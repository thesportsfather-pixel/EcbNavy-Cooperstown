export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const {
      type,
      playerKey,
      playerName,
      playerNumber,
      baseballNumbers = [],
      amount,
      donorName = "Anonymous"
    } = body;

    if (!amount || Number(amount) < 1) {
      return json(
        { success: false, error: "Invalid donation amount." },
        400
      );
    }

    if (!context.env.STRIPE_SECRET_KEY) {
      return json(
        { success: false, error: "Stripe secret key is not configured." },
        500
      );
    }

    const amountInCents = Math.round(Number(amount) * 100);

    let description = "";

    if (type === "baseballs") {
      description =
        `ECB Navy Cooperstown Fundraiser — ` +
        `#${playerNumber} ${playerName} — ` +
        `Baseballs: ${baseballNumbers.join(", ")}`;
    } else {
      description =
        playerKey === "team"
          ? "ECB Navy Cooperstown Fundraiser — General Team Donation"
          : `ECB Navy Cooperstown Fundraiser — #${playerNumber} ${playerName} — General Donation`;
    }

    const origin = new URL(context.request.url).origin;

    const params = new URLSearchParams();

    params.append("mode", "payment");

    params.append(
      "success_url",
      `${origin}/?success=1&session_id={CHECKOUT_SESSION_ID}`
    );

    params.append(
      "cancel_url",
      `${origin}/?canceled=1`
    );

    params.append(
      "line_items[0][price_data][currency]",
      "usd"
    );

    params.append(
      "line_items[0][price_data][product_data][name]",
      "ECB Navy Road to Cooperstown"
    );

    params.append(
      "line_items[0][price_data][product_data][description]",
      description
    );

    params.append(
      "line_items[0][price_data][unit_amount]",
      amountInCents.toString()
    );

    params.append(
      "line_items[0][quantity]",
      "1"
    );

    params.append(
      "metadata[type]",
      type || ""
    );

    params.append(
      "metadata[player_key]",
      playerKey || ""
    );

    params.append(
      "metadata[player_name]",
      playerName || ""
    );

    params.append(
      "metadata[player_number]",
      playerNumber !== null && playerNumber !== undefined
        ? String(playerNumber)
        : ""
    );

    params.append(
      "metadata[baseball_numbers]",
      baseballNumbers.join(",")
    );

    params.append(
      "metadata[donor_name]",
      donorName || "Anonymous"
    );

    const stripeResponse = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${context.env.STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params.toString()
      }
    );

    const session = await stripeResponse.json();

    if (!stripeResponse.ok) {
      console.error("Stripe error:", session);

      return json(
        {
          success: false,
          error:
            session?.error?.message ||
            "Unable to create Stripe checkout session."
        },
        500
      );
    }

    return json({
      success: true,
      url: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error(error);

    return json(
      {
        success: false,
        error: "Unexpected checkout error."
      },
      500
    );
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

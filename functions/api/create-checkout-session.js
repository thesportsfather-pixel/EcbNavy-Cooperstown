export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();

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
      return responseJson(
        { success: false, error: "Invalid donation amount." },
        400
      );
    }

    if (!env.STRIPE_SECRET_KEY) {
      return responseJson(
        { success: false, error: "Stripe secret key is not configured." },
        500
      );
    }

    const amountInCents = Math.round(Number(amount) * 100);

    let description;

    if (type === "baseballs") {
      description =
        `ECB Navy Cooperstown Fundraiser - ` +
        `#${playerNumber} ${playerName} - ` +
        `Baseballs: ${baseballNumbers.join(", ")}`;
    } else {
      description =
        playerKey === "team"
          ? "ECB Navy Cooperstown Fundraiser - General Team Donation"
          : `ECB Navy Cooperstown Fundraiser - #${playerNumber} ${playerName} - General Donation`;
    }

    const origin = new URL(request.url).origin;

    const params = new URLSearchParams();

    params.set("mode", "payment");
    params.set(
      "success_url",
      `${origin}/?success=1&session_id={CHECKOUT_SESSION_ID}`
    );
    params.set(
      "cancel_url",
      `${origin}/?canceled=1`
    );

    params.set(
      "line_items[0][price_data][currency]",
      "usd"
    );

    params.set(
      "line_items[0][price_data][product_data][name]",
      "ECB Navy Road to Cooperstown"
    );

    params.set(
      "line_items[0][price_data][product_data][description]",
      description
    );

    params.set(
      "line_items[0][price_data][unit_amount]",
      String(amountInCents)
    );

    params.set(
      "line_items[0][quantity]",
      "1"
    );

    params.set("metadata[type]", type || "");
    params.set("metadata[player_key]", playerKey || "");
    params.set("metadata[player_name]", playerName || "");
    params.set(
      "metadata[player_number]",
      playerNumber == null ? "" : String(playerNumber)
    );
    params.set(
      "metadata[baseball_numbers]",
      baseballNumbers.join(",")
    );
    params.set(
      "metadata[donor_name]",
      donorName || "Anonymous"
    );

    const stripeResponse = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params.toString()
      }
    );

    const session = await stripeResponse.json();

    if (!stripeResponse.ok) {
      return responseJson(
        {
          success: false,
          error:
            session?.error?.message ||
            "Unable to create checkout session."
        },
        500
      );
    }

    return responseJson({
      success: true,
      url: session.url,
      sessionId: session.id
    });

  } catch (error) {
    return responseJson(
      {
        success: false,
        error: "Unexpected checkout error."
      },
      500
    );
  }
}

function responseJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function supabasePatch(
  env,
  path,
  data
) {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/${path}`,
    {
      method: "PATCH",

      headers: {
        apikey:
          env.SUPABASE_SERVICE_ROLE_KEY,

        authorization:
          `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,

        "content-type":
          "application/json",

        prefer:
          "return=representation",

        accept:
          "application/json",
      },

      body: JSON.stringify(data),
    }
  );

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase ${response.status}: ${text}`
    );
  }

  return text ? JSON.parse(text) : [];
}

export async function onRequestGet({
  request,
  env,
}) {
  try {
    if (
      !env.SUPABASE_URL ||
      !env.SUPABASE_SERVICE_ROLE_KEY ||
      !env.STRIPE_SECRET_KEY
    ) {
      return json(
        {
          success: false,
          error:
            "Missing server configuration.",
        },
        500
      );
    }

    const url =
      new URL(request.url);

    const sessionId =
      url.searchParams.get(
        "session_id"
      );

    if (
      !sessionId ||
      !sessionId.startsWith(
        "cs_"
      )
    ) {
      return json(
        {
          success: false,
          error:
            "A valid Stripe session_id is required.",
        },
        400
      );
    }

    const stripeResponse =
      await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(
          sessionId
        )}`,
        {
          headers: {
            authorization:
              `Bearer ${env.STRIPE_SECRET_KEY}`,
          },
        }
      );

    const session =
      await stripeResponse.json();

    if (!stripeResponse.ok) {
      return json(
        {
          success: false,
          error:
            session?.error?.message ||
            "Unable to retrieve Stripe checkout.",
        },
        stripeResponse.status
      );
    }

    if (
      session.payment_status !==
      "paid"
    ) {
      return json(
        {
          success: false,
          paid: false,
          error:
            "Payment has not been confirmed.",
        },
        409
      );
    }

    if (
      session.metadata?.team_key !==
      "ecb-navy-cooperstown"
    ) {
      return json(
        {
          success: false,
          error:
            "Invalid ECB Navy fundraiser metadata.",
        },
        400
      );
    }

    const donationType =
      session.metadata
        ?.donation_type ||
      "baseballs";

    /*
    GENERAL DONATION
    */

    if (
      donationType ===
      "general"
    ) {
      return json({
        success: true,
        paid: true,
        type: "general",
        donorName:
          session.metadata
            ?.donor_name ||
          "Anonymous",
      });
    }

    /*
    BASEBALL PURCHASE
    */

    const playerId =
      session.metadata
        ?.player_id;

    const playerKey =
      session.metadata
        ?.player_key;

    const baseballCsv =
      session.metadata
        ?.baseball_numbers;

    if (
      !playerId ||
      !playerKey ||
      !baseballCsv
    ) {
      return json(
        {
          success: false,
          error:
            "Missing baseball purchase metadata.",
        },
        400
      );
    }

    const baseballNumbers =
      baseballCsv
        .split(",")
        .map(
          (value) =>
            Number(
              value.trim()
            )
        )
        .filter(
          (value) =>
            Number.isInteger(
              value
            ) &&
            value >= 1 &&
            value <= 100
        );

    const anonymous =
      session.metadata
        ?.anonymous === "true";

    let donorName =
      session.metadata
        ?.donor_name || "";

    if (
      anonymous ||
      !donorName
    ) {
      donorName =
        "Anonymous";
    }

    const soldRows =
      await supabasePatch(
        env,

        `baseballs?player_id=eq.${encodeURIComponent(
          playerId
        )}&ball_number=in.(${baseballNumbers.join(
          ","
        )})`,

        {
          status: "sold",
          sold_at:
            new Date().toISOString(),
          reserved_until: null,
          stripe_session_id:
            session.id,
          donor_name:
            donorName,
        }
      );

    return json({
      success: true,
      paid: true,
      type: "baseballs",
      playerKey,
      baseballNumbers,
      donorName,
      updatedRows:
        soldRows.length,
    });
  } catch (error) {
    console.error(
      "Verify payment error:",
      error
    );

    return json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500
    );
  }
}

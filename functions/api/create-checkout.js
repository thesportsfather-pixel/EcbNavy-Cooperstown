function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function supabaseGet(env, path) {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/${path}`,
    {
      method: "GET",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        accept: "application/json",
      },
    }
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase ${response.status}: ${text}`
    );
  }

  return text ? JSON.parse(text) : [];
}

export async function onRequestPost({
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
          error: "Missing server configuration.",
        },
        500
      );
    }

    const body = await request.json();

    const type =
      body.type === "general"
        ? "general"
        : "baseballs";

    const anonymous =
      body.anonymous === true;

    let donorName =
      typeof body.donorName === "string"
        ? body.donorName
            .trim()
            .replace(/\s+/g, " ")
        : "";

    if (anonymous || !donorName) {
      donorName = "Anonymous";
    }

    if (
      !anonymous &&
      donorName.length < 2
    ) {
      return json(
        {
          success: false,
          error:
            "Please enter a donor name or choose Anonymous.",
        },
        400
      );
    }

    const origin = new URL(
      request.url
    ).origin;

    /*
    ========================================
    GENERAL DONATION
    ========================================
    */

    if (type === "general") {
      const amount = Number(
        body.amount
      );

      if (
        !Number.isFinite(amount) ||
        amount < 1 ||
        amount > 10000
      ) {
        return json(
          {
            success: false,
            error:
              "Please enter a valid donation amount.",
          },
          400
        );
      }

      const amountCents = Math.round(
        amount * 100
      );

      const playerKey =
        typeof body.playerKey === "string"
          ? body.playerKey.trim()
          : "";

      let player = null;

      if (
        playerKey &&
        playerKey !== "team"
      ) {
        const players =
          await supabaseGet(
            env,
            `players?team_key=eq.ecb-navy-cooperstown&player_key=eq.${encodeURIComponent(
              playerKey
            )}&select=id,player_key,player_name,player_number&limit=1`
          );

        if (players.length) {
          player = players[0];
        }
      }

      const params =
        new URLSearchParams();

      params.set(
        "mode",
        "payment"
      );

      params.set(
        "success_url",
        `${origin}/fundraiser.html${
          player
            ? `?player=${encodeURIComponent(
                player.player_key
              )}&`
            : "?"
        }payment=success&session_id={CHECKOUT_SESSION_ID}`
      );

      params.set(
        "cancel_url",
        `${origin}/fundraiser.html${
          player
            ? `?player=${encodeURIComponent(
                player.player_key
              )}&`
            : "?"
        }payment=cancelled`
      );

      params.set(
        "line_items[0][price_data][currency]",
        "usd"
      );

      params.set(
        "line_items[0][price_data][product_data][name]",
        player
          ? `ECB Navy Cooperstown - ${player.player_name}`
          : "ECB Navy Cooperstown - Team Donation"
      );

      params.set(
        "line_items[0][price_data][product_data][description]",
        `General Donation • Donor: ${donorName}`
      );

      params.set(
        "line_items[0][price_data][unit_amount]",
        String(amountCents)
      );

      params.set(
        "line_items[0][quantity]",
        "1"
      );

      params.set(
        "metadata[team_key]",
        "ecb-navy-cooperstown"
      );

      params.set(
        "metadata[donation_type]",
        "general"
      );

      params.set(
        "metadata[player_id]",
        player ? String(player.id) : ""
      );

      params.set(
        "metadata[player_key]",
        player
          ? player.player_key
          : "team"
      );

      params.set(
        "metadata[player_name]",
        player
          ? player.player_name
          : "ECB Navy Team"
      );

      params.set(
        "metadata[donor_name]",
        donorName
      );

      params.set(
        "metadata[anonymous]",
        String(anonymous)
      );

      params.set(
        "metadata[amount_cents]",
        String(amountCents)
      );

      return await createStripeSession(
        env,
        params
      );
    }

    /*
    ========================================
    BASEBALL PURCHASE
    ========================================
    */

    const playerKey =
      typeof body.playerKey === "string"
        ? body.playerKey.trim()
        : "";

    const baseballNumbers =
      Array.from(
        new Set(
          (
            Array.isArray(body.baseballs)
              ? body.baseballs
              : []
          )
            .map(Number)
            .filter(
              (number) =>
                Number.isInteger(number) &&
                number >= 1 &&
                number <= 100
            )
        )
      ).sort((a, b) => a - b);

    if (
      !playerKey ||
      !baseballNumbers.length
    ) {
      return json(
        {
          success: false,
          error:
            "A player and at least one baseball are required.",
        },
        400
      );
    }

    const players =
      await supabaseGet(
        env,
        `players?team_key=eq.ecb-navy-cooperstown&player_key=eq.${encodeURIComponent(
          playerKey
        )}&select=id,player_key,player_name,player_number&limit=1`
      );

    if (!players.length) {
      return json(
        {
          success: false,
          error: "Player not found.",
        },
        404
      );
    }

    const player = players[0];

    const baseballs =
      await supabaseGet(
        env,
        `baseballs?player_id=eq.${encodeURIComponent(
          player.id
        )}&ball_number=in.(${baseballNumbers.join(
          ","
        )})&select=ball_number,amount_cents,status`
      );

    if (
      baseballs.length !==
      baseballNumbers.length
    ) {
      return json(
        {
          success: false,
          error:
            "One or more selected baseballs could not be found.",
        },
        409
      );
    }

    const unavailable =
      baseballs.filter(
        (ball) =>
          ball.status !== "available"
      );

    if (unavailable.length) {
      return json(
        {
          success: false,

          error:
            `Baseball${
              unavailable.length === 1
                ? ""
                : "s"
            } #${unavailable
              .map(
                (ball) =>
                  ball.ball_number
              )
              .join(
                ", #"
              )} ${
              unavailable.length === 1
                ? "is"
                : "are"
            } no longer available.`,
        },
        409
      );
    }

    const amountCents =
      baseballs.reduce(
        (sum, ball) =>
          sum +
          (
            Number(
              ball.amount_cents
            ) ||
            Number(
              ball.ball_number
            ) * 100
          ),
        0
      );

    const params =
      new URLSearchParams();

    params.set(
      "mode",
      "payment"
    );

    params.set(
      "success_url",
      `${origin}/fundraiser.html?player=${encodeURIComponent(
        playerKey
      )}&payment=success&session_id={CHECKOUT_SESSION_ID}`
    );

    params.set(
      "cancel_url",
      `${origin}/fundraiser.html?player=${encodeURIComponent(
        playerKey
      )}&payment=cancelled`
    );

    params.set(
      "line_items[0][price_data][currency]",
      "usd"
    );

    params.set(
      "line_items[0][price_data][product_data][name]",
      `ECB Navy - ${player.player_name}`
    );

    params.set(
      "line_items[0][price_data][product_data][description]",
      `Baseballs #${baseballNumbers.join(
        ", #"
      )} • Donor: ${donorName}`
    );

    params.set(
      "line_items[0][price_data][unit_amount]",
      String(amountCents)
    );

    params.set(
      "line_items[0][quantity]",
      "1"
    );

    params.set(
      "metadata[team_key]",
      "ecb-navy-cooperstown"
    );

    params.set(
      "metadata[donation_type]",
      "baseballs"
    );

    params.set(
      "metadata[player_id]",
      String(player.id)
    );

    params.set(
      "metadata[player_key]",
      player.player_key
    );

    params.set(
      "metadata[player_name]",
      player.player_name
    );

    params.set(
      "metadata[player_number]",
      String(
        player.player_number ?? ""
      )
    );

    params.set(
      "metadata[baseball_numbers]",
      baseballNumbers.join(",")
    );

    params.set(
      "metadata[donor_name]",
      donorName
    );

    params.set(
      "metadata[anonymous]",
      String(anonymous)
    );

    return await createStripeSession(
      env,
      params
    );
  } catch (error) {
    console.error(
      "Create checkout error:",
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

async function createStripeSession(
  env,
  params
) {
  const stripeResponse =
    await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",

        headers: {
          authorization:
            `Bearer ${env.STRIPE_SECRET_KEY}`,

          "content-type":
            "application/x-www-form-urlencoded",

          accept:
            "application/json",
        },

        body:
          params.toString(),
      }
    );

  const text =
    await stripeResponse.text();

  let session;

  try {
    session =
      JSON.parse(text);
  } catch {
    return json(
      {
        success: false,
        error:
          "Stripe returned invalid data.",
      },
      500
    );
  }

  if (!stripeResponse.ok) {
    return json(
      {
        success: false,
        error:
          session?.error?.message ||
          "Unable to create checkout.",
      },
      stripeResponse.status
    );
  }

  return json({
    success: true,
    url: session.url,
    sessionId: session.id,
  });
}

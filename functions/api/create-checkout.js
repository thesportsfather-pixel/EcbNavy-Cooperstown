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

async function createStripeSession(
  env,
  params
) {
  const stripeResponse = await fetch(
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

  const stripeText =
    await stripeResponse.text();

  let session;

  try {
    session =
      JSON.parse(stripeText);
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
          "Unable to create Stripe checkout.",
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

    const body =
      await request.json();

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

    if (
      anonymous ||
      !donorName
    ) {
      donorName =
        "Anonymous";
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

    /*
    ==========================================
    FIND ECB NAVY TEAM
    ==========================================
    */

    const teams = await supabaseGet(
      env,
      `teams?team_key=eq.ecb-navy-cooperstown&select=id,team_key,team_name&limit=1`
    );

    if (!teams.length) {
      return json(
        {
          success: false,
          error: "ECB Navy team was not found.",
        },
        404
      );
    }

    const team = teams[0];

    const origin =
      new URL(
        request.url
      ).origin;

    /*
    ==========================================
    GENERAL DONATION
    ==========================================
    */

    if (type === "general") {
      const amount =
        Number(body.amount);

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

      const amountCents =
        Math.round(
          amount * 100
        );

      const requestedPlayerKey =
        typeof body.playerKey === "string"
          ? body.playerKey.trim()
          : "team";

      let player = null;

      /*
      If donor selected a player,
      find that player under ECB Navy.
      */

      if (
        requestedPlayerKey &&
        requestedPlayerKey !== "team"
      ) {
        const players =
          await supabaseGet(
            env,

            `players?team_id=eq.${encodeURIComponent(
              team.id
            )}&player_key=eq.${encodeURIComponent(
              requestedPlayerKey
            )}&select=id,player_key,player_name,player_number,team_id&limit=1`
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

        player =
          players[0];
      }

      const params =
        new URLSearchParams();

      params.set(
        "mode",
        "payment"
      );

      let successUrl;
      let cancelUrl;

      if (player) {
        successUrl =
          `${origin}/fundraiser.html?player=${encodeURIComponent(
            player.player_key
          )}&payment=success&session_id={CHECKOUT_SESSION_ID}`;

        cancelUrl =
          `${origin}/fundraiser.html?player=${encodeURIComponent(
            player.player_key
          )}&payment=cancelled`;
      } else {
        successUrl =
          `${origin}/fundraiser.html?payment=success&session_id={CHECKOUT_SESSION_ID}`;

        cancelUrl =
          `${origin}/fundraiser.html?payment=cancelled`;
      }

      params.set(
        "success_url",
        successUrl
      );

      params.set(
        "cancel_url",
        cancelUrl
      );

      params.set(
        "line_items[0][price_data][currency]",
        "usd"
      );

      params.set(
        "line_items[0][price_data][product_data][name]",
        player
          ? `ECB Navy Road to Cooperstown - ${player.player_name}`
          : "ECB Navy Road to Cooperstown - Team Donation"
      );

      params.set(
        "line_items[0][price_data][product_data][description]",
        player
          ? `General donation supporting #${player.player_number} ${player.player_name} • Donor: ${donorName}`
          : `General ECB Navy team donation • Donor: ${donorName}`
      );

      params.set(
        "line_items[0][price_data][unit_amount]",
        String(amountCents)
      );

      params.set(
        "line_items[0][quantity]",
        "1"
      );

      /*
      STRIPE METADATA
      */

      params.set(
        "metadata[team_key]",
        "ecb-navy-cooperstown"
      );

      params.set(
        "metadata[team_id]",
        String(team.id)
      );

      params.set(
        "metadata[donation_type]",
        "general"
      );

      params.set(
        "metadata[player_id]",
        player
          ? String(player.id)
          : ""
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
        "metadata[player_number]",
        player
          ? String(
              player.player_number ?? ""
            )
          : ""
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
    ==========================================
    BASEBALL PURCHASE
    ==========================================
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
      ).sort(
        (a, b) =>
          a - b
      );

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

    /*
    FIND PLAYER THROUGH team_id
    */

    const players =
      await supabaseGet(
        env,

        `players?team_id=eq.${encodeURIComponent(
          team.id
        )}&player_key=eq.${encodeURIComponent(
          playerKey
        )}&select=id,player_key,player_name,player_number,team_id&limit=1`
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

    const player =
      players[0];

    /*
    LOAD SELECTED BASEBALLS
    */

    const baseballs =
      await supabaseGet(
        env,

        `baseballs?player_id=eq.${encodeURIComponent(
          player.id
        )}&ball_number=in.(${baseballNumbers.join(
          ","
        )})&select=id,ball_number,amount_cents,status`
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

    /*
    CHECK AVAILABILITY
    */

    const unavailable =
      baseballs.filter(
        (ball) =>
          ball.status !==
          "available"
      );

    if (unavailable.length) {
      const unavailableNumbers =
        unavailable
          .map(
            (ball) =>
              Number(
                ball.ball_number
              )
          )
          .sort(
            (a, b) =>
              a - b
          );

      return json(
        {
          success: false,

          error:
            `Baseball${
              unavailableNumbers.length === 1
                ? ""
                : "s"
            } #${unavailableNumbers.join(
              ", #"
            )} ${
              unavailableNumbers.length === 1
                ? "is"
                : "are"
            } no longer available. Please refresh the board.`,
        },
        409
      );
    }

    /*
    SERVER CALCULATES TOTAL
    NEVER TRUST BROWSER AMOUNT
    */

    const amountCents =
      baseballs.reduce(
        (total, ball) => {
          const number =
            Number(
              ball.ball_number
            );

          const amount =
            Number(
              ball.amount_cents
            ) ||
            number * 100;

          return (
            total +
            amount
          );
        },
        0
      );

    if (
      !Number.isInteger(amountCents) ||
      amountCents < 100
    ) {
      return json(
        {
          success: false,
          error: "Invalid checkout amount.",
        },
        400
      );
    }

    /*
    ==========================================
    CREATE STRIPE CHECKOUT
    ==========================================
    */

    const params =
      new URLSearchParams();

    params.set(
      "mode",
      "payment"
    );

    params.set(
      "success_url",

      `${origin}/fundraiser.html?player=${encodeURIComponent(
        player.player_key
      )}&payment=success&session_id={CHECKOUT_SESSION_ID}`
    );

    params.set(
      "cancel_url",

      `${origin}/fundraiser.html?player=${encodeURIComponent(
        player.player_key
      )}&payment=cancelled`
    );

    params.set(
      "line_items[0][price_data][currency]",
      "usd"
    );

    params.set(
      "line_items[0][price_data][product_data][name]",

      `ECB Navy Road to Cooperstown - #${player.player_number} ${player.player_name}`
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

    /*
    ==========================================
    STRIPE METADATA
    ==========================================
    */

    params.set(
      "metadata[team_key]",
      "ecb-navy-cooperstown"
    );

    params.set(
      "metadata[team_id]",
      String(team.id)
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

    params.set(
      "metadata[amount_cents]",
      String(amountCents)
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

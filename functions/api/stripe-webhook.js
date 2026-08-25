function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type":
        "application/json; charset=utf-8",
    },
  });
}

function hexToBytes(hex) {
  if (
    !/^[0-9a-f]+$/i.test(hex) ||
    hex.length % 2 !== 0
  ) {
    return null;
  }

  const bytes =
    new Uint8Array(
      hex.length / 2
    );

  for (
    let i = 0;
    i < bytes.length;
    i++
  ) {
    bytes[i] =
      parseInt(
        hex.slice(
          i * 2,
          i * 2 + 2
        ),
        16
      );
  }

  return bytes;
}

function timingSafeEqual(
  a,
  b
) {
  if (
    a.length !== b.length
  ) {
    return false;
  }

  let diff = 0;

  for (
    let i = 0;
    i < a.length;
    i++
  ) {
    diff |=
      a[i] ^ b[i];
  }

  return diff === 0;
}

async function verifySignature(
  body,
  signatureHeader,
  secret
) {
  if (
    !signatureHeader ||
    !secret
  ) {
    return false;
  }

  const pieces =
    signatureHeader.split(",");

  const timestamp =
    pieces
      .find(
        (item) =>
          item.startsWith(
            "t="
          )
      )
      ?.slice(2);

  const signatures =
    pieces
      .filter(
        (item) =>
          item.startsWith(
            "v1="
          )
      )
      .map(
        (item) =>
          item.slice(3)
      );

  if (
    !timestamp ||
    !signatures.length
  ) {
    return false;
  }

  const encoder =
    new TextEncoder();

  const key =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      {
        name: "HMAC",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );

  const signed =
    `${timestamp}.${body}`;

  const expectedBuffer =
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(
        signed
      )
    );

  const expected =
    new Uint8Array(
      expectedBuffer
    );

  return signatures.some(
    (sig) => {
      const actual =
        hexToBytes(sig);

      return (
        actual &&
        timingSafeEqual(
          expected,
          actual
        )
      );
    }
  );
}

async function supabasePatch(
  env,
  path,
  data
) {
  const response =
    await fetch(
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
        },

        body:
          JSON.stringify(
            data
          ),
      }
    );

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      text
    );
  }

  return text
    ? JSON.parse(text)
    : [];
}

export async function onRequestPost({
  request,
  env,
}) {
  try {
    const rawBody =
      await request.text();

    const signature =
      request.headers.get(
        "stripe-signature"
      );

    const valid =
      await verifySignature(
        rawBody,
        signature,
        env.STRIPE_WEBHOOK_SECRET
      );

    if (!valid) {
      return json(
        {
          success: false,
          error:
            "Invalid Stripe signature.",
        },
        400
      );
    }

    const event =
      JSON.parse(
        rawBody
      );

    if (
      event.type !==
      "checkout.session.completed"
    ) {
      return json({
        received: true,
      });
    }

    const session =
      event.data?.object;

    if (
      session.payment_status !==
      "paid"
    ) {
      return json({
        received: true,
      });
    }

    if (
      session.metadata?.team_key !==
      "ecb-navy-cooperstown"
    ) {
      return json({
        received: true,
      });
    }

    if (
      session.metadata
        ?.donation_type ===
      "general"
    ) {
      return json({
        received: true,
        type: "general",
      });
    }

    const playerId =
      session.metadata
        ?.player_id;

    const baseballNumbers =
      (
        session.metadata
          ?.baseball_numbers ||
        ""
      )
        .split(",")
        .map(Number)
        .filter(
          (number) =>
            Number.isInteger(
              number
            )
        );

    if (
      !playerId ||
      !baseballNumbers.length
    ) {
      return json({
        received: true,
      });
    }

    const anonymous =
      session.metadata
        ?.anonymous === "true";

    let donorName =
      session.metadata
        ?.donor_name ||
      "Anonymous";

    if (anonymous) {
      donorName =
        "Anonymous";
    }

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

        reserved_until:
          null,

        stripe_session_id:
          session.id,

        donor_name:
          donorName,
      }
    );

    return json({
      received: true,
    });
  } catch (error) {
    console.error(
      "Webhook error:",
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

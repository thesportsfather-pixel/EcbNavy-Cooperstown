function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function onRequestPost({ env }) {

  const supabaseUrl =
    !!env.SUPABASE_URL;

  const supabaseServiceRole =
    !!env.SUPABASE_SERVICE_ROLE_KEY;

  const stripeSecret =
    !!env.STRIPE_SECRET_KEY;

  const stripeWebhookSecret =
    !!env.STRIPE_WEBHOOK_SECRET;

  return json(
    {
      success: false,

      error:
        "DIAGNOSTIC — " +
        "SUPABASE_URL=" +
        supabaseUrl +
        " | SUPABASE_SERVICE_ROLE_KEY=" +
        supabaseServiceRole +
        " | STRIPE_SECRET_KEY=" +
        stripeSecret +
        " | STRIPE_WEBHOOK_SECRET=" +
        stripeWebhookSecret
    },
    400
  );
}

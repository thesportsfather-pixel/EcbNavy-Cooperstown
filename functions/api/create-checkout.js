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
  return json({
    success: false,
    diagnostic: true,

    variables: {
      SUPABASE_URL: !!env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!env.SUPABASE_SERVICE_ROLE_KEY,
      STRIPE_SECRET_KEY: !!env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: !!env.STRIPE_WEBHOOK_SECRET,
    },

    message:
      "true means Cloudflare sees the variable; false means it is missing from this deployment."
  });
}

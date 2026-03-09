export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(_req, res) {
  return res.status(501).json({
    error:
      'Webhook not configured yet. After Stripe setup, implement signature verification with STRIPE_WEBHOOK_SECRET and update Supabase entitlement (subscriptions/profiles).',
  });
}

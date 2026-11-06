// TomoFlow web config — client-side placeholders only (no secrets here).
// Stripe secret keys, webhook secrets, and Resend keys live in Vercel env
// (see .env.example) and are used by /api/restore-pro and /api/stripe-webhook.
//
// Sandbox vs live:
//   1. Create a Stripe Payment Link (test mode via Vercel Marketplace Stripe sandbox).
//   2. After payment → Redirect to https://YOUR_DOMAIN/?pro=1
//   3. Paste the Payment Link URL below as stripePaymentLink.
//   4. When going live, create a live Payment Link and replace this URL
//      (and swap Vercel env to live STRIPE_SECRET_KEY / webhook secret).
//
// ?pro=1 is a client hint for unlock-after-redirect. Production restore should
// verify via Stripe + Resend magic link (or webhook entitlement) — do not treat
// the query param alone as proof of payment.
window.TOMOFLOW_CONFIG = {
  // One-time Pro unlock ($21). Paste sandbox or live Payment Link URL.
  stripePaymentLink: "https://buy.stripe.com/test_4gMbIU8dCf94fsVdombV600",

  // On-chain Bitcoin tip address (no entitlement; optional support).
  btcAddress: "REPLACE_WITH_BTC_ADDRESS",

  // Display price (matches your Stripe Payment Link amount).
  proPriceLabel: "$21",

  // Query params that unlock Pro after Stripe redirects back (or Restore email).
  proUnlockParams: ["pro", "unlocked"],
};

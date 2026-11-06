// TomoFlow web config — replace placeholders before going live.
// See README for Stripe Payment Link + BTC address setup.
window.TOMOFLOW_CONFIG = {
  // One-time Pro unlock ($21). Create a Stripe Payment Link and paste the URL.
  // After payment, redirect back to the site with a Pro unlock query (below).
  stripePaymentLink: "REPLACE_WITH_STRIPE_PAYMENT_LINK",

  // On-chain Bitcoin tip address (no entitlement; optional support).
  btcAddress: "REPLACE_WITH_BTC_ADDRESS",

  // Display price (matches your Stripe Payment Link amount).
  proPriceLabel: "$21",

  // Query params that unlock Pro after Stripe redirects back.
  proUnlockParams: ["pro", "unlocked"],
};

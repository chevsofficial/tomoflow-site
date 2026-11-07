const config = {
  // One-time Pro unlock ($21). Paste sandbox or live Payment Link URL.
  stripePaymentLink: "https://buy.stripe.com/test_4gMbIU8dCf94fsVdombV600",

  // On-chain Bitcoin tip address (no entitlement; optional support).
  btcAddress: "REPLACE_WITH_BTC_ADDRESS",

  // Display price (matches your Stripe Payment Link amount).
  proPriceLabel: "$21",
};

if (typeof module !== "undefined") module.exports = config;
if (typeof window !== "undefined") window.TOMOFLOW_CONFIG = config;

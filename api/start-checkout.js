const config = require('../assets/js/config');
const { sign, verify, cookie } = require('../lib/pro-access');
const { limit } = require('../lib/request-limits');
const { json } = require('../lib/http');
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const site = new URL(process.env.PUBLIC_SITE_URL || 'https://www.tomoflow.app');
    if (process.env.VERCEL_ENV === 'production' && req.headers.host !== site.host) {
      res.setHeader('Location', `${site.origin}/api/start-checkout`); res.statusCode = 303; return res.end();
    }
    if (!await limit(req, 'checkout-start', 10)) return json(res, 429, { error: 'Too many checkout requests. Please wait and try again.' });
    const url = new URL(config.stripePaymentLink);
    if (url.origin !== 'https://buy.stripe.com' || !url.pathname.startsWith('/test_')) throw new Error('Sandbox Payment Link required');
    const token = sign('checkout', {}, 86400);
    url.searchParams.set('client_reference_id', verify(token, 'checkout').nonce);
    res.setHeader('Set-Cookie', cookie(token));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Location', url.toString());
    res.statusCode = 303;
    res.end();
  } catch (error) {
    console.error('start-checkout:', error.message);
    return json(res, 503, { error: 'Checkout is temporarily unavailable. Please try again later.' });
  }
};

const { stripeGet, isAvailableProSession } = require('../lib/stripe');
const { verify, checkoutContext, cookie, digest } = require('../lib/pro-access');
const { limit, claim } = require('../lib/request-limits');
const { json, readJson, sameOrigin } = require('../lib/http');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!sameOrigin(req)) return json(res, 403, { error: 'Invalid request origin' });
  let body;
  try { body = await readJson(req); } catch { return json(res, 400, { error: 'Invalid request' }); }
  try {
    const restore = body?.restoreToken !== undefined;
    const proof = restore ? verify(body.restoreToken, 'restore') : checkoutContext(req);
    const sessionId = restore ? proof?.sessionId : body?.sessionId;
    if (!proof || !/^cs_[a-zA-Z0-9_]+$/.test(sessionId || '')) return json(res, 401, { error: 'This link is invalid or expired. Request a new Restore Pro email.' });
    if (!await limit(req, 'pro-unlock', 30)) return json(res, 429, { error: 'Too many requests. Please wait and try again.' });
    const session = await stripeGet(`/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent.latest_charge`);
    if (session.livemode !== false) return json(res, 403, { error: 'Only sandbox purchases are enabled.' });
    if (!restore && session.client_reference_id !== proof.nonce) return json(res, 403, { error: 'Complete checkout in this browser, or use Restore Pro.' });
    if (session.payment_status === 'unpaid') return json(res, 202, { pending: true, message: 'Payment is still processing. Once it succeeds, use Restore Pro with your checkout email.' });
    if (!await isAvailableProSession(session)) return json(res, 403, { error: 'No paid Pro purchase was verified.' });
    if (restore && !await claim([[`restore-use:${digest(body.restoreToken)}`, 1, 3600]])) return json(res, 410, { error: 'This restore link has already been used. Request a new one.' });
    if (!restore) res.setHeader('Set-Cookie', cookie('', true));
    return json(res, 200, { unlocked: true });
  } catch (error) {
    console.error('unlock-pro:', error.message);
    return json(res, 503, { error: 'Could not verify Pro right now. Please try again or request a new Restore email.' });
  }
};

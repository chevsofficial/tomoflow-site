// POST /api/restore-pro — verify a paid Pro checkout and email a signed, short-lived restore link.
const { restoreProEmail } = require('../lib/email-brand');
const { stripeGet, isAvailableProSession } = require('../lib/stripe');
const { sign, ip } = require('../lib/pro-access');
const { claim } = require('../lib/request-limits');
const { json, readJson, sameOrigin } = require('../lib/http');
const ACCEPTED = { ok: true, accepted: true, message: 'If a paid Pro purchase matches that email, a restore link will arrive shortly. Check your inbox and spam folder.' };

async function findPurchase(email) {
  let after;
  for (let pageNumber = 0; pageNumber < 50; pageNumber++) {
    const params = new URLSearchParams({ limit: '100', status: 'complete' });
    params.append('expand[]', 'data.line_items');
    params.append('expand[]', 'data.payment_intent.latest_charge');
    if (after) params.set('starting_after', after);
    const page = await stripeGet(`/checkout/sessions?${params}`);
    for (const session of page.data || []) {
      const buyer = session.customer_details?.email || session.customer_email;
      if (typeof buyer === 'string' && buyer.trim().toLowerCase() === email.toLowerCase() && await isAvailableProSession(session)) return session.id;
    }
    if (!page.has_more) return false;
    after = page.data?.at(-1)?.id;
    if (!after) throw new Error('Invalid Stripe pagination');
  }
  // Do not report "no purchase" if the search stopped before exhausting results.
  throw new Error('Purchase lookup limit reached');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });
  if (!process.env.STRIPE_SECRET_KEY || !process.env.RESEND_API_KEY) {
    return json(res, 503, { ok: false, error: 'Restore email is temporarily unavailable. Please try again later.' });
  }
  if (!sameOrigin(req)) return json(res, 403, { ok: false, error: 'Invalid request origin' });
  let body;
  try { body = await readJson(req); }
  catch { return json(res, 400, { ok: false, error: 'Invalid JSON body' }); }
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(res, 400, { ok: false, error: 'Enter a valid email address' });
  }
  try {
    if (!await claim([[`restore-ip:${ip(req)}`, 10, 900], [`restore-email:${email.toLowerCase()}`, 3, 3600]])) {
      res.setHeader('Retry-After', '3600');
      return json(res, 429, { ok: false, error: 'Too many Restore requests. Please wait before trying again.' });
    }
    const sessionId = await findPurchase(email);
    if (!sessionId) return json(res, 200, ACCEPTED);
    const base = (process.env.PUBLIC_SITE_URL || 'https://www.tomoflow.app').trim().replace(/\/$/, '');
    const token = sign('restore', { sessionId }, 1800);
    const mail = restoreProEmail({ unlockUrl: `${base}/#restore=${token}` });
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.RESEND_FROM || 'TomoFlow <noreply@tomoflow.app>', to: [email], ...mail }),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok || !result.id) throw new Error('Restore email send failed');
    return json(res, 200, ACCEPTED);
  } catch (error) {
    console.error('restore-pro:', error.message);
    return json(res, 503, { ok: false, error: 'Could not restore Pro right now. Please try again in a moment.' });
  }
};

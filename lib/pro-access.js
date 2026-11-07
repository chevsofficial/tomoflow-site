const crypto = require('node:crypto');
const DEPLOYED = ['production', 'preview'].includes(process.env.VERCEL_ENV);
const COOKIE = DEPLOYED ? '__Host-tomoflow_checkout' : 'tomoflow_checkout';
function secret() {
  const key = process.env.PRO_TOKEN_SECRET?.trim();
  if (!key || key.length < 32) throw new Error('Pro access signing key not configured');
  return key;
}
function digest(value) { return crypto.createHmac('sha256', secret()).update(value).digest('hex'); }
function sign(purpose, fields, ttl) {
  const payload = Buffer.from(JSON.stringify({ ...fields, purpose, exp: Math.floor(Date.now() / 1000) + ttl, nonce: crypto.randomBytes(16).toString('hex') })).toString('base64url');
  return `${payload}.${digest(`tomoflow.pro.v1:${payload}`)}`;
}
function verify(token, purpose) {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const [payload, signature, extra] = token.split('.');
  if (extra || !/^[a-f0-9]{64}$/.test(signature || '') || !/^[A-Za-z0-9_-]+$/.test(payload || '')) return null;
  const expected = digest(`tomoflow.pro.v1:${payload}`);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url'));
    if (data.purpose !== purpose || !Number.isInteger(data.exp) || data.exp <= Date.now() / 1000 || !/^[a-f0-9]{32}$/.test(data.nonce || '')) return null;
    return data;
  } catch { return null; }
}
function cookie(token, clear = false) {
  return `${COOKIE}=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 86400}${DEPLOYED ? '; Secure' : ''}`;
}
function checkoutContext(req) {
  const value = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return verify(value, 'checkout');
}
function ip(req) {
  // Vercel supplies trusted forwarding headers; local Node falls back to its socket.
  return String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}
module.exports = { sign, verify, digest, cookie, checkoutContext, ip };

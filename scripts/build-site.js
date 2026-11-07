// Keep server code, tests, migrations and internal docs out of the public website.
const { rmSync, mkdirSync, cpSync } = require('node:fs');
const { resolve } = require('node:path');
function buildSite(root = resolve(__dirname, '..')) {
  if (process.env.VERCEL_ENV === 'production' && !process.env.STRIPE_SECRET_KEY?.trim().startsWith('sk_test_')) {
    throw new Error('Production must keep Stripe in sandbox.');
  }
  const output = resolve(root, 'public');
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output);
  for (const entry of ['index.html', '404.html', 'support.html', 'privacy.html', 'terms.html', 'assets']) {
    cpSync(resolve(root, entry), resolve(output, entry), { recursive: true });
  }
  return output;
}
if (require.main === module) buildSite();
module.exports = buildSite;

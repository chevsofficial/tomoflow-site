# TomoFlow

A static, local-first Pomodoro timer. No framework, package dependencies, customer accounts, or cloud sync.

## Architecture

- `index.html`, `assets/js/timer.js`, `assets/css/styles.css`: timer, settings and Pro UI.
- `assets/js/themes.js` and `characters.js`: catalogs; each entry declares whether it is free.
- `assets/js/config.js`: public sandbox Payment Link, displayed price, optional Bitcoin address. No secrets.
- `support.html`, `terms.html`, `privacy.html`: static information pages. `nav.js` supplies shared navigation, footer links and year.
- `api/restore-pro.js`: checks Stripe for a paid Pro checkout matching the entered checkout email, then sends a Restore email.
- `api/stripe-webhook.js`: verifies the raw Stripe signature and sends purchase confirmations after successful paid Pro checkout.
- `lib/stripe.js`: shared exact Pro purchase matching for both endpoints. Generic app/sku metadata cannot unlock Pro.
- `lib/email-brand.js`: shared centered HTML and plain-text email templates.
- `lib/delivery-store.js`: Supabase delivery tracking. It is not a customer-account or timer database.
- `scripts/build-site.js`: copies only public HTML and assets into `public/`. Vercel bundles the two API routes separately; helpers, scripts, tests, migrations and docs are not static website files.

Timer settings, selected theme/character and `tomoflow_pro` stay in browser storage, with an in-memory fallback if writes are blocked. Clearing browser storage removes that local state. There is no timer data in Supabase. Unconfigured Bitcoin tips are hidden and make no QR-service request.

## Stripe sandbox and email configuration

Use the existing Vercel Marketplace Stripe **sandbox** resource. Do not switch to live keys or a live Payment Link.

1. The public test Payment Link lives in `assets/js/config.js`; its current after-payment redirect is `https://www.tomoflow.app/?pro=1`.
2. Set the server variables from `.env.example` in Vercel. Use the sandbox `STRIPE_SECRET_KEY` and at least one exact Pro Payment Link, price or product ID. Both Restore and confirmations require a complete, one-time, strictly paid session with that match.
3. The existing sandbox endpoint is `https://www.tomoflow.app/api/stripe-webhook`. Subscribe it to `checkout.session.completed` and `checkout.session.async_payment_succeeded`; retain its matching `STRIPE_WEBHOOK_SECRET`. Delayed unpaid checkouts wait for success. Failed and unrelated events are ignored.
4. Resend uses the verified `RESEND_API_KEY` and `RESEND_FROM=TomoFlow <noreply@tomoflow.app>`. `PUBLIC_SITE_URL=https://www.tomoflow.app` is the Restore destination. Restore reports send/provider failures as retryable errors; there is no client-only fallback.
5. Apply the versioned migrations in `supabase/migrations/`. Configure server-only `TOMOFLOW_SUPABASE_URL` and `TOMOFLOW_SUPABASE_SECRET_KEY` for the new TomoFlow project. Never use a publishable key or expose the secret in client config. Older, separately configured Supabase variables are not used by these routes.

The delivery table enables RLS, grants no browser/user access, and gives the service role SELECT, INSERT and UPDATE of the sent marker only. Records include recipient/email content and must be retained for duplicate protection. The privacy page describes this processing. No extra Supabase Auth or Realtime setup is needed.

## Email duplicate protection

An atomic Postgres insert with a unique Checkout Session key freezes one email payload and first-attempt timestamp. All success event types/retries use the same Resend idempotency key. After Resend accepts the email, its ID is saved; subsequent events acknowledge without sending.

Stripe, Supabase and Resend errors, missing recipients and missing configuration return 503 for retry. Resend acceptance followed by a failed database update is recovered with the same key. Acceptance does not guarantee inbox delivery.

Resend retains idempotency keys for 24 hours. Pending attempts older than 23 hours fail closed and need operator reconciliation against Resend logs, rather than risking another email after key expiry. Do not delete/reset ambiguous records or expire delivery records. Database loss removes durable duplicate protection. Historic purchases are not backfilled. If switching from an active older store, migrate its existing records first.

Confirmations use Stripe's actual total/currency and a purchase reference, escape dynamic HTML, and include plain text. Test purchases are explicitly marked `[TEST]` and state that no real money was charged. Their CTA opens the normal app; it does not create a new unlock mechanism.

## Build and verification

```sh
node --test tests/*.test.js
node scripts/build-site.js
python3 -m http.server 8080 --directory public
```

Vercel runs the same tests and static build. The Production build retains a local sandbox-key guard, but makes no external API calls: a provider outage cannot block an unrelated site fix. API routes require Vercel Functions (or `vercel dev`), not the static Python server.

Optional read-only operator checks, run in an environment with the server variables and `VERCEL_ENV=production`:

```sh
node scripts/verify-email-store.js
node scripts/verify-stripe-webhook.js
```

These inspect Supabase Data API access and required sandbox webhook subscriptions. They send no emails, replay no events and modify no provider settings. `supabase/tests/purchase_email_deliveries.sql` checks real grants/uniqueness/marker writes in a rolled-back synthetic transaction. Automated Node tests mock all provider calls.

After deployment, complete a **new sandbox Pro checkout**. Confirm one centered `[TEST]` email with the actual test total and no-real-charge label. Check browser-local access. In another browser, request Restore using the checkout email and follow the centered Restore email. Test delayed-payment success if enabled and verify failed/tip-only transactions send no confirmation. Actual inbox delivery and rendering in email clients require these checks; do not replay purchases or send test emails without authorization.

## Remaining work before a paid launch

The current checkout/Restore URL `?pro=1` still unlocks the local UI without verifying that link. It is an existing sandbox shortcut, not proof of payment. Replace it with server-verified checkout and signed, expiring Restore links before a paid launch. Local cosmetic assets/state remain editable by a technically capable browser user; this architecture does not provide DRM.

Restore also needs durable request throttling before public launch, and the support mailbox needs delivery/reply verification. These are separate from email confirmation duplicate protection. No customer-account system is needed to address them.

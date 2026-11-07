# TomoFlow

A static, local-first Pomodoro timer. No framework, package dependencies, customer accounts, or cloud sync.

## Architecture

- `index.html`, `assets/js/timer.js`, `assets/css/styles.css`: timer, settings and Pro UI.
- `assets/js/themes.js` and `characters.js`: catalogs; each entry declares whether it is free.
- `assets/js/config.js`: public sandbox Payment Link, displayed price, optional Bitcoin address. No secrets.
- `support.html`, `terms.html`, `privacy.html`: static information pages. `nav.js` supplies shared navigation, footer links and year.
- `api/restore-pro.js`: checks Stripe for a paid Pro checkout matching the entered checkout email, then sends a signed, 30-minute, one-use Restore link. Requests are limited per IP and email; the public response does not reveal purchase existence.
- `api/start-checkout.js`: issues an HttpOnly, signed 24-hour checkout-context cookie and redirects to the existing sandbox Payment Link with a random browser reference.
- `api/unlock-pro.js`: verifies the Stripe session plus browser context, or a signed Restore token, before granting a browser-local unlock. Restore redemption rechecks the purchase and atomically consumes the token.
- `api/stripe-webhook.js`: verifies the raw Stripe signature and sends purchase confirmations after successful paid Pro checkout.
- `lib/stripe.js`: shared exact Pro purchase matching for both endpoints. Generic app/sku metadata cannot unlock Pro.
- `lib/email-brand.js`: shared centered HTML and plain-text email templates.
- `lib/delivery-store.js`: Supabase delivery tracking. It is not a customer-account or timer database.
- `scripts/build-site.js`: copies only public HTML and assets into `public/`. Vercel bundles API routes separately; helpers, scripts, tests, migrations and docs are not static website files.

Timer settings, selected theme/character and `tomoflow_pro` stay in browser storage, with an in-memory fallback if writes are blocked. Clearing browser storage removes that local state. There is no timer data in Supabase. Unconfigured Bitcoin tips are hidden and make no QR-service request.

## Stripe sandbox and email configuration

Use the existing Vercel Marketplace Stripe **sandbox** resource. Do not switch to live keys or a live Payment Link.

1. The public test Payment Link lives in `assets/js/config.js`. Start through `/api/start-checkout` to bind it to the browser. Its after-payment redirect must be `https://www.tomoflow.app/?session_id={CHECKOUT_SESSION_ID}`.
2. Set the server variables from `.env.example` in Vercel. Use the sandbox `STRIPE_SECRET_KEY` and at least one exact Pro Payment Link, price or product ID. Both Restore and confirmations require a complete, one-time, strictly paid session with that match.
3. The existing sandbox endpoint is `https://www.tomoflow.app/api/stripe-webhook`. Subscribe it to `checkout.session.completed` and `checkout.session.async_payment_succeeded`; retain its matching `STRIPE_WEBHOOK_SECRET`. Delayed unpaid checkouts wait for success. Failed and unrelated events are ignored.
4. Resend uses the verified `RESEND_API_KEY` and `RESEND_FROM=TomoFlow <noreply@tomoflow.app>`. `PUBLIC_SITE_URL=https://www.tomoflow.app` is the Restore destination. Restore reports send/provider failures as retryable errors; there is no client-only fallback.
5. Apply the versioned migrations in `supabase/migrations/`. Configure server-only `TOMOFLOW_SUPABASE_URL` and `TOMOFLOW_SUPABASE_SECRET_KEY` for the new TomoFlow project. Never use a publishable key or expose the secret in client config. Older, separately configured Supabase variables are not used by these routes. Set a server-only random `PRO_TOKEN_SECRET` of at least 32 characters for signed checkout/Restore proofs; rotating it invalidates outstanding links and checkout contexts.

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

## Access security and operational limits

Plain `?pro=1`, `?unlocked=1` and `?dev=1` links never grant Pro. Older Restore emails using these shortcuts must be replaced by requesting a new email. Existing browser-local unlocks are preserved. New grants require a verified complete, paid Pro purchase; fully refunded purchases cannot grant a new unlock or Restore. Browser storage and cosmetic assets remain editable by a technically capable user, and an already cached offline unlock cannot be remotely revoked. This is not DRM.

Checkout returns must contain the Stripe session ID and the same signed browser context that started payment. A copied session URL alone cannot unlock another browser. Only one checkout context is active per browser at a time; if it expires or another tab replaces it, Restore remains available. Unpaid delayed payments show processing instructions and can be restored after success.

Restore links contain a signed token in the URL fragment, not the request query, and the app removes it from the address bar immediately. The user must click the restore-confirmation button, so opening/scanning a link does not consume it. Tokens expire after 30 minutes and can be redeemed once. If redemption succeeds but the response is lost, request a new link. They are not bound to a specific browser until redemption, so keep them private. They contain no email address.

`pro_request_limits` stores keyed hashes only, never raw IPs, email addresses or Restore tokens. An atomic invoker-rights RPC is callable only by the service role. Fixed windows allow 3 Restore requests per email per hour and 10 per IP per 15 minutes; checkout starts allow 10 per IP per 15 minutes and unlock verification 30. Expired rows are cleaned after a day as requests arrive. A one-use token claim lasts beyond token expiry. If this store is unavailable, access and email requests fail closed. Shared-network users share the IP quota. Automated large-scale abuse may require an additional challenge later; this does not require accounts.

The domain redirects to `www.tomoflow.app`, keeping checkout cookies and browser-local Pro state on one origin. The support mailbox is planned for Google Workspace and still requires creation and receive/reply verification; no DNS changes or support messages have been made by this code.

To inspect the existing sandbox Payment Link and verify the production request-protection RPC, run `node scripts/verify-checkout-link.js` with the Production server environment. It makes read-only Stripe calls and records one synthetic request-counter claim in Supabase, without sending email or consuming a Restore link. The explicit `--configure` option updates only that exact existing sandbox Payment Link's completion redirect. It refuses live, inactive or unrelated links. This is an operator action, never part of routine builds.

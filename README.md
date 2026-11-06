# TomoFlow Website

Simple Pomodoro timer for the browser. No accounts required.

Live experience is `/` — timer, settings, theme + character pickers, optional one-time Pro unlock, optional on-chain Bitcoin tip.

## Structure

- `index.html` — Timer app (main experience)
- `privacy.html` / `terms.html` / `support.html` — Legal & help
- `assets/js/config.js` — Stripe Payment Link + BTC address placeholders (client only)
- `assets/js/themes.js` — Theme catalog (add themes here; picker scales)
- `assets/js/characters.js` — Character (mascot) catalog; Pro art lives in `assets/img/characters/`
- `assets/js/timer.js` — Timer, localStorage, theme/character pickers, Pro unlock, Restore Pro, tip UI
- `assets/js/nav.js` / `main.js` — Header/footer helpers
- `assets/css/styles.css` — Shared styles + themes
- `assets/img/` — Logo, favicon, tomato + character art
- `api/restore-pro.js` — `POST /api/restore-pro` (Stripe lookup + Resend magic link / sandbox unlock)
- `api/stripe-webhook.js` — Signature-verified Pro purchase confirmations via Resend
- `vercel.json` — Thin rewrites for legal pages (`/api/*` is served by Vercel Functions)
- `.env.example` — Server env vars for Stripe / Resend / restore behavior

## Monetization

1. **Pro (one-time ~$21)** — Stripe Payment Link. After payment, redirect back with `?pro=1` so this browser unlocks Pro themes and characters (`tomoflow_pro` in localStorage). That query param is a **client hint** only — production restore verifies via Stripe + email (see below).
2. **Restore Pro** — Buyer enters the email on their Stripe receipt; `/api/restore-pro` checks Stripe for a paid purchase, then emails a magic unlock link via Resend (or, in sandbox only, unlocks the client when `ALLOW_CLIENT_RESTORE=1`).
3. **Optional Bitcoin tip** — On-chain address + QR + copy, collapsed under Support. Tips do **not** unlock Pro.

### Stripe Payment Link setup (sandbox → live)

1. Attach **Stripe** to this Vercel project (Marketplace / Integrations). Use the **sandbox / test mode** resource while wiring.
2. In Stripe Dashboard (test mode) → Payment Links → create a **one-time** product for **$21**.
3. Set **After payment → Redirect to** `https://YOUR_DOMAIN/?pro=1` (or the Vercel preview URL while testing).
4. Paste the link into `assets/js/config.js` as `stripePaymentLink`.
5. Set Vercel env from `.env.example`: at least `STRIPE_SECRET_KEY`. For restore emails also set `RESEND_API_KEY` + `RESEND_FROM` + `PUBLIC_SITE_URL`. For sandbox without Resend, set `ALLOW_CLIENT_RESTORE=1` on Preview only.
6. For confirmations, configure the sandbox webhook and durable delivery store as described below.
7. **Go live:** create a **live** Payment Link, replace `stripePaymentLink`, swap Vercel env to live `STRIPE_SECRET_KEY` / webhook secret, set `ALLOW_CLIENT_RESTORE=0`, redeploy.

Local Pro testing without Stripe: open the site with `?dev=1` to reveal **Mark Pro (local)**.

### Unlock / Restore behavior

| Situation | Unlock Pro button | Restore Pro |
| --- | --- | --- |
| Payment Link still `REPLACE_WITH_…` | Toast: checkout isn't configured | — |
| Payment Link set | Redirects to Stripe Checkout | — |
| Return with `?pro=1` | Client stores Pro (hint) | — |
| `STRIPE_SECRET_KEY` missing | — | `501` + helpful message |
| Purchase found + Resend configured | — | Emails `/?pro=1&restore=1` |
| Purchase found + `ALLOW_CLIENT_RESTORE=1` | — | `{ unlocked: true }` → client stores Pro |
| Purchase found, no Resend / allow flag | — | Success message; no auto-unlock (contact support) |
| No matching paid purchase | — | `404` |

### Bitcoin tip address

1. Generate or choose an on-chain receive address.
2. Replace `REPLACE_WITH_BTC_ADDRESS` in `assets/js/config.js` (`btcAddress`).
3. QR codes are generated client-side via a public QR image API from that address.

## Local preview

Static UI:

```bash
npx --yes serve .
# or: python3 -m http.server 8080
```

API routes (`/api/*`) need `vercel dev` (with env from `.env.example`) to exercise Restore Pro against Stripe test mode.

Open `http://localhost:3000` (or the port shown).

Mobile apps (if any) live in other repositories; this repo is the web timer.

## Purchase confirmations (sandbox remains enabled)

The previous webhook was a logging stub and never sent purchase mail. It now verifies the exact raw request body with HMAC-SHA256, constant-time comparison, and a five-minute timestamp tolerance. Missing signing configuration returns 503; invalid signatures return 400. There is no shape-only acceptance.

Before an approved deployment:

1. Keep the existing Vercel Marketplace Stripe **sandbox** key and test Payment Link. Set `STRIPE_WEBHOOK_SECRET` to the signing secret for the existing sandbox endpoint `https://www.tomoflow.app/api/stripe-webhook`.
2. Subscribe that endpoint to **both** `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Delayed methods are acknowledged while unpaid and confirmed only on successful payment. Failed/unrelated events are ignored.
3. Set at least one exact sandbox Pro identifier: `STRIPE_PRO_PAYMENT_LINK_ID`, `STRIPE_PRO_PRICE_ID`, or `STRIPE_PRO_PRODUCT_ID`. Confirm it identifies Pro, never a tip. Matching a Payment Link avoids a Stripe read; price/product matching paginates the session line items. Generic `app`/`sku` metadata is deliberately insufficient for confirmations. Existing Restore matching behavior is unchanged.
4. Reuse the verified `RESEND_API_KEY` and `RESEND_FROM=TomoFlow <noreply@tomoflow.app>` settings. Keep `PUBLIC_SITE_URL=https://www.tomoflow.app` for Restore. Confirmation links use the shared canonical branding URL.
5. Provision or reuse persistent Upstash Redis and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in the Vercel environment serving the endpoint. Configure no eviction and retain delivery records without TTL. Restrict database access: records contain the recipient and rendered email. No environment or webhook settings are changed by this PR.

Only complete, one-time, strictly `paid` Pro sessions with a positive actual transaction total and valid recipient are sent mail. Free/unpaid purchases and tip-only transactions are excluded. Sandbox subjects carry `[TEST]`, and HTML/plain text explicitly say no real money was charged. The email shows Stripe's actual total and currency (including zero/three decimal currencies), a session reference, and browser-local Pro/Restore instructions. Its ordinary app link grants no new entitlement. No live-payment configuration is introduced.

### Duplicate prevention and failures

An atomic Redis `SET NX` creates one permanent outbox record per Checkout Session and test/live mode, freezing the complete Resend payload and first-attempt timestamp. Resend receives the same session-based idempotency key and identical payload on concurrent deliveries, different success event types, and retries. After acceptance, Redis stores the returned email ID; subsequent webhooks acknowledge without sending. This is session-based, not event-ID-based.

Stripe/Redis/Resend errors, missing recipients, and missing required configuration return **503** so Stripe can retry. A send accepted by Resend followed by a Redis write failure is recovered with the same Resend idempotency key. Acceptance does not guarantee inbox delivery; bounces and mailbox filtering still require Resend diagnostics.

**Limits:** Resend idempotency expires after 24 hours. Pending records older than 23 hours return 503 without another send, preserving duplicate protection at the cost of automatic recovery for prolonged outages. Monitor non-2xx webhook deliveries and reconcile these promptly. Check the stored key against Resend delivery logs before marking a record sent with the confirmed email ID. Never delete/reset an ambiguous record or resend it blindly; an intentional resend requires operator review. Durable protection depends on retaining Redis records (including across deployments); database loss or manual deletion removes it. Existing historic purchases are not backfilled automatically.

### Verification and testing after approved deployment

Run `node --test tests/*.test.js` (Node 20+). All automated tests mock Stripe, Redis and Resend; no email or purchase event is sent. Tests cover signature/replay validation, purchase filtering, delayed success, missing recipient/configuration, concurrent duplicates, provider/store failure recovery, expired pending records, rendering/alignment and the existing Restore endpoint.

After you approve deployment and the settings above are present:

1. Complete a **new sandbox Pro checkout** with an inbox you control. Confirm the webhook succeeds and exactly one branded `[TEST]` confirmation arrives with the actual test amount/currency and no-real-charge label. Check its plain-text version and centered body, footer note and links in your email client.
2. Confirm the checkout return still unlocks Pro in that browser. In a separate browser without Pro, choose **Restore Pro**, enter the checkout email, and follow the existing restore email there. Check all its visible text is centered and that access remains browser-local.
3. If delayed methods are enabled, complete a new sandbox delayed-payment scenario: no confirmation while unpaid; one after success. Verify failure and tip-only sandbox transactions do not produce confirmations.
4. Only with explicit authorization to replay an event, redeliver that new successful sandbox event in Stripe and confirm no second email. Automated tests already cover this without replaying real events.

Live delivery, email-client rendering, deployed raw-body handling, configured Pro IDs, webhook subscriptions, Redis provisioning and bounce behavior remain unverified until these deployment checks. No deployment or live API/email test is performed by the automated suite.

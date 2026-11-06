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
- `api/stripe-webhook.js` — Stub for `checkout.session.completed` entitlement / unlock email
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
6. Point a Stripe webhook (optional but recommended) at `https://YOUR_DOMAIN/api/stripe-webhook` for `checkout.session.completed`, and set `STRIPE_WEBHOOK_SECRET`.
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

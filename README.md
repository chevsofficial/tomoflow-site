# TomoFlow Website

Simple **local-first** Pomodoro timer for the browser. No accounts, no Expo web bundle, no Supabase sync.

Live experience is `/` — timer, settings, themes, optional Pro unlock, optional on-chain Bitcoin tip.

## Structure

- `index.html` — Timer app (main experience)
- `privacy.html` / `terms.html` / `support.html` — Legal & help (local-first + one-time Pro + BTC tips)
- `assets/js/config.js` — **Stripe Payment Link** + **BTC address** placeholders
- `assets/js/timer.js` — Timer, localStorage, themes, Pro unlock, tip UI
- `assets/js/nav.js` / `main.js` — Header/footer helpers
- `assets/css/styles.css` — Shared styles + themes
- `assets/img/` — Logo, favicon, tomato art
- `vercel.json` — Thin rewrites for legal pages
- `.env.example` — Notes for Payment Link / BTC setup (site reads `config.js`)

## Monetization

1. **Pro (one-time ~$21)** — Stripe Payment Link. Success URL should be `https://YOUR_DOMAIN/?pro=1` (or `?unlocked=1`). The page stores `tomoflow_pro=1` in localStorage and unlocks Pro themes.
2. **Optional Bitcoin tip** — On-chain address + QR + copy. Tips do **not** unlock Pro.

### Stripe Payment Link setup

1. In Stripe Dashboard → Payment Links → create a **one-time** product for **$21**.
2. Set **After payment → Redirect to** your site with `?pro=1`.
3. Paste the link into `assets/js/config.js` as `stripePaymentLink`.
4. (Optional) Remove the “Mark Pro (local)” button before a public launch — it is a setup helper.

### Bitcoin tip address

1. Generate or choose an on-chain receive address.
2. Replace `REPLACE_WITH_BTC_ADDRESS` in `assets/js/config.js` (`btcAddress`).
3. QR codes are generated client-side via a public QR image API from that address.

## Local preview

```bash
npx --yes serve .
# or: python3 -m http.server 8080
```

Open `http://localhost:3000` (or the port shown).

## What was removed

- Expo export under `/app` and related Vercel SPA rewrites
- Auth pages / Supabase client in nav
- Stripe Checkout + webhook API that synced subscriptions to Supabase

Mobile apps (if any) live in other repositories; this repo is the simplified web timer.

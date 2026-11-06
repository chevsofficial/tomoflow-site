# TomoFlow Website

Simple Pomodoro timer for the browser. No accounts required.

Live experience is `/` — timer, settings, theme picker, optional one-time Pro unlock, optional on-chain Bitcoin tip.

## Structure

- `index.html` — Timer app (main experience)
- `privacy.html` / `terms.html` / `support.html` — Legal & help
- `assets/js/config.js` — Stripe Payment Link + BTC address placeholders
- `assets/js/themes.js` — Theme catalog (add themes here; picker scales)
- `assets/js/timer.js` — Timer, localStorage, theme picker, Pro unlock, tip UI
- `assets/js/nav.js` / `main.js` — Header/footer helpers
- `assets/css/styles.css` — Shared styles + themes
- `assets/img/` — Logo, favicon, tomato art
- `vercel.json` — Thin rewrites for legal pages
- `.env.example` — Notes for Payment Link / BTC setup (site reads `config.js`)

## Monetization

1. **Pro (one-time ~$21)** — Stripe Payment Link. After payment, redirect back to the site so this browser unlocks Pro themes (`tomoflow_pro` in localStorage).
2. **Optional Bitcoin tip** — On-chain address + QR + copy, collapsed under Support. Tips do **not** unlock Pro.

### Stripe Payment Link setup

1. In Stripe Dashboard → Payment Links → create a **one-time** product for **$21**.
2. Set **After payment → Redirect to** your site with a Pro unlock query (see `proUnlockParams` in `config.js`).
3. Paste the link into `assets/js/config.js` as `stripePaymentLink`.
4. Local Pro testing: open the site with `?dev=1` to reveal **Mark Pro (local)**.

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

Mobile apps (if any) live in other repositories; this repo is the web timer.

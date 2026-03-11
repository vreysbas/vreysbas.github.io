# EAFC 26 Hub Shop (GitHub Pages)

Static storefront with an EAFC 26-inspired theme and admin management.

## Features
- Shop page with cart, checkout and account login/register
- Admin dashboard with KPI cards, order table and CSV export
- Product management in admin (add/edit/delete manually)
- PayPal Checkout integration (real payments) via client-side SDK
- Optional order email notifications via Web3Forms

## Default Admin
- Username: `vreys.bas`
- Password: `Kleerkast0428!`

## Real Payment Setup (PayPal)
1. Open `payment-config.js`
2. Set `paypalClientId` to your PayPal app client ID
3. Keep `currency` as `EUR` or change to your preferred currency
4. Publish and test checkout

## Optional Email Setup
1. Open `email-config.js`
2. Set your Web3Forms access key and sender fields
3. Keep `enabled: true` only when configured

## Notes
- This project is fully static and stores orders/products in browser `localStorage`.
- For stronger security and server-side payment verification, add a backend with PayPal webhooks.

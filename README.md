# EAFC 26 Hub Shop (GitHub Pages)

Static storefront with an EAFC 26-inspired theme and admin management.

## Features
- Shop page with cart, checkout and account login/register
- Admin dashboard with KPI cards, order table and CSV export
- Product management in admin (add/edit/delete manually)
- Duidelijke manuele PayPal betaalflow met verplicht order-ID in beschrijving
- Optional order email notifications via Web3Forms

## Default Admin
- Username: `vreys.bas`
- Password: `Kleerkast0428!`

## Real Payment Setup (PayPal)
1. Klant maakt eerst order aan op de checkout pagina.
2. Klant maakt daarna manueel over naar `congaxd@gmail.com`.
3. Klant vermeldt verplicht het order-ID in de PayPal beschrijving.
4. Admin controleert betaling handmatig en zet orderstatus op betaald.

## Optional Email Setup
1. Open `email-config.js`
2. Set your Web3Forms access key and sender fields
3. Keep `enabled: true` only when configured

## Notes
- This project is fully static and stores orders/products in browser `localStorage`.
- Manuele betaalflow betekent dat betaling en orderkoppeling handmatig gebeuren.

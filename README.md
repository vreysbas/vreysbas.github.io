# EAFC 26 Hub Shop (GitHub Pages)

Static storefront with an EAFC 26-inspired theme and admin management.

## Features
- Shop page with cart, checkout and account login/register
- Admin dashboard with KPI cards, order table and CSV export
- Product management in admin (add/edit/delete manually)
- Duidelijke manuele PayPal betaalflow met verplicht order-ID in beschrijving
- Checkout vereist ingelogd account
- Optionele realtime cloud sync (Firebase Realtime Database) voor gedeelde data op meerdere toestellen
- Optional order email notifications via Web3Forms
- GDPR-hulp: verplichte consent bij registratie/checkout, data-export en self-service data-verwijdering

## Default Admin
- Username: `vreys.bas`
- Password: `Kleerkast0428!`
- Verander dit wachtwoord onmiddellijk na eerste login.

## Real Payment Setup (PayPal)
1. Klant maakt eerst order aan op de checkout pagina.
2. Klant maakt daarna manueel over naar `congaxd@gmail.com`.
3. Klant vermeldt verplicht het order-ID in de PayPal beschrijving.
4. Admin controleert betaling handmatig en zet orderstatus op betaald.

## Cloud Sync Setup (Meerdere toestellen)
1. Open `cloud-config.js`
2. Zet `enabled: true`
3. Vul je Firebase config waarden in (`apiKey`, `authDomain`, `projectId`, `appId`)
4. Publiceer opnieuw

Daarna delen pc/telefoon dezelfde orders, producten, accounts en checkout-config.

## GDPR / Security Checklist
1. Beperk toegang tot Firebase project tot bevoegde beheerders.
2. Gebruik niet langer algemene open regels dan nodig (`.read/.write: true` is alleen tijdelijk voor testen).
3. Verwerk alleen noodzakelijke persoonsgegevens; verwijder oude afgehandelde orders (retentie is ingebouwd op 180 dagen).
4. Respecteer rechten van betrokkenen: in de app kunnen gebruikers hun data downloaden en account+data verwijderen.
5. Gebruik een duidelijke privacytekst en contactadres voor inzage/verwijderverzoeken.
6. Sluit een verwerkersovereenkomst af met je hosting- en mailproviders indien vereist.

## Optional Email Setup
1. Open `email-config.js`
2. Set your Web3Forms access key and sender fields
3. Keep `enabled: true` only when configured

## Notes
- This project is fully static and stores orders/products in browser `localStorage`.
- Manuele betaalflow betekent dat betaling en orderkoppeling handmatig gebeuren.
- Deze code helpt met technische maatregelen, maar juridische GDPR-compliance hangt ook af van je processen, policies en contracten.

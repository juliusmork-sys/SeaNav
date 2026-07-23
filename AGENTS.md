# SeaNav Project Memory

Dette er prosjektminne for SeaNav. Bruk det som praktisk kontekst før du gjør endringer.

## Prosjekt

- SeaNav er en Vite/React/TypeScript-app for maritim navigasjon.
- Norsk er primærspråk. Engelsk finnes som valg i innstillinger.
- Appen deployes til Vercel og er tilgjengelig på `https://www.seanav.no`.
- Vercel-prosjektet er koblet lokalt via `.vercel/`.

## Git

- Repoet bruker en uvanlig git-layout:
  - `.git` er en katalog som ikke fungerer direkte for vanlig `git`.
  - Bruk `git --git-dir=.git-data --work-tree=.` for status, diff, commit og push.
- Standard branch er `main`.
- Remote er `origin` på `https://github.com/juliusmork-sys/SeaNav.git`.
- Når brukeren sier "commit og push alle endringer", stage alt i workspace, også endringer som allerede lå der.
- Ikke rull tilbake endringer du ikke har laget. Hvis de finnes, arbeid med dem eller inkluder dem når brukeren eksplisitt ber om alle endringer.

## Local Dev

- Start lokal server med:

```bash
npm run dev
```

- Scriptet binder til `0.0.0.0`, som ofte krever eskalering i sandbox.
- For testing lokalt bruker appen vanligvis `http://localhost:5173/`.
- Hvis dev-server allerede kjører fra en tidligere tur, sjekk/poll den heller enn å starte flere kopier unødvendig.

## Build

- Verifiser frontend-endringer med:

```bash
npm run build
```

- Det er en kjent Vite-advarsel om chunk over 500 kB. Den har ikke blokkert deploy.

## Deployment

- Deploy production med:

```bash
npx vercel --prod --yes
```

- Dette krever nettverk og må vanligvis kjøres med eskalering.
- Vercel aliaser production til `https://www.seanav.no`.
- Etter deploy: oppgi både `https://www.seanav.no` og direkte Vercel URL hvis CLI-en returnerer den.

## Vipps

- SeaNav bruker vanlig Vipps-betaling, ikke donasjon.
- Unngå ord som "donasjon", "doner" og "Vipps Donasjoner" i UI og vilkår når flyten gjelder betaling til Getz Tech AS.
- Betalingslenken er:

```text
https://qr.vipps.no/vp/nCQjy9dcM
```

- Appen har fallback-konstant i `src/App.tsx`, men kan overstyres med:

```bash
VITE_VIPPS_PAYMENT_URL="https://qr.vipps.no/vp/nCQjy9dcM"
```

- QR-koden ligger i `public/vipps-qr.png`.
- Det opprinnelige opplastede bildet kan også finnes som `public/QR-kode_GetzTechAS#59998.png`, men bruk `public/vipps-qr.png` i appkode fordi filnavnet er URL-vennlig.
- Vipps-knappen skal åpne lenken direkte. QR-koden skal vises i appen slik at brukere på nettbrett/laptop kan skanne med telefon.

## Avtalevilkår

- Vilkårssiden ligger i `public/avtalevilkar/index.html`.
- Den skal beskrive betalinger til Getz Tech AS, ikke donasjoner.
- Mottakerinformasjon som sist brukt:
  - Getz Tech AS
  - Organisasjonsnummer: 937 930 895
  - Nils Lauritssøns vei 38, 0870 Oslo, Norge
  - E-post: `julius.mork@gmail.com`

## Erfaringer Og Preferanser

- Når brukeren gir en konkret URL, bruk den direkte i stedet for å forsøke å gjette eller dekode fra skjermbilde.
- Hvis et opplastet bilde ikke er tilgjengelig som fil i workspace, be om fil eller URL i stedet for å late som QR-dekoding er mulig.
- I mobil portrettmodus kan Android navigasjonsbar og iOS Safari-adresselinje skjule nederste del av instrumentpanelet. Bruk `visualViewport` pluss plattformbasert fallback for `--mobile-panel-bottom-clearance`, ikke bare `env(safe-area-inset-bottom)`.
- Bruk `rg` først for søk.
- Bruk `apply_patch` for manuelle filendringer.
- Hold frontend-endringer konsistente med eksisterende instrument-/panelstil. Appen er et verktøy, ikke en landingsside.
- Ikke legg inn donasjonslogikk eller ideell-innsamlingsspråk for SeaNav uten at brukeren eksplisitt ber om det.

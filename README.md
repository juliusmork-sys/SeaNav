# SeaNav

SeaNav er en nettbasert navigasjonsapp for fritidsfartøy i Norge. Appen kombinerer live GPS-posisjon, roterbart kart, sjøkartlag, antatt dybde, badeplassmarkører og en kompakt instrumentvisning som fungerer både på mobil og desktop.

Appen er laget som en maritim situasjonsforståelse for nettleser, ikke som et sertifisert navigasjonsinstrument.

## Funksjoner

- Fullskjerm kart basert på MapLibre GL.
- Automatisk GPS-sporing med posisjon, GPS-presisjon, hastighet og kurs.
- Kart kan følge egen posisjon og rotere etter kurs, eller låses til nord opp.
- Instrumentpanel tilpasset skjermretning:
  - portrett: fast panel nederst
  - landskap på mobil: fast panel til venstre
  - desktop: kompakt panel på kartet
- Hastighet kan veksles mellom knop og km/t.
- Presise koordinater kan vises/skjules.
- Kartlag:
  - standard kart
  - satellitt
  - Kartverket sjøkart
  - badeplasser
- Antatt dybde basert på Kartverket dybdedata, med EMODnet som fallback.
- Badeplassmarkører fra Miljødirektoratet.
- Varsler for nærliggende badeplass og grunt område.
- Varsellyd kan skrus av/på.
- Norsk er primærspråk, med engelsk språkvalg i innstillinger.

## Datakilder

- **OpenFreeMap** brukes som standard basiskart.
- **Esri World Imagery** brukes som satellittlag.
- **Kartverket Sjøkart WMTS** brukes som sjøkartlag.
- **Kartverket Sjøkart dybdedata WFS** brukes for antatt dybde.
- **EMODnet Bathymetry** brukes som reservekilde for dybde dersom Kartverket ikke gir treff.
- **Miljødirektoratet Badeplasser** brukes for registrerte badeplasser og nærliggende badeplassvarsel.

## Teknologi

- React
- TypeScript
- Vite
- MapLibre GL JS
- Lucide React
- Vercel serverless functions for API-ruter

## API-ruter

Appen har to serverless API-ruter:

- `api/depth.ts`
  - Tar `lat` og `lon`.
  - Henter nærliggende dybdepunkter fra Kartverket WFS.
  - Returnerer estimert dybde, kilde, konfidens og avstand til nærmeste dybdepunkt.

- `api/beaches.ts`
  - Tar `lat`, `lon` og valgfri `radius`.
  - Henter registrerte badeplasser fra Miljødirektoratets ArcGIS-tjeneste.
  - Returnerer GeoJSON for visning på kart og nærmeste badeplass.

Ved vanlig `npm run dev` i Vite kjører ikke Vercel API-rutene. Bruk `vercel dev` hvis dybde- og badeplass-API skal testes lokalt.

## Lokal utvikling

Installer avhengigheter:

```bash
npm install
```

Start Vite-devserver:

```bash
npm run dev
```

Start med Vercel API-ruter lokalt:

```bash
vercel dev
```

Bygg produksjonsversjon:

```bash
npm run build
```

Forhåndsvis produksjonsbuild:

```bash
npm run preview
```

## Vipps-donasjon

Donasjonsknappen i innstillinger leser lenken fra:

```bash
VITE_VIPPS_DONATION_URL="https://..."
```

Legg verdien i `.env.local` lokalt og som environment variable i Vercel.

Anbefalt oppsett:

1. Bruk **Vipps Donasjoner** hvis SeaNav skal samle inn pengegaver som organisasjon/forening.
2. Opprett en innsamlingskampanje i Vipps-portalen.
3. Kopier kampanjelenken.
4. Sett lenken som `VITE_VIPPS_DONATION_URL`.
5. Deploy på nytt.

Hvis SeaNav ikke har tilgang til Vipps Donasjoner, kan en Vipps Payment Link brukes som midlertidig løsning, men da er det en betalingslenke og ikke Vipps sin dedikerte donasjonsløsning.

## Deploy

Prosjektet er konfigurert for Vercel:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

Ved deploy bygger Vercel frontend til `dist` og publiserer API-rutene under `/api`.

## Viktige begrensninger

- SeaNav er ikke godkjent for navigasjon og skal ikke erstatte offisielle sjøkart, utkikk, ekkolodd eller annet påkrevd navigasjonsutstyr.
- GPS-presisjon avhenger av enhet, nettleser, tillatelser og om brukeren har valgt presis lokasjon.
- Dybdeverdien er et estimat basert på kartdata og interpolering, ikke en live måling.
- Desktop-maskiner har ofte dårlig eller indirekte posisjonering via Wi-Fi/IP, og mangler gjerne reell kurs/hastighet.
- Badeplassdata avhenger av hva som er registrert i Miljødirektoratets datakilde.

## Status

SeaNav er under aktiv utvikling. Nåværende versjon fokuserer på mobil bruk til sjøs, lesbar dagmodus og norske datakilder.

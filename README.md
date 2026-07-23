# SeaNav

SeaNav er en nettbasert navigasjonsapp for fritidsbåter i Norge. Den gir sjøkart, GPS-posisjon, fart, kurs, antatt dybde og avstand til land i en kompakt visning som er tilpasset mobil, nettbrett og desktop.

SeaNav er kun for situasjonsforståelse og er ikke et godkjent navigasjonsinstrument.

## Funksjoner

- Landingsside og navigasjonsapp uten innlogging eller abonnement.
- GPS-sporing med posisjon, presisjon, fart og kurs.
- Nord opp, følg egen posisjon og roterende kart.
- Standardkart, satellitt, Kartverkets sjøkart og badeplasslag.
- Antatt dybde og avstand til land basert på Kartverket-data.
- Varsler for grunt farvann og nærliggende badeplasser.
- Sikkerhetsinnstillinger, sjømerkeoversikt og norsk/engelsk språkvalg.
- Vipps-støtte med betalingslenke og QR-kode.
- PWA-metadata og startskjermikoner for Android og iOS. En snarvei åpner navigasjonen direkte.

## Teknologi

React, TypeScript, Vite, MapLibre GL JS, Lucide og Vercel serverless functions.

## Datakilder

- OpenFreeMap og Esri World Imagery for basiskart.
- Kartverket for sjøkart, dybdepunkter og kystkontur.
- Miljødirektoratet for badeplasser.

## Lokal utvikling

```bash
npm install
npm run dev
```

Vite kjører frontenden. For å teste API-rutene lokalt med Vercel:

```bash
npx vercel dev
```

Produksjonsbuild:

```bash
npm run build
```

## API-ruter

- `/api/depth` estimerer dybde fra Kartverkets dybdepunkter.
- `/api/shoreline` beregner avstand til nærmeste kystkontur.
- `/api/beaches` henter badeplasser og nærmeste badeplass.

## Deploy

Prosjektet er konfigurert for Vercel. Deploy til produksjon med:

```bash
npx vercel --prod --yes
```

## Begrensninger

- SeaNav skal ikke erstatte offisielle sjøkart, utkikk, ekkolodd eller annet påkrevd navigasjonsutstyr.
- GPS-presisjon avhenger av enhet, nettleser, tillatelser og valgt nøyaktighet.
- Dybde og avstand til land er kartbaserte estimater, ikke målinger i sanntid.

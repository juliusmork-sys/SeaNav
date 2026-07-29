import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { createRoot } from "react-dom/client";
import maplibregl, { Map } from "maplibre-gl";
import {
  booleanSetting,
  enumSetting,
  usePersistedState,
} from "./usePersistedState";
import { usePresence } from "./usePresence";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  Anchor,
  BookOpen,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  Compass,
  Lightbulb,
  Clock,
  CloudSun,
  Crosshair,
  Download,
  Droplet,
  ExternalLink,
  Fuel,
  Globe,
  HeartHandshake,
  Layers,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Moon,
  Phone,
  Recycle,
  Sailboat,
  Satellite,
  Share,
  ShieldAlert,
  ShowerHead,
  SlidersHorizontal,
  Sun,
  Toilet,
  Wind,
  X,
  Waves,
  Zap,
} from "lucide-react";

type PositionFix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speedKnots: number | null;
  heading: number | null;
  headingSource: "gps" | "calculated" | "compass" | "none";
  timestamp: number;
};

type DepthState = {
  status: "idle" | "loading" | "ready" | "error";
  value: number | null;
  message: string;
};

type DepthEstimate = {
  value: number;
  message: string;
};

type ShorelineState = {
  status: "idle" | "loading" | "ready" | "error";
  distanceMeters: number | null;
};

type BeachFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  Record<string, unknown>
>;

type NearestBeach = {
  id: string | number | null;
  name: string;
  municipality: string | null;
  waterQuality: string | null;
  monitored: string | null;
  distanceMeters: number;
};

type BeachState = {
  status: "idle" | "loading" | "ready" | "error";
  nearest: NearestBeach | null;
  featureCollection: BeachFeatureCollection;
  markerFeatureCollection: BeachFeatureCollection;
};

type WeatherState = {
  status: "idle" | "loading" | "ready" | "error";
  temperature: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  waveHeight: number | null;
  waveDirection: number | null;
  currentSpeed: number | null;
  currentDirection: number | null;
  waterTemperature: number | null;
  symbolCode: string | null;
};

type TideExtreme = {
  type: "high" | "low";
  /** Millisekunder siden epoke. Kartverket leverer ISO med UTC-sone. */
  time: number;
  /** Centimeter over sjøkartnull. */
  value: number;
};

type TideState = {
  // «unavailable» er ikke en feil: Kartverket har ikke vannstand for posisjoner
  // langt fra kysten, og det gjelder også reelle sjøposisjoner. Det skal ikke se
  // ut som at noe er galt.
  status: "idle" | "loading" | "ready" | "error" | "unavailable";
  station: string | null;
  extremes: TideExtreme[];
};

type Harbor = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  type: string | null;
  website: string | null;
  phone: string | null;
  openingHours: string | null;
  capacity: string | null;
  amenities: string[];
};

type HarborState = {
  status: "idle" | "loading" | "ready" | "error";
  featureCollection: GeoJSON.FeatureCollection<GeoJSON.Point, Harbor>;
};

type Language = "no" | "en";
type SpeedUnit = "kn" | "kmh";
type DepthUnit = "m" | "ft";
type DistanceUnit = "metric" | "nm";
type HeadingMode = "full" | "degrees";
type BaseMap = "map" | "satellite" | "off";
type BeachDisplayMode = "off" | "icons" | "areas";
type GpsIssueCode =
  | "insecure"
  | "unsupported"
  | "denied"
  | "unavailable"
  | "timeout"
  | "unknown";
type GpsIssue = {
  code: GpsIssueCode;
  message: string;
};
type SeaMark = {
  title: string;
  detail: string;
  className: string;
  color?: string;
  reflex?: string;
  light?: string;
  lightVariant?: "white" | "red" | "green" | "yellow";
};

function SeaMarkSymbol({ type }: { type: string }) {
  const clip = `smclip-${type}`;
  const outline = "rgba(6,25,35,0.4)";
  const base = "0 0 44 90";
  switch (type) {
    case "north":
    case "south":
    case "east":
    case "west": {
      const bands =
        type === "north"
          ? [
              { y: 20, h: 31, fill: "#101820" },
              { y: 51, h: 31, fill: "#f2c94c" },
            ]
          : type === "south"
            ? [
                { y: 20, h: 31, fill: "#f2c94c" },
                { y: 51, h: 31, fill: "#101820" },
              ]
            : type === "east"
              ? [
                  { y: 20, h: 62, fill: "#101820" },
                  { y: 46, h: 10, fill: "#f2c94c" },
                ]
              : [
                  { y: 20, h: 62, fill: "#f2c94c" },
                  { y: 46, h: 10, fill: "#101820" },
                ];
      return (
        <svg viewBox={base} className="sea-mark-svg" aria-hidden="true">
          <defs>
            <clipPath id={clip}>
              <rect x="15" y="20" width="14" height="62" rx="6" />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clip})`}>
            {bands.map((b, i) => (
              <rect key={i} x="15" y={b.y} width="14" height={b.h} fill={b.fill} />
            ))}
          </g>
          <rect x="15" y="20" width="14" height="62" rx="6" fill="none" stroke={outline} strokeWidth="1.2" />
          <ellipse cx="22" cy="84" rx="11" ry="3" fill="#0b2733" opacity="0.14" />
        </svg>
      );
    }
    case "port":
      return (
        <svg viewBox="0 0 44 74" className="sea-mark-svg sea-mark-svg-lateral" aria-hidden="true">
          <rect x="15" y="10" width="14" height="56" rx="6" fill="#cf2323" stroke={outline} strokeWidth="1.4" />
          <ellipse cx="22" cy="68" rx="11" ry="2.6" fill="#0b2733" opacity="0.14" />
        </svg>
      );
    case "starboard":
      return (
        <svg viewBox="0 0 44 74" className="sea-mark-svg sea-mark-svg-lateral" aria-hidden="true">
          <rect x="15" y="10" width="14" height="56" rx="6" fill="#138a45" stroke={outline} strokeWidth="1.4" />
          <ellipse cx="22" cy="68" rx="11" ry="2.6" fill="#0b2733" opacity="0.14" />
        </svg>
      );
    case "special":
      return (
        <svg viewBox={base} className="sea-mark-svg" aria-hidden="true">
          <line x1="17" y1="12" x2="27" y2="22" stroke="#c99400" strokeWidth="3" strokeLinecap="round" />
          <line x1="27" y1="12" x2="17" y2="22" stroke="#c99400" strokeWidth="3" strokeLinecap="round" />
          <rect x="21" y="22" width="2" height="8" fill="#0b2733" />
          <rect x="15" y="30" width="14" height="52" rx="6" fill="#f2c94c" stroke={outline} strokeWidth="1.2" />
          <ellipse cx="22" cy="84" rx="11" ry="3" fill="#0b2733" opacity="0.14" />
        </svg>
      );
    case "danger":
      return (
        <svg viewBox={base} className="sea-mark-svg" aria-hidden="true">
          <defs>
            <clipPath id={clip}>
              <rect x="15" y="20" width="14" height="62" rx="6" />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clip})`}>
            <rect x="15" y="20" width="14" height="62" fill="#101820" />
            <rect x="15" y="46" width="14" height="10" fill="#cf2323" />
          </g>
          <rect x="15" y="20" width="14" height="62" rx="6" fill="none" stroke={outline} strokeWidth="1.2" />
          <ellipse cx="22" cy="84" rx="11" ry="3" fill="#0b2733" opacity="0.14" />
        </svg>
      );
    case "safe":
      return (
        <svg viewBox={base} className="sea-mark-svg" aria-hidden="true">
          <defs>
            <clipPath id={clip}>
              <rect x="15" y="20" width="14" height="62" rx="6" />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clip})`}>
            <rect x="15" y="20" width="3.5" height="62" fill="#cf2323" />
            <rect x="18.5" y="20" width="3.5" height="62" fill="#ffffff" />
            <rect x="22" y="20" width="3.5" height="62" fill="#cf2323" />
            <rect x="25.5" y="20" width="3.5" height="62" fill="#ffffff" />
          </g>
          <rect x="15" y="20" width="14" height="62" rx="6" fill="none" stroke={outline} strokeWidth="1.2" />
          <ellipse cx="22" cy="84" rx="11" ry="3" fill="#0b2733" opacity="0.14" />
        </svg>
      );
    case "stang":
      return (
        <svg viewBox={base} className="sea-mark-svg" aria-hidden="true">
          <rect x="21" y="12" width="3" height="70" fill="#46626e" />
          <rect x="12" y="12" width="9" height="7" fill="#46626e" />
          <ellipse cx="22.5" cy="84" rx="8" ry="2.4" fill="#0b2733" opacity="0.12" />
        </svg>
      );
    case "varde":
      return (
        <svg viewBox={base} className="sea-mark-svg" aria-hidden="true">
          <defs>
            <clipPath id={clip}>
              <polygon points="15,42 29,42 35,80 9,80" />
            </clipPath>
          </defs>
          <rect x="20.5" y="18" width="3" height="24" fill="#46626e" />
          <rect x="11.5" y="18" width="9" height="6.5" fill="#46626e" />
          <rect x="7" y="38" width="30" height="4" rx="1" fill="#46626e" />
          <g clipPath={`url(#${clip})`}>
            <rect x="8" y="40" width="28" height="42" fill="#46626e" />
            <rect x="8" y="57" width="28" height="8" fill="#eef2f0" />
          </g>
          <polygon points="15,42 29,42 35,80 9,80" fill="none" stroke="rgba(6,25,35,0.3)" strokeWidth="1" strokeLinejoin="round" />
          <ellipse cx="22" cy="83" rx="13" ry="2.8" fill="#0b2733" opacity="0.12" />
        </svg>
      );
    case "bake":
      return (
        <svg viewBox={base} className="sea-mark-svg" aria-hidden="true">
          <g stroke="#46626e" strokeWidth="1.7" fill="none" strokeLinecap="round">
            <line x1="10" y1="20" x2="10" y2="44" />
            <line x1="34" y1="20" x2="34" y2="44" />
            <line x1="10" y1="21" x2="34" y2="21" />
            <line x1="10" y1="25" x2="34" y2="25" />
            <line x1="10" y1="29" x2="34" y2="29" />
            <line x1="10" y1="33" x2="34" y2="33" />
            <line x1="10" y1="37" x2="34" y2="37" />
            <line x1="10" y1="41" x2="34" y2="41" />
            <line x1="34" y1="25" x2="40" y2="25" />
            <line x1="34" y1="29" x2="40" y2="29" />
            <line x1="12" y1="44" x2="6" y2="82" strokeWidth="2.3" />
            <line x1="32" y1="44" x2="38" y2="82" strokeWidth="2.3" />
            <line x1="22" y1="44" x2="22" y2="82" strokeWidth="2.3" />
          </g>
          <ellipse cx="22" cy="84" rx="14" ry="2.6" fill="#0b2733" opacity="0.1" />
        </svg>
      );
    default:
      return null;
  }
}

function SeaLedDirection() {
  return (
    <svg viewBox="0 0 64 168" className="sea-mark-led" aria-hidden="true">
      <path
        d="M32 8 C40 18 40 34 37 56 L27 56 C24 34 24 18 32 8 Z"
        fill="#d3dbe0"
        stroke="#0b2733"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M29 24 Q32 18 35 24 L35 38 L29 38 Z" fill="#2f80b8" />
      <line x1="32" y1="58" x2="32" y2="106" stroke="rgba(6,25,35,0.45)" strokeWidth="2" strokeDasharray="4 5" />
      <polygon
        points="32,104 46,126 39,126 39,148 25,148 25,126 18,126"
        fill="#ffffff"
        stroke="#0b2733"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="136" r="7" fill="#cf2323" />
      <circle cx="52" cy="136" r="7" fill="#138a45" />
    </svg>
  );
}

type CameraPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

const DEFAULT_VIPPS_PAYMENT_URL = "https://qr.vipps.no/vp/nCQjy9dcM";
const VIPPS_QR_IMAGE_URL = "/vipps-qr.png";
const HERO_IMAGE_URL = "/seanav-hero.png";
const LOGO_IMAGE_URL = "/app-icon-512.png";

const UI_TEXT = {
  no: {
    waitingForPosition: "Venter på posisjon",
    updatingEstimate: "Oppdaterer estimat",
    depthUnavailable: "Dybdetjeneste utilgjengelig",
    kartverketEstimate: (confidence: string, nearest: number | null) =>
      `Kartverket-estimat (${confidence}${nearest !== null ? `, nærmeste ${nearest} m` : ""})`,
    emodnetFallback: "EMODnet DTM-reserveestimat",
    brandSubtitle: "Maritim navigasjon i Norge",
    navigationMap: "Navigasjonskart",
    navigationStatus: "Navigasjonsstatus",
    liveNavigationData: "Navigasjonsdata",
    mapDepth: "Antatt dybde",
    distanceToLand: "Avstand til land",
    onLand: "På land",
    latitude: "Breddegrad",
    longitude: "Lengdegrad",
    speed: "Hastighet",
    toggleSpeedUnit: "Veksle mellom knop og kilometer i timen",
    toggleDepthUnit: "Veksle mellom meter og fot",
    toggleDistanceUnit: "Veksle mellom kilometer/meter og nautiske mil",
    toggleHeadingMode: "Veksle mellom kurs med kompasspunkt og bare grader",
    heading: "Kurs",
    gpsAccuracy: "GPS-presisjon",
    gpsRestarting: "Re-starter...",
    noGps: "Ingen GPS",
    retryGps: "Start eller prøv GPS-sporing på nytt",
    gpsIssueTitle: "GPS-posisjon er ikke aktiv",
    gpsIssueHelp: "Vis hjelp",
    gpsIssueRetry: "Prøv igjen",
    dismissGpsIssue: "Lukk GPS-varsel",
    gpsHelpTitle: "Aktiver GPS for SeaNav",
    gpsHelpSubtitle:
      "SeaNav trenger presis posisjon i nettleseren for å vise fart, kurs og egen båt riktig.",
    closeGpsHelp: "Lukk GPS-hjelp",
    gpsIssueMessages: {
      insecure:
        "GPS virker bare på sikker tilkobling. Åpne appen via https://seanav.no.",
      unsupported:
        "Denne enheten eller nettleseren tilbyr ikke GPS-posisjon til nettsider.",
      denied:
        "Posisjonstilgang er blokkert. Gi nettleseren og seanav.no tilgang til presis posisjon.",
      unavailable:
        "Enheten klarer ikke hente posisjon akkurat nå. Sjekk at stedstjenester og presis posisjon er aktivert.",
      timeout:
        "GPS brukte for lang tid. Gå utendørs, sjekk stedstjenester og prøv igjen.",
      unknown:
        "GPS-sporing kunne ikke startes. Sjekk posisjonsinnstillingene og prøv igjen.",
    },
    gpsHelpSections: [
      {
        title: "Android og Chrome",
        steps: [
          "Åpne Android Innstillinger > Posisjon og slå på posisjon.",
          "Gå til Apper > Chrome > Tillatelser > Posisjon og velg Tillat.",
          "Velg presis posisjon for Chrome hvis Android spør om nøyaktighet.",
          "I Chrome: åpne seanav.no, trykk lås-/innstillingsikonet i adresselinjen og tillat posisjon for siden.",
        ],
      },
      {
        title: "iPhone og Safari",
        steps: [
          "Åpne Innstillinger > Personvern og sikkerhet > Stedstjenester og slå på stedstjenester.",
          "Gå til Safari > Sted og velg Spør eller Tillat.",
          "Åpne seanav.no igjen og tillat posisjon når Safari spør.",
          "Hvis valget er blokkert: Innstillinger > Safari > Avansert > Nettsteddata, fjern seanav.no og prøv igjen.",
        ],
      },
      {
        title: "Vanlige årsaker",
        steps: [
          "Bærbare PC-er og nettbrett uten GPS kan gi grov eller manglende posisjon.",
          "VPN, strømsparing eller dårlig dekning kan redusere presisjon.",
          "For navigasjon bør mobilen ha fri sikt mot himmelen og presis posisjon aktivert.",
        ],
      },
    ],
    lockedNorth: "Låst til nord",
    followingCourse: "Følger kurs",
    returnToLocation: "Gå til GPS-posisjon",
    myLocation: "Min posisjon",
    settings: "Innstillinger",
    showDisplayOptions: "Vis innstillinger",
    navLayers: "Kartlag",
    showNavigationControls: "Vis kartlag",
    language: "Språk",
    norwegian: "Norsk",
    english: "English",
    accuracyRing: "Nøyaktighetsring",
    ownshipMarker: "Egen posisjon",
    headingLine: "Vis kjøreretning (200 m linje)",
    safetyNotice: "Sikkerhetsvarsel",
    alertSound: "Varsellyd",
    seaMarks: "Sjømerker",
    openSeaMarks: "Åpne oversikt over sjømerker",
    payment: "Støtt med Vipps",
    paymentUnavailable: "Vipps-lenke er ikke satt opp ennå.",
    paymentQrTitle: "Vipps QR-kode",
    paymentQrDescription:
      "SeaNav er helt gratis å bruke for alle. Vi blir derimot veldig glade for valgfritt bidrag for å støtte videre utvikling.",
    closeSeaMarks: "Lukk sjømerker",
    seaMarksTitle: "Sjømerker",
    seaMarksSubtitle: "Norge bruker IALA region A.",
    seaMarksSource: "Kilde: Kystverket – Fyr, lykter og sjømerker",
    seaMarksIntro:
      "Farge og form viser typen. Lyssymbolet markerer lyskarakteren du ser om natta. Refleks hjelper deg å finne merket i lyskaster.",
    seaMarksColorLabel: "Farge",
    seaMarksReflexLabel: "Refleks",
    seaMarksGroupCardinal: "Kardinalmerker",
    seaMarksGroupCardinalIntro:
      "Trygt farvann ligger i himmelretningen merket peker mot. Alltid svart/gult, alltid hvitt lys.",
    seaMarksGroupLateral: "Lateralmerker (sidemerker)",
    seaMarksGroupLateralIntro:
      "Med hovedretningen (normalt inn mot havn): rødt på babord (venstre), grønt på styrbord (høyre).",
    seaMarksGroupOther: "Andre flytende merker",
    seaMarksGroupFixed: "Faste merker",
    seaMarksGroupFixedIntro:
      "Rundt 12 000 bunnfaste merker uten lys, ofte med refleks. Markerer småskjær og grunner. Viseren peker mot sikkert farvann. Tre hovedtyper. Der viser peker til begge sider (eller hvit krekse) = farbar led på begge sider.",
    seaMarksCardinal: [
      {
        title: "Nord kardinalmerke",
        color: "Svart over gult",
        reflex: "Blått over gult",
        light: "Q W",
        lightVariant: "white",
        detail: "Trygt farvann ligger nord for merket.",
        className: "north",
      },
      {
        title: "Øst kardinalmerke",
        color: "Svart med ett gult belte",
        reflex: "To blå bånd",
        light: "Q(3) W 10s",
        lightVariant: "white",
        detail: "Trygt farvann ligger øst for merket.",
        className: "east",
      },
      {
        title: "Sør kardinalmerke",
        color: "Gult over svart",
        reflex: "Gult over blått",
        light: "Q(6)+LFl W 15s",
        lightVariant: "white",
        detail: "Trygt farvann ligger sør for merket.",
        className: "south",
      },
      {
        title: "Vest kardinalmerke",
        color: "Gult med ett svart belte",
        reflex: "To gule bånd",
        light: "Q(9) W 15s",
        lightVariant: "white",
        detail: "Trygt farvann ligger vest for merket.",
        className: "west",
      },
    ] satisfies SeaMark[],
    seaMarksLateral: [
      {
        title: "Babord",
        color: "Rød",
        reflex: "Rød",
        light: "Rødt lys",
        lightVariant: "red",
        detail: "Hold på babord (venstre) side.",
        className: "port",
      },
      {
        title: "Styrbord",
        color: "Grønn",
        reflex: "Grønn",
        light: "Grønt lys",
        lightVariant: "green",
        detail: "Hold på styrbord (høyre) side.",
        className: "starboard",
      },
    ] satisfies SeaMark[],
    seaMarksOther: [
      {
        title: "Spesialmerke",
        color: "Gul, gult X-toppmerke",
        reflex: "Gul",
        light: "Fl(4) Y",
        lightVariant: "yellow",
        detail: "Særskilt område – f.eks. badeplass, kabel eller oppdrett.",
        className: "special",
      },
      {
        title: "Frittliggende grunne",
        color: "Svart med røde belter",
        reflex: "Blått over rødt",
        light: "Fl(2) W",
        lightVariant: "white",
        detail: "Fare rett ved merket – seilbart rundt.",
        className: "danger",
      },
      {
        title: "Senterledsmerke",
        color: "Røde/hvite loddrette striper",
        reflex: "Rødt over hvitt",
        light: "Iso W / LFl W",
        lightVariant: "white",
        detail: "Trygt farvann rundt – midt i leden.",
        className: "safe",
      },
    ] satisfies SeaMark[],
    seaMarksFixed: [
      {
        title: "Stang",
        detail:
          "Jernstang med viser eller toppmerke/krekse, oftest med refleks. Står på grunner og tørrfall. Vanligste faste merket.",
        className: "stang",
      },
      {
        title: "Varde",
        detail:
          "Steinvarde eller murt dagmerke på holme eller skjær, ofte med stang og viser på toppen. Holdepunkt mot himmelen.",
        className: "varde",
      },
      {
        title: "Båke",
        detail:
          "Større dagmerke i tre eller stål – ofte gittertårn på bukk. Satt opp så konturen synes mot himmelen. Uten lys.",
        className: "bake",
      },
    ] satisfies SeaMark[],
    beachAreas: "Badeplasser",
    beachLayerOff: "Av",
    beachLayerIcons: "Strand",
    beachLayerAreas: "Areal",
    dismissAlert: "Lukk varsel",
    showStandardMap: "Vis standard kart",
    showSatelliteImagery: "Vis satellittbilde",
    hideBaseMap: "Skjul basiskart",
    cycleBaseMap: "Bytt mellom kart, satellitt og av",
    toggleNauticalChart: "Slå sjøkart av/på",
    toggleBeachAreas: "Bytt visning for badeplasser",
    togglePrecisePosition: "Vis/skjul presise koordinater",
    map: "Kart",
    satellite: "Satellitt",
    chart: "Sjøkart",
    beaches: "Bading",
    harbors: "Havner",
    weather: "Vær",
    weatherHere: "Vær her",
    weatherToggle: "Vis værdata for posisjon",
    weatherWaiting: "Venter på GPS-posisjon",
    weatherUnavailable: "Værdata er ikke tilgjengelig akkurat nå.",
    weatherOpenForecast: "Åpne værmelding for posisjonen på yr.no",
    wind: "Vind",
    waves: "Bølger",
    current: "Strøm",
    tideHigh: "Flo",
    tideLow: "Fjære",
    tideNow: "Nå",
    tideExpanded: "Utvidet tidevannsvisning",
    harborCapacity: "Kapasitet",
    harborHours: "Åpningstider",
    harborPhone: "Telefon",
    harborWebsite: "Nettside",
    harborTypeMarina: "Marina",
    harborTypeHarbour: "Havn",
    beachBadge: "Badeplass",
    waterTemperature: "Vanntemperatur",
    waterTemperatureLoading: "Henter …",
    waterTemperatureUnavailable: "Ikke tilgjengelig",
    waterQualityLabels: {
      good: "God vannkvalitet",
      fair: "Mindre god vannkvalitet",
      poor: "Ikke akseptabel vannkvalitet",
    },
    harborOpenAllHours: "Åpent hele døgnet",
    harborCapacityUnit: (count: number) => `${count} båtplasser`,
    amenityLabels: {
      power: "Strøm",
      water: "Vann",
      toilets: "Toalett",
      shower: "Dusj",
      sewage: "Tømming",
      fuel: "Drivstoff",
    },
    openGoogleMaps: "Åpne i Google Maps",
    closeMap: "Lukk kart",
    coordinates: "Koordinater",
    precisePosition: "Presis posisjon",
    beachSpeedWarning: (name: string, distance: number) =>
      `Badeplass nær deg: maks 5 kn ved ${name} (${distance} m)`,
    beachNearby: (name: string, distance: number) =>
      `Badeplass nær deg: ${name} (${distance} m)`,
    shallowWaterWarning: (depth: number, distance: number) =>
      `Grunt område foran: antatt dybde ${depth.toFixed(1)} m om ${distance} m`,
    safetyNoticeText:
      "Kun situasjonsforståelse. Ikke godkjent for navigasjon.",
  },
  en: {
    waitingForPosition: "Waiting for position",
    updatingEstimate: "Updating estimate",
    depthUnavailable: "Depth service unavailable",
    kartverketEstimate: (confidence: string, nearest: number | null) =>
      `Kartverket WFS estimate (${confidence}${nearest !== null ? `, nearest ${nearest} m` : ""})`,
    emodnetFallback: "EMODnet DTM fallback estimate",
    brandSubtitle: "Maritim navigasjon i Norge",
    navigationMap: "Navigation map",
    navigationStatus: "Navigation status",
    liveNavigationData: "Live navigation data",
    mapDepth: "Map depth",
    distanceToLand: "Distance to land",
    onLand: "On land",
    latitude: "Latitude",
    longitude: "Longitude",
    speed: "Speed",
    toggleSpeedUnit: "Toggle between knots and kilometers per hour",
    toggleDepthUnit: "Toggle between meters and feet",
    toggleDistanceUnit: "Toggle between kilometers/meters and nautical miles",
    toggleHeadingMode: "Toggle between heading with compass point and degrees only",
    heading: "Heading",
    gpsAccuracy: "GPS Accuracy",
    gpsRestarting: "Restarting...",
    noGps: "No GPS",
    retryGps: "Start or retry GPS tracking",
    gpsIssueTitle: "GPS position is not active",
    gpsIssueHelp: "Show help",
    gpsIssueRetry: "Try again",
    dismissGpsIssue: "Dismiss GPS alert",
    gpsHelpTitle: "Enable GPS for SeaNav",
    gpsHelpSubtitle:
      "SeaNav needs precise browser location to show speed, course and your boat correctly.",
    closeGpsHelp: "Close GPS help",
    gpsIssueMessages: {
      insecure:
        "GPS only works on a secure connection. Open the app at https://seanav.no.",
      unsupported:
        "This device or browser does not provide GPS location to websites.",
      denied:
        "Location access is blocked. Allow the browser and seanav.no to use precise location.",
      unavailable:
        "The device cannot get a position right now. Check that location services and precise location are enabled.",
      timeout:
        "GPS took too long. Move outdoors, check location services and try again.",
      unknown:
        "GPS tracking could not start. Check location settings and try again.",
    },
    gpsHelpSections: [
      {
        title: "Android and Chrome",
        steps: [
          "Open Android Settings > Location and turn location on.",
          "Go to Apps > Chrome > Permissions > Location and choose Allow.",
          "Choose precise location for Chrome if Android asks about accuracy.",
          "In Chrome: open seanav.no, tap the lock/settings icon in the address bar and allow location for the site.",
        ],
      },
      {
        title: "iPhone and Safari",
        steps: [
          "Open Settings > Privacy & Security > Location Services and turn location services on.",
          "Go to Safari > Location and choose Ask or Allow.",
          "Open seanav.no again and allow location when Safari asks.",
          "If the choice is blocked: Settings > Safari > Advanced > Website Data, remove seanav.no and try again.",
        ],
      },
      {
        title: "Common causes",
        steps: [
          "Laptops and tablets without GPS can provide rough or missing positions.",
          "VPN, power saving or poor signal can reduce accuracy.",
          "For navigation, the phone should have a clear sky view and precise location enabled.",
        ],
      },
    ],
    lockedNorth: "Locked to north",
    followingCourse: "Following course",
    returnToLocation: "Return to GPS location",
    myLocation: "My location",
    settings: "Settings",
    showDisplayOptions: "Show display options",
    navLayers: "Nav layers",
    showNavigationControls: "Show navigation controls",
    language: "Language",
    norwegian: "Norsk",
    english: "English",
    accuracyRing: "Accuracy ring",
    ownshipMarker: "Ownship marker",
    headingLine: "Show heading line (200 m)",
    safetyNotice: "Safety notice",
    alertSound: "Alert sound",
    seaMarks: "Sea marks",
    openSeaMarks: "Open sea mark overview",
    payment: "Support with Vipps",
    paymentUnavailable: "Vipps payment link is not configured yet.",
    paymentQrTitle: "Vipps QR code",
    paymentQrDescription:
      "SeaNav is free for everyone to use. Optional contributions to support further development are greatly appreciated.",
    closeSeaMarks: "Close sea marks",
    seaMarksTitle: "Sea marks",
    seaMarksSubtitle: "Norway uses IALA region A.",
    seaMarksSource: "Source: Kystverket – lighthouses, lights and sea marks",
    seaMarksIntro:
      "Colour and shape show the type. The light symbol marks the light character you see at night. Reflex helps you find the mark with a spotlight.",
    seaMarksColorLabel: "Colour",
    seaMarksReflexLabel: "Reflex",
    seaMarksGroupCardinal: "Cardinal marks",
    seaMarksGroupCardinalIntro:
      "Safe water lies in the compass direction the mark points to. Always black/yellow, always a white light.",
    seaMarksGroupLateral: "Lateral marks",
    seaMarksGroupLateralIntro:
      "With the main direction of buoyage (normally into harbour): red to port (left), green to starboard (right).",
    seaMarksGroupOther: "Other floating marks",
    seaMarksGroupFixed: "Fixed marks",
    seaMarksGroupFixedIntro:
      "Around 12,000 fixed unlit marks, often with reflex. They mark small skerries and shoals. The pointer points toward safe water. Three main types. Where pointers face both sides (or a white topmark) = navigable water on both sides.",
    seaMarksCardinal: [
      {
        title: "North cardinal mark",
        color: "Black over yellow",
        reflex: "Blue over yellow",
        light: "Q W",
        lightVariant: "white",
        detail: "Safe water is north of the mark.",
        className: "north",
      },
      {
        title: "East cardinal mark",
        color: "Black with one yellow band",
        reflex: "Two blue bands",
        light: "Q(3) W 10s",
        lightVariant: "white",
        detail: "Safe water is east of the mark.",
        className: "east",
      },
      {
        title: "South cardinal mark",
        color: "Yellow over black",
        reflex: "Yellow over blue",
        light: "Q(6)+LFl W 15s",
        lightVariant: "white",
        detail: "Safe water is south of the mark.",
        className: "south",
      },
      {
        title: "West cardinal mark",
        color: "Yellow with one black band",
        reflex: "Two yellow bands",
        light: "Q(9) W 15s",
        lightVariant: "white",
        detail: "Safe water is west of the mark.",
        className: "west",
      },
    ] satisfies SeaMark[],
    seaMarksLateral: [
      {
        title: "Port",
        color: "Red",
        reflex: "Red",
        light: "Red light",
        lightVariant: "red",
        detail: "Keep to port (left) side.",
        className: "port",
      },
      {
        title: "Starboard",
        color: "Green",
        reflex: "Green",
        light: "Green light",
        lightVariant: "green",
        detail: "Keep to starboard (right) side.",
        className: "starboard",
      },
    ] satisfies SeaMark[],
    seaMarksOther: [
      {
        title: "Special mark",
        color: "Yellow, yellow X topmark",
        reflex: "Yellow",
        light: "Fl(4) Y",
        lightVariant: "yellow",
        detail: "Special area – e.g. bathing, cable or aquaculture.",
        className: "special",
      },
      {
        title: "Isolated danger mark",
        color: "Black with red bands",
        reflex: "Blue over red",
        light: "Fl(2) W",
        lightVariant: "white",
        detail: "Danger at the mark – navigable around it.",
        className: "danger",
      },
      {
        title: "Safe water mark",
        color: "Red/white vertical stripes",
        reflex: "Red over white",
        light: "Iso W / LFl W",
        lightVariant: "white",
        detail: "Safe water around – mid-channel.",
        className: "safe",
      },
    ] satisfies SeaMark[],
    seaMarksFixed: [
      {
        title: "Pole (stang)",
        detail:
          "Iron pole with a pointer or topmark, usually with reflex. Stands on shoals and drying rocks. The most common fixed mark.",
        className: "stang",
      },
      {
        title: "Cairn (varde)",
        detail:
          "Stone cairn or masonry daymark on an islet or skerry, often with a pole and pointer on top. A landmark against the sky.",
        className: "varde",
      },
      {
        title: "Beacon (båke)",
        detail:
          "Larger daymark in wood or steel – often a lattice tower on legs. Placed so its outline shows against the sky. Unlit.",
        className: "bake",
      },
    ] satisfies SeaMark[],
    beachAreas: "Bathing areas",
    beachLayerOff: "Off",
    beachLayerIcons: "Beach",
    beachLayerAreas: "Area",
    dismissAlert: "Dismiss alert",
    showStandardMap: "Show standard map",
    showSatelliteImagery: "Show satellite imagery",
    hideBaseMap: "Hide base map",
    cycleBaseMap: "Switch between map, satellite and off",
    toggleNauticalChart: "Toggle nautical chart",
    toggleBeachAreas: "Change bathing area display",
    togglePrecisePosition: "Show/hide precise coordinates",
    map: "Map",
    satellite: "Satellite",
    chart: "Chart",
    beaches: "Bathing",
    harbors: "Harbours",
    weather: "Weather",
    weatherHere: "Weather here",
    weatherToggle: "Show weather data for position",
    weatherWaiting: "Waiting for GPS position",
    weatherUnavailable: "Weather data is unavailable right now.",
    weatherOpenForecast: "Open the forecast for this position on yr.no",
    wind: "Wind",
    waves: "Waves",
    current: "Current",
    tideHigh: "High tide",
    tideLow: "Low tide",
    tideNow: "Now",
    tideExpanded: "Extended tide display",
    harborCapacity: "Capacity",
    harborHours: "Opening hours",
    harborPhone: "Phone",
    harborWebsite: "Website",
    harborTypeMarina: "Marina",
    harborTypeHarbour: "Harbour",
    beachBadge: "Bathing spot",
    waterTemperature: "Water temperature",
    waterTemperatureLoading: "Loading …",
    waterTemperatureUnavailable: "Not available",
    waterQualityLabels: {
      good: "Good water quality",
      fair: "Fair water quality",
      poor: "Not acceptable water quality",
    },
    harborOpenAllHours: "Open around the clock",
    harborCapacityUnit: (count: number) => `${count} berths`,
    amenityLabels: {
      power: "Power",
      water: "Water",
      toilets: "Toilets",
      shower: "Shower",
      sewage: "Pump-out",
      fuel: "Fuel",
    },
    openGoogleMaps: "Open in Google Maps",
    closeMap: "Close map",
    coordinates: "Coordinates",
    precisePosition: "Precise position",
    beachSpeedWarning: (name: string, distance: number) =>
      `Bathing area nearby: max 5 kn at ${name} (${distance} m)`,
    beachNearby: (name: string, distance: number) =>
      `Bathing area nearby: ${name} (${distance} m)`,
    shallowWaterWarning: (depth: number, distance: number) =>
      `Shallow area ahead: estimated depth ${depth.toFixed(1)} m in ${distance} m`,
    safetyNoticeText:
      "Situational awareness only. Not certified navigation.",
  },
};

const OSLO_FJORD: [number, number] = [10.735, 59.68];
// Midt i Drøbaksundet, hoved-skipsleia inn til Oslo — trygt vannpunkt for GPS-simulering.
const SIMULATED_BOAT_DEFAULT: [number, number] = [10.618, 59.66];
const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const SJOKART_WMTS =
  "https://cache.kartverket.no/v1/wmts/1.0.0/sjokartraster/default/webmercator/{z}/{y}/{x}.png";
const SATELLITE_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const DEFAULT_DEPTH_STATE: DepthState = {
  status: "idle",
  value: null,
  message: UI_TEXT.no.waitingForPosition,
};
const DEFAULT_SHORELINE_STATE: ShorelineState = {
  status: "idle",
  distanceMeters: null,
};
const EMPTY_FEATURE_COLLECTION: BeachFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};
const DEFAULT_BEACH_STATE: BeachState = {
  status: "idle",
  nearest: null,
  featureCollection: EMPTY_FEATURE_COLLECTION,
  markerFeatureCollection: EMPTY_FEATURE_COLLECTION,
};
const DEFAULT_WEATHER_STATE: WeatherState = {
  status: "idle",
  temperature: null,
  windSpeed: null,
  windDirection: null,
  waveHeight: null,
  waveDirection: null,
  currentSpeed: null,
  currentDirection: null,
  waterTemperature: null,
  symbolCode: null,
};
const DEFAULT_TIDE_STATE: TideState = {
  status: "idle",
  station: null,
  extremes: [],
};
const EMPTY_HARBOR_FEATURE_COLLECTION: HarborState["featureCollection"] = {
  type: "FeatureCollection",
  features: [],
};
const DEFAULT_HARBOR_STATE: HarborState = {
  status: "idle",
  featureCollection: EMPTY_HARBOR_FEATURE_COLLECTION,
};
const OWNSHIP_MARKER_SVG = `
  <div class="ownship-pulse"></div>
  <svg class="ownship-boat" viewBox="0 0 52 76" aria-hidden="true" focusable="false">
    <path class="boat-shadow" d="M26 4 12.4 30.4v31.8c0 4.8 3.9 8.7 8.7 8.7h9.8c4.8 0 8.7-3.9 8.7-8.7V30.4L26 4Z"/>
    <path class="boat-hull" d="M26 4.6 13.8 30.7v30.8c0 4.2 3.4 7.6 7.6 7.6h9.2c4.2 0 7.6-3.4 7.6-7.6V30.7L26 4.6Z"/>
    <path class="boat-transom" d="M15.2 56.3h21.6v5.7c0 3.2-2.6 5.8-5.8 5.8H21c-3.2 0-5.8-2.6-5.8-5.8v-5.7Z"/>
    <path class="boat-deck" d="M26 9.5 17.1 31v22.2c0 2 1.6 3.6 3.6 3.6h10.6c2 0 3.6-1.6 3.6-3.6V31L26 9.5Z"/>
    <path class="boat-port" d="M17.7 35.5v17.1c0 1.6 1.1 2.9 2.6 3.2l2.7.5-4.5 8.1c-2.7-2.1-4.3-5.3-4.3-8.7V37.8l3.5-2.3Z"/>
    <path class="boat-starboard" d="M34.3 35.5v17.1c0 1.6-1.1 2.9-2.6 3.2l-2.7.5 4.5 8.1c2.7-2.1 4.3-5.3 4.3-8.7V37.8l-3.5-2.3Z"/>
    <path class="boat-bow-port" d="M16 30.5 24.7 9.8v20.7H16Z"/>
    <path class="boat-bow-starboard" d="M36 30.5 27.3 9.8v20.7H36Z"/>
    <path class="boat-cabin" d="M18.9 31.3c.7-5.5 3.2-11.3 7.1-16.2 3.9 4.9 6.4 10.7 7.1 16.2l-2.2 14.9h-9.8l-2.2-14.9Z"/>
    <path class="boat-window" d="M21.2 31.4c.6-4 2.3-8 4.8-11.6 2.5 3.6 4.2 7.6 4.8 11.6l-1.4 9.4h-6.8l-1.4-9.4Z"/>
    <path class="boat-bow-line" d="M26 7.8v11.3"/>
  </svg>
`;

const HEADING_LINE_DISTANCE_METERS = 200;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;
const metersPerSecondToKnots = (speed: number) => speed * 1.943844492;
const normalizeBearing = (degrees: number) => (degrees + 360) % 360;

const interpolateHeading = (
  start: number | null,
  end: number | null,
  t: number,
) => {
  if (start === null || end === null) return end;
  const delta = ((end - start + 540) % 360) - 180;
  return normalizeBearing(start + delta * t);
};

const FIX_ANIMATION_DURATION_MS = 950;
const GEOJSON_UPDATE_INTERVAL_MS = 120;
const DEPTH_QUERY_MIN_DISTANCE_METERS = 25;
const DEPTH_QUERY_MAX_AGE_MS = 30000;
const SHALLOW_AHEAD_QUERY_MIN_DISTANCE_METERS = 25;
const SHALLOW_AHEAD_QUERY_MAX_AGE_MS = 15000;
const SHORELINE_QUERY_MIN_DISTANCE_METERS = 50;
const SHORELINE_QUERY_MAX_AGE_MS = 30000;

function distanceMeters(a: PositionFix, latitude: number, longitude: number) {
  return distanceBetweenCoordinates(a.latitude, a.longitude, latitude, longitude);
}

function destinationPoint(
  latitude: number,
  longitude: number,
  bearing: number,
  distanceMetersValue: number,
) {
  const angularDistance = distanceMetersValue / 6371008.8;
  const bearingRadians = toRadians(bearing);
  const latitudeRadians = toRadians(latitude);
  const longitudeRadians = toRadians(longitude);
  const nextLatitude = Math.asin(
    Math.sin(latitudeRadians) * Math.cos(angularDistance) +
      Math.cos(latitudeRadians) *
        Math.sin(angularDistance) *
        Math.cos(bearingRadians),
  );
  const nextLongitude =
    longitudeRadians +
    Math.atan2(
      Math.sin(bearingRadians) *
        Math.sin(angularDistance) *
        Math.cos(latitudeRadians),
      Math.cos(angularDistance) -
        Math.sin(latitudeRadians) * Math.sin(nextLatitude),
    );

  return {
    latitude: toDegrees(nextLatitude),
    longitude: normalizeLongitude(toDegrees(nextLongitude)),
  };
}

function normalizeLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function distanceBetweenCoordinates(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const radius = 6371008.8;
  const phi1 = toRadians(latitudeA);
  const phi2 = toRadians(latitudeB);
  const deltaPhi = toRadians(latitudeB - latitudeA);
  const deltaLambda = toRadians(longitudeB - longitudeA);
  const sinPhi = Math.sin(deltaPhi / 2);
  const sinLambda = Math.sin(deltaLambda / 2);
  const h =
    sinPhi * sinPhi +
    Math.cos(phi1) * Math.cos(phi2) * sinLambda * sinLambda;

  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function bearingDegrees(a: PositionFix, latitude: number, longitude: number) {
  const phi1 = toRadians(a.latitude);
  const phi2 = toRadians(latitude);
  const lambda1 = toRadians(a.longitude);
  const lambda2 = toRadians(longitude);
  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);

  return normalizeBearing(toDegrees(Math.atan2(y, x)));
}

function compassPoint(heading: number | null) {
  if (heading === null) return "--";
  const points = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  return points[Math.round(heading / 22.5) % 16];
}

function formatCoordinate(value: number, positive: string, negative: string) {
  return `${Math.abs(value).toFixed(5)}° ${value >= 0 ? positive : negative}`;
}

function formatPreciseCoordinate(
  value: number | null | undefined,
  positive: string,
  negative: string,
) {
  if (value === null || value === undefined) return "--";
  return `${Math.abs(value).toFixed(6)}° ${value >= 0 ? positive : negative}`;
}

function formatDepth(value: number | null, unit: DepthUnit) {
  if (value === null || Number.isNaN(value)) return "--";
  const absoluteValue = Math.abs(value);
  if (unit === "ft") return `${(absoluteValue * 3.28084).toFixed(0)} ft`;
  return `${absoluteValue.toFixed(1)} m`;
}

/**
 * Vannstand over sjøkartnull. Kartverket leverer centimeter.
 *
 * Fortegnet beholdes med vilje — `formatDepth` tar absoluttverdien, men for
 * tidevann betyr minus at vannet står *under* sjøkartnull, og det er nettopp da
 * en dybde i kartet blir grunnere enn den ser ut.
 */
function formatTideLevel(valueCm: number | null, unit: DepthUnit) {
  if (valueCm === null || Number.isNaN(valueCm)) return "--";
  if (unit === "ft") return `${(valueCm / 30.48).toFixed(1)} ft`;
  return `${Math.round(valueCm)} cm`;
}

function formatClockTime(time: number, language: Language) {
  return new Date(time).toLocaleTimeString(language === "no" ? "nb-NO" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDistance(value: number | null, unit: DistanceUnit) {
  if (value === null || Number.isNaN(value)) return "--";
  if (unit === "nm") return `${(value / 1852).toFixed(value >= 1852 ? 1 : 2)} nm`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)} km`;
  return `${Math.round(value)} m`;
}

function getShallowLookaheadDistance(speedKnots: number | null | undefined) {
  const metersPerSecond =
    speedKnots !== null && speedKnots !== undefined ? speedKnots / 1.943844492 : 0;
  return Math.round(Math.min(250, Math.max(80, metersPerSecond * 30)));
}

function formatSpeed(speedKnots: number | null | undefined, unit: SpeedUnit) {
  if (speedKnots === null || speedKnots === undefined) return "--";
  if (unit === "kmh") return `${(speedKnots * 1.852).toFixed(1)} km/t`;
  return `${speedKnots.toFixed(1)} kn`;
}

function formatHeading(
  heading: number | null | undefined,
  mode: HeadingMode,
) {
  if (heading === null || heading === undefined) return "--";
  const degrees = Math.round(heading).toString().padStart(3, "0");
  if (mode === "degrees") return `${degrees}°`;
  return `${degrees}° ${compassPoint(heading)}`;
}

function formatWeatherValue(value: number | null, unit: string) {
  if (value === null || Number.isNaN(value)) return "--";
  return `${value.toFixed(1)} ${unit}`;
}

// MET gir vind/bølge som "fra"-retning (kilden) og strøm som "til"-retning
// (målet). Pilen skal alltid peke dit strømningen faktisk går, derfor +180°
// på de to første og ingen justering på strøm.
function weatherFlowArrowDegrees(direction: number | null, kind: "from" | "to") {
  if (direction === null || Number.isNaN(direction)) return null;
  const bearing = kind === "from" ? direction + 180 : direction;
  return normalizeBearing(bearing);
}

const WEATHER_SYMBOL_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  clearsky_day: Sun,
  clearsky_night: Moon,
  clearsky_polartwilight: Sun,
  fair_day: CloudSun,
  fair_night: CloudMoon,
  fair_polartwilight: CloudSun,
  partlycloudy_day: CloudSun,
  partlycloudy_night: CloudMoon,
  partlycloudy_polartwilight: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  thunder: CloudLightning,
  lightssleetshowersandthunder: CloudLightning,
  lightssnowshowersandthunder: CloudLightning,
  lightrainandthunder: CloudLightning,
  rainandthunder: CloudLightning,
  heavyrainandthunder: CloudLightning,
};

function buildYrForecastUrl(latitude: number, longitude: number, language: Language) {
  const coords = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  return language === "no"
    ? `https://www.yr.no/nb/detaljert/graf/${coords}`
    : `https://www.yr.no/en/forecast/graph/${coords}`;
}

function weatherSymbolIcon(symbolCode: string | null) {
  if (!symbolCode) return CloudSun;
  if (WEATHER_SYMBOL_ICONS[symbolCode]) return WEATHER_SYMBOL_ICONS[symbolCode];
  if (symbolCode.includes("thunder")) return CloudLightning;
  if (symbolCode.includes("snow")) return CloudSnow;
  if (symbolCode.includes("sleet")) return CloudSnow;
  if (symbolCode.includes("drizzle")) return CloudDrizzle;
  if (symbolCode.includes("rain")) return CloudRain;
  if (symbolCode.includes("fog")) return CloudFog;
  if (symbolCode.startsWith("cloudy")) return Cloud;
  if (symbolCode.startsWith("partlycloudy_night")) return CloudMoon;
  if (symbolCode.startsWith("partlycloudy") || symbolCode.startsWith("fair")) return CloudSun;
  if (symbolCode.startsWith("clearsky_night")) return Moon;
  if (symbolCode.startsWith("clearsky")) return Sun;
  return CloudSun;
}

function CurrentArrowsIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 9a6.5 6.5 0 0 1 7 0 6.5 6.5 0 0 0 7 0" />
      <path d="M16.5 7L19 9L16.5 11" transform="rotate(-22.58 19 9)" />
      <path d="M5 15a6.5 6.5 0 0 1 7 0 6.5 6.5 0 0 0 7 0" />
      <path d="M16.5 13L19 15L16.5 17" transform="rotate(-22.58 19 15)" />
    </svg>
  );
}

/**
 * Bølgelinje med pil over. Pilen peker den veien vannet er på vei.
 *
 * Pilhodet er med vilje like bredt som det er: ikonet vises på 14 px i
 * værkortet, der 2 px strek blir omtrent 1,2 px, og et smalere hode kollapser
 * visuelt til en strek — da forsvinner hele retningen ikonet skal formidle.
 */
function TideIcon({ rising, size = 24 }: { rising: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={rising ? "M12 12V4" : "M12 4v8"} />
      <path d={rising ? "M8.5 7.5 12 4l3.5 3.5" : "M8.5 8.5 12 12l3.5-3.5"} />
      <path d="M3 18q3-3 6 0t6 0t6 0" />
    </svg>
  );
}

function getVisibleMapPadding(): CameraPadding {
  if (typeof window === "undefined") {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  const panel = document.querySelector<HTMLElement>(".readout-panel");
  if (!panel) {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  const panelRect = panel.getBoundingClientRect();
  const landscape = window.matchMedia(
    "(max-height: 540px) and (orientation: landscape)",
  ).matches;
  const portrait = window.matchMedia(
    "(max-width: 820px) and (orientation: portrait)",
  ).matches;
  const gutter = 16;

  if (landscape) {
    return {
      top: 0,
      right: 0,
      bottom: 0,
      left: Math.max(0, Math.round(panelRect.width + gutter)),
    };
  }

  if (portrait) {
    return {
      top: 0,
      right: 0,
      bottom: Math.max(0, Math.round(panelRect.height + gutter)),
      left: 0,
    };
  }

  return {
    top: 0,
    right: Math.max(0, Math.round(panelRect.width + gutter)),
    bottom: 0,
    left: 0,
  };
}

function getBeachSearchRadius(map: Map) {
  const center = map.getCenter();
  const bounds = map.getBounds();
  const northEast = bounds.getNorthEast();
  const radiusMeters = distanceBetweenCoordinates(
    center.lat,
    center.lng,
    northEast.lat,
    northEast.lng,
  );

  // Dekk hele synlig kartutsnitt (sentrum→hjørne), ikke bare en liten
  // boble rundt sentrum — ellers dukker havner/strender utenfor bobla ikke
  // opp. Cap holder Overpass-spørringen håndterbar.
  return Math.round(Math.min(10000, Math.max(1500, radiusMeters)));
}

// Ray-cast point-in-polygon. Punkt og ring i [lng, lat].
function pointInRing(point: [number, number], ring: number[][]) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: [number, number], rings: number[][][]) {
  if (rings.length === 0 || !pointInRing(point, rings[0])) return false;
  // Punkt i et hull (indre ring) teller som utenfor polygonet.
  for (let i = 1; i < rings.length; i += 1) {
    if (pointInRing(point, rings[i])) return false;
  }
  return true;
}

function pointInGeometry(point: [number, number], geometry: GeoJSON.Geometry) {
  if (geometry.type === "Polygon") {
    return pointInPolygon(point, geometry.coordinates as number[][][]);
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as number[][][][]).some((polygon) =>
      pointInPolygon(point, polygon),
    );
  }
  return false;
}

// Avgjør om posisjonen ligger på land ved å slå den opp mot vann-polygonene i
// vektorkartet (OpenMapTiles "water"-lag). Returnerer null når vi ikke kan
// avgjøre det — kartet ikke lastet, posisjon utenfor synlig utsnitt, eller
// vann-kilden ikke ferdiglastet — slik at forrige tilstand beholdes.
function isPositionOnLand(
  map: Map,
  longitude: number,
  latitude: number,
): boolean | null {
  if (!map.isStyleLoaded()) return null;
  if (!map.getBounds().contains([longitude, latitude])) return null;

  const layers = map.getStyle()?.layers ?? [];
  const waterSources = new Set<string>();
  for (const layer of layers) {
    const sourceLayer = (layer as { "source-layer"?: unknown })["source-layer"];
    const source = (layer as { source?: unknown }).source;
    if (sourceLayer === "water" && typeof source === "string") {
      waterSources.add(source);
    }
  }
  if (waterSources.size === 0) return null;

  const point: [number, number] = [longitude, latitude];
  let sawLoadedSource = false;
  for (const source of waterSources) {
    if (!map.isSourceLoaded(source)) continue;
    sawLoadedSource = true;
    const features = map.querySourceFeatures(source, { sourceLayer: "water" });
    for (const feature of features) {
      if (pointInGeometry(point, feature.geometry)) {
        return false;
      }
    }
  }

  // Ingen vann-polygon dekker punktet, men bare hvis kilden faktisk var lastet.
  return sawLoadedSource ? true : null;
}

// Ikon-geometri som SVG path-data (24x24 viewBox), delt mellom kartmarkør
// (rasterisert via Path2D) og popup-tittel (inline SVG) så de er identiske.
const HARBOR_ICON_PATHS = [
  "M9 5a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "M12 22V8",
  "M5 12H2a10 10 0 0 0 20 0h-3",
];
const BEACH_ICON_PATHS = [
  "M17.553 16.75a7.5 7.5 0 0 0 -10.606 0",
  "M18 3.804a6 6 0 0 0 -8.196 2.196l10.392 6a6 6 0 0 0 -2.196 -8.196z",
  "M16.732 10c1.658 -2.87 2.225 -5.644 1.268 -6.196c-.957 -.552 -3.075 1.326 -4.732 4.196",
  "M15 9l-3 5.196",
  "M3 19.25a2.4 2.4 0 0 1 1 -.25a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 1 -.25",
];

// Vannkvalitetsfarger (trafikklys). "Ukjent" har ingen farge -> ingen dråpe.
const BEACH_QUALITY_STYLE = {
  good: "#16a34a",
  fair: "#f59e0b",
  poor: "#dc2626",
} as const;

type BeachQualityKey = keyof typeof BEACH_QUALITY_STYLE;

// Kartlegg rå Tilstand-verdi (God / Mindre god / Ikke akseptabel / ukjent) til
// en normalisert nøkkel. Alt annet (inkl. "ukjent" og null) -> null.
function getBeachQualityKey(
  properties: maplibregl.MapGeoJSONFeature["properties"] | undefined,
): BeachQualityKey | null {
  const raw = properties?.waterQuality ?? properties?.Tilstand;
  if (typeof raw !== "string") return null;
  switch (raw.trim().toLowerCase()) {
    case "god":
      return "good";
    case "mindre god":
      return "fair";
    case "ikke akseptabel":
      return "poor";
    default:
      return null;
  }
}

// Tegn en dråpeformet kvalitetsbadge (spiss opp) med hvit kant for kontrast.
function drawQualityDroplet(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  color: string,
) {
  context.save();
  context.beginPath();
  context.moveTo(centerX, centerY - radius * 1.7);
  context.quadraticCurveTo(centerX + radius, centerY - radius, centerX + radius, centerY);
  context.arc(centerX, centerY, radius, 0, Math.PI, false);
  context.quadraticCurveTo(centerX - radius, centerY - radius, centerX, centerY - radius * 1.7);
  context.closePath();
  context.lineJoin = "round";
  context.strokeStyle = "#ffffff";
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = color;
  context.fill();
  context.restore();
}

// Tegn hvit bakgrunnssirkel + ikon (SVG-paths) sentrert. Path2D gir eksakt
// samme geometri som Lucide/Tabler-ikonene. Valgfri badgeColor tegner en
// dråpeformet kvalitetsindikator nede til høyre.
function createMarkerIconImageData(
  paths: string[],
  strokeColor: string,
  badgeColor?: string,
) {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.clearRect(0, 0, size, size);
  context.lineCap = "round";
  context.lineJoin = "round";

  context.fillStyle = "rgba(255, 255, 255, 0.96)";
  context.strokeStyle = "rgba(31, 41, 55, 0.22)";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(32, 32, 25, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  const scale = 1.5;
  context.save();
  context.translate(32 - 12 * scale, 32 - 12 * scale);
  context.scale(scale, scale);
  context.strokeStyle = strokeColor;
  context.lineWidth = 2;
  for (const definition of paths) {
    context.stroke(new Path2D(definition));
  }
  context.restore();

  if (badgeColor) {
    drawQualityDroplet(context, 48, 46, 9, badgeColor);
  }

  return context.getImageData(0, 0, size, size);
}

function createBeachIconImageData(badgeColor?: string) {
  return createMarkerIconImageData(BEACH_ICON_PATHS, "#ea580c", badgeColor);
}

function createBeachAreaPatternImageData() {
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.clearRect(0, 0, size, size);
  context.strokeStyle = "rgba(234, 88, 12, 0.34)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(-4, 16);
  context.lineTo(16, -4);
  context.moveTo(4, 20);
  context.lineTo(20, 4);
  context.stroke();

  return context.getImageData(0, 0, size, size);
}

function createHarborIconImageData() {
  return createMarkerIconImageData(HARBOR_ICON_PATHS, "#007590");
}

function getBeachFeatureName(
  properties: maplibregl.MapGeoJSONFeature["properties"],
) {
  const rawName = properties?.name ?? properties?.Navn;
  return typeof rawName === "string" && rawName.trim()
    ? rawName.trim()
    : "Badeplass";
}

function getHarborFromProperties(
  properties: maplibregl.MapGeoJSONFeature["properties"] | undefined,
) {
  const record = properties ?? {};
  const latitude = typeof record.latitude === "number" ? record.latitude : null;
  const longitude = typeof record.longitude === "number" ? record.longitude : null;
  if (
    typeof record.id !== "string" ||
    typeof record.name !== "string" ||
    latitude === null ||
    longitude === null
  ) {
    return null;
  }

  const amenities = Array.isArray(record.amenities)
    ? record.amenities.filter((value): value is string => typeof value === "string")
    : typeof record.amenities === "string"
      ? record.amenities.split(",").filter(Boolean)
      : [];
  return {
    id: record.id,
    name: record.name,
    latitude,
    longitude,
    type: typeof record.type === "string" ? record.type : null,
    website: typeof record.website === "string" ? record.website : null,
    phone: typeof record.phone === "string" ? record.phone : null,
    openingHours: typeof record.openingHours === "string" ? record.openingHours : null,
    capacity: typeof record.capacity === "string" ? record.capacity : null,
    amenities,
  } satisfies Harbor;
}

type UiText = (typeof UI_TEXT)[Language];
type AmenityKey = keyof UiText["amenityLabels"];

const AMENITY_ICONS: Record<AmenityKey, ComponentType<{ size?: number }>> = {
  power: Zap,
  water: Droplet,
  toilets: Toilet,
  shower: ShowerHead,
  sewage: Recycle,
  fuel: Fuel,
};

function harborTypeLabel(type: string | null, text: UiText) {
  if (type === "marina") return text.harborTypeMarina;
  if (type === "harbour") return text.harborTypeHarbour;
  return null;
}

const OSM_DAY_LABELS_NO: Record<string, string> = {
  Mo: "Ma",
  Tu: "Ti",
  We: "On",
  Th: "To",
  Fr: "Fr",
  Sa: "Lø",
  Su: "Sø",
};

function humanizeOpeningHours(raw: string, text: UiText, language: Language) {
  let value = raw.trim();
  // Vanligste OSM-mønstre for døgnåpent; ellers vis rå streng.
  if (/^(24\/7|(mo-su\s*)?00:00-24:00)$/i.test(value)) {
    return text.harborOpenAllHours;
  }
  // Oversett OSM-dagskoder (Mo, Tu, ...) til norske forkortelser.
  if (language === "no") {
    value = value.replace(
      /\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g,
      (day) => OSM_DAY_LABELS_NO[day] ?? day,
    );
  }
  return value;
}

function normalizeCapacity(raw: string, text: UiText) {
  const match = raw.match(/\d+/);
  if (!match) return null;
  return text.harborCapacityUnit(Number.parseInt(match[0], 10));
}

function HarborPopupContent({
  harbor,
  text,
  language,
  onOpenMaps,
}: {
  harbor: Harbor;
  text: UiText;
  language: Language;
  onOpenMaps: () => void;
}) {
  const typeLabel = harborTypeLabel(harbor.type, text);
  const capacity = harbor.capacity
    ? normalizeCapacity(harbor.capacity, text)
    : null;
  const hours = harbor.openingHours
    ? humanizeOpeningHours(harbor.openingHours, text, language)
    : null;
  const amenities = harbor.amenities.filter(
    (key): key is AmenityKey => key in AMENITY_ICONS,
  );
  const hasMeta = Boolean(capacity || hours || harbor.phone);

  return (
    <div className="harbor-popup-content">
      <div className="popup-title">
        <Anchor size={17} />
        <strong>{harbor.name}</strong>
      </div>
      {typeLabel && <span className="popup-type-badge">{typeLabel}</span>}
      {hasMeta && (
        <div className="harbor-meta">
          {capacity && (
            <span className="harbor-meta-row">
              <Sailboat size={15} />
              {capacity}
            </span>
          )}
          {hours && (
            <span className="harbor-meta-row">
              <Clock size={15} />
              {hours}
            </span>
          )}
          {harbor.phone && (
            <span className="harbor-meta-row">
              <Phone size={15} />
              <a href={`tel:${harbor.phone.replace(/\s+/g, "")}`}>
                {harbor.phone}
              </a>
            </span>
          )}
        </div>
      )}
      {amenities.length > 0 && (
        <div className="harbor-amenities">
          {amenities.map((key) => {
            const Icon = AMENITY_ICONS[key];
            return (
              <span className="harbor-amenity" key={key}>
                <Icon size={13} />
                {text.amenityLabels[key]}
              </span>
            );
          })}
        </div>
      )}
      <div className="harbor-popup-actions">
        <button
          type="button"
          className="harbor-action-primary"
          onClick={onOpenMaps}
          aria-label={text.openGoogleMaps}
        >
          <MapPin size={15} />
          Google Maps
        </button>
        {harbor.website && (
          <a
            className="harbor-action-secondary"
            href={harbor.website}
            target="_blank"
            rel="noreferrer"
            aria-label={text.harborWebsite}
          >
            <Globe size={15} />
          </a>
        )}
      </div>
    </div>
  );
}

// Tabler "beach"-ikon (parasoll + bølger). Lucide mangler en badeplass-
// parasoll, så vi inliner denne. Bygges fra samme path-data som markøren.
// currentColor arves fra popup-aksenten.
const BEACH_ICON_SVG = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${BEACH_ICON_PATHS.map(
  (definition) => `<path d="${definition}" />`,
).join("")}</svg>`;

// Termometer (Lucide thermometer) foran sjøtemperaturen i badeplass-popup.
const WATER_TEMP_ICON_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4v10.54a4 4 0 1 1 -4 0V4a2 2 0 0 1 4 0z" /></svg>`;

// Fylt dråpe (Tabler ti-droplet), farget etter vannkvalitet i popup-linjen.
function beachQualityDropletSvg(color: string) {
  return `<svg viewBox="0 0 24 24" width="15" height="15" fill="${color}" aria-hidden="true"><path d="M6.8 11a6 6 0 1 0 10.396 0l-5.197 -8l-5.2 8z" /></svg>`;
}

function escapePopupText(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function playAlertSound() {
  const AudioContextConstructor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextConstructor) return;

  const audioContext = new AudioContextConstructor();
  const now = audioContext.currentTime;
  const masterGain = audioContext.createGain();
  masterGain.gain.setValueAtTime(0.0001, now);
  masterGain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
  masterGain.connect(audioContext.destination);

  [880, 1174.66].forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const toneGain = audioContext.createGain();
    const start = now + index * 0.15;
    const end = start + 0.16;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    toneGain.gain.setValueAtTime(0.0001, start);
    toneGain.gain.exponentialRampToValueAtTime(0.85, start + 0.018);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(toneGain);
    toneGain.connect(masterGain);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  });

  window.setTimeout(() => void audioContext.close(), 700);
}

function createAccuracyCircle(
  longitude: number,
  latitude: number,
  radiusMeters: number,
): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const points = 96;
  const coordinates: number[][] = [];
  const earthRadius = 6378137;
  const latRad = toRadians(latitude);

  for (let i = 0; i <= points; i += 1) {
    const bearing = (i / points) * Math.PI * 2;
    const lat =
      latitude + toDegrees((radiusMeters / earthRadius) * Math.cos(bearing));
    const lon =
      longitude +
      toDegrees(
        (radiusMeters / (earthRadius * Math.cos(latRad))) * Math.sin(bearing),
      );
    coordinates.push([lon, lat]);
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [coordinates],
        },
      },
    ],
  };
}

function parseDepthResponse(payload: unknown) {
  if (typeof payload === "number") return payload;
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const candidates = [
    record.depth,
    record.elevation,
    record.value,
    record.z,
    record.water_depth,
    record.result,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number") return candidate;
    if (typeof candidate === "string") {
      const parsed = Number.parseFloat(candidate);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }

  return null;
}

async function fetchEstimatedDepth(
  latitude: number,
  longitude: number,
  language: Language,
) {
  const text = UI_TEXT[language];

  try {
    const response = await fetch(
      `/api/depth?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`,
    );
    if (response.ok) {
      const payload = (await response.json()) as {
        depth?: unknown;
        source?: unknown;
        confidence?: unknown;
        nearestPointMeters?: unknown;
      };
      if (typeof payload.depth === "number") {
        const confidence =
          typeof payload.confidence === "string" ? payload.confidence : "unknown";
        const nearest =
          typeof payload.nearestPointMeters === "number"
            ? payload.nearestPointMeters
            : null;
        return {
          value: payload.depth,
          message: text.kartverketEstimate(confidence, nearest),
        } satisfies DepthEstimate;
      }
    }
  } catch {
    // Fall back to the broader EMODnet DTM when the local API is unavailable.
  }

  const emodnetEndpoints = [
    `https://ows.emodnet-bathymetry.eu/wcs_dtm/?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=emodnet:mean&FORMAT=application/json&SUBSET=Lat(${latitude})&SUBSET=Long(${longitude})`,
    `https://ows.emodnet-bathymetry.eu/rest/getdepth?lon=${longitude}&lat=${latitude}`,
  ];

  for (const endpoint of emodnetEndpoints) {
    try {
      const response = await fetch(endpoint, { mode: "cors" });
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("json")) {
        const depth = parseDepthResponse(await response.json());
        if (depth !== null) {
          return {
            value: Math.abs(depth),
            message: text.emodnetFallback,
          } satisfies DepthEstimate;
        }
      } else {
        const responseText = await response.text();
        const match = responseText.match(/-?\d+(?:\.\d+)?/);
        if (match) {
          return {
            value: Math.abs(Number.parseFloat(match[0])),
            message: text.emodnetFallback,
          } satisfies DepthEstimate;
        }
      }
    } catch {
      // Try the next known public endpoint, then degrade in the UI.
    }
  }

  throw new Error("Depth service unavailable");
}

async function fetchNearbyBeaches(
  latitude: number,
  longitude: number,
  radiusMeters = 2000,
) {
  const response = await fetch(
    `/api/beaches?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&radius=${encodeURIComponent(radiusMeters)}`,
  );

  if (!response.ok) {
    throw new Error("Beach service unavailable");
  }

  const payload = (await response.json()) as {
    nearest?: NearestBeach | null;
    featureCollection?: BeachFeatureCollection;
    markerFeatureCollection?: BeachFeatureCollection;
  };

  return {
    nearest: payload.nearest ?? null,
    featureCollection: payload.featureCollection ?? EMPTY_FEATURE_COLLECTION,
    markerFeatureCollection:
      payload.markerFeatureCollection ?? EMPTY_FEATURE_COLLECTION,
  } satisfies Pick<
    BeachState,
    "nearest" | "featureCollection" | "markerFeatureCollection"
  >;
}

async function fetchDistanceToLand(latitude: number, longitude: number) {
  const response = await fetch(
    `/api/shoreline?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`,
  );

  if (!response.ok) {
    throw new Error("Shoreline service unavailable");
  }

  const payload = (await response.json()) as {
    distanceMeters?: unknown;
  };

  if (typeof payload.distanceMeters !== "number") {
    throw new Error("Shoreline service returned no distance");
  }

  return payload.distanceMeters;
}

async function fetchWeather(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `/api/weather?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`,
    { signal },
  );

  if (!response.ok) {
    throw new Error("Weather service unavailable");
  }

  const payload = (await response.json()) as Partial<Omit<WeatherState, "status">>;
  const valueOrNull = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : null;

  return {
    status: "ready",
    temperature: valueOrNull(payload.temperature),
    windSpeed: valueOrNull(payload.windSpeed),
    windDirection: valueOrNull(payload.windDirection),
    waveHeight: valueOrNull(payload.waveHeight),
    waveDirection: valueOrNull(payload.waveDirection),
    currentSpeed: valueOrNull(payload.currentSpeed),
    currentDirection: valueOrNull(payload.currentDirection),
    waterTemperature: valueOrNull(payload.waterTemperature),
    symbolCode: typeof payload.symbolCode === "string" ? payload.symbolCode : null,
  } satisfies WeatherState;
}

async function fetchTide(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `/api/tide?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`,
    { signal },
  );

  if (!response.ok) {
    throw new Error("Tide service unavailable");
  }

  const payload = (await response.json()) as {
    available?: boolean;
    station?: string | null;
    extremes?: Array<{ type?: string; time?: string; value?: number }>;
  };

  if (!payload.available) {
    return { ...DEFAULT_TIDE_STATE, status: "unavailable" } satisfies TideState;
  }

  const extremes: TideExtreme[] = [];
  for (const entry of payload.extremes ?? []) {
    if (entry.type !== "high" && entry.type !== "low") continue;
    const time = Date.parse(entry.time ?? "");
    if (!Number.isFinite(time)) continue;
    if (typeof entry.value !== "number" || !Number.isFinite(entry.value)) continue;
    extremes.push({ type: entry.type, time, value: entry.value });
  }
  extremes.sort((a, b) => a.time - b.time);

  if (extremes.length < 2) {
    return { ...DEFAULT_TIDE_STATE, status: "unavailable" } satisfies TideState;
  }

  return {
    status: "ready",
    station: typeof payload.station === "string" ? payload.station : null,
    extremes,
  } satisfies TideState;
}

/**
 * Vannstand mellom to ekstremverdier, tilnærmet med en halv cosinusbue.
 *
 * Dette er standardmetoden når man bare har høy- og lavvann, og treffer innen
 * noen få centimeter. Merk hva tallet da er: en interpolasjon mellom to
 * prediksjoner, ikke en måling. Skal det en dag legges til en kartlagt dybde,
 * bør vi hente den faktiske kurven fra Kartverket (`datatype=all`) i stedet.
 */
function interpolateTideLevel(
  previous: TideExtreme,
  next: TideExtreme,
  atTime: number,
) {
  const span = next.time - previous.time;
  if (span <= 0) return next.value;
  const progress = Math.min(1, Math.max(0, (atTime - previous.time) / span));
  const eased = (1 - Math.cos(progress * Math.PI)) / 2;
  return previous.value + (next.value - previous.value) * eased;
}

async function fetchNearbyHarbors(
  latitude: number,
  longitude: number,
  radiusMeters = 2000,
) {
  const response = await fetch(
    `/api/harbors?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&radius=${encodeURIComponent(radiusMeters)}`,
  );
  if (!response.ok) {
    throw new Error("Harbor service unavailable");
  }

  const payload = (await response.json()) as {
    featureCollection?: HarborState["featureCollection"];
  };
  return payload.featureCollection ?? EMPTY_HARBOR_FEATURE_COLLECTION;
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Kan ikke tvinge installasjon — nettleseren eier gesten. Vi fanger
// beforeinstallprompt (Android/Chromium) og viser egen knapp; iOS Safari
// sender ikke eventet, så der viser vi manuell instruksjon i stedet.
/**
 * Husker siste ikke-tomme verdi så lenge `keepAlive` er sant.
 *
 * Overlays som får innholdet sitt fra en avledet verdi (`visibleMarineAlert`,
 * `harborMapOpen`) mister det i samme render som verdien blir null. Uten dette
 * ville boksen bli tom idet exit-animasjonen starter, og brukeren ser et blankt
 * skall tone ut.
 */
function useLastPresent<T>(value: T | null, keepAlive: boolean): T | null {
  const lastRef = useRef<T | null>(value);
  if (value !== null) lastRef.current = value;
  else if (!keepAlive) lastRef.current = null;
  return value !== null ? value : keepAlive ? lastRef.current : null;
}

function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;
    setInstalled(standalone);

    const ua = window.navigator.userAgent;
    setIsIos(/iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua));

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  return {
    installed,
    canInstall: deferredPrompt !== null,
    isIos,
    promptInstall,
  };
}

function LandingPage({ onStart }: { onStart: () => void }) {
  const { installed, canInstall, isIos, promptInstall } = useInstallPrompt();
  const [showIosHint, setShowIosHint] = useState(false);
  const showInstall = !installed && (canInstall || isIos);

  return (
    <main className="landing-page">
      <section className="landing-hero">
        <img
          className="landing-hero-image"
          src={HERO_IMAGE_URL}
          alt="Fritidsbåt på vei gjennom norsk skjærgård"
        />
        <div className="landing-hero-shade" aria-hidden="true" />

        <header className="landing-header">
          <a className="landing-brand" href="#" aria-label="SeaNav forside">
            <span className="landing-brand-mark">
              <img src={LOGO_IMAGE_URL} alt="" />
            </span>
            <span>SeaNav</span>
          </a>
          <button className="landing-header-cta" type="button" onClick={onStart}>
            Åpne sjøkart
            <ArrowRight size={17} />
          </button>
        </header>

        <div className="landing-hero-content">
          <p className="landing-eyebrow">Enklere navigasjon på sjøen</p>
          <h1>SeaNav</h1>
          <p className="landing-statement">Sjønavigasjon helt gratis.</p>
          <p className="landing-intro">
            Ingen innlogging. Ingen abonnement. Bare sjøkart og navigasjon –
            klart til bruk når du trenger det.
          </p>
          <div className="landing-actions">
            <button className="landing-primary-cta" type="button" onClick={onStart}>
              Start gratis navigasjon
              <ArrowRight size={19} />
            </button>
            {showInstall && (
              <button
                className="landing-install-cta"
                type="button"
                onClick={
                  canInstall ? promptInstall : () => setShowIosHint((v) => !v)
                }
              >
                {isIos && !canInstall ? (
                  <Share size={18} />
                ) : (
                  <Download size={18} />
                )}
                Installer som app
              </button>
            )}
            <span>Gratis å bruke, rett i nettleseren.</span>
            {showIosHint && isIos && !canInstall && (
              <p className="landing-install-hint">
                Trykk <strong>Del</strong>-knappen nederst i Safari og velg{" "}
                <strong>«Legg til på Hjem-skjerm»</strong>.
              </p>
            )}
          </div>
        </div>

        <a className="landing-scroll-cue" href="#slik-virker-det">
          <span>Se hvorfor SeaNav er enklere</span>
          <span className="landing-scroll-line" aria-hidden="true" />
        </a>
      </section>

      <section className="landing-principles" id="slik-virker-det">
        <div className="landing-section-intro">
          <p>Bygget for norske farvann</p>
          <h2>Sjøkart, posisjon og havner – alt i én app.</h2>
        </div>

        <div className="landing-principle-grid">
          <article>
            <span className="landing-principle-icon">
              <MapIcon size={30} />
            </span>
            <h3>Offisielle sjøkart</h3>
            <p>Dybdekoter, skjær og seilingsmerker rett fra Kartverket – alltid oppdatert.</p>
          </article>
          <article>
            <span className="landing-principle-icon">
              <LocateFixed size={30} />
            </span>
            <h3>Posisjon, fart og kurs</h3>
            <p>Se hvor du er i sanntid, med fart over grunn og kurs – i én ryddig visning.</p>
          </article>
          <article>
            <span className="landing-principle-icon">
              <Anchor size={30} />
            </span>
            <h3>Havner &amp; gjestehavner</h3>
            <p>Finn nærmeste havn, fortøyning og fasiliteter langs hele kysten.</p>
          </article>
          <article>
            <span className="landing-principle-icon landing-principle-icon--foam">
              <Waves size={30} />
            </span>
            <h3>Badeplasser &amp; vannkvalitet</h3>
            <p>Nærmeste strand med fersk vannkvalitet – vet før du hopper uti.</p>
          </article>
        </div>
      </section>

      <section className="landing-closing">
        <div>
          <p>Klar når du er.</p>
          <h2>Åpne kartet. Finn kursen.</h2>
        </div>
        <button className="landing-primary-cta light" type="button" onClick={onStart}>
          Kom i gang gratis
          <ArrowRight size={19} />
        </button>
      </section>
    </main>
  );
}

function NavigationApp() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const positionAnimationFrameRef = useRef<number | null>(null);
  const animatedFixRef = useRef<PositionFix | null>(null);
  const lastGeoJsonUpdateRef = useRef(0);
  const shadowMapRef = useRef<Map | null>(null);
  const shadowMapCenterRef = useRef<{ latitude: number; longitude: number } | null>(
    null,
  );
  const baseStyleLayerIdsRef = useRef<string[]>([]);
  const beachDisplayModeRef = useRef<BeachDisplayMode>("off");
  const harborsVisibleRef = useRef(false);
  // Følge-tilstanden leses fra kart-lyttere og fra kamera-effekten. Den må være
  // en ref i tillegg til state: `setFollowingLocation(false)` fra en gest slår
  // ikke inn før neste render, og rekker en GPS-fiks å komme før det, ville
  // kameraet flyttet seg midt i gesten likevel.
  const followingLocationRef = useRef(true);
  const northUpRef = useRef(true);
  // Tidligste tidspunkt den løpende følgingen får røre kameraet igjen. En
  // eksplisitt «sentrer»- eller nord-opp-handling animerer over flere hundre ms,
  // og uten denne sperren avbryter første GPS-fiks som kommer underveis
  // animasjonen — i praksis ble minstezoomen fra «sentrer» aldri satt.
  const cameraLockUntilRef = useRef(0);
  // Sant mens en finger eller museknapp står på kartet. Da holder følgingen
  // fingrene fra kameraet helt.
  const pointerActiveRef = useRef(false);
  // Kartets padding avhenger av instrumentpanelets størrelse, som bare endrer
  // seg ved resize/rotasjon. `getVisibleMapPadding()` gjør
  // `getBoundingClientRect()` og tvinger dermed synkron layout — for dyrt til å
  // kalles fra kamerakall som skjer på hver GPS-fiks.
  const mapPaddingRef = useRef<CameraPadding>({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const lastFixRef = useRef<PositionFix | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const simulationIntervalRef = useRef<number | null>(null);
  const depthAbortRef = useRef<number | null>(null);
  const shallowAheadAbortRef = useRef<number | null>(null);
  const shorelineAbortRef = useRef<number | null>(null);
  const depthQueryRef = useRef<{
    latitude: number;
    longitude: number;
    timestamp: number;
  } | null>(null);
  const shallowAheadQueryRef = useRef<{
    latitude: number;
    longitude: number;
    timestamp: number;
  } | null>(null);
  const shorelineQueryRef = useRef<{
    latitude: number;
    longitude: number;
    timestamp: number;
  } | null>(null);
  const beachPositionAbortRef = useRef<number | null>(null);
  const beachMapAbortRef = useRef<number | null>(null);
  const harborMapAbortRef = useRef<number | null>(null);
  const weatherAbortRef = useRef<number | null>(null);
  const gpsRestartLabelTimeoutRef = useRef<number | null>(null);
  const beachPositionQueryRef = useRef<{
    latitude: number;
    longitude: number;
    radiusMeters: number;
    timestamp: number;
  } | null>(null);
  const beachMapQueryRef = useRef<{
    latitude: number;
    longitude: number;
    radiusMeters: number;
    timestamp: number;
  } | null>(null);
  const harborMapQueryRef = useRef<{
    latitude: number;
    longitude: number;
    radiusMeters: number;
    timestamp: number;
  } | null>(null);
  const weatherQueryRef = useRef<{
    latitude: number;
    longitude: number;
    timestamp: number;
  } | null>(null);
  const tideQueryRef = useRef<{
    latitude: number;
    longitude: number;
    timestamp: number;
  } | null>(null);
  const tideAbortRef = useRef<number | null>(null);
  const lastPlayedAlertKeyRef = useRef<string | null>(null);
  const orientationHeadingRef = useRef<number | null>(null);
  const [fix, setFix] = useState<PositionFix | null>(null);
  const [depth, setDepth] = useState<DepthState>(DEFAULT_DEPTH_STATE);
  const [shallowAheadDepth, setShallowAheadDepth] = useState<DepthState>(
    DEFAULT_DEPTH_STATE,
  );
  const [shoreline, setShoreline] = useState<ShorelineState>(
    DEFAULT_SHORELINE_STATE,
  );
  const [onLand, setOnLand] = useState<boolean>(false);
  const [beaches, setBeaches] = useState<BeachState>(DEFAULT_BEACH_STATE);
  const [harbors, setHarbors] = useState<HarborState>(DEFAULT_HARBOR_STATE);
  const [weather, setWeather] = useState<WeatherState>(DEFAULT_WEATHER_STATE);
  const [tide, setTide] = useState<TideState>(DEFAULT_TIDE_STATE);
  // Tikker hvert minutt. Tidevannsdataene ligger fast i over et døgn, men hvilken
  // ekstremverdi som er «neste» og hvor prikken står i kurven endrer seg med
  // klokka — det er derfor dette er en egen tilstand og ikke utledet av `fix`.
  const [tideClock, setTideClock] = useState(() => Date.now());
  const [language, setLanguage] = usePersistedState(
    "seanav-language",
    enumSetting<Language>("no", ["no", "en"]),
  );
  const [tracking, setTracking] = useState(false);
  const [gpsRestarting, setGpsRestarting] = useState(false);
  const [followingLocation, setFollowingLocation] = useState(true);
  const [northUp, setNorthUp] = useState(true);
  const [mapBearing, setMapBearing] = useState(0);
  // Lagene finnes først etter at kartstilen har lastet. Effektene som styrer
  // synlighet må derfor kjøre på nytt når kartet er klart, ellers går en
  // gjenopprettet innstilling tapt fordi laget ikke fantes da effekten kjørte.
  const [mapReady, setMapReady] = useState(false);
  const [chartVisible, setChartVisible] = usePersistedState(
    "seanav-chart-visible",
    booleanSetting(true),
  );
  const [harborsVisible, setHarborsVisible] = usePersistedState(
    "seanav-harbors-visible",
    booleanSetting(false),
  );
  const [beachDisplayMode, setBeachDisplayMode] = usePersistedState(
    "seanav-beach-display-mode",
    enumSetting<BeachDisplayMode>("off", ["off", "icons", "areas"]),
  );
  const [baseMap, setBaseMap] = usePersistedState(
    "seanav-base-map",
    enumSetting<BaseMap>("map", ["map", "satellite", "off"]),
  );
  const [displayOpen, setDisplayOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [weatherOpen, setWeatherOpen] = usePersistedState(
    "seanav-weather-open",
    booleanSetting(false),
  );
  const [tideExpanded, setTideExpanded] = usePersistedState(
    "seanav-tide-expanded",
    booleanSetting(false),
  );
  const [isPortrait, setIsPortrait] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 820px) and (orientation: portrait)").matches;
  });
  const [harborMapOpen, setHarborMapOpen] = useState<Harbor | null>(null);
  const [seaMarksOpen, setSeaMarksOpen] = useState(false);
  const [gpsHelpOpen, setGpsHelpOpen] = useState(false);
  const [gpsIssue, setGpsIssue] = useState<GpsIssue | null>(null);
  const [dismissedGpsIssueCode, setDismissedGpsIssueCode] =
    useState<GpsIssueCode | null>(null);
  const [showOwnship, setShowOwnship] = usePersistedState(
    "seanav-show-ownship",
    booleanSetting(true),
  );
  const [showAccuracyRing, setShowAccuracyRing] = usePersistedState(
    "seanav-show-accuracy-ring",
    booleanSetting(true),
  );
  const [showHeadingLine, setShowHeadingLine] = usePersistedState(
    "seanav-show-heading-line",
    booleanSetting(true),
  );
  const [showNotice, setShowNotice] = usePersistedState(
    "seanav-show-notice",
    booleanSetting(true),
  );
  // Egen koding ("enabled"/"muted") av historiske grunner — må beholdes for
  // ikke å nullstille lyd-valget til brukere som allerede har lagret det.
  const [alertSoundEnabled, setAlertSoundEnabled] = usePersistedState(
    "seanav-alert-sound",
    {
      decode: (stored) => stored !== "muted",
      encode: (value) => (value ? "enabled" : "muted"),
    },
  );
  const [showPrecisePosition, setShowPrecisePosition] = usePersistedState(
    "seanav-show-precise-position",
    booleanSetting(false),
  );
  const [dismissedAlertKey, setDismissedAlertKey] = useState<string | null>(null);
  const [speedUnit, setSpeedUnit] = usePersistedState(
    "seanav-speed-unit",
    enumSetting<SpeedUnit>("kn", ["kn", "kmh"]),
  );
  const [depthUnit, setDepthUnit] = usePersistedState(
    "seanav-depth-unit",
    enumSetting<DepthUnit>("m", ["m", "ft"]),
  );
  const [distanceUnit, setDistanceUnit] = usePersistedState(
    "seanav-distance-unit",
    enumSetting<DistanceUnit>("metric", ["metric", "nm"]),
  );
  const [headingMode, setHeadingMode] = usePersistedState(
    "seanav-heading-mode",
    enumSetting<HeadingMode>("full", ["full", "degrees"]),
  );
  const text = UI_TEXT[language];
  // Kart-effekten kjører kun én gang (tomme deps), så `text` fanget i den
  // fryser på språket appen startet med. Popup-ene bygges inne i den effekten
  // og må derfor lese gjeldende tekst via denne ref-en i stedet.
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  }, [text]);
  const beachesVisible = beachDisplayMode !== "off";
  const beachAreasVisible = beachDisplayMode === "areas";
  const beachLayerLabel =
    beachDisplayMode === "off"
      ? text.beachLayerOff
      : beachDisplayMode === "icons"
        ? text.beachLayerIcons
        : text.beachLayerAreas;
  const baseMapLabel =
    baseMap === "map"
      ? text.map
      : baseMap === "satellite"
        ? text.satellite
        : text.beachLayerOff;
  const visibleGpsIssue =
    gpsIssue && gpsIssue.code !== dismissedGpsIssueCode ? gpsIssue : null;
  const gpsStatusTone =
    tracking && fix
      ? fix.accuracy !== null && fix.accuracy > 20
        ? "limited"
        : "active"
      : "inactive";
  const gpsAccuracyLabel = gpsRestarting
    ? text.gpsRestarting
    : tracking && fix
      ? text.gpsAccuracy
      : text.noGps;

  const canAskOrientation =
    typeof window !== "undefined" &&
    "DeviceOrientationEvent" in window &&
    typeof (
      DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<PermissionState>;
      }
    ).requestPermission === "function";

  useEffect(() => {
    const query = window.matchMedia(
      "(max-width: 820px) and (orientation: portrait)",
    );
    const handleChange = () => setIsPortrait(query.matches);
    handleChange();
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === "no" ? "nb" : "en";
  }, [language]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateMobileChromeOffset = () => {
      const viewport = window.visualViewport;

      const measuredCoveredBottom = viewport
        ? Math.max(
            0,
            window.innerHeight - viewport.height - viewport.offsetTop,
          )
        : 0;

      document.documentElement.style.setProperty(
        "--mobile-browser-bottom-offset",
        `${Math.round(measuredCoveredBottom)}px`,
      );
      document.documentElement.style.setProperty(
        "--mobile-panel-bottom-clearance",
        `${Math.round(measuredCoveredBottom)}px`,
      );
    };

    updateMobileChromeOffset();
    window.visualViewport?.addEventListener("resize", updateMobileChromeOffset);
    window.visualViewport?.addEventListener("scroll", updateMobileChromeOffset);
    window.addEventListener("resize", updateMobileChromeOffset);
    window.addEventListener("orientationchange", updateMobileChromeOffset);

    return () => {
      window.visualViewport?.removeEventListener(
        "resize",
        updateMobileChromeOffset,
      );
      window.visualViewport?.removeEventListener(
        "scroll",
        updateMobileChromeOffset,
      );
      window.removeEventListener("resize", updateMobileChromeOffset);
      window.removeEventListener("orientationchange", updateMobileChromeOffset);
      document.documentElement.style.removeProperty(
        "--mobile-browser-bottom-offset",
      );
      document.documentElement.style.removeProperty(
        "--mobile-panel-bottom-clearance",
      );
    };
  }, []);

  const setPositionOnMap = useCallback(
    (nextFix: PositionFix) => {
      const map = mapRef.current;
      if (!map) return;
      const point: [number, number] = [nextFix.longitude, nextFix.latitude];

      markerRef.current?.setLngLat(point);
      // Markøren er opprettet med `rotationAlignment: "map"`, så rotasjonen her
      // er kurs i *geografiske* grader. MapLibre trekker fra kartets bearing
      // selv, hver frame. Roterte vi i stedet SVG-en inne i markøren ville den
      // stå i skjermkoordinater, og i kurs-opp — der kartet allerede er rotert
      // til kursen — ville båten blitt rotert dobbelt.
      if (nextFix.heading !== null) {
        markerRef.current?.setRotation(nextFix.heading);
      }

      const now = performance.now();
      const shouldUpdateGeoJson =
        now - lastGeoJsonUpdateRef.current >= GEOJSON_UPDATE_INTERVAL_MS;
      if (shouldUpdateGeoJson) {
        lastGeoJsonUpdateRef.current = now;
      }

      const source = map.getSource("accuracy") as maplibregl.GeoJSONSource;
      if (source && nextFix.accuracy && shouldUpdateGeoJson) {
        source.setData(
          createAccuracyCircle(
            nextFix.longitude,
            nextFix.latitude,
            Math.max(nextFix.accuracy, 8),
          ) as GeoJSON.GeoJSON,
        );
      }

      const headingLineSource = map.getSource(
        "heading-line",
      ) as maplibregl.GeoJSONSource;
      if (headingLineSource && shouldUpdateGeoJson) {
        if (nextFix.heading !== null) {
          const tip = destinationPoint(
            nextFix.latitude,
            nextFix.longitude,
            nextFix.heading,
            HEADING_LINE_DISTANCE_METERS,
          );
          headingLineSource.setData({
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [nextFix.longitude, nextFix.latitude],
                [tip.longitude, tip.latitude],
              ],
            },
            properties: {},
          });
        } else {
          headingLineSource.setData(EMPTY_FEATURE_COLLECTION as GeoJSON.GeoJSON);
        }
      }
    },
    // Bevisst tom: denne funksjonen rører bare markør og kartkilder, aldri
    // kameraet. Da holder identiteten seg stabil, og interpolasjonsløkka som
    // har den i avhengighetslista starter ikke på nytt hver gang brukeren
    // bytter følge- eller nord-opp-modus.
    [],
  );

  const refreshBeaches = useCallback(
    (
      latitude: number,
      longitude: number,
      radiusMeters = 2000,
      updateNearest = true,
    ) => {
      if (!beachesVisible) return;

      const queryRef = updateNearest ? beachPositionQueryRef : beachMapQueryRef;
      const lastQuery = queryRef.current;
      if (
        lastQuery &&
        Date.now() - lastQuery.timestamp < 120000 &&
        radiusMeters <= lastQuery.radiusMeters &&
        distanceBetweenCoordinates(
          latitude,
          longitude,
          lastQuery.latitude,
          lastQuery.longitude,
        ) < 250
      ) {
        return;
      }

      const abortRef = updateNearest ? beachPositionAbortRef : beachMapAbortRef;
      if (abortRef.current) {
        window.clearTimeout(abortRef.current);
      }

      const requestedAt = Date.now();
      queryRef.current = {
        latitude,
        longitude,
        radiusMeters,
        timestamp: requestedAt,
      };

      setBeaches((current) => ({
        ...current,
        status: "loading",
      }));

      abortRef.current = window.setTimeout(() => {
        fetchNearbyBeaches(latitude, longitude, radiusMeters)
          .then((result) => {
            const latestQuery = queryRef.current;
            if (
              !latestQuery ||
              latestQuery.timestamp !== requestedAt ||
              latestQuery.latitude !== latitude ||
              latestQuery.longitude !== longitude ||
              latestQuery.radiusMeters !== radiusMeters
            ) {
              return;
            }

            setBeaches((current) => ({
              status: "ready",
              nearest: updateNearest ? result.nearest : current.nearest,
              featureCollection: result.featureCollection,
              markerFeatureCollection: result.markerFeatureCollection,
            }));
          })
          .catch(() => {
            const latestQuery = queryRef.current;
            if (
              !latestQuery ||
              latestQuery.timestamp !== requestedAt ||
              latestQuery.latitude !== latitude ||
              latestQuery.longitude !== longitude ||
              latestQuery.radiusMeters !== radiusMeters
            ) {
              return;
            }

            setBeaches((current) => ({
              ...current,
              status: "error",
              nearest: updateNearest ? null : current.nearest,
            }));
          });
      }, 300);
    },
    [beachesVisible],
  );

  const refreshHarbors = useCallback(
    (latitude: number, longitude: number, radiusMeters = 2000) => {
      const lastQuery = harborMapQueryRef.current;
      if (
        lastQuery &&
        Date.now() - lastQuery.timestamp < 300000 &&
        radiusMeters <= lastQuery.radiusMeters &&
        distanceBetweenCoordinates(
          latitude,
          longitude,
          lastQuery.latitude,
          lastQuery.longitude,
        ) < 350
      ) {
        return;
      }

      if (harborMapAbortRef.current !== null) {
        window.clearTimeout(harborMapAbortRef.current);
      }

      const requestedAt = Date.now();
      harborMapQueryRef.current = {
        latitude,
        longitude,
        radiusMeters,
        timestamp: requestedAt,
      };
      setHarbors((current) => ({ ...current, status: "loading" }));

      harborMapAbortRef.current = window.setTimeout(() => {
        fetchNearbyHarbors(latitude, longitude, radiusMeters)
          .then((featureCollection) => {
            if (harborMapQueryRef.current?.timestamp !== requestedAt) return;
            setHarbors({ status: "ready", featureCollection });
          })
          .catch(() => {
            if (harborMapQueryRef.current?.timestamp !== requestedAt) return;
            setHarbors((current) => ({ ...current, status: "error" }));
          });
      }, 300);
    },
    [],
  );

  useEffect(() => {
    beachDisplayModeRef.current = beachDisplayMode;
  }, [beachDisplayMode]);

  useEffect(() => {
    harborsVisibleRef.current = harborsVisible;
  }, [harborsVisible]);

  useEffect(() => {
    followingLocationRef.current = followingLocation;
  }, [followingLocation]);

  useEffect(() => {
    northUpRef.current = northUp;
  }, [northUp]);

  const toggleHarbors = useCallback(() => {
    setHarborsVisible((current) => {
      const next = !current;
      const map = mapRef.current;
      if (next && map) {
        const center = map.getCenter();
        refreshHarbors(center.lat, center.lng, getBeachSearchRadius(map));
      }
      return next;
    });
  }, [refreshHarbors, setHarborsVisible]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: OPENFREEMAP_STYLE,
      center: OSLO_FJORD,
      zoom: 9,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }));
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    // Brukeren tar over kartet.
    //
    // `dragstart` alene holdt ikke: knip-zoom og to-finger-rotasjon går gjennom
    // `touchZoomRotate` og fyrer aldri `dragstart`. Følgingen ble dermed stående
    // på, og kameraet trakk seg tilbake til båten for hver GPS-fiks — kartet lot
    // seg rett og slett ikke zoome.
    //
    // `zoomstart`/`rotatestart` med `originalEvent`-sjekk ble prøvd først, men
    // MapLibre setter ikke `originalEvent` på dem her (verifisert i nettleser:
    // hjul-zoom ga `zoomstart` med `originalEvent: undefined`). Vi lytter derfor
    // på selve inndataene i stedet — de kan ikke forveksles med våre egne
    // `easeTo`-kall. `touchstart` slår bare av ved to fingre eller flere; ett
    // trykk kan være et klikk på en havn eller badeplass, og det skal ikke stoppe
    // følgingen. Enkeltfinger-panorering fanges av `dragstart`.
    const releaseFollow = () => {
      followingLocationRef.current = false;
      setFollowingLocation(false);
    };
    const releaseFollowOnMultiTouch = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      releaseFollow();
    };

    // Så lenge fingeren står på kartet skal vi ikke røre kameraet i det hele
    // tatt. Følgingen animerer nesten sammenhengende (én ease per GPS-fiks,
    // omtrent like lang som intervallet mellom fiksene), og en pågående
    // programmatisk animasjon spiser de første framene av gesten — det var
    // derfor panorering «ikke tok» før etter en stund. `map.stop()` avbryter
    // animasjonen med én gang, slik at MapLibre sine egne håndterere eier
    // kameraet fra første frame og `dragstart` faktisk rekker å fyre.
    const beginPointerInteraction = () => {
      pointerActiveRef.current = true;
      map.stop();
    };
    const endPointerInteraction = () => {
      pointerActiveRef.current = false;
    };

    map.on("dragstart", releaseFollow);
    const canvasContainer = map.getCanvasContainer();
    canvasContainer.addEventListener("wheel", releaseFollow, { passive: true });
    canvasContainer.addEventListener("dblclick", releaseFollow);
    canvasContainer.addEventListener("touchstart", releaseFollowOnMultiTouch, {
      passive: true,
    });
    canvasContainer.addEventListener("mousedown", beginPointerInteraction);
    canvasContainer.addEventListener("touchstart", beginPointerInteraction, {
      passive: true,
    });
    // Slutten fanges på window: fingeren eller musa slippes ofte utenfor kartet.
    window.addEventListener("mouseup", endPointerInteraction);
    window.addEventListener("touchend", endPointerInteraction);
    window.addEventListener("touchcancel", endPointerInteraction);
    const syncMapBearing = () => setMapBearing(normalizeBearing(map.getBearing()));
    map.on("rotate", syncMapBearing);
    map.on("move", syncMapBearing);

    map.on("load", () => {
      baseStyleLayerIdsRef.current = (map.getStyle().layers ?? []).map(
        (layer) => layer.id,
      );
      const initialBeachMarkerVisibility =
        beachDisplayModeRef.current !== "off" ? "visible" : "none";
      const initialBeachAreaVisibility =
        beachDisplayModeRef.current === "areas" ? "visible" : "none";
      const initialHarborMarkerVisibility = harborsVisibleRef.current
        ? "visible"
        : "none";
      // Basisikon (ukjent kvalitet, ingen dråpe) + én variant per kvalitet.
      const beachIconVariants: Array<[string, string | undefined]> = [
        ["beach-icon", undefined],
        ["beach-icon-good", BEACH_QUALITY_STYLE.good],
        ["beach-icon-fair", BEACH_QUALITY_STYLE.fair],
        ["beach-icon-poor", BEACH_QUALITY_STYLE.poor],
      ];
      for (const [imageName, badgeColor] of beachIconVariants) {
        const image = createBeachIconImageData(badgeColor);
        if (image && !map.hasImage(imageName)) {
          map.addImage(imageName, image, { pixelRatio: 2 });
        }
      }
      const beachAreaPattern = createBeachAreaPatternImageData();
      if (beachAreaPattern && !map.hasImage("beach-area-pattern")) {
        map.addImage("beach-area-pattern", beachAreaPattern, { pixelRatio: 2 });
      }
      const harborIcon = createHarborIconImageData();
      if (harborIcon && !map.hasImage("harbor-icon")) {
        map.addImage("harbor-icon", harborIcon, { pixelRatio: 2 });
      }

      map.addSource("satellite", {
        type: "raster",
        tiles: [SATELLITE_TILES],
        tileSize: 256,
        attribution: "Satellite imagery: Esri, Maxar, Earthstar Geographics",
      });
      map.addLayer({
        id: "satellite",
        type: "raster",
        source: "satellite",
        layout: {
          visibility: "none",
        },
      });
      map.addSource("sjokart", {
        type: "raster",
        tiles: [SJOKART_WMTS],
        tileSize: 256,
        // Dekker også vannstandsdataene i værkortet. De er CC BY 4.0 og krever
        // kreditering, og kartattribusjonen er stedet appen allerede har for
        // det — et eget felt i et tett kort ville kostet plass uten å gi mer.
        attribution: "Nautical chart and tide data: Kartverket",
      });
      map.addLayer({
        id: "sjokart",
        type: "raster",
        source: "sjokart",
        paint: {
          "raster-opacity": 0.68,
        },
      });
      map.addSource("harbors", {
        type: "geojson",
        data: EMPTY_HARBOR_FEATURE_COLLECTION,
        attribution: "Harbours: OpenStreetMap contributors",
        promoteId: "id",
      });
      map.addSource("beaches", {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION,
      });
      map.addSource("beach-markers", {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION,
        promoteId: "id",
      });
      map.addLayer({
        id: "beach-area-fill",
        type: "fill",
        source: "beaches",
        layout: {
          visibility: initialBeachAreaVisibility,
        },
        paint: {
          "fill-color": "#f97316",
          "fill-opacity": 0.08,
        },
      });
      map.addLayer({
        id: "beach-area-hatch",
        type: "fill",
        source: "beaches",
        layout: {
          visibility: initialBeachAreaVisibility,
        },
        paint: {
          "fill-pattern": "beach-area-pattern",
          "fill-opacity": 0.32,
        },
      });
      map.addLayer({
        id: "beach-area-outline",
        type: "line",
        source: "beaches",
        layout: {
          visibility: initialBeachAreaVisibility,
        },
        paint: {
          "line-color": "#ea580c",
          "line-opacity": 0.38,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            0.6,
            14,
            1.2,
          ],
        },
      });
      map.addLayer({
        id: "beach-marker-halo",
        type: "circle",
        source: "beach-markers",
        layout: {
          visibility: initialBeachMarkerVisibility,
        },
        paint: {
          "circle-color": "#ffffff",
          "circle-opacity": 0.94,
          "circle-radius": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            18,
            13,
          ],
          "circle-stroke-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#ea580c",
            "rgba(31, 41, 55, 0.28)",
          ],
          "circle-stroke-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3,
            1,
          ],
        },
      });
      map.addLayer({
        id: "beach-marker",
        type: "symbol",
        source: "beach-markers",
        layout: {
          visibility: initialBeachMarkerVisibility,
          "icon-image": [
            "match",
            ["downcase", ["to-string", ["coalesce", ["get", "waterQuality"], ""]]],
            "god",
            "beach-icon-good",
            "mindre god",
            "beach-icon-fair",
            "ikke akseptabel",
            "beach-icon-poor",
            "beach-icon",
          ],
          "icon-size": 0.85,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-anchor": "center",
        },
        paint: {
          "icon-opacity": 0.98,
        },
      });
      map.addLayer({
        id: "beach-label",
        type: "symbol",
        source: "beach-markers",
        minzoom: 13,
        layout: {
          visibility: initialBeachMarkerVisibility,
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-offset": [0, 1.15],
          "text-anchor": "top",
          "text-max-width": 9,
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#9a3412",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.6,
        },
      });
      map.addLayer({
        id: "harbor-marker-halo",
        type: "circle",
        source: "harbors",
        layout: { visibility: initialHarborMarkerVisibility },
        paint: {
          "circle-color": "#ffffff",
          "circle-opacity": 0.96,
          "circle-radius": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            18,
            13,
          ],
          "circle-stroke-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#007590",
            "rgba(31, 41, 55, 0.28)",
          ],
          "circle-stroke-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3,
            1,
          ],
        },
      });
      map.addLayer({
        id: "harbor-marker",
        type: "symbol",
        source: "harbors",
        layout: {
          visibility: initialHarborMarkerVisibility,
          "icon-image": "harbor-icon",
          "icon-size": 0.85,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-anchor": "center",
        },
      });
      const beachPopupLayers = [
        "beach-marker-halo",
        "beach-marker",
        "beach-label",
        "beach-area-fill",
        "beach-area-hatch",
        "beach-area-outline",
      ];
      // Fremhev valgt markør (større disk + tykkere omriss) via feature-state.
      let selectedMarker: { source: string; id: string | number } | null = null;
      const clearSelectedMarker = () => {
        if (selectedMarker) {
          map.setFeatureState(selectedMarker, { selected: false });
          selectedMarker = null;
        }
      };
      const selectMarker = (feature: maplibregl.MapGeoJSONFeature) => {
        clearSelectedMarker();
        if (feature.id === undefined || feature.id === null) return;
        selectedMarker = { source: feature.source, id: feature.id };
        map.setFeatureState(selectedMarker, { selected: true });
      };

      const showBeachPopup = (
        feature: maplibregl.MapGeoJSONFeature,
        lngLat: maplibregl.LngLat,
      ) => {
        const text = textRef.current;
        const name = getBeachFeatureName(feature.properties);
        const qualityKey = getBeachQualityKey(feature.properties);
        const qualityRow = qualityKey
          ? `<div class="popup-quality" style="color:${BEACH_QUALITY_STYLE[qualityKey]}">${beachQualityDropletSvg(BEACH_QUALITY_STYLE[qualityKey])}<span>${escapePopupText(text.waterQualityLabels[qualityKey])}</span></div>`
          : "";
        const popup = new maplibregl.Popup({
          closeButton: true,
          closeOnClick: true,
          offset: 16,
          className: "beach-popup",
        })
          .setLngLat(lngLat)
          .setHTML(
            `<div class="popup-card"><div class="popup-title">${BEACH_ICON_SVG}<strong>${escapePopupText(name)}</strong></div><span class="popup-type-badge">${escapePopupText(text.beachBadge)}</span>${qualityRow}<div class="popup-water-temp">${WATER_TEMP_ICON_SVG}<span>${escapePopupText(text.waterTemperature)}</span><strong data-water-temp aria-live="polite" aria-busy="true">${escapePopupText(text.waterTemperatureLoading)}</strong></div></div>`,
          )
          .addTo(map);

        selectMarker(feature);

        // Sjøtemperaturen hentes etter at popup-en er åpen, ellers ville
        // klikket henge på et nettverkskall. Avbrytes hvis brukeren lukker
        // popup-en først, slik at vi ikke skriver til et fjernet DOM-tre.
        const controller = new AbortController();
        void (async () => {
          let label: string;
          try {
            const weather = await fetchWeather(
              lngLat.lat,
              lngLat.lng,
              controller.signal,
            );
            label =
              weather.waterTemperature === null
                ? textRef.current.waterTemperatureUnavailable
                : formatWeatherValue(weather.waterTemperature, "°C");
          } catch {
            label = textRef.current.waterTemperatureUnavailable;
          }
          if (controller.signal.aborted) return;
          const target = popup
            .getElement()
            ?.querySelector("[data-water-temp]");
          if (target) {
            target.textContent = label;
            // Stopper ventepulsen i CSS. Teksten byttes på samme plass, så
            // layouten står stille mens verdien kommer.
            target.removeAttribute("aria-busy");
          }
        })();

        popup.on("close", () => {
          controller.abort();
          clearSelectedMarker();
        });
      };
      const showPointer = () => {
        map.getCanvas().style.cursor = "pointer";
      };
      const hidePointer = () => {
        map.getCanvas().style.cursor = "";
      };

      // Ett klikk kan treffe flere overlappende badelag samtidig (halo +
      // markør + areal). Bruk ett samlet klikk-håndtak og vis kun én popup for
      // øverste treff, ellers stables flere popups oppå hverandre og må lukkes
      // en etter en.
      const handleBeachClick = (event: maplibregl.MapMouseEvent) => {
        const hitLayers = beachPopupLayers.filter((id) => map.getLayer(id));
        if (hitLayers.length === 0) return;
        const features = map.queryRenderedFeatures(event.point, {
          layers: hitLayers,
        });
        if (features.length === 0) return;
        showBeachPopup(features[0], event.lngLat);
      };
      map.on("click", handleBeachClick);

      beachPopupLayers.forEach((layerId) => {
        map.on("mouseenter", layerId, showPointer);
        map.on("mouseleave", layerId, hidePointer);
      });
      const showHarborPopup = (event: maplibregl.MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        const harbor = getHarborFromProperties(feature?.properties);
        if (!harbor || !feature) return;

        const container = document.createElement("div");
        const root = createRoot(container);
        root.render(
          <HarborPopupContent
            harbor={harbor}
            text={text}
            language={language}
            onOpenMaps={() => setHarborMapOpen(harbor)}
          />,
        );

        const popup = new maplibregl.Popup({
          closeButton: true,
          closeOnClick: true,
          offset: 16,
          className: "harbor-popup",
        })
          .setLngLat(event.lngLat)
          .setDOMContent(container)
          .addTo(map);

        selectMarker(feature);

        // Utsett unmount til maplibre er ferdig med å fjerne DOM-noden.
        popup.on("close", () => {
          clearSelectedMarker();
          window.setTimeout(() => root.unmount(), 0);
        });
      };
      map.on("click", "harbor-marker", showHarborPopup);
      map.on("mouseenter", "harbor-marker", showPointer);
      map.on("mouseleave", "harbor-marker", hidePointer);
      map.addSource("accuracy", {
        type: "geojson",
        data: createAccuracyCircle(OSLO_FJORD[0], OSLO_FJORD[1], 0),
      });
      map.addLayer({
        id: "accuracy-fill",
        type: "fill",
        source: "accuracy",
        paint: {
          "fill-color": "#111827",
          "fill-opacity": 0.04,
        },
      });
      map.addLayer({
        id: "accuracy-halo",
        type: "line",
        source: "accuracy",
        paint: {
          "line-color": "#ffffff",
          "line-opacity": 0.86,
          "line-width": 5,
        },
      });
      map.addLayer({
        id: "accuracy-line",
        type: "line",
        source: "accuracy",
        paint: {
          "line-color": "#111827",
          "line-dasharray": [1.4, 1.4],
          "line-opacity": 0.86,
          "line-width": 2.4,
        },
      });
      map.addSource("heading-line", {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION,
      });
      map.addLayer({
        id: "heading-line",
        type: "line",
        source: "heading-line",
        paint: {
          "line-color": "#111827",
          "line-opacity": 0.86,
          "line-width": 2.4,
        },
      });

      // Nå finnes alle lagene — la synlighets-effektene kjøre på nytt slik at
      // innstillinger lest fra localStorage faktisk blir tatt i bruk.
      setMapReady(true);
    });

    const markerEl = document.createElement("div");
    markerEl.className = "ownship-marker";
    markerEl.innerHTML = OWNSHIP_MARKER_SVG;
    markerRef.current = new maplibregl.Marker({
      element: markerEl,
      // Default for markører er `viewport`. Med `map` roterer markøren sammen
      // med kartet, slik at `setRotation()` kan ta imot kurs i geografiske
      // grader og båten peker rett både i nord-opp og kurs-opp.
      rotationAlignment: "map",
    })
      .setLngLat(OSLO_FJORD)
      .addTo(map);
    mapRef.current = map;

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (depthAbortRef.current !== null) {
        window.clearTimeout(depthAbortRef.current);
      }
      if (shallowAheadAbortRef.current !== null) {
        window.clearTimeout(shallowAheadAbortRef.current);
      }
      if (shorelineAbortRef.current !== null) {
        window.clearTimeout(shorelineAbortRef.current);
      }
      if (beachPositionAbortRef.current !== null) {
        window.clearTimeout(beachPositionAbortRef.current);
      }
      if (beachMapAbortRef.current !== null) {
        window.clearTimeout(beachMapAbortRef.current);
      }
      if (harborMapAbortRef.current !== null) {
        window.clearTimeout(harborMapAbortRef.current);
      }
      if (weatherAbortRef.current !== null) {
        window.clearTimeout(weatherAbortRef.current);
      }
      if (gpsRestartLabelTimeoutRef.current !== null) {
        window.clearTimeout(gpsRestartLabelTimeoutRef.current);
      }
      map.off("rotate", syncMapBearing);
      map.off("move", syncMapBearing);
      map.off("dragstart", releaseFollow);
      canvasContainer.removeEventListener("wheel", releaseFollow);
      canvasContainer.removeEventListener("dblclick", releaseFollow);
      canvasContainer.removeEventListener(
        "touchstart",
        releaseFollowOnMultiTouch,
      );
      canvasContainer.removeEventListener("mousedown", beginPointerInteraction);
      canvasContainer.removeEventListener(
        "touchstart",
        beginPointerInteraction,
      );
      window.removeEventListener("mouseup", endPointerInteraction);
      window.removeEventListener("touchend", endPointerInteraction);
      window.removeEventListener("touchcancel", endPointerInteraction);
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Skjult kart-instans, alltid sentrert nær GPS-fix, uavhengig av hva
  // brukeren panorerer/zoomer til på synlig kart. Brukes kun til å slå opp
  // vann-polygoner for land-deteksjon — dermed er ikke deteksjonen bundet
  // til synlig kartutsnitt eller zoom-nivå.
  useEffect(() => {
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.style.top = "-9999px";
    container.style.width = "256px";
    container.style.height = "256px";
    container.style.pointerEvents = "none";
    document.body.appendChild(container);

    const shadowMap = new maplibregl.Map({
      container,
      style: OPENFREEMAP_STYLE,
      center: OSLO_FJORD,
      zoom: 12,
      interactive: false,
      attributionControl: false,
    });
    shadowMapRef.current = shadowMap;

    return () => {
      shadowMap.remove();
      shadowMapRef.current = null;
      container.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("sjokart")) return;
    map.setLayoutProperty(
      "sjokart",
      "visibility",
      chartVisible ? "visible" : "none",
    );
  }, [chartVisible, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("harbor-marker")) return;
    const visibility = harborsVisible ? "visible" : "none";
    map.setLayoutProperty("harbor-marker-halo", "visibility", visibility);
    map.setLayoutProperty("harbor-marker", "visibility", visibility);
  }, [harborsVisible, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("harbors")) return;
    const source = map.getSource("harbors") as maplibregl.GeoJSONSource;
    source.setData(harbors.featureCollection);
  }, [harbors.featureCollection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("satellite")) return;
    const showStandardMap = baseMap === "map";
    baseStyleLayerIdsRef.current.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(
          layerId,
          "visibility",
          showStandardMap ? "visible" : "none",
        );
      }
    });
    map.setLayoutProperty(
      "satellite",
      "visibility",
      baseMap === "satellite" ? "visible" : "none",
    );
  }, [baseMap, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("beach-marker")) return;
    const markerVisibility = beachesVisible ? "visible" : "none";
    const areaVisibility = beachAreasVisible ? "visible" : "none";
    map.setLayoutProperty("beach-marker-halo", "visibility", markerVisibility);
    map.setLayoutProperty("beach-marker", "visibility", markerVisibility);
    map.setLayoutProperty("beach-label", "visibility", markerVisibility);
    map.setLayoutProperty("beach-area-fill", "visibility", areaVisibility);
    map.setLayoutProperty("beach-area-hatch", "visibility", areaVisibility);
    map.setLayoutProperty("beach-area-outline", "visibility", areaVisibility);
  }, [beachAreasVisible, beachesVisible, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("beaches")) return;
    const source = map.getSource("beaches") as maplibregl.GeoJSONSource;
    source.setData(beaches.featureCollection);
  }, [beaches.featureCollection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("beach-markers")) return;
    const source = map.getSource("beach-markers") as maplibregl.GeoJSONSource;
    source.setData(beaches.markerFeatureCollection);
  }, [beaches.markerFeatureCollection]);

  useEffect(() => {
    const marker = markerRef.current?.getElement();
    if (marker) {
      marker.style.display = showOwnship ? "block" : "none";
    }
  }, [showOwnship]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("accuracy-fill")) return;
    const visibility = showAccuracyRing ? "visible" : "none";
    map.setLayoutProperty("accuracy-fill", "visibility", visibility);
    map.setLayoutProperty("accuracy-halo", "visibility", visibility);
    map.setLayoutProperty("accuracy-line", "visibility", visibility);
  }, [showAccuracyRing, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("heading-line")) return;
    map.setLayoutProperty(
      "heading-line",
      "visibility",
      showHeadingLine ? "visible" : "none",
    );
  }, [showHeadingLine, mapReady]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const globalWindow = window as unknown as {
      seanavSimulateBoat?: (options?: {
        latitude?: number;
        longitude?: number;
        heading?: number;
        speedKnots?: number;
      }) => void;
      seanavStopSimulation?: () => void;
    };

    globalWindow.seanavSimulateBoat = (options) => {
      if (simulationIntervalRef.current !== null) {
        window.clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }

      let position = {
        latitude: options?.latitude ?? SIMULATED_BOAT_DEFAULT[1],
        longitude: options?.longitude ?? SIMULATED_BOAT_DEFAULT[0],
      };
      const heading = normalizeBearing(options?.heading ?? 45);
      const speedKnots = options?.speedKnots ?? 8;
      const metersPerTick = (speedKnots * 0.514444) * 1;

      const tick = () => {
        const nextFix: PositionFix = {
          latitude: position.latitude,
          longitude: position.longitude,
          accuracy: 5,
          speedKnots,
          heading,
          headingSource: "gps",
          timestamp: Date.now(),
        };
        lastFixRef.current = nextFix;
        setFix(nextFix);
        setTracking(true);
        setGpsIssue(null);

        if (speedKnots > 0) {
          position = destinationPoint(
            position.latitude,
            position.longitude,
            heading,
            metersPerTick,
          );
        }
      };

      tick();
      simulationIntervalRef.current = window.setInterval(tick, 1000);
    };

    globalWindow.seanavStopSimulation = () => {
      if (simulationIntervalRef.current !== null) {
        window.clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
    };

    const simParam = new URLSearchParams(window.location.search).get("sim");
    if (simParam !== null) {
      const [latitude, longitude, heading, speedKnots] = simParam
        .split(",")
        .map((value) => (value.trim() === "" ? undefined : Number(value)));
      globalWindow.seanavSimulateBoat({
        latitude,
        longitude,
        heading,
        speedKnots,
      });
    }

    return () => {
      delete globalWindow.seanavSimulateBoat;
      delete globalWindow.seanavStopSimulation;
    };
  }, []);

  // Holder padding-cachen fersk og etterjusterer utsnittet når panelet endrer
  // størrelse. Instrumentpanelet vokser og krymper med skuffer, orientering og
  // nettleserens adresselinje, så `resize` alene fanger det ikke — derav
  // ResizeObserver på selve panelet.
  useEffect(() => {
    const refreshPadding = () => {
      mapPaddingRef.current = getVisibleMapPadding();
      const map = mapRef.current;
      if (!map || !followingLocationRef.current) return;
      const current = lastFixRef.current;
      if (!current) return;
      map.easeTo({
        center: [current.longitude, current.latitude],
        padding: mapPaddingRef.current,
        duration: 250,
      });
    };

    refreshPadding();
    window.addEventListener("resize", refreshPadding);
    window.addEventListener("orientationchange", refreshPadding);

    const panel = document.querySelector<HTMLElement>(".readout-panel");
    const observer =
      panel && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(refreshPadding)
        : null;
    observer?.observe(panel as HTMLElement);

    return () => {
      window.removeEventListener("resize", refreshPadding);
      window.removeEventListener("orientationchange", refreshPadding);
      observer?.disconnect();
    };
  }, []);

  // Kameraet følger båten én gang per reell GPS-fiks, ikke per
  // interpolasjonsframe. Tidligere kalte `setPositionOnMap` `jumpTo` opptil 60
  // ganger i sekundet; berøringsgester regnes relativt til der gesten startet,
  // så kartet spratt tilbake for hver frame og lot seg verken dra eller zoome.
  //
  // Zoom settes bevisst ikke her. Minstezoom hører hjemme i den eksplisitte
  // «sentrer»-handlingen — ellers kan man ikke zoome ut mens følging er på.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fix || !followingLocation || !followingLocationRef.current) {
      return;
    }
    if (pointerActiveRef.current) return;
    if (performance.now() < cameraLockUntilRef.current) return;
    map.easeTo({
      center: [fix.longitude, fix.latitude],
      bearing: northUpRef.current ? 0 : (fix.heading ?? map.getBearing()),
      padding: mapPaddingRef.current,
      // Matcher interpolasjonen av markøren, slik at båten holder seg i ro i
      // forhold til kartet i stedet for å skli fram og tilbake mot sentrum.
      duration: FIX_ANIMATION_DURATION_MS,
      easing: (t) => t,
    });
  }, [fix, followingLocation]);

  useEffect(() => {
    const map = shadowMapRef.current;
    if (!map || !fix) return;

    const lastCenter = shadowMapCenterRef.current;
    const driftMeters = lastCenter
      ? distanceBetweenCoordinates(
          lastCenter.latitude,
          lastCenter.longitude,
          fix.latitude,
          fix.longitude,
        )
      : Infinity;
    if (driftMeters > 2000) {
      shadowMapCenterRef.current = {
        latitude: fix.latitude,
        longitude: fix.longitude,
      };
      map.jumpTo({ center: [fix.longitude, fix.latitude] });
    }

    const evaluate = () => {
      const result = isPositionOnLand(map, fix.longitude, fix.latitude);
      if (result !== null) {
        setOnLand(result);
      }
    };

    evaluate();
    map.on("idle", evaluate);
    return () => {
      map.off("idle", evaluate);
    };
  }, [fix]);

  useEffect(() => {
    if (!fix) return;

    const previous = animatedFixRef.current ?? fix;
    const startLatitude = previous.latitude;
    const startLongitude = previous.longitude;
    const startHeading = previous.heading;
    const startTime = performance.now();

    if (positionAnimationFrameRef.current !== null) {
      cancelAnimationFrame(positionAnimationFrameRef.current);
    }

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / FIX_ANIMATION_DURATION_MS);
      const interpolatedFix: PositionFix = {
        ...fix,
        latitude: startLatitude + (fix.latitude - startLatitude) * t,
        longitude: startLongitude + (fix.longitude - startLongitude) * t,
        heading: interpolateHeading(startHeading, fix.heading, t),
      };
      animatedFixRef.current = interpolatedFix;
      setPositionOnMap(interpolatedFix);

      if (t < 1) {
        positionAnimationFrameRef.current = requestAnimationFrame(step);
      } else {
        positionAnimationFrameRef.current = null;
      }
    };

    positionAnimationFrameRef.current = requestAnimationFrame(step);

    if (onLand) {
      if (depthAbortRef.current) {
        window.clearTimeout(depthAbortRef.current);
      }
      setDepth({ status: "idle", value: null, message: text.onLand });
      return;
    }

    const lastDepthQuery = depthQueryRef.current;
    if (
      lastDepthQuery &&
      Date.now() - lastDepthQuery.timestamp < DEPTH_QUERY_MAX_AGE_MS &&
      distanceBetweenCoordinates(
        fix.latitude,
        fix.longitude,
        lastDepthQuery.latitude,
        lastDepthQuery.longitude,
      ) < DEPTH_QUERY_MIN_DISTANCE_METERS
    ) {
      return;
    }

    if (depthAbortRef.current) {
      window.clearTimeout(depthAbortRef.current);
    }

    setDepth((current) => ({
      ...current,
      status: "loading",
      message: text.updatingEstimate,
    }));

    depthQueryRef.current = {
      latitude: fix.latitude,
      longitude: fix.longitude,
      timestamp: Date.now(),
    };

    depthAbortRef.current = window.setTimeout(() => {
      fetchEstimatedDepth(fix.latitude, fix.longitude, language)
        .then((estimate) => {
          setDepth({
            status: "ready",
            value: estimate.value,
            message: estimate.message,
          });
        })
        .catch(() => {
          setDepth({
            status: "error",
            value: null,
            message: text.depthUnavailable,
          });
        });
    }, 650);
  }, [
    fix,
    language,
    onLand,
    setPositionOnMap,
    text.depthUnavailable,
    text.onLand,
    text.updatingEstimate,
  ]);

  useEffect(() => {
    if (!fix) return;

    if (onLand) {
      if (shorelineAbortRef.current) {
        window.clearTimeout(shorelineAbortRef.current);
      }
      setShoreline({ status: "idle", distanceMeters: null });
      return;
    }

    const lastShorelineQuery = shorelineQueryRef.current;
    if (
      lastShorelineQuery &&
      Date.now() - lastShorelineQuery.timestamp < SHORELINE_QUERY_MAX_AGE_MS &&
      distanceBetweenCoordinates(
        fix.latitude,
        fix.longitude,
        lastShorelineQuery.latitude,
        lastShorelineQuery.longitude,
      ) < SHORELINE_QUERY_MIN_DISTANCE_METERS
    ) {
      return;
    }

    if (shorelineAbortRef.current) {
      window.clearTimeout(shorelineAbortRef.current);
    }

    setShoreline((current) => ({
      ...current,
      status: "loading",
    }));

    shorelineQueryRef.current = {
      latitude: fix.latitude,
      longitude: fix.longitude,
      timestamp: Date.now(),
    };

    shorelineAbortRef.current = window.setTimeout(() => {
      fetchDistanceToLand(fix.latitude, fix.longitude)
        .then((distanceMeters) => {
          setShoreline({
            status: "ready",
            distanceMeters,
          });
        })
        .catch(() => {
          setShoreline({
            status: "error",
            distanceMeters: null,
          });
        });
    }, 900);
  }, [fix, onLand]);

  useEffect(() => {
    if (!fix || fix.heading === null || onLand) {
      setShallowAheadDepth(DEFAULT_DEPTH_STATE);
      return;
    }

    const lookaheadMeters = getShallowLookaheadDistance(fix.speedKnots);
    const ahead = destinationPoint(
      fix.latitude,
      fix.longitude,
      fix.heading,
      lookaheadMeters,
    );

    const lastShallowAheadQuery = shallowAheadQueryRef.current;
    if (
      lastShallowAheadQuery &&
      Date.now() - lastShallowAheadQuery.timestamp <
        SHALLOW_AHEAD_QUERY_MAX_AGE_MS &&
      distanceBetweenCoordinates(
        ahead.latitude,
        ahead.longitude,
        lastShallowAheadQuery.latitude,
        lastShallowAheadQuery.longitude,
      ) < SHALLOW_AHEAD_QUERY_MIN_DISTANCE_METERS
    ) {
      return;
    }

    if (shallowAheadAbortRef.current) {
      window.clearTimeout(shallowAheadAbortRef.current);
    }

    setShallowAheadDepth((current) =>
      current.status === "ready"
        ? current
        : { ...current, status: "loading", message: text.updatingEstimate },
    );

    shallowAheadQueryRef.current = {
      latitude: ahead.latitude,
      longitude: ahead.longitude,
      timestamp: Date.now(),
    };

    shallowAheadAbortRef.current = window.setTimeout(() => {
      fetchEstimatedDepth(ahead.latitude, ahead.longitude, language)
        .then((estimate) => {
          setShallowAheadDepth({
            status: "ready",
            value: estimate.value,
            message: estimate.message,
          });
        })
        .catch(() => {
          setShallowAheadDepth((current) =>
            current.status === "ready"
              ? current
              : {
                  status: "error",
                  value: null,
                  message: text.depthUnavailable,
                },
          );
        });
    }, 950);
  }, [fix, language, onLand, text.depthUnavailable, text.updatingEstimate]);

  useEffect(() => {
    if (!fix) return;
    refreshBeaches(fix.latitude, fix.longitude, 2000);
  }, [fix, refreshBeaches]);

  useEffect(() => {
    if (!fix) return;

    const lastQuery = weatherQueryRef.current;
    if (
      lastQuery &&
      Date.now() - lastQuery.timestamp < 600000 &&
      distanceBetweenCoordinates(
        fix.latitude,
        fix.longitude,
        lastQuery.latitude,
        lastQuery.longitude,
      ) < 500
    ) {
      return;
    }

    if (weatherAbortRef.current !== null) {
      window.clearTimeout(weatherAbortRef.current);
    }

    const requestedAt = Date.now();
    weatherQueryRef.current = {
      latitude: fix.latitude,
      longitude: fix.longitude,
      timestamp: requestedAt,
    };
    setWeather((current) => ({ ...current, status: "loading" }));

    weatherAbortRef.current = window.setTimeout(() => {
      fetchWeather(fix.latitude, fix.longitude)
        .then((result) => {
          if (weatherQueryRef.current?.timestamp !== requestedAt) return;
          setWeather(result);
        })
        .catch(() => {
          if (weatherQueryRef.current?.timestamp !== requestedAt) return;
          setWeather((current) => ({ ...current, status: "error" }));
        });
    }, 850);
  }, [fix]);

  // Ett minutts oppløsning holder for et klokkeslett og en prikk i en kurve.
  useEffect(() => {
    const timer = window.setInterval(() => setTideClock(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!fix) return;

    // Ett svar dekker over et døgn, og Kartverket velger uansett nærmeste
    // målestasjon. Derfor er tersklene helt andre enn for værmeldingen over:
    // vi henter på nytt først når båten har flyttet seg langt nok til at
    // stasjonsvalget kan ha endret seg, eller når vinduet er i ferd med å gå
    // tomt bakfra.
    const lastExtreme = tide.extremes[tide.extremes.length - 1];
    const windowRunningOut =
      lastExtreme === undefined || lastExtreme.time - tideClock < 2 * 3600000;
    const lastQuery = tideQueryRef.current;
    const movedFar =
      lastQuery === null ||
      distanceBetweenCoordinates(
        fix.latitude,
        fix.longitude,
        lastQuery.latitude,
        lastQuery.longitude,
      ) > 10000;

    const sinceLastQuery = lastQuery ? Date.now() - lastQuery.timestamp : Infinity;

    // Gulv mot at flere GPS-fikser rett etter hverandre gir hvert sitt kall.
    if (sinceLastQuery < 30000) return;
    if (!movedFar && !windowRunningOut) return;
    // `windowRunningOut` er permanent sann for en posisjon uten vannstandsdata —
    // `extremes` blir jo aldri fylt. Derfor prøver vi sjeldnere i det tilfellet.
    // Har båten derimot flyttet seg langt, kan stasjonen ha blitt en annen, og da
    // skal vi hente med én gang: en fastlåst brems her lot stasjonsnavnet og
    // tidevannet bli stående på forrige landsdel i flere minutter.
    if (!movedFar && sinceLastQuery < 300000) return;

    if (tideAbortRef.current !== null) {
      window.clearTimeout(tideAbortRef.current);
    }

    const requestedAt = Date.now();
    tideQueryRef.current = {
      latitude: fix.latitude,
      longitude: fix.longitude,
      timestamp: requestedAt,
    };
    setTide((current) => ({ ...current, status: "loading" }));

    tideAbortRef.current = window.setTimeout(() => {
      fetchTide(fix.latitude, fix.longitude)
        .then((result) => {
          if (tideQueryRef.current?.timestamp !== requestedAt) return;
          setTide(result);
        })
        .catch(() => {
          if (tideQueryRef.current?.timestamp !== requestedAt) return;
          setTide((current) => ({ ...current, status: "error" }));
        });
    }, 850);
  }, [fix, tide.extremes, tideClock]);

  useEffect(() => {
    if (!beachesVisible) return;
    const map = mapRef.current;
    if (!map) return;

    const refreshFromMapCenter = () => {
      const center = map.getCenter();
      refreshBeaches(center.lat, center.lng, getBeachSearchRadius(map), false);
    };

    if (map.loaded()) {
      refreshFromMapCenter();
    } else {
      map.once("load", refreshFromMapCenter);
    }

    map.on("moveend", refreshFromMapCenter);
    map.on("zoomend", refreshFromMapCenter);
    return () => {
      map.off("moveend", refreshFromMapCenter);
      map.off("zoomend", refreshFromMapCenter);
    };
  }, [beachesVisible, refreshBeaches]);

  useEffect(() => {
    if (!harborsVisible) return;
    const map = mapRef.current;
    if (!map) return;

    const refreshFromMapCenter = () => {
      const center = map.getCenter();
      refreshHarbors(center.lat, center.lng, getBeachSearchRadius(map));
    };

    if (map.loaded()) {
      refreshFromMapCenter();
    } else {
      map.once("load", refreshFromMapCenter);
    }

    map.on("moveend", refreshFromMapCenter);
    map.on("zoomend", refreshFromMapCenter);
    return () => {
      map.off("moveend", refreshFromMapCenter);
      map.off("zoomend", refreshFromMapCenter);
    };
  }, [harborsVisible, refreshHarbors]);

  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const webkitHeading = (event as DeviceOrientationEvent & {
        webkitCompassHeading?: number;
      }).webkitCompassHeading;
      const heading =
        typeof webkitHeading === "number"
          ? webkitHeading
          : typeof event.alpha === "number"
            ? normalizeBearing(360 - event.alpha)
            : null;
      orientationHeadingRef.current = heading;
    };

    window.addEventListener("deviceorientation", handleOrientation, true);
    return () =>
      window.removeEventListener("deviceorientation", handleOrientation, true);
  }, []);

  const startTracking = useCallback(async (
    requestCompass = true,
    showRestartingLabel = false,
  ) => {
    const setIssue = (code: GpsIssueCode) => {
      setGpsIssue({
        code,
        message: text.gpsIssueMessages[code],
      });
    };

    setDismissedGpsIssueCode(null);
    if (showRestartingLabel) {
      setGpsRestarting(true);
      if (gpsRestartLabelTimeoutRef.current !== null) {
        window.clearTimeout(gpsRestartLabelTimeoutRef.current);
      }
      gpsRestartLabelTimeoutRef.current = window.setTimeout(() => {
        setGpsRestarting(false);
        gpsRestartLabelTimeoutRef.current = null;
      }, 2600);
    }

    if (!window.isSecureContext) {
      setTracking(false);
      setIssue("insecure");
      return;
    }

    if (!("geolocation" in navigator)) {
      setTracking(false);
      setIssue("unsupported");
      return;
    }

    if (requestCompass && canAskOrientation) {
      try {
        await (
          DeviceOrientationEvent as unknown as {
            requestPermission: () => Promise<PermissionState>;
          }
        ).requestPermission();
      } catch {
        // Compass fallback is optional; location tracking remains useful.
      }
    }

    setTracking(true);
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const previous = lastFixRef.current;
        const coords = position.coords;
        const calculatedSpeed =
          previous && position.timestamp > previous.timestamp
            ? distanceMeters(previous, coords.latitude, coords.longitude) /
              ((position.timestamp - previous.timestamp) / 1000)
            : null;
        const speedKnots =
          typeof coords.speed === "number" && coords.speed >= 0
            ? metersPerSecondToKnots(coords.speed)
            : calculatedSpeed !== null
              ? metersPerSecondToKnots(calculatedSpeed)
              : null;

        const gpsHeading =
          typeof coords.heading === "number" && !Number.isNaN(coords.heading)
            ? normalizeBearing(coords.heading)
            : null;
        const calculatedHeading =
          previous &&
          distanceMeters(previous, coords.latitude, coords.longitude) > 4
            ? bearingDegrees(previous, coords.latitude, coords.longitude)
            : null;
        const compassHeading =
          speedKnots !== null && speedKnots < 0.8
            ? orientationHeadingRef.current
            : null;
        const heading = gpsHeading ?? calculatedHeading ?? compassHeading;
        const headingSource = gpsHeading !== null
          ? "gps"
          : calculatedHeading !== null
            ? "calculated"
            : compassHeading !== null
              ? "compass"
              : "none";
        const nextFix: PositionFix = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy:
            typeof coords.accuracy === "number" ? coords.accuracy : null,
          speedKnots,
          heading,
          headingSource,
          timestamp: position.timestamp,
        };

        lastFixRef.current = nextFix;
        setFix(nextFix);
        setGpsIssue(null);
      },
      (error) => {
        setTracking(false);
        const code =
          error.code === 1
            ? "denied"
            : error.code === 2
              ? "unavailable"
              : error.code === 3
                ? "timeout"
                : "unknown";
        setIssue(code);
        console.warn(error.message || text.gpsIssueMessages[code]);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000,
      },
    );
  }, [canAskOrientation, text.gpsIssueMessages]);

  useEffect(() => {
    void startTracking(false);
  }, [startTracking]);

  const recenterOrToggleNorth = () => {
    const map = mapRef.current;
    if (!map) return;

    if (!followingLocation) {
      followingLocationRef.current = true;
      setFollowingLocation(true);
      if (fix) {
        // Minstezoom hører hjemme her, i den eksplisitte «sentrer»-handlingen,
        // og ikke i den løpende følgingen.
        cameraLockUntilRef.current = performance.now() + 600;
        map.easeTo({
          center: [fix.longitude, fix.latitude],
          zoom: Math.max(map.getZoom(), 13),
          bearing: northUp ? 0 : (fix.heading ?? map.getBearing()),
          padding: mapPaddingRef.current,
          duration: 600,
        });
      }
      return;
    }

    setNorthUp((value) => {
      const nextNorthUp = !value;
      northUpRef.current = nextNorthUp;
      cameraLockUntilRef.current = performance.now() + 500;
      map.easeTo({
        bearing: nextNorthUp ? 0 : (fix?.heading ?? map.getBearing()),
        padding: mapPaddingRef.current,
        duration: 500,
      });
      return nextNorthUp;
    });
  };

  // Dybde og avstand til land hentes over nett og er strupet på tid og avstand, så
  // de endrer seg sjelden nok til at en «settle»-animasjon leses som at et nytt
  // estimat har kommet inn. Fart og kurs står bevisst uten: de oppdateres på hver
  // GPS-fiks, og et tall som blinker flere ganger i sekundet er ikke lesbart.
  const depthValueText = onLand
    ? text.onLand
    : formatDepth(depth.value, depthUnit);
  const shorelineValueText = onLand
    ? text.onLand
    : formatDistance(shoreline.distanceMeters, distanceUnit);

  // Alt tidevannet trenger, utledet på ett sted: hvilke to ekstremverdier vi står
  // mellom, hvilken vei det går, nivået nå, og punktene til minikurven.
  const tideNow = useMemo(() => {
    // Bevisst ingen sjekk på `status`: under en ny henting står statusen på
    // «loading» mens `extremes` fortsatt holder forrige svar. Skjulte vi raden da,
    // ville hele kolonnen blinke bort hver gang båten flytter seg langt nok.
    // Prediksjonene gjelder uansett i over et døgn. Ved «unavailable» og «error»
    // er `extremes` tom, og da faller vi ut her.
    if (tide.extremes.length < 2) return null;

    const nextIndex = tide.extremes.findIndex(
      (extreme) => extreme.time > tideClock,
    );
    // Ingen ekstremverdi igjen i vinduet — henteeffekten er allerede på vei med
    // nye data, og inntil de kommer har vi ingenting troverdig å vise.
    if (nextIndex < 1) return null;

    const previous = tide.extremes[nextIndex - 1];
    const next = tide.extremes[nextIndex];
    const following = tide.extremes[nextIndex + 1] ?? null;

    return {
      previous,
      next,
      following,
      rising: next.type === "high",
      level: interpolateTideLevel(previous, next, tideClock),
    };
  }, [tide, tideClock]);

  // Kurven tegnes av samme cosinustilnærming som nivået, så prikken ligger
  // alltid nøyaktig på linja. Passert del og resten er to separate baner, slik
  // at de kan ha ulik farge uten å regne strekklengder.
  const tideCurve = useMemo(() => {
    if (!tideNow || tide.extremes.length < 2) return null;

    // Koordinatsystemet har samme forhold som elementet tegnes i, slik at
    // skalering blir uniform. Med `preserveAspectRatio="none"` ville prikken
    // blitt oval og strekene ulikt tykke i hver retning.
    const width = 100;
    const height = 26;
    const top = 3.5;
    const bottom = 22.5;
    const from = tideNow.previous.time;
    const to = (tideNow.following ?? tideNow.next).time;
    const span = to - from;
    if (span <= 0) return null;

    const values = [tideNow.previous, tideNow.next, tideNow.following]
      .filter((extreme): extreme is TideExtreme => extreme !== null)
      .map((extreme) => extreme.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const pointAt = (time: number) => {
      const segmentEnd =
        tideNow.following !== null && time > tideNow.next.time
          ? tideNow.following
          : tideNow.next;
      const segmentStart =
        segmentEnd === tideNow.next ? tideNow.previous : tideNow.next;
      const value = interpolateTideLevel(segmentStart, segmentEnd, time);
      return {
        x: ((time - from) / span) * width,
        y: bottom - ((value - min) / range) * (bottom - top),
      };
    };

    const steps = 40;
    const points = Array.from({ length: steps + 1 }, (_, index) =>
      pointAt(from + (span * index) / steps),
    );
    const nowPoint = pointAt(tideClock);
    const nowIndex = Math.round(((tideClock - from) / span) * steps);

    const toPath = (subset: typeof points) =>
      subset
        .map(
          (point, index) =>
            `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
        )
        .join(" ");

    return {
      viewBox: `0 0 ${width} ${height}`,
      full: toPath(points),
      passed: toPath(points.slice(0, Math.max(2, nowIndex + 1))),
      now: nowPoint,
    };
  }, [tide.extremes.length, tideClock, tideNow]);

  const readouts = useMemo(
    () => [
      {
        label: text.latitude,
        value: fix ? formatCoordinate(fix.latitude, "N", "S") : "--",
      },
      {
        label: text.longitude,
        value: fix ? formatCoordinate(fix.longitude, "E", "W") : "--",
      },
      {
        label: text.speed,
        value: formatSpeed(fix?.speedKnots, speedUnit),
      },
      {
        label: text.heading,
        value: formatHeading(fix?.heading, headingMode),
      },
    ],
    [
      fix,
      headingMode,
      speedUnit,
      text.heading,
      text.latitude,
      text.longitude,
      text.speed,
    ],
  );

  const marineAlert = useMemo(() => {
    if (!showNotice || onLand) return null;

    const nearestBeach = beachesVisible ? beaches.nearest : null;
    const speedKnots = fix?.speedKnots ?? 0;
    if (nearestBeach && nearestBeach.distanceMeters <= 50 && speedKnots > 5) {
      return {
        kind: "warning",
        message: text.beachSpeedWarning(
          nearestBeach.name,
          nearestBeach.distanceMeters,
        ),
      };
    }

    if (nearestBeach && nearestBeach.distanceMeters <= 250) {
      return {
        kind: "caution",
        message: text.beachNearby(nearestBeach.name, nearestBeach.distanceMeters),
      };
    }

    if (
      shallowAheadDepth.status === "ready" &&
      shallowAheadDepth.value !== null &&
      shallowAheadDepth.value <= 3 &&
      speedKnots > 1
    ) {
      return {
        kind: "caution",
        message: text.shallowWaterWarning(
          shallowAheadDepth.value,
          getShallowLookaheadDistance(fix?.speedKnots),
        ),
      };
    }

    return null;
  }, [
    beaches.nearest,
    beachesVisible,
    fix?.speedKnots,
    onLand,
    shallowAheadDepth.status,
    shallowAheadDepth.value,
    showNotice,
    text,
  ]);
  const marineAlertKey = marineAlert
    ? `${marineAlert.kind}:${marineAlert.message}`
    : null;
  const visibleMarineAlert =
    marineAlert && marineAlertKey !== dismissedAlertKey ? marineAlert : null;

  useEffect(() => {
    if (!alertSoundEnabled || !visibleMarineAlert || !marineAlertKey) return;
    if (lastPlayedAlertKeyRef.current === marineAlertKey) return;

    lastPlayedAlertKeyRef.current = marineAlertKey;
    try {
      playAlertSound();
    } catch {
      // Browsers may block audio until the user has interacted with the page.
    }
  }, [alertSoundEnabled, marineAlertKey, visibleMarineAlert]);

  // Alt som vises betinget må holdes montert gjennom exit-animasjonen. Hookene
  // ligger samlet her fordi rekkefølgen på hook-kall må være stabil, og fordi
  // det er lettere å se hvilke overlays som har bevegelse når de står sammen.
  const harborMapPresence = usePresence(harborMapOpen !== null);
  const seaMarksPresence = usePresence(seaMarksOpen);
  const gpsHelpPresence = usePresence(gpsHelpOpen);
  const displayDrawerPresence = usePresence(displayOpen);
  const controlsDrawerPresence = usePresence(controlsOpen);
  const gpsAlertPresence = usePresence(visibleGpsIssue !== null);
  const marineAlertPresence = usePresence(visibleMarineAlert !== null);
  const weatherCardPresence = usePresence(weatherOpen);
  // Stripa slås av og på fra innstillingene, altså midt i blikket til brukeren.
  // Presence-en gjelder bare bryteren: forsvinner tidevannsdataene i stedet
  // (posisjon uten vannstand), er det ingen handling å bekrefte, og da er det
  // riktigere at raden bare er borte.
  const tideStripPresence = usePresence(tideExpanded);
  const coordinatePanelPresence = usePresence(showPrecisePosition);

  // Innholdet i disse forsvinner samtidig som `visible*`-verdien blir null, men
  // noden skal stå ut animasjonen — derfor holder vi siste viste verdi.
  const harborMapShown = useLastPresent(harborMapOpen, harborMapPresence.mounted);
  const gpsIssueShown = useLastPresent(visibleGpsIssue, gpsAlertPresence.mounted);
  const marineAlertShown = useLastPresent(visibleMarineAlert, marineAlertPresence.mounted);
  const marineAlertKeyShown = useLastPresent(marineAlertKey, marineAlertPresence.mounted);

  const toggles = [
    {
      label: text.accuracyRing,
      checked: showAccuracyRing,
      onChange: setShowAccuracyRing,
    },
    {
      label: text.headingLine,
      checked: showHeadingLine,
      onChange: setShowHeadingLine,
    },
    {
      label: text.ownshipMarker,
      checked: showOwnship,
      onChange: setShowOwnship,
    },
    {
      label: text.safetyNotice,
      checked: showNotice,
      onChange: setShowNotice,
    },
    {
      label: text.alertSound,
      checked: alertSoundEnabled,
      onChange: setAlertSoundEnabled,
    },
    {
      label: text.precisePosition,
      checked: showPrecisePosition,
      onChange: setShowPrecisePosition,
    },
    {
      label: text.weatherToggle,
      checked: weatherOpen,
      onChange: setWeatherOpen,
    },
    {
      label: text.tideExpanded,
      checked: tideExpanded,
      onChange: setTideExpanded,
    },
  ];
  const configuredVippsPaymentUrl =
    typeof import.meta.env.VITE_VIPPS_PAYMENT_URL === "string"
      ? import.meta.env.VITE_VIPPS_PAYMENT_URL.trim()
      : "";
  const vippsPaymentUrl =
    configuredVippsPaymentUrl || DEFAULT_VIPPS_PAYMENT_URL;

  const payWithVipps = () => {
    if (!vippsPaymentUrl) {
      window.alert(text.paymentUnavailable);
      return;
    }

    window.location.href = vippsPaymentUrl;
  };

  // Følger værkortets *monterte* tilstand, ikke `weatherOpen`: ellers ville
  // presis posisjon hoppe ut av .map-top-cluster i samme øyeblikk værkortet
  // begynner å tone ut, og vi ville sett den flytte seg under animasjonen.
  const coordinatePanelInline = weatherCardPresence.mounted && !isPortrait;
  const coordinatePanel = coordinatePanelPresence.mounted && (
    <section
      className={`${coordinatePanelInline ? "coordinate-panel coordinate-panel-inline" : "coordinate-panel"} ${coordinatePanelPresence.className}`}
      aria-label={text.precisePosition}
    >
      <span>{text.precisePosition}</span>
      <strong>
        {formatPreciseCoordinate(fix?.latitude, "N", "S")}
      </strong>
      <strong>
        {formatPreciseCoordinate(fix?.longitude, "E", "W")}
      </strong>
    </section>
  );

  return (
    <main
      className={
        displayDrawerPresence.mounted || controlsDrawerPresence.mounted
          ? "app-shell panel-drawer-open"
          : "app-shell"
      }
    >
      <div ref={mapContainer} className="map" aria-label={text.navigationMap} />

      <section className="topbar" aria-label={text.navigationStatus}>
        <div className="brand" aria-label="SeaNav">
          <img className="brand-logo" src={LOGO_IMAGE_URL} alt="" />
          <div>
            <strong>SeaNav</strong>
            <span>{text.brandSubtitle}</span>
          </div>
        </div>
      </section>

      <div className="map-center-overlays">
      {weatherCardPresence.mounted && (() => {
        const SymbolIcon = weatherSymbolIcon(weather.symbolCode);
        const windArrow = weatherFlowArrowDegrees(weather.windDirection, "from");
        const waveArrow = weatherFlowArrowDegrees(weather.waveDirection, "from");
        const currentArrow = weatherFlowArrowDegrees(weather.currentDirection, "to");
        const forecastUrl = fix && buildYrForecastUrl(fix.latitude, fix.longitude, language);

        return (
          <div className="map-top-cluster">
            <button
              type="button"
              className={`weather-card map-weather-card ${weatherCardPresence.className}`}
              aria-label={fix ? `${text.weatherHere} — ${text.weatherOpenForecast}` : text.weatherHere}
              disabled={!forecastUrl}
              onClick={() => {
                if (forecastUrl) window.open(forecastUrl, "_blank", "noopener,noreferrer");
              }}
            >
              <div className="weather-card-symbol">
                <SymbolIcon size={22} />
                {weather.temperature !== null && (
                  <strong>{Math.round(weather.temperature)}°</strong>
                )}
              </div>
              {!fix ? (
                <p className="weather-card-message">{text.weatherWaiting}</p>
              ) : weather.status === "error" ? (
                <p className="weather-card-message">{text.weatherUnavailable}</p>
              ) : (
                <div className="weather-card-metrics" aria-busy={weather.status === "loading"}>
                  <div className="weather-card-metric">
                    <div className="weather-card-metric-label">
                      <Wind size={14} />
                      <span>{text.wind}</span>
                    </div>
                    <div className="weather-card-metric-value">
                      <strong>{formatWeatherValue(weather.windSpeed, "m/s")}</strong>
                      {windArrow !== null && (
                        <ArrowUp size={13} style={{ transform: `rotate(${windArrow}deg)` }} />
                      )}
                    </div>
                  </div>
                  <div className="weather-card-metric">
                    <div className="weather-card-metric-label">
                      <Waves size={14} />
                      <span>{text.waves}</span>
                    </div>
                    <div className="weather-card-metric-value">
                      <strong>{formatWeatherValue(weather.waveHeight, "m")}</strong>
                      {waveArrow !== null && (
                        <ArrowUp size={13} style={{ transform: `rotate(${waveArrow}deg)` }} />
                      )}
                    </div>
                  </div>
                  <div className="weather-card-metric">
                    <div className="weather-card-metric-label">
                      <CurrentArrowsIcon size={14} />
                      <span>{text.current}</span>
                    </div>
                    <div className="weather-card-metric-value">
                      <strong>{formatWeatherValue(weather.currentSpeed, "m/s")}</strong>
                      {currentArrow !== null && (
                        <ArrowUp size={13} style={{ transform: `rotate(${currentArrow}deg)` }} />
                      )}
                    </div>
                  </div>
                  {tideNow && (
                    <div className="weather-card-metric">
                      <div className="weather-card-metric-label">
                        <TideIcon rising={tideNow.rising} size={14} />
                        <span>
                          {tideNow.rising ? text.tideHigh : text.tideLow}
                        </span>
                      </div>
                      <div
                        className="weather-card-metric-value"
                        aria-busy={tide.status === "loading"}
                      >
                        <strong>
                          {formatClockTime(tideNow.next.time, language)}
                        </strong>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {tideStripPresence.mounted && tideNow && tideCurve && (
                <div className={`weather-card-tide ${tideStripPresence.className}`}>
                  <svg
                    className="tide-spark"
                    viewBox={tideCurve.viewBox}
                    aria-hidden="true"
                  >
                    <path className="tide-spark-full" d={tideCurve.full} />
                    <path className="tide-spark-passed" d={tideCurve.passed} />
                    <circle
                      className="tide-spark-now"
                      cx={tideCurve.now.x}
                      cy={tideCurve.now.y}
                      r={2.8}
                    />
                  </svg>
                  <div className="weather-card-tide-now">
                    <span className="weather-card-metric-label">
                      {tide.station
                        ? `${text.tideNow} · ${tide.station}`
                        : text.tideNow}
                    </span>
                    <strong>{formatTideLevel(tideNow.level, depthUnit)}</strong>
                  </div>
                  <div className="weather-card-tide-events">
                    <span>
                      <em>{tideNow.rising ? text.tideHigh : text.tideLow}</em>
                      {` ${formatClockTime(tideNow.next.time, language)} · ${formatTideLevel(tideNow.next.value, depthUnit)}`}
                    </span>
                    {tideNow.following && (
                      <span>
                        <em>{tideNow.rising ? text.tideLow : text.tideHigh}</em>
                        {` ${formatClockTime(tideNow.following.time, language)} · ${formatTideLevel(tideNow.following.value, depthUnit)}`}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </button>
            {coordinatePanelInline && coordinatePanel}
          </div>
        );
      })()}

      {gpsAlertPresence.mounted && gpsIssueShown && (
        <div className={`gps-alert ${gpsAlertPresence.className}`} role="alert">
          <ShieldAlert size={17} />
          <div>
            <strong>{text.gpsIssueTitle}</strong>
            <span>{gpsIssueShown.message}</span>
          </div>
          <button
            type="button"
            className="gps-alert-action"
            onClick={() => setGpsHelpOpen(true)}
          >
            {text.gpsIssueHelp}
          </button>
          <button
            type="button"
            className="gps-alert-action"
            onClick={() => startTracking(true, true)}
          >
            {text.gpsIssueRetry}
          </button>
          <button
            type="button"
            className="marine-alert-close"
            onClick={() => setDismissedGpsIssueCode(gpsIssueShown.code)}
            title={text.dismissGpsIssue}
            aria-label={text.dismissGpsIssue}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {marineAlertPresence.mounted && marineAlertShown && marineAlertKeyShown && (
        <div className={`marine-alert ${marineAlertShown.kind} ${marineAlertPresence.className}`} role="alert">
          <ShieldAlert size={16} />
          <span>{marineAlertShown.message}</span>
          <button
            type="button"
            className="marine-alert-close"
            onClick={() => setDismissedAlertKey(marineAlertKeyShown)}
            title={text.dismissAlert}
            aria-label={text.dismissAlert}
          >
            <X size={15} />
          </button>
        </div>
      )}
      </div>

      <div className="bottom-dock">
      {!coordinatePanelInline && coordinatePanel}
      <section className="readout-panel" aria-label={text.liveNavigationData}>
          <div className="readout instrument-pair primary-depth">
            <button
              type="button"
              className="instrument-toggle"
              onClick={() =>
                setDepthUnit((current) => (current === "m" ? "ft" : "m"))
              }
              title={text.toggleDepthUnit}
              aria-label={text.toggleDepthUnit}
            >
              <span>{text.mapDepth}</span>
              {/* `key` på verdien tvinger React til å sette inn et nytt element når
                  tallet faktisk endrer seg, og først da spiller CSS-animasjonen av
                  seg. Uten den ville den aldri kjørt igjen etter første render. */}
              <strong
                key={depthValueText}
                className="instrument-value-settle"
              >
                {depthValueText}
              </strong>
            </button>
            <button
              type="button"
              className="instrument-toggle"
              onClick={() =>
                setDistanceUnit((current) =>
                  current === "metric" ? "nm" : "metric",
                )
              }
              title={text.toggleDistanceUnit}
              aria-label={text.toggleDistanceUnit}
            >
              <span>{text.distanceToLand}</span>
              <strong
                key={shorelineValueText}
                className="instrument-value-settle"
              >
                {shorelineValueText}
              </strong>
            </button>
            <Waves size={28} />
          </div>
          <div className="readout-grid coordinate-readouts">
            {readouts.slice(0, 2).map((item) => (
              <div className="readout" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>

          <div className="readout-grid motion-readouts">
            <div className="readout instrument-pair motion-readout">
              <button
                type="button"
                className="instrument-toggle speed-toggle"
                onClick={() =>
                  setSpeedUnit((current) => (current === "kn" ? "kmh" : "kn"))
                }
                title={text.toggleSpeedUnit}
                aria-label={text.toggleSpeedUnit}
              >
                <span>{text.speed}</span>
                <strong>{readouts[2].value}</strong>
              </button>
              <button
                type="button"
                className="instrument-toggle"
                onClick={() =>
                  setHeadingMode((current) =>
                    current === "full" ? "degrees" : "full",
                  )
                }
                title={text.toggleHeadingMode}
                aria-label={text.toggleHeadingMode}
              >
                <span>{text.heading}</span>
                <strong>{readouts[3].value}</strong>
              </button>
            </div>
          </div>

          <button
            type="button"
            className="accuracy"
            onClick={() => startTracking(true, true)}
            title={text.retryGps}
          >
            <div className="accuracy-target">
              <Crosshair size={18} />
              <span className={`status-dot ${gpsStatusTone}`} />
            </div>
            <strong className="accuracy-value">
              {fix?.accuracy ? `${Math.round(fix.accuracy)} m` : "--"}
            </strong>
            <div className="accuracy-label">{gpsAccuracyLabel}</div>
          </button>

          <button
            type="button"
            className={
              followingLocation && !northUp
                ? "location-mode-button active"
                : "location-mode-button"
            }
            onClick={recenterOrToggleNorth}
            title={
              followingLocation
                ? northUp
                  ? text.lockedNorth
                  : text.followingCourse
                : text.returnToLocation
            }
          >
            {followingLocation ? (
              <span
                className="map-bearing-icon"
                style={{ transform: `rotate(${mapBearing}deg)` }}
                aria-hidden="true"
              >
                <span className="map-bearing-north" />
              </span>
            ) : (
              <LocateFixed size={20} />
            )}
            <span>
              {followingLocation
                ? northUp
                  ? text.lockedNorth
                  : text.followingCourse
                : text.myLocation}
            </span>
          </button>

          <div className="panel-actions">
            <button
              type="button"
              className={displayOpen ? "active" : ""}
              onClick={() => {
                setDisplayOpen((value) => !value);
                setControlsOpen(false);
              }}
              title={text.showDisplayOptions}
            >
              {displayOpen ? <X size={18} /> : <SlidersHorizontal size={18} />}
              <span>{text.settings}</span>
            </button>
            <button
              type="button"
              className={controlsOpen ? "active" : ""}
              onClick={() => {
                setControlsOpen((value) => !value);
                setDisplayOpen(false);
              }}
              title={text.showNavigationControls}
            >
              {controlsOpen ? <X size={18} /> : <Layers size={18} />}
              <span>{text.navLayers}</span>
            </button>
          </div>

          {displayDrawerPresence.mounted && (
            <div className={`panel-drawer display-drawer ${displayDrawerPresence.className}`}>
              <label className="language-row">
                <span>{text.language}</span>
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value as Language)}
                >
                  <option value="no">{text.norwegian}</option>
                  <option value="en">{text.english}</option>
                </select>
              </label>
              {toggles.map((item) => (
                <label className="toggle-row" key={item.label}>
                  <span>{item.label}</span>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(event) => item.onChange(event.target.checked)}
                  />
                </label>
              ))}
              <div className="settings-actions">
                <button
                  type="button"
                  onClick={() => setSeaMarksOpen(true)}
                  title={text.openSeaMarks}
                >
                  <BookOpen size={18} />
                  <span>{text.seaMarks}</span>
                </button>
                <button
                  type="button"
                  onClick={payWithVipps}
                  title={text.payment}
                >
                  <HeartHandshake size={18} />
                  <span>{text.payment}</span>
                </button>
              </div>
              <a
                className="vipps-qr-panel"
                href={vippsPaymentUrl}
                aria-label={text.payment}
              >
                <img src={VIPPS_QR_IMAGE_URL} alt={text.paymentQrTitle} />
                <span>
                  <strong>{text.paymentQrTitle}</strong>
                  <small>{text.paymentQrDescription}</small>
                </span>
              </a>
            </div>
          )}

          {controlsDrawerPresence.mounted && (
            <div className={`panel-drawer embedded-controls ${controlsDrawerPresence.className}`}>
              <button
                type="button"
                className={baseMap === "off" ? "" : "active"}
                onClick={() =>
                  setBaseMap((current) =>
                    current === "map"
                      ? "satellite"
                      : current === "satellite"
                        ? "off"
                        : "map",
                  )
                }
                title={text.cycleBaseMap}
              >
                {baseMap === "map" ? (
                  <MapIcon size={20} />
                ) : baseMap === "satellite" ? (
                  <Satellite size={20} />
                ) : (
                  <MapIcon size={20} />
                )}
                <span>{baseMapLabel}</span>
              </button>
              <button
                type="button"
                className={chartVisible ? "active" : ""}
                onClick={() => setChartVisible((value) => !value)}
                title={text.toggleNauticalChart}
              >
                <Layers size={20} />
                <span>{text.chart}</span>
              </button>
              <button
                type="button"
                className={beachesVisible ? "active" : ""}
                data-mode={beachDisplayMode}
                onClick={() =>
                  setBeachDisplayMode((mode) =>
                    mode === "off" ? "icons" : mode === "icons" ? "areas" : "off",
                  )
                }
                title={text.toggleBeachAreas}
              >
                <Waves size={20} />
                <span>{beachLayerLabel}</span>
              </button>
              <button
                type="button"
                className={harborsVisible ? "active" : ""}
                onClick={toggleHarbors}
                title={text.harbors}
              >
                <Anchor size={20} />
                <span>{text.harbors}</span>
              </button>
            </div>
          )}

          {showNotice && (
            <div
              className="notice"
              role="note"
              title={text.safetyNoticeText}
            >
              <ShieldAlert size={17} />
              <span>{text.safetyNoticeText}</span>
            </div>
          )}
        </section>
      </div>

      {harborMapPresence.mounted && harborMapShown && (
        <section
          className={`harbor-map-modal ${harborMapPresence.className}`}
          role="dialog"
          aria-modal="true"
          aria-label={harborMapShown.name}
        >
          <header>
            <div>
              <Anchor size={20} />
              <strong>{harborMapShown.name}</strong>
            </div>
            <button
              type="button"
              onClick={() => setHarborMapOpen(null)}
              title={text.closeMap}
              aria-label={text.closeMap}
            >
              <X size={21} />
            </button>
          </header>
          <iframe
            title={`${harborMapShown.name} i Google Maps`}
            src={`https://www.google.com/maps?q=${encodeURIComponent(`${harborMapShown.latitude},${harborMapShown.longitude}`)}&z=15&output=embed`}
          />
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${harborMapShown.latitude},${harborMapShown.longitude}`)}`}
            target="_blank"
            rel="noreferrer"
          >
            {text.openGoogleMaps}
            <ExternalLink size={17} />
          </a>
        </section>
      )}

      {seaMarksPresence.mounted && (
        <section
          className={`sea-marks-modal ${seaMarksPresence.className}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="sea-marks-title"
        >
          <div className="sea-marks-header">
            <div>
              <strong id="sea-marks-title">{text.seaMarksTitle}</strong>
              <span>{text.seaMarksSubtitle}</span>
            </div>
            <button
              type="button"
              className="sea-marks-close"
              onClick={() => setSeaMarksOpen(false)}
              title={text.closeSeaMarks}
              aria-label={text.closeSeaMarks}
            >
              <X size={20} />
            </button>
          </div>

          <div className="sea-marks-scroll">
            <p className="sea-marks-note">
              <Lightbulb size={15} aria-hidden="true" />
              <span>{text.seaMarksIntro}</span>
            </p>

            <div className="sea-marks-group-head">
              <Compass size={16} aria-hidden="true" />
              <strong>{text.seaMarksGroupCardinal}</strong>
              <span className="sea-marks-rule" />
            </div>
            <p className="sea-marks-group-intro">{text.seaMarksGroupCardinalIntro}</p>
            <div className="sea-marks-grid">
              {text.seaMarksCardinal.map((mark) => (
                <article className="sea-mark-card" key={mark.title}>
                  <div className="sea-mark-symbol">
                    <SeaMarkSymbol type={mark.className} />
                  </div>
                  <div>
                    <strong>{mark.title}</strong>
                    {mark.color && (
                      <div className="sea-mark-meta">
                        <span>{text.seaMarksColorLabel}</span>
                        {mark.color}
                      </div>
                    )}
                    {mark.reflex && (
                      <div className="sea-mark-meta">
                        <span>{text.seaMarksReflexLabel}</span>
                        {mark.reflex}
                      </div>
                    )}
                    <p>{mark.detail}</p>
                    {mark.light && (
                      <span className={`sea-mark-light sea-mark-light-${mark.lightVariant ?? "white"}`}>
                        <Lightbulb size={13} aria-hidden="true" />
                        {mark.light}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>

            <div className="sea-marks-group-head">
              <ArrowLeftRight size={16} aria-hidden="true" />
              <strong>{text.seaMarksGroupLateral}</strong>
              <span className="sea-marks-rule" />
            </div>
            <p className="sea-marks-group-intro">{text.seaMarksGroupLateralIntro}</p>
            <div className="sea-marks-lateral">
              {text.seaMarksLateral[0] && (
                <article className="sea-mark-lateral-card">
                  <div className="sea-mark-symbol">
                    <SeaMarkSymbol type={text.seaMarksLateral[0].className} />
                  </div>
                  <strong>{text.seaMarksLateral[0].title}</strong>
                  <div className="sea-mark-meta">
                    <span>{text.seaMarksColorLabel}</span>
                    {text.seaMarksLateral[0].color}
                  </div>
                  <div className="sea-mark-meta">
                    <span>{text.seaMarksReflexLabel}</span>
                    {text.seaMarksLateral[0].reflex}
                  </div>
                  <p>{text.seaMarksLateral[0].detail}</p>
                  <span className="sea-mark-light sea-mark-light-red">
                    <Lightbulb size={13} aria-hidden="true" />
                    {text.seaMarksLateral[0].light}
                  </span>
                </article>
              )}
              <div className="sea-mark-led-wrap">
                <SeaLedDirection />
              </div>
              {text.seaMarksLateral[1] && (
                <article className="sea-mark-lateral-card">
                  <div className="sea-mark-symbol">
                    <SeaMarkSymbol type={text.seaMarksLateral[1].className} />
                  </div>
                  <strong>{text.seaMarksLateral[1].title}</strong>
                  <div className="sea-mark-meta">
                    <span>{text.seaMarksColorLabel}</span>
                    {text.seaMarksLateral[1].color}
                  </div>
                  <div className="sea-mark-meta">
                    <span>{text.seaMarksReflexLabel}</span>
                    {text.seaMarksLateral[1].reflex}
                  </div>
                  <p>{text.seaMarksLateral[1].detail}</p>
                  <span className="sea-mark-light sea-mark-light-green">
                    <Lightbulb size={13} aria-hidden="true" />
                    {text.seaMarksLateral[1].light}
                  </span>
                </article>
              )}
            </div>

            <div className="sea-marks-group-head">
              <AlertTriangle size={16} aria-hidden="true" />
              <strong>{text.seaMarksGroupOther}</strong>
              <span className="sea-marks-rule" />
            </div>
            <div className="sea-marks-grid">
              {text.seaMarksOther.map((mark) => (
                <article className="sea-mark-card" key={mark.title}>
                  <div className="sea-mark-symbol">
                    <SeaMarkSymbol type={mark.className} />
                  </div>
                  <div>
                    <strong>{mark.title}</strong>
                    {mark.color && (
                      <div className="sea-mark-meta">
                        <span>{text.seaMarksColorLabel}</span>
                        {mark.color}
                      </div>
                    )}
                    {mark.reflex && (
                      <div className="sea-mark-meta">
                        <span>{text.seaMarksReflexLabel}</span>
                        {mark.reflex}
                      </div>
                    )}
                    <p>{mark.detail}</p>
                    {mark.light && (
                      <span className={`sea-mark-light sea-mark-light-${mark.lightVariant ?? "white"}`}>
                        <Lightbulb size={13} aria-hidden="true" />
                        {mark.light}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>

            <div className="sea-marks-group-head">
              <MapPin size={16} aria-hidden="true" />
              <strong>{text.seaMarksGroupFixed}</strong>
              <span className="sea-marks-rule" />
            </div>
            <p className="sea-marks-group-intro">{text.seaMarksGroupFixedIntro}</p>
            <div className="sea-marks-grid">
              {text.seaMarksFixed.map((mark) => (
                <article className="sea-mark-card" key={mark.title}>
                  <div className="sea-mark-symbol">
                    <SeaMarkSymbol type={mark.className} />
                  </div>
                  <div>
                    <strong>{mark.title}</strong>
                    <p>{mark.detail}</p>
                  </div>
                </article>
              ))}
            </div>

            <a
              className="sea-marks-source"
              href="https://www.kystverket.no/sjovegen/fyr-lykter-og-sjomerker/"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={15} aria-hidden="true" />
              {text.seaMarksSource}
            </a>
          </div>
        </section>
      )}

      {gpsHelpPresence.mounted && (
        <section
          className={`gps-help-modal ${gpsHelpPresence.className}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="gps-help-title"
        >
          <div className="sea-marks-header">
            <div>
              <strong id="gps-help-title">{text.gpsHelpTitle}</strong>
              <span>{text.gpsHelpSubtitle}</span>
            </div>
            <button
              type="button"
              className="sea-marks-close"
              onClick={() => setGpsHelpOpen(false)}
              title={text.closeGpsHelp}
              aria-label={text.closeGpsHelp}
            >
              <X size={20} />
            </button>
          </div>

          <div className="gps-help-grid">
            {text.gpsHelpSections.map((section) => (
              <article className="gps-help-card" key={section.title}>
                <strong>{section.title}</strong>
                <ol>
                  {section.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function App() {
  const [showNavigation, setShowNavigation] = useState(
    () => typeof window !== "undefined" && window.location.hash === "#navigasjon",
  );

  useEffect(() => {
    const syncViewWithHash = () => {
      setShowNavigation(window.location.hash === "#navigasjon");
    };

    window.addEventListener("hashchange", syncViewWithHash);
    return () => window.removeEventListener("hashchange", syncViewWithHash);
  }, []);

  useEffect(() => {
    document.title = showNavigation
      ? "SeaNav | Navigasjon"
      : "SeaNav | Enkel navigering og sjøkart";
  }, [showNavigation]);

  const startNavigation = () => {
    window.location.hash = "navigasjon";
  };

  return showNavigation ? (
    <NavigationApp />
  ) : (
    <LandingPage onStart={startNavigation} />
  );
}

export default App;

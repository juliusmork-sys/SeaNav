import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { createRoot } from "react-dom/client";
import maplibregl, { Map } from "maplibre-gl";
import {
  ArrowRight,
  Anchor,
  BookOpen,
  CircleDollarSign,
  Clock,
  CloudSun,
  Compass,
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
  Phone,
  Recycle,
  Sailboat,
  Satellite,
  Share,
  ShieldAlert,
  ShowerHead,
  SlidersHorizontal,
  Toilet,
  UserRoundX,
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
  windSpeed: number | null;
  windDirection: number | null;
  waveHeight: number | null;
  waveDirection: number | null;
  currentSpeed: number | null;
  currentDirection: number | null;
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
  description: string;
  detail: string;
  className: string;
};

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
    unlockNorth: "Lås opp nord opp",
    fixNorth: "Lås nord opp",
    returnToLocation: "Gå til GPS-posisjon",
    fixNorthLabel: "Nord opp",
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
    seaMarksSource: "Kilde: Kystverket",
    seaMarksList: [
      {
        title: "Babord lateralmerke",
        description: "Rødt merke.",
        detail: "Holdes på babord side i merkets hovedretning.",
        className: "port",
      },
      {
        title: "Styrbord lateralmerke",
        description: "Grønt merke.",
        detail: "Holdes på styrbord side i merkets hovedretning.",
        className: "starboard",
      },
      {
        title: "Nord kardinalmerke",
        description: "Svart over gult.",
        detail: "Trygt farvann ligger nord for merket.",
        className: "north",
      },
      {
        title: "Sør kardinalmerke",
        description: "Gult over svart.",
        detail: "Trygt farvann ligger sør for merket.",
        className: "south",
      },
      {
        title: "Øst kardinalmerke",
        description: "Svart med gult belte.",
        detail: "Trygt farvann ligger øst for merket.",
        className: "east",
      },
      {
        title: "Vest kardinalmerke",
        description: "Gult med svart belte.",
        detail: "Trygt farvann ligger vest for merket.",
        className: "west",
      },
      {
        title: "Spesialmerke",
        description: "Gult merke.",
        detail: "Brukes for særskilte områder, ofte med begrensninger.",
        className: "special",
      },
      {
        title: "Frittliggende grunne/fare",
        description: "Svart med røde belter.",
        detail: "Farvannet rundt er seilbart, men fare finnes ved merket.",
        className: "danger",
      },
      {
        title: "Senterledsmerke",
        description: "Røde og hvite vertikale striper.",
        detail: "Markerer trygt farvann eller midt i leden.",
        className: "safe",
      },
      {
        title: "Fast merke",
        description: "Stang, varde eller båke.",
        detail: "Viser peker normalt mot sikkert farvann.",
        className: "fixed",
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
    weatherWaiting: "Venter på GPS-posisjon",
    weatherUnavailable: "Værdata er ikke tilgjengelig akkurat nå.",
    wind: "Vind",
    waves: "Bølger",
    current: "Strøm",
    harborCapacity: "Kapasitet",
    harborHours: "Åpningstider",
    harborPhone: "Telefon",
    harborWebsite: "Nettside",
    harborTypeMarina: "Marina",
    harborTypeHarbour: "Havn",
    beachBadge: "Badeplass",
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
    unlockNorth: "Unlock north-up",
    fixNorth: "Fix north-up",
    returnToLocation: "Return to GPS location",
    fixNorthLabel: "Fix north",
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
    seaMarksSource: "Source: Kystverket",
    seaMarksList: [
      {
        title: "Port lateral mark",
        description: "Red mark.",
        detail: "Kept to port in the main direction of buoyage.",
        className: "port",
      },
      {
        title: "Starboard lateral mark",
        description: "Green mark.",
        detail: "Kept to starboard in the main direction of buoyage.",
        className: "starboard",
      },
      {
        title: "North cardinal mark",
        description: "Black over yellow.",
        detail: "Safe water is north of the mark.",
        className: "north",
      },
      {
        title: "South cardinal mark",
        description: "Yellow over black.",
        detail: "Safe water is south of the mark.",
        className: "south",
      },
      {
        title: "East cardinal mark",
        description: "Black with a yellow band.",
        detail: "Safe water is east of the mark.",
        className: "east",
      },
      {
        title: "West cardinal mark",
        description: "Yellow with a black band.",
        detail: "Safe water is west of the mark.",
        className: "west",
      },
      {
        title: "Special mark",
        description: "Yellow mark.",
        detail: "Used for special areas, often with restrictions.",
        className: "special",
      },
      {
        title: "Isolated danger mark",
        description: "Black with red bands.",
        detail: "Navigable water around the mark, but danger at the mark.",
        className: "danger",
      },
      {
        title: "Safe water mark",
        description: "Red and white vertical stripes.",
        detail: "Marks safe water or centre of fairway.",
        className: "safe",
      },
      {
        title: "Fixed mark",
        description: "Pole, cairn or beacon.",
        detail: "The pointer normally points toward safe water.",
        className: "fixed",
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
    weatherWaiting: "Waiting for GPS position",
    weatherUnavailable: "Weather data is unavailable right now.",
    wind: "Wind",
    waves: "Waves",
    current: "Current",
    harborCapacity: "Capacity",
    harborHours: "Opening hours",
    harborPhone: "Phone",
    harborWebsite: "Website",
    harborTypeMarina: "Marina",
    harborTypeHarbour: "Harbour",
    beachBadge: "Bathing spot",
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
  windSpeed: null,
  windDirection: null,
  waveHeight: null,
  waveDirection: null,
  currentSpeed: null,
  currentDirection: null,
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

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;
const metersPerSecondToKnots = (speed: number) => speed * 1.943844492;
const normalizeBearing = (degrees: number) => (degrees + 360) % 360;

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

function formatWeatherMeasure(
  value: number | null,
  unit: string,
  direction: number | null,
) {
  if (value === null || Number.isNaN(value)) return "--";
  const valueLabel = `${value.toFixed(1)} ${unit}`;
  if (direction === null || Number.isNaN(direction)) return valueLabel;
  return `${valueLabel} · ${Math.round(normalizeBearing(direction))}° ${compassPoint(direction)}`;
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

// Tegn hvit bakgrunnssirkel + ikon (SVG-paths) sentrert. Path2D gir eksakt
// samme geometri som Lucide/Tabler-ikonene.
function createMarkerIconImageData(paths: string[], strokeColor: string) {
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

  return context.getImageData(0, 0, size, size);
}

function createBeachIconImageData() {
  return createMarkerIconImageData(BEACH_ICON_PATHS, "#ea580c");
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

async function fetchWeather(latitude: number, longitude: number) {
  const response = await fetch(
    `/api/weather?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`,
  );

  if (!response.ok) {
    throw new Error("Weather service unavailable");
  }

  const payload = (await response.json()) as Partial<Omit<WeatherState, "status">>;
  const valueOrNull = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : null;

  return {
    status: "ready",
    windSpeed: valueOrNull(payload.windSpeed),
    windDirection: valueOrNull(payload.windDirection),
    waveHeight: valueOrNull(payload.waveHeight),
    waveDirection: valueOrNull(payload.waveDirection),
    currentSpeed: valueOrNull(payload.currentSpeed),
    currentDirection: valueOrNull(payload.currentDirection),
  } satisfies WeatherState;
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
          <p className="landing-eyebrow">Enklere navigering på sjøen</p>
          <h1>SeaNav</h1>
          <p className="landing-statement">Ikke enda en app.</p>
          <p className="landing-intro">
            Ingen innlogging. Ikke noe abonnement. Bare enkel navigering og
            sjøkart, klart når du trenger det.
          </p>
          <div className="landing-actions">
            <button className="landing-primary-cta" type="button" onClick={onStart}>
              Start gratis navigering
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
            <span>Gratis å bruke. Rett i nettleseren.</span>
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
          <p>Alt du trenger. Ingenting i veien.</p>
          <h2>Fra land til sjøkart på ett trykk.</h2>
        </div>

        <div className="landing-principle-grid">
          <article>
            <UserRoundX size={24} />
            <span>01</span>
            <h3>Ingen innlogging</h3>
            <p>Ingen konto å opprette og ingen personopplysninger å fylle ut.</p>
          </article>
          <article>
            <CircleDollarSign size={24} />
            <span>02</span>
            <h3>Ikke noe abonnement</h3>
            <p>SeaNav er helt gratis å bruke, uten prøveperiode eller binding.</p>
          </article>
          <article>
            <Compass size={24} />
            <span>03</span>
            <h3>Bare navigering</h3>
            <p>Sjøkart, posisjon, fart og kurs samlet i en ryddig visning.</p>
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
  const baseStyleLayerIdsRef = useRef<string[]>([]);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const lastFixRef = useRef<PositionFix | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const depthAbortRef = useRef<number | null>(null);
  const shallowAheadAbortRef = useRef<number | null>(null);
  const shorelineAbortRef = useRef<number | null>(null);
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
  const [beaches, setBeaches] = useState<BeachState>(DEFAULT_BEACH_STATE);
  const [harbors, setHarbors] = useState<HarborState>(DEFAULT_HARBOR_STATE);
  const [weather, setWeather] = useState<WeatherState>(DEFAULT_WEATHER_STATE);
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") return "no";
    return window.localStorage.getItem("seanav-language") === "en"
      ? "en"
      : "no";
  });
  const [tracking, setTracking] = useState(false);
  const [gpsRestarting, setGpsRestarting] = useState(false);
  const [followingLocation, setFollowingLocation] = useState(true);
  const [northUp, setNorthUp] = useState(false);
  const [mapBearing, setMapBearing] = useState(0);
  const [chartVisible, setChartVisible] = useState(true);
  const [harborsVisible, setHarborsVisible] = useState(false);
  const [beachDisplayMode, setBeachDisplayMode] =
    useState<BeachDisplayMode>("icons");
  const [baseMap, setBaseMap] = useState<BaseMap>("map");
  const [displayOpen, setDisplayOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [harborMapOpen, setHarborMapOpen] = useState<Harbor | null>(null);
  const [seaMarksOpen, setSeaMarksOpen] = useState(false);
  const [gpsHelpOpen, setGpsHelpOpen] = useState(false);
  const [gpsIssue, setGpsIssue] = useState<GpsIssue | null>(null);
  const [dismissedGpsIssueCode, setDismissedGpsIssueCode] =
    useState<GpsIssueCode | null>(null);
  const [showOwnship, setShowOwnship] = useState(true);
  const [showAccuracyRing, setShowAccuracyRing] = useState(true);
  const [showNotice, setShowNotice] = useState(true);
  const [alertSoundEnabled, setAlertSoundEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("seanav-alert-sound") !== "muted";
  });
  const [showPrecisePosition, setShowPrecisePosition] = useState(false);
  const [dismissedAlertKey, setDismissedAlertKey] = useState<string | null>(null);
  const [speedUnit, setSpeedUnit] = useState<SpeedUnit>(() => {
    if (typeof window === "undefined") return "kn";
    return window.localStorage.getItem("seanav-speed-unit") === "kmh"
      ? "kmh"
      : "kn";
  });
  const [depthUnit, setDepthUnit] = useState<DepthUnit>(() => {
    if (typeof window === "undefined") return "m";
    return window.localStorage.getItem("seanav-depth-unit") === "ft"
      ? "ft"
      : "m";
  });
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(() => {
    if (typeof window === "undefined") return "metric";
    return window.localStorage.getItem("seanav-distance-unit") === "nm"
      ? "nm"
      : "metric";
  });
  const [headingMode, setHeadingMode] = useState<HeadingMode>(() => {
    if (typeof window === "undefined") return "full";
    return window.localStorage.getItem("seanav-heading-mode") === "degrees"
      ? "degrees"
      : "full";
  });
  const text = UI_TEXT[language];
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
    document.documentElement.lang = language === "no" ? "nb" : "en";
    window.localStorage.setItem("seanav-language", language);
  }, [language]);

  useEffect(() => {
    window.localStorage.setItem("seanav-speed-unit", speedUnit);
  }, [speedUnit]);

  useEffect(() => {
    window.localStorage.setItem("seanav-depth-unit", depthUnit);
  }, [depthUnit]);

  useEffect(() => {
    window.localStorage.setItem("seanav-distance-unit", distanceUnit);
  }, [distanceUnit]);

  useEffect(() => {
    window.localStorage.setItem("seanav-heading-mode", headingMode);
  }, [headingMode]);

  useEffect(() => {
    window.localStorage.setItem(
      "seanav-alert-sound",
      alertSoundEnabled ? "enabled" : "muted",
    );
  }, [alertSoundEnabled]);

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
      const boat = markerRef.current
        ?.getElement()
        .querySelector<SVGElement>(".ownship-boat");
      if (boat && nextFix.heading !== null) {
        boat.style.transform = `rotate(${nextFix.heading}deg)`;
      }
      if (followingLocation) {
        map.easeTo({
          center: point,
          zoom: Math.max(map.getZoom(), 13),
          bearing: northUp ? 0 : (nextFix.heading ?? map.getBearing()),
          padding: getVisibleMapPadding(),
          duration: 700,
        });
      }

      const source = map.getSource("accuracy") as maplibregl.GeoJSONSource;
      if (source && nextFix.accuracy) {
        source.setData(
          createAccuracyCircle(
            nextFix.longitude,
            nextFix.latitude,
            Math.max(nextFix.accuracy, 8),
          ) as GeoJSON.GeoJSON,
        );
      }
    },
    [followingLocation, northUp],
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
  }, [refreshHarbors]);

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
    map.on("dragstart", () => setFollowingLocation(false));
    const syncMapBearing = () => setMapBearing(normalizeBearing(map.getBearing()));
    map.on("rotate", syncMapBearing);
    map.on("move", syncMapBearing);

    map.on("load", () => {
      baseStyleLayerIdsRef.current = (map.getStyle().layers ?? []).map(
        (layer) => layer.id,
      );
      const beachIcon = createBeachIconImageData();
      if (beachIcon && !map.hasImage("beach-icon")) {
        map.addImage("beach-icon", beachIcon, { pixelRatio: 2 });
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
        attribution: "Nautical chart: Kartverket",
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
          visibility: "none",
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
          visibility: "none",
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
          visibility: "none",
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
        paint: {
          "circle-color": "#ffffff",
          "circle-opacity": 0.94,
          "circle-radius": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            15,
            10,
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
          "icon-image": "beach-icon",
          "icon-size": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.85,
            0.6,
          ],
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
        layout: { visibility: "none" },
        paint: {
          "circle-color": "#ffffff",
          "circle-opacity": 0.96,
          "circle-radius": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            15,
            10,
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
          visibility: "none",
          "icon-image": "harbor-icon",
          "icon-size": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.85,
            0.6,
          ],
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

      const showBeachPopup = (event: maplibregl.MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature) return;

        const name = getBeachFeatureName(feature.properties);
        const popup = new maplibregl.Popup({
          closeButton: true,
          closeOnClick: true,
          offset: 16,
          className: "beach-popup",
        })
          .setLngLat(event.lngLat)
          .setHTML(
            `<div class="popup-card"><div class="popup-title">${BEACH_ICON_SVG}<strong>${escapePopupText(name)}</strong></div><span class="popup-type-badge">${escapePopupText(text.beachBadge)}</span></div>`,
          )
          .addTo(map);

        selectMarker(feature);
        popup.on("close", clearSelectedMarker);
      };
      const showPointer = () => {
        map.getCanvas().style.cursor = "pointer";
      };
      const hidePointer = () => {
        map.getCanvas().style.cursor = "";
      };

      beachPopupLayers.forEach((layerId) => {
        map.on("click", layerId, showBeachPopup);
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
    });

    const markerEl = document.createElement("div");
    markerEl.className = "ownship-marker";
    markerEl.innerHTML = OWNSHIP_MARKER_SVG;
    markerRef.current = new maplibregl.Marker({ element: markerEl })
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
      map.remove();
      mapRef.current = null;
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
  }, [chartVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("harbor-marker")) return;
    const visibility = harborsVisible ? "visible" : "none";
    map.setLayoutProperty("harbor-marker-halo", "visibility", visibility);
    map.setLayoutProperty("harbor-marker", "visibility", visibility);
  }, [harborsVisible]);

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
  }, [baseMap]);

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
  }, [beachAreasVisible, beachesVisible]);

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
  }, [showAccuracyRing]);

  useEffect(() => {
    if (!followingLocation || !fix) return;

    const handleViewportChange = () => {
      const map = mapRef.current;
      if (!map) return;
      map.easeTo({
        center: [fix.longitude, fix.latitude],
        padding: getVisibleMapPadding(),
        duration: 250,
      });
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("orientationchange", handleViewportChange);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("orientationchange", handleViewportChange);
    };
  }, [fix, followingLocation]);

  useEffect(() => {
    if (!fix) return;
    setPositionOnMap(fix);

    if (depthAbortRef.current) {
      window.clearTimeout(depthAbortRef.current);
    }

    setDepth((current) => ({
      ...current,
      status: "loading",
      message: text.updatingEstimate,
    }));

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
  }, [fix, language, setPositionOnMap, text.depthUnavailable, text.updatingEstimate]);

  useEffect(() => {
    if (!fix) return;

    if (shorelineAbortRef.current) {
      window.clearTimeout(shorelineAbortRef.current);
    }

    setShoreline((current) => ({
      ...current,
      status: "loading",
    }));

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
  }, [fix]);

  useEffect(() => {
    if (!fix || fix.heading === null) {
      setShallowAheadDepth(DEFAULT_DEPTH_STATE);
      return;
    }

    if (shallowAheadAbortRef.current) {
      window.clearTimeout(shallowAheadAbortRef.current);
    }

    const lookaheadMeters = getShallowLookaheadDistance(fix.speedKnots);
    const ahead = destinationPoint(
      fix.latitude,
      fix.longitude,
      fix.heading,
      lookaheadMeters,
    );

    setShallowAheadDepth((current) => ({
      ...current,
      status: "loading",
      message: text.updatingEstimate,
    }));

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
          setShallowAheadDepth({
            status: "error",
            value: null,
            message: text.depthUnavailable,
          });
        });
    }, 950);
  }, [fix, language, text.depthUnavailable, text.updatingEstimate]);

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
      setFollowingLocation(true);
      if (fix) {
        map.easeTo({
          center: [fix.longitude, fix.latitude],
          zoom: Math.max(map.getZoom(), 13),
          bearing: northUp ? 0 : (fix.heading ?? map.getBearing()),
          padding: getVisibleMapPadding(),
          duration: 600,
        });
      }
      return;
    }

    setNorthUp((value) => {
      const nextNorthUp = !value;
      map.easeTo({
        bearing: nextNorthUp ? 0 : (fix?.heading ?? map.getBearing()),
        padding: getVisibleMapPadding(),
        duration: 500,
      });
      return nextNorthUp;
    });
  };

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
    if (!showNotice) return null;

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

  const toggles = [
    {
      label: text.accuracyRing,
      checked: showAccuracyRing,
      onChange: setShowAccuracyRing,
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

  return (
    <main className={weatherOpen ? "app-shell weather-open" : "app-shell"}>
      <div ref={mapContainer} className="map" aria-label={text.navigationMap} />

      {showPrecisePosition && (
        <section className="coordinate-panel" aria-label={text.precisePosition}>
          <span>{text.precisePosition}</span>
          <strong>
            {formatPreciseCoordinate(fix?.latitude, "N", "S")}
          </strong>
          <strong>
            {formatPreciseCoordinate(fix?.longitude, "E", "W")}
          </strong>
        </section>
      )}

      <section className="topbar" aria-label={text.navigationStatus}>
        <div className="brand" aria-label="SeaNav">
          <img className="brand-logo" src={LOGO_IMAGE_URL} alt="" />
          <div>
            <strong>SeaNav</strong>
            <span>{text.brandSubtitle}</span>
          </div>
        </div>
      </section>

      {weatherOpen && (
        <section className="weather-card map-weather-card" aria-label={text.weatherHere}>
          <div className="weather-card-heading">
            <CloudSun size={18} />
            <strong>{text.weatherHere}</strong>
          </div>
          {!fix ? (
            <p className="weather-card-message">{text.weatherWaiting}</p>
          ) : weather.status === "error" ? (
            <p className="weather-card-message">{text.weatherUnavailable}</p>
          ) : (
            <div className="weather-card-metrics" aria-busy={weather.status === "loading"}>
              <div className="weather-card-metric">
                <Wind size={18} />
                <span>{text.wind}</span>
                <strong>{formatWeatherMeasure(weather.windSpeed, "m/s", weather.windDirection)}</strong>
              </div>
              <div className="weather-card-metric">
                <Waves size={18} />
                <span>{text.waves}</span>
                <strong>{formatWeatherMeasure(weather.waveHeight, "m", weather.waveDirection)}</strong>
              </div>
              <div className="weather-card-metric">
                <Waves size={18} />
                <span>{text.current}</span>
                <strong>{formatWeatherMeasure(weather.currentSpeed, "m/s", weather.currentDirection)}</strong>
              </div>
            </div>
          )}
        </section>
      )}

      {visibleGpsIssue && (
        <div className="gps-alert" role="alert">
          <ShieldAlert size={17} />
          <div>
            <strong>{text.gpsIssueTitle}</strong>
            <span>{visibleGpsIssue.message}</span>
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
            onClick={() => setDismissedGpsIssueCode(visibleGpsIssue.code)}
            title={text.dismissGpsIssue}
            aria-label={text.dismissGpsIssue}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {visibleMarineAlert && marineAlertKey && (
        <div
          className={`marine-alert ${visibleMarineAlert.kind} ${
            visibleGpsIssue ? "below-gps-alert" : ""
          }`}
          role="alert"
        >
          <ShieldAlert size={16} />
          <span>{visibleMarineAlert.message}</span>
          <button
            type="button"
            className="marine-alert-close"
            onClick={() => setDismissedAlertKey(marineAlertKey)}
            title={text.dismissAlert}
            aria-label={text.dismissAlert}
          >
            <X size={15} />
          </button>
        </div>
      )}

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
              <strong>{formatDepth(depth.value, depthUnit)}</strong>
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
              <strong>{formatDistance(shoreline.distanceMeters, distanceUnit)}</strong>
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
              followingLocation && northUp
                ? "location-mode-button active"
                : "location-mode-button"
            }
            onClick={recenterOrToggleNorth}
            title={
              followingLocation
                ? northUp
                  ? text.unlockNorth
                  : text.fixNorth
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
            <span>{followingLocation ? text.fixNorthLabel : text.myLocation}</span>
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

          {displayOpen && (
            <div className="panel-drawer display-drawer">
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

          {controlsOpen && (
            <div className="panel-drawer embedded-controls">
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
              <button
                type="button"
                className={weatherOpen ? "active" : ""}
                onClick={() => setWeatherOpen((value) => !value)}
                title={text.weatherHere}
              >
                <CloudSun size={20} />
                <span>{text.weather}</span>
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

      {harborMapOpen && (
        <section className="harbor-map-modal" role="dialog" aria-modal="true" aria-label={harborMapOpen.name}>
          <header>
            <div>
              <Anchor size={20} />
              <strong>{harborMapOpen.name}</strong>
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
            title={`${harborMapOpen.name} i Google Maps`}
            src={`https://www.google.com/maps?q=${encodeURIComponent(`${harborMapOpen.latitude},${harborMapOpen.longitude}`)}&z=15&output=embed`}
          />
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${harborMapOpen.latitude},${harborMapOpen.longitude}`)}`}
            target="_blank"
            rel="noreferrer"
          >
            {text.openGoogleMaps}
            <ExternalLink size={17} />
          </a>
        </section>
      )}

      {seaMarksOpen && (
        <section className="sea-marks-modal" role="dialog" aria-modal="true" aria-labelledby="sea-marks-title">
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

          <div className="sea-marks-grid">
            {text.seaMarksList.map((mark) => (
              <article className="sea-mark-card" key={mark.title}>
                <div className={`sea-mark-symbol ${mark.className}`} aria-hidden="true">
                  <span />
                </div>
                <div>
                  <strong>{mark.title}</strong>
                  <span>{mark.description}</span>
                  <p>{mark.detail}</p>
                </div>
              </article>
            ))}
          </div>

          <a
            className="sea-marks-source"
            href="https://www.kystverket.no/navigasjonstjenester/sjomerker-og-navigasjonsinstallasjoner/"
            target="_blank"
            rel="noreferrer"
          >
            {text.seaMarksSource}
          </a>
        </section>
      )}

      {gpsHelpOpen && (
        <section
          className="gps-help-modal"
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map } from "maplibre-gl";
import {
  Anchor,
  BookOpen,
  Crosshair,
  HeartHandshake,
  Layers,
  LocateFixed,
  Map as MapIcon,
  Satellite,
  ShieldAlert,
  SlidersHorizontal,
  X,
  Waves,
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

type Language = "no" | "en";
type SpeedUnit = "kn" | "kmh";
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
    heading: "Kurs",
    gpsAccuracy: "GPS-presisjon",
    retryGps: "Start eller prøv GPS-sporing på nytt",
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
    donate: "Doner med Vipps",
    donateUnavailable: "Vipps-lenke er ikke satt opp ennå.",
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
    dismissAlert: "Lukk varsel",
    showStandardMap: "Vis standard kart",
    showSatelliteImagery: "Vis satellittbilde",
    toggleNauticalChart: "Slå sjøkart av/på",
    toggleBeachAreas: "Vis/skjul registrerte badeplasser",
    togglePrecisePosition: "Vis/skjul presise koordinater",
    map: "Kart",
    satellite: "Satellitt",
    chart: "Sjøkart",
    beaches: "Bading",
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
    heading: "Heading",
    gpsAccuracy: "GPS Accuracy",
    retryGps: "Start or retry GPS tracking",
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
    donate: "Donate with Vipps",
    donateUnavailable: "Vipps donation link is not configured yet.",
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
    dismissAlert: "Dismiss alert",
    showStandardMap: "Show standard map",
    showSatelliteImagery: "Show satellite imagery",
    toggleNauticalChart: "Toggle nautical chart",
    toggleBeachAreas: "Show/hide registered bathing areas",
    togglePrecisePosition: "Show/hide precise coordinates",
    map: "Map",
    satellite: "Satellite",
    chart: "Chart",
    beaches: "Bathing",
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

function formatDepth(value: number | null) {
  if (value === null || Number.isNaN(value)) return "--";
  return `${Math.abs(value).toFixed(1)} m`;
}

function formatDistance(value: number | null) {
  if (value === null || Number.isNaN(value)) return "--";
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

  return Math.round(Math.min(5000, Math.max(1500, radiusMeters)));
}

function createBeachIconImageData() {
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

  context.strokeStyle = "#ea580c";
  context.lineWidth = 4.8;
  context.beginPath();
  context.arc(32, 29, 15, Math.PI * 1.04, Math.PI * 1.96);
  context.stroke();

  context.fillStyle = "#f97316";
  context.beginPath();
  context.moveTo(17, 29);
  context.quadraticCurveTo(22, 18, 32, 15);
  context.quadraticCurveTo(42, 18, 47, 29);
  context.lineTo(41, 27);
  context.lineTo(35, 30);
  context.lineTo(29, 27);
  context.lineTo(23, 30);
  context.closePath();
  context.fill();

  context.strokeStyle = "#9a3412";
  context.lineWidth = 3.2;
  context.beginPath();
  context.moveTo(32, 16);
  context.lineTo(28, 43);
  context.stroke();

  context.strokeStyle = "#ea580c";
  context.lineWidth = 3.2;
  context.beginPath();
  context.moveTo(18, 43);
  context.quadraticCurveTo(23, 38, 28, 43);
  context.quadraticCurveTo(33, 48, 38, 43);
  context.quadraticCurveTo(43, 38, 48, 43);
  context.stroke();

  return context.getImageData(0, 0, size, size);
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

function App() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const lastFixRef = useRef<PositionFix | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const depthAbortRef = useRef<number | null>(null);
  const shallowAheadAbortRef = useRef<number | null>(null);
  const shorelineAbortRef = useRef<number | null>(null);
  const beachPositionAbortRef = useRef<number | null>(null);
  const beachMapAbortRef = useRef<number | null>(null);
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
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") return "no";
    return window.localStorage.getItem("seanav-language") === "en"
      ? "en"
      : "no";
  });
  const [tracking, setTracking] = useState(false);
  const [followingLocation, setFollowingLocation] = useState(true);
  const [northUp, setNorthUp] = useState(false);
  const [mapBearing, setMapBearing] = useState(0);
  const [chartVisible, setChartVisible] = useState(true);
  const [beachesVisible, setBeachesVisible] = useState(true);
  const [baseMap, setBaseMap] = useState<"map" | "satellite">("map");
  const [displayOpen, setDisplayOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [seaMarksOpen, setSeaMarksOpen] = useState(false);
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
  const text = UI_TEXT[language];

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
    window.localStorage.setItem(
      "seanav-alert-sound",
      alertSoundEnabled ? "enabled" : "muted",
    );
  }, [alertSoundEnabled]);

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
      }, 450);
    },
    [beachesVisible],
  );

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
      const beachIcon = createBeachIconImageData();
      if (beachIcon && !map.hasImage("beach-icon")) {
        map.addImage("beach-icon", beachIcon, { pixelRatio: 2 });
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
      map.addSource("beaches", {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION,
      });
      map.addSource("beach-markers", {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION,
      });
      map.addLayer({
        id: "beach-marker-halo",
        type: "circle",
        source: "beach-markers",
        paint: {
          "circle-color": "#ffffff",
          "circle-opacity": 0.94,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            8,
            14,
            11,
          ],
          "circle-stroke-color": "rgba(31, 41, 55, 0.28)",
          "circle-stroke-width": 1,
        },
      });
      map.addLayer({
        id: "beach-marker",
        type: "symbol",
        source: "beach-markers",
        layout: {
          "icon-image": "beach-icon",
          "icon-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            0.5,
            14,
            0.68,
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
    if (!map || !map.getLayer("satellite")) return;
    map.setLayoutProperty(
      "satellite",
      "visibility",
      baseMap === "satellite" ? "visible" : "none",
    );
  }, [baseMap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("beach-marker")) return;
    const visibility = beachesVisible ? "visible" : "none";
    map.setLayoutProperty("beach-marker-halo", "visibility", visibility);
    map.setLayoutProperty("beach-marker", "visibility", visibility);
    map.setLayoutProperty("beach-label", "visibility", visibility);
  }, [beachesVisible]);

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

  const startTracking = useCallback(async (requestCompass = true) => {
    if (!window.isSecureContext) {
      setTracking(false);
      return;
    }

    if (!("geolocation" in navigator)) {
      setTracking(false);
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
      },
      (error) => {
        setTracking(false);
        console.warn(error.message || "Location permission denied");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000,
      },
    );
  }, [canAskOrientation]);

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
        value:
          fix?.heading !== null && fix?.heading !== undefined
            ? `${Math.round(fix.heading).toString().padStart(3, "0")}° ${compassPoint(fix.heading)}`
            : "--",
      },
    ],
    [fix, speedUnit, text.heading, text.latitude, text.longitude, text.speed],
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
  const vippsDonationUrl =
    typeof import.meta.env.VITE_VIPPS_DONATION_URL === "string"
      ? import.meta.env.VITE_VIPPS_DONATION_URL
      : "";

  const donateWithVipps = () => {
    if (!vippsDonationUrl) {
      window.alert(text.donateUnavailable);
      return;
    }

    window.location.href = vippsDonationUrl;
  };

  return (
    <main className="app-shell">
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
        <div className="brand">
          <Anchor size={22} strokeWidth={2.4} />
          <div>
            <strong>SeaNav</strong>
            <span>{text.brandSubtitle}</span>
          </div>
        </div>
      </section>

      {visibleMarineAlert && marineAlertKey && (
        <div className={`marine-alert ${visibleMarineAlert.kind}`} role="alert">
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
          <div className="primary-depth">
            <div>
              <span>{text.mapDepth}</span>
              <strong>{formatDepth(depth.value)}</strong>
            </div>
            <div>
              <span>{text.distanceToLand}</span>
              <strong>{formatDistance(shoreline.distanceMeters)}</strong>
            </div>
            <Waves size={28} />
          </div>
          <p className={depth.status === "error" ? "warning" : ""}>
            {depth.message}
          </p>

          <div className="readout-grid">
            {readouts.slice(0, 2).map((item) => (
              <div className="readout" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
            <div className="readout motion-readout">
              <button
                type="button"
                className="speed-toggle"
                onClick={() =>
                  setSpeedUnit((current) => (current === "kn" ? "kmh" : "kn"))
                }
                title={text.toggleSpeedUnit}
                aria-label={text.toggleSpeedUnit}
              >
                <span>{text.speed}</span>
                <strong>{readouts[2].value}</strong>
              </button>
              <div>
                <span>{text.heading}</span>
                <strong>{readouts[3].value}</strong>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="accuracy"
            onClick={() => startTracking()}
            title={text.retryGps}
          >
            <div className="accuracy-target">
              <Crosshair size={18} />
              <span className={tracking ? "status-dot active" : "status-dot"} />
            </div>
            <strong className="accuracy-value">
              {fix?.accuracy ? `${Math.round(fix.accuracy)} m` : "--"}
            </strong>
            <div className="accuracy-label">{text.gpsAccuracy}</div>
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
                  onClick={donateWithVipps}
                  title={text.donate}
                >
                  <HeartHandshake size={18} />
                  <span>{text.donate}</span>
                </button>
              </div>
            </div>
          )}

          {controlsOpen && (
            <div className="panel-drawer embedded-controls">
              <button
                type="button"
                className={baseMap === "map" ? "active" : ""}
                onClick={() => setBaseMap("map")}
                title={text.showStandardMap}
              >
                <MapIcon size={20} />
                <span>{text.map}</span>
              </button>
              <button
                type="button"
                className={baseMap === "satellite" ? "active" : ""}
                onClick={() => setBaseMap("satellite")}
                title={text.showSatelliteImagery}
              >
                <Satellite size={20} />
                <span>{text.satellite}</span>
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
                onClick={() => setBeachesVisible((value) => !value)}
                title={text.toggleBeachAreas}
              >
                <Waves size={20} />
                <span>{text.beaches}</span>
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
    </main>
  );
}

export default App;

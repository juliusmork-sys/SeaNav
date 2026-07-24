import {
  ensureSchema,
  isDbConfigured,
  pruneStaleHarbors,
  selectHarborsInBbox,
  upsertHarbors,
  type BoundingBox,
  type HarborRow,
} from "./_lib/db.js";

type ApiRequest = {
  query: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  status: (statusCode: number) => ApiResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

type OverpassResponse = { elements?: OverpassElement[] };

// Flere speil: overpass-api.de returnerer jevnlig 504/429 på travle tider.
// Prøv speilene i rekkefølge slik at ett tregt speil ikke gir tomt resultat.
// Overpass brukes bare av ingest-cron; request-path leser kun DB.
// Rekkefølge = prioritet. kumi.systems er mest stabil under last i praksis;
// overpass-api.de 504'er ofte på tunge tiles, så den er ikke lenger først.
const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const DEFAULT_RADIUS_METERS = 2000;
const MAX_RADIUS_METERS = 10000;

function parseNumber(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function bboxForRadius(latitude: number, longitude: number, radiusMeters: number) {
  const latDelta = radiusMeters / 111320;
  const lonDelta =
    radiusMeters /
    (111320 * Math.max(Math.cos((latitude * Math.PI) / 180), 0.01));
  return {
    south: latitude - latDelta,
    west: longitude - lonDelta,
    north: latitude + latDelta,
    east: longitude + lonDelta,
  };
}

// OpenSeaMap koder fasiliteter i en ;-separert liste, f.eks.
// seamark:small_craft_facility:category="electricity;water_tap;toilets;showers".
const SEAMARK_AMENITY_MAP: Record<string, string> = {
  electricity: "power",
  water_tap: "water",
  toilets: "toilets",
  showers: "shower",
  "pump-out": "sewage",
  fuel_station: "fuel",
};

function getAmenities(tags: Record<string, string>) {
  const values = new Set<string>();
  if (tags.electricity === "yes") values.add("power");
  if (tags.water === "yes" || tags["drinking_water"] === "yes") values.add("water");
  if (tags.toilets === "yes") values.add("toilets");
  if (tags.shower === "yes") values.add("shower");
  if (tags.sewage === "yes" || tags["sewage:disposal"] === "yes") {
    values.add("sewage");
  }
  if (tags.fuel === "yes" || tags["fuel:diesel"] === "yes") values.add("fuel");

  const seamarkCategory =
    tags["seamark:small_craft_facility:category"] ??
    tags["seamark:harbour:category"];
  if (seamarkCategory) {
    for (const raw of seamarkCategory.split(";")) {
      const mapped = SEAMARK_AMENITY_MAP[raw.trim()];
      if (mapped) values.add(mapped);
    }
  }
  return [...values];
}

function normalizeHarborType(tags: Record<string, string>) {
  if (tags.leisure === "marina") return "marina";
  // OpenSeaMap: seamark:harbour:category=marina/marina_no_facilities, og
  // seamark:type=small_craft_facility er begge marina-lignende småbåthavner.
  const seamarkHarbour = tags["seamark:harbour:category"];
  if (seamarkHarbour && seamarkHarbour.includes("marina")) return "marina";
  if (tags["seamark:type"] === "small_craft_facility") return "marina";
  const harbour = tags.harbour;
  // OSM bruker ofte harbour=yes; behandle som generisk havn.
  if (harbour && harbour !== "no") return "harbour";
  if (tags["seamark:type"] === "harbour") return "harbour";
  return null;
}

function normalizeWebsite(tags: Record<string, string>) {
  const value = tags.website ?? tags["contact:website"] ?? null;
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

// Hent rått Overpass-svar fra ett speil, med egen timeout.
async function fetchOverpassPayload(
  endpoint: string,
  query: string,
  timeoutMs: number,
): Promise<OverpassResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent": "SeaNav/1.0 (https://www.seanav.no)",
      },
      body: new URLSearchParams({ data: query }),
      signal: controller.signal,
    });
    if (!upstream.ok) throw new Error(`Overpass returned ${upstream.status}`);
    return (await upstream.json()) as OverpassResponse;
  } finally {
    clearTimeout(timer);
  }
}

// Kjør en vilkårlig Overpass-spørring og parse elementene til rader.
// Prøver speilene i rekkefølge til ett svarer; ett 504/429-speil gir dermed
// ikke lenger tomt resultat. dedupeSeen kan sendes inn utenfra for å dedupe på
// tvers av flere kall (grid-splitting).
async function runOverpass(
  query: string,
  timeoutMs: number,
  dedupeSeen?: Set<string>,
  maxEndpoints = OVERPASS_ENDPOINTS.length,
): Promise<HarborRow[]> {
  let payload: OverpassResponse | null = null;
  let lastError: unknown = null;
  // maxEndpoints lar kalleren begrense antall speil per spørring. Ingest kjører
  // 48 tiles under maxDuration=300s og setter den lavt, ellers ganger retries
  // opp tida langt forbi budsjettet.
  for (const endpoint of OVERPASS_ENDPOINTS.slice(0, maxEndpoints)) {
    try {
      payload = await fetchOverpassPayload(endpoint, query, timeoutMs);
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!payload) {
    throw lastError instanceof Error
      ? lastError
      : new Error("All Overpass mirrors failed");
  }

  const seen = dedupeSeen ?? new Set<string>();
  const rows: HarborRow[] = [];
  for (const element of payload.elements ?? []) {
    const tags = element.tags ?? {};
    const point = element.center ?? element;
    if (
      typeof point.lat !== "number" ||
      typeof point.lon !== "number" ||
      !tags.name
    ) {
      continue;
    }

    const dedupeKey = `${tags.name.toLocaleLowerCase("nb-NO")}:${point.lat.toFixed(4)}:${point.lon.toFixed(4)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    rows.push({
      id: `${element.type}/${element.id}`,
      name: tags.name,
      lat: point.lat,
      lon: point.lon,
      type: normalizeHarborType(tags),
      website: normalizeWebsite(tags),
      phone: tags.phone ?? tags["contact:phone"] ?? null,
      openingHours: tags.opening_hours ?? null,
      capacity: tags.capacity ?? null,
      amenities: getAmenities(tags),
    });
  }
  return rows;
}

// Norge dekker ca lat 57.8-71.5, lon 4-31.5. Hele landet i én Overpass-spørring
// gir 504 fra overpass-api.de (for tung server-side) selv med lang timeout.
// Del i et grid av mindre bbox-spørringer i stedet, kjørt sekvensielt.
const NORWAY_BOUNDS = { south: 57.8, west: 4.0, north: 71.6, east: 31.5 };
// Grovt grid (5x3) ga enorme tiles: de tette sørlige/vestlige tilene (Oslofjord,
// Skagerrak, vestlandsfjordene) returnerte for mye og fikk 504, så nettopp
// Norges mest brukte båtområder manglet i cachen. Finere grid => hver tile er
// liten nok til å svare. Tomme hav-/innlandsruter returnerer uansett raskt.
const GRID_LAT_STEPS = 8;
const GRID_LON_STEPS = 6;

function norwayGridTiles(): BoundingBox[] {
  const tiles: BoundingBox[] = [];
  const latStep = (NORWAY_BOUNDS.north - NORWAY_BOUNDS.south) / GRID_LAT_STEPS;
  const lonStep = (NORWAY_BOUNDS.east - NORWAY_BOUNDS.west) / GRID_LON_STEPS;
  for (let latIndex = 0; latIndex < GRID_LAT_STEPS; latIndex += 1) {
    for (let lonIndex = 0; lonIndex < GRID_LON_STEPS; lonIndex += 1) {
      tiles.push({
        south: NORWAY_BOUNDS.south + latIndex * latStep,
        north: NORWAY_BOUNDS.south + (latIndex + 1) * latStep,
        west: NORWAY_BOUNDS.west + lonIndex * lonStep,
        east: NORWAY_BOUNDS.west + (lonIndex + 1) * lonStep,
      });
    }
  }
  return tiles;
}

// Full ingest: alle havner i Norge, gitt som grid av bbox-kall (brukes av cron via /api/ingest).
// Kjøres i batcher parallelt (ikke sekvensielt) siden /api/ingest deler 300s
// maxDuration med beach-ingest.
// Høyere samtidighet (6) => færre sekvensielle batcher, og siden hver tile nå
// også henter seamark small_craft_facility (tyngre), er dette nødvendig for å
// holde oss under budsjettet. 48 tiles / 6 = 8 batcher; tomme hav-/innlands-
// tiles svarer raskt.
const TILE_BATCH_SIZE = 6;
const TILE_TIMEOUT_MS = 25000;
// 2 speil per tile: nok fallback til å redde en 504 fra første speil uten at
// retries sprenger budsjettet. Tidsgrensa under (HARBOR_INGEST_BUDGET_MS) er
// den egentlige beskyttelsen mot 300s-timeout, ikke lavt speil-tall — å pinne
// til 1 speil ga i praksis 0 havner når toppspeilet 504'et.
const INGEST_MAX_ENDPOINTS = 2;
// Hard tidsgrense for havne-delen slik at funksjonen aldri når Vercels 300s.
// Ved overskridelse upsertes det vi har rukket; resten tas neste kjøring.
const HARBOR_INGEST_BUDGET_MS = 220000;

export async function fetchAllNorwayHarbors(): Promise<{
  rows: HarborRow[];
  complete: boolean;
}> {
  const startedAt = Date.now();
  const seen = new Set<string>();
  const rows: HarborRow[] = [];
  const tiles = norwayGridTiles();
  let complete = true;

  for (let index = 0; index < tiles.length; index += TILE_BATCH_SIZE) {
    if (Date.now() - startedAt > HARBOR_INGEST_BUDGET_MS) {
      console.warn(
        `Harbor ingest budget reached after ${index}/${tiles.length} tiles; upserting partial result.`,
      );
      complete = false;
      break;
    }
    const batch = tiles.slice(index, index + TILE_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((tile) => {
        const box = `${tile.south},${tile.west},${tile.north},${tile.east}`;
        // Begrens til norske havner via area-filter: grid-bboxen er rektangulær
        // og drar ellers inn svenske/finske/russiske havner langs grensa. Norge
        // ≈ sjøkart-dekningen vår. (area.no)(bbox) krever at begge matcher.
        const query = `[out:json][timeout:25];area["ISO3166-1"="NO"][admin_level=2]->.no;(nwr["leisure"="marina"](area.no)(${box});nwr["harbour"](area.no)(${box});nwr["seamark:type"="harbour"](area.no)(${box});nwr["seamark:type"="small_craft_facility"](area.no)(${box}););out center tags;`;
        return runOverpass(query, TILE_TIMEOUT_MS, seen, INGEST_MAX_ENDPOINTS);
      }),
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        rows.push(...result.value);
      } else {
        // Én mislykket tile skal ikke stoppe resten av landet.
        console.error(
          `Overpass tile failed: ${result.reason instanceof Error ? result.reason.message : "unknown"}`,
        );
      }
    }
  }
  return { rows, complete };
}

export async function ingestHarbors(): Promise<number> {
  await ensureSchema();
  const { rows, complete } = await fetchAllNorwayHarbors();
  const upserted = await upsertHarbors(rows);
  // Bare prune når kjøringen var komplett (alle tiles) og faktisk hentet noe —
  // ellers kan en delvis/budsjett-avbrutt kjøring slette gyldige havner fra
  // tiles vi hoppet over. Pruning fjerner uansett bare rader eldre enn 14 dager.
  if (complete && rows.length > 0) {
    const pruned = await pruneStaleHarbors();
    if (pruned > 0) console.log(`Pruned ${pruned} stale harbors`);
  }
  return upserted;
}

function harborsToFeatureCollection(rows: HarborRow[]) {
  return {
    type: "FeatureCollection" as const,
    features: rows.map((row) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [row.lon, row.lat] as [number, number],
      },
      properties: {
        id: row.id,
        name: row.name,
        latitude: row.lat,
        longitude: row.lon,
        type: row.type,
        website: row.website,
        phone: row.phone,
        openingHours: row.openingHours,
        capacity: row.capacity,
        amenities: row.amenities,
      },
    })),
  };
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");

  const latitude = parseNumber(request.query.lat);
  const longitude = parseNumber(request.query.lon);
  const requestedRadius = parseNumber(request.query.radius);
  if (
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    response.status(400).json({ error: "Expected numeric lat and lon query parameters." });
    return;
  }

  const radiusMeters = Math.round(
    Math.min(MAX_RADIUS_METERS, Math.max(800, requestedRadius ?? DEFAULT_RADIUS_METERS)),
  );
  const bounds = bboxForRadius(latitude, longitude, radiusMeters);

  // Kun egen DB i request-path: ingen live-fallback mot Overpass ved
  // brukerinteraksjon. Overpass brukes bare av ingest-cron (fetchAllNorwayHarbors).
  // Tomt bbox-svar er et gyldig "ingen havner her", ikke en feil.
  if (!isDbConfigured) {
    response.status(503).json({ error: "Harbor database not configured." });
    return;
  }

  try {
    const rows = await selectHarborsInBbox(bounds);
    response.status(200).json({
      featureCollection: harborsToFeatureCollection(rows),
      source: "SeaNav cache (OpenStreetMap contributors)",
    });
  } catch (error) {
    console.error("Harbor DB query failed:", error);
    response.status(502).json({ error: "Harbor service unavailable." });
  }
}

import {
  ensureSchema,
  isDbConfigured,
  selectHarborsInBbox,
  upsertHarbors,
  type BoundingBox,
  type HarborRow,
} from "./_lib/db";

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

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
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

function getAmenities(tags: Record<string, string>) {
  const values: string[] = [];
  if (tags.electricity === "yes") values.push("power");
  if (tags.water === "yes" || tags["drinking_water"] === "yes") values.push("water");
  if (tags.toilets === "yes") values.push("toilets");
  if (tags.shower === "yes") values.push("shower");
  if (tags.sewage === "yes" || tags["sewage:disposal"] === "yes") {
    values.push("sewage");
  }
  if (tags.fuel === "yes" || tags["fuel:diesel"] === "yes") values.push("fuel");
  return values;
}

function normalizeHarborType(tags: Record<string, string>) {
  if (tags.leisure === "marina") return "marina";
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

// Kjør en vilkårlig Overpass-spørring og parse elementene til rader.
async function runOverpass(query: string, timeoutMs: number): Promise<HarborRow[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const upstream = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent": "SeaNav/1.0 (https://www.seanav.no)",
      },
      body: new URLSearchParams({ data: query }),
      signal: controller.signal,
    });
    if (!upstream.ok) throw new Error(`Overpass returned ${upstream.status}`);

    const payload = (await upstream.json()) as { elements?: OverpassElement[] };
    const seen = new Set<string>();
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
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLiveHarbors(bounds: BoundingBox): Promise<HarborRow[]> {
  const box = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  const query = `[out:json][timeout:15];(nwr["leisure"="marina"](${box});nwr["harbour"](${box});nwr["seamark:type"="harbour"](${box}););out center tags;`;
  return runOverpass(query, 16000);
}

// Full ingest: alle havner i Norge (brukes av cron via /api/ingest).
export async function fetchAllNorwayHarbors(): Promise<HarborRow[]> {
  const query = `[out:json][timeout:180];area["ISO3166-1"="NO"][admin_level=2]->.no;(nwr["leisure"="marina"](area.no);nwr["harbour"](area.no);nwr["seamark:type"="harbour"](area.no););out center tags;`;
  return runOverpass(query, 200000);
}

export async function ingestHarbors(): Promise<number> {
  await ensureSchema();
  const rows = await fetchAllNorwayHarbors();
  return upsertHarbors(rows);
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

  try {
    let rows: HarborRow[] = [];
    let source = "OpenStreetMap contributors";

    // Egen DB først; tom (område uten havner eller før første ingest) => live.
    if (isDbConfigured) {
      try {
        rows = await selectHarborsInBbox(bounds);
        source = "SeaNav cache (OpenStreetMap contributors)";
      } catch {
        rows = [];
      }
    }
    if (rows.length === 0) {
      rows = await fetchLiveHarbors(bounds);
      source = "OpenStreetMap contributors";
    }

    response.status(200).json({
      featureCollection: harborsToFeatureCollection(rows),
      source,
    });
  } catch {
    response.status(502).json({ error: "Harbor service unavailable." });
  }
}

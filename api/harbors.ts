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
  const bbox = bboxForRadius(latitude, longitude, radiusMeters);
  const bounds = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const query = `[out:json][timeout:15];(nwr["leisure"="marina"](${bounds});nwr["harbour"](${bounds});nwr["seamark:type"="harbour"](${bounds}););out center tags;`;

  try {
    const upstream = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent": "SeaNav/1.0 (https://www.seanav.no)",
      },
      body: new URLSearchParams({ data: query }),
    });
    if (!upstream.ok) throw new Error(`Overpass returned ${upstream.status}`);

    const payload = (await upstream.json()) as { elements?: OverpassElement[] };
    const seen = new Set<string>();
    const features = (payload.elements ?? []).flatMap((element) => {
      const tags = element.tags ?? {};
      const point = element.center ?? element;
      if (
        typeof point.lat !== "number" ||
        typeof point.lon !== "number" ||
        !tags.name
      ) {
        return [];
      }

      const dedupeKey = `${tags.name.toLocaleLowerCase("nb-NO")}:${point.lat.toFixed(4)}:${point.lon.toFixed(4)}`;
      if (seen.has(dedupeKey)) return [];
      seen.add(dedupeKey);

      return [{
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [point.lon, point.lat] as [number, number] },
        properties: {
          id: `${element.type}/${element.id}`,
          name: tags.name,
          latitude: point.lat,
          longitude: point.lon,
          type: normalizeHarborType(tags),
          website: normalizeWebsite(tags),
          phone: tags.phone ?? tags["contact:phone"] ?? null,
          openingHours: tags.opening_hours ?? null,
          capacity: tags.capacity ?? null,
          amenities: getAmenities(tags),
        },
      }];
    });

    response.status(200).json({
      featureCollection: { type: "FeatureCollection", features },
      source: "OpenStreetMap contributors",
    });
  } catch {
    response.status(502).json({ error: "Harbor service unavailable." });
  }
}

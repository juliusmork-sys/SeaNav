import {
  ensureSchema,
  isDbConfigured,
  selectBeachesInBbox,
  upsertBeaches,
  type BeachRow,
} from "./_lib/db.js";

type ApiRequest = {
  query: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  status: (statusCode: number) => ApiResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};

type Geometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

type BeachFeature = {
  type: "Feature";
  id?: string | number;
  geometry: Geometry | null;
  properties?: Record<string, unknown>;
};

type BeachFeatureCollection = {
  type: "FeatureCollection";
  features: BeachFeature[];
};

type BeachMarkerFeature = {
  type: "Feature";
  id?: string | number;
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    id: string | number | null;
    name: string;
    municipality: string | null;
    waterQuality: string | null;
  };
};

type BeachMarkerFeatureCollection = {
  type: "FeatureCollection";
  features: BeachMarkerFeature[];
};

type NearestBeach = {
  id: string | number | null;
  name: string;
  municipality: string | null;
  waterQuality: string | null;
  monitored: string | null;
  distanceMeters: number;
};

const BEACH_ENDPOINT =
  "https://testarcgis02.miljodirektoratet.no/arcgis/rest/services/Badeplasser/Badeplasser_status/MapServer/1/query";
const DEFAULT_RADIUS_METERS = 2000;
const MAX_RADIUS_METERS = 10000;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

function parseNumber(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function bboxForRadius(latitude: number, longitude: number, radiusMeters: number) {
  const latDelta = radiusMeters / 111320;
  const lonDelta =
    radiusMeters / (111320 * Math.max(Math.cos(toRadians(latitude)), 0.01));
  return {
    south: latitude - latDelta,
    west: longitude - lonDelta,
    north: latitude + latDelta,
    east: longitude + lonDelta,
  };
}

function pointToLocalMeters(
  longitude: number,
  latitude: number,
  originLongitude: number,
  originLatitude: number,
) {
  const metersPerDegreeLatitude = 111320;
  const metersPerDegreeLongitude =
    111320 * Math.cos(toRadians(originLatitude));

  return {
    x: (longitude - originLongitude) * metersPerDegreeLongitude,
    y: (latitude - originLatitude) * metersPerDegreeLatitude,
  };
}

function localMetersToPoint(
  point: { x: number; y: number },
  originLongitude: number,
  originLatitude: number,
) {
  return {
    longitude:
      originLongitude +
      point.x /
        (111320 * Math.max(Math.cos(toRadians(originLatitude)), 0.01)),
    latitude: originLatitude + point.y / 111320,
  };
}

function distanceToSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
  );
  const projection = {
    x: start.x + t * dx,
    y: start.y + t * dy,
  };

  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function nearestPointOnSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return start;
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
  );

  return {
    x: start.x + t * dx,
    y: start.y + t * dy,
  };
}

function pointInRing(point: { x: number; y: number }, ring: { x: number; y: number }[]) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const current = ring[i];
    const previous = ring[j];
    const intersects =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y) +
          current.x;

    if (intersects) inside = !inside;
  }

  return inside;
}

function distanceToPolygon(
  coordinates: number[][][],
  latitude: number,
  longitude: number,
) {
  const point = { x: 0, y: 0 };
  const rings = coordinates.map((ring) =>
    ring.map(([ringLongitude, ringLatitude]) =>
      pointToLocalMeters(ringLongitude, ringLatitude, longitude, latitude),
    ),
  );

  const outerRing = rings[0];
  if (outerRing && pointInRing(point, outerRing)) {
    const insideHole = rings.slice(1).some((ring) => pointInRing(point, ring));
    if (!insideHole) return 0;
  }

  let nearest = Number.POSITIVE_INFINITY;
  for (const ring of rings) {
    for (let index = 1; index < ring.length; index += 1) {
      nearest = Math.min(
        nearest,
        distanceToSegment(point, ring[index - 1], ring[index]),
      );
    }
  }

  return nearest;
}

function distanceToGeometry(
  geometry: Geometry | null,
  latitude: number,
  longitude: number,
) {
  if (!geometry) return Number.POSITIVE_INFINITY;

  if (geometry.type === "Polygon") {
    return distanceToPolygon(geometry.coordinates, latitude, longitude);
  }

  return Math.min(
    ...geometry.coordinates.map((polygon) =>
      distanceToPolygon(polygon, latitude, longitude),
    ),
  );
}

function polygonCenter(coordinates: number[][][]) {
  const outerRing = coordinates[0] ?? [];
  const usableRing = outerRing.length > 1 ? outerRing.slice(0, -1) : outerRing;
  if (usableRing.length === 0) return null;

  const totals = usableRing.reduce(
    (accumulator, [longitude, latitude]) => ({
      longitude: accumulator.longitude + longitude,
      latitude: accumulator.latitude + latitude,
    }),
    { longitude: 0, latitude: 0 },
  );

  return [
    totals.longitude / usableRing.length,
    totals.latitude / usableRing.length,
  ] satisfies [number, number];
}

function nearestPointOnPolygon(
  coordinates: number[][][],
  latitude: number,
  longitude: number,
) {
  const center = polygonCenter(coordinates);
  const point = { x: 0, y: 0 };
  const rings = coordinates.map((ring) =>
    ring.map(([ringLongitude, ringLatitude]) =>
      pointToLocalMeters(ringLongitude, ringLatitude, longitude, latitude),
    ),
  );

  const outerRing = rings[0];
  if (outerRing && pointInRing(point, outerRing)) {
    const insideHole = rings.slice(1).some((ring) => pointInRing(point, ring));
    if (!insideHole) return center;
  }

  let nearest: { x: number; y: number } | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const ring of rings) {
    for (let index = 1; index < ring.length; index += 1) {
      const candidate = nearestPointOnSegment(point, ring[index - 1], ring[index]);
      const distance = Math.hypot(candidate.x, candidate.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = candidate;
      }
    }
  }

  if (!nearest) return center;
  const nearestPoint = localMetersToPoint(nearest, longitude, latitude);
  return [nearestPoint.longitude, nearestPoint.latitude] satisfies [number, number];
}

function geometryCenter(geometry: Geometry | null) {
  if (!geometry) return null;

  if (geometry.type === "Polygon") {
    return polygonCenter(geometry.coordinates);
  }

  const polygonCenters = geometry.coordinates
    .map((polygon) => polygonCenter(polygon))
    .filter((point): point is [number, number] => point !== null);
  if (polygonCenters.length === 0) return null;

  const totals = polygonCenters.reduce(
    (accumulator, [longitude, latitude]) => ({
      longitude: accumulator.longitude + longitude,
      latitude: accumulator.latitude + latitude,
    }),
    { longitude: 0, latitude: 0 },
  );

  return [
    totals.longitude / polygonCenters.length,
    totals.latitude / polygonCenters.length,
  ] satisfies [number, number];
}

function geometryMarkerPoint(
  geometry: Geometry | null,
  latitude: number,
  longitude: number,
) {
  if (!geometry) return null;

  if (geometry.type === "Polygon") {
    return nearestPointOnPolygon(geometry.coordinates, latitude, longitude);
  }

  const points = geometry.coordinates
    .map((polygon) => nearestPointOnPolygon(polygon, latitude, longitude))
    .filter((point): point is [number, number] => point !== null)
    .sort(
      (a, b) =>
        Math.hypot(a[0] - longitude, a[1] - latitude) -
        Math.hypot(b[0] - longitude, b[1] - latitude),
    );

  return points[0] ?? geometryCenter(geometry);
}

function buildBeachUrl(latitude: number, longitude: number, radiusMeters: number) {
  const bbox = bboxForRadius(latitude, longitude, radiusMeters);
  const params = new URLSearchParams({
    f: "geojson",
    where: "1=1",
    outFields:
      "OBJECTID,Navn,Tilstand,Tilstandkommentar,Overvaking_badevannskvalitet,Kommunenavn,Kommunenr,Fylke",
    returnGeometry: "true",
    geometry: `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    resultRecordCount: "200",
  });

  return `${BEACH_ENDPOINT}?${params.toString()}`;
}

function getString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

const BEACH_OUT_FIELDS =
  "OBJECTID,Navn,Tilstand,Tilstandkommentar,Overvaking_badevannskvalitet,Kommunenavn,Kommunenr,Fylke";

// Konverter ArcGIS-feature til en DB-rad (sentroide for bbox-filter,
// full geometri lagres som jsonb).
function beachFeatureToRow(feature: BeachFeature): BeachRow | null {
  const center = geometryCenter(feature.geometry);
  if (!center || !feature.geometry) return null;

  const properties = feature.properties ?? {};
  const id = feature.id ?? getString(properties.OBJECTID);
  if (id === undefined || id === null) return null;

  return {
    id: String(id),
    name: getString(properties.Navn) ?? "Badeplass",
    lat: center[1],
    lon: center[0],
    municipality: getString(properties.Kommunenavn),
    waterQuality: getString(properties.Tilstand),
    monitored: getString(properties.Overvaking_badevannskvalitet),
    geometry: feature.geometry,
  };
}

// Rekonstruer ArcGIS-lignende feature fra DB-rad, slik at findNearestBeach og
// createBeachMarkers virker uendret.
function rowToBeachFeature(row: BeachRow): BeachFeature {
  return {
    type: "Feature",
    id: row.id,
    geometry: row.geometry as Geometry,
    properties: {
      OBJECTID: row.id,
      Navn: row.name,
      Kommunenavn: row.municipality,
      Tilstand: row.waterQuality,
      Overvaking_badevannskvalitet: row.monitored,
    },
  };
}

// Full ingest: alle registrerte badeplasser (paginert), brukt av cron.
async function fetchAllBeaches(): Promise<BeachFeature[]> {
  const pageSize = 1000;
  const all: BeachFeature[] = [];
  for (let offset = 0; offset <= 40000; offset += pageSize) {
    const params = new URLSearchParams({
      f: "geojson",
      where: "1=1",
      outFields: BEACH_OUT_FIELDS,
      returnGeometry: "true",
      outSR: "4326",
      resultRecordCount: String(pageSize),
      resultOffset: String(offset),
    });
    const response = await fetch(`${BEACH_ENDPOINT}?${params.toString()}`, {
      headers: { accept: "application/geo+json, application/json" },
    });
    if (!response.ok) throw new Error(`ArcGIS returned ${response.status}`);
    const collection = (await response.json()) as BeachFeatureCollection;
    const features = Array.isArray(collection.features)
      ? collection.features
      : [];
    all.push(...features);
    if (features.length < pageSize) break;
  }
  return all;
}

export async function ingestBeaches(): Promise<number> {
  await ensureSchema();
  const features = await fetchAllBeaches();
  const rows = features
    .map(beachFeatureToRow)
    .filter((row): row is BeachRow => row !== null);
  return upsertBeaches(rows);
}

function findNearestBeach(
  collection: BeachFeatureCollection,
  latitude: number,
  longitude: number,
  radiusMeters: number,
): NearestBeach | null {
  const nearest = collection.features
    .map((feature) => {
      const distanceMeters = distanceToGeometry(feature.geometry, latitude, longitude);
      return { feature, distanceMeters };
    })
    .filter((item) => Number.isFinite(item.distanceMeters))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)[0];

  if (!nearest || nearest.distanceMeters > radiusMeters) return null;

  const properties = nearest.feature.properties ?? {};
  return {
    id: nearest.feature.id ?? getString(properties.OBJECTID) ?? null,
    name: getString(properties.Navn) ?? "Registrert badeplass",
    municipality: getString(properties.Kommunenavn),
    waterQuality: getString(properties.Tilstand),
    monitored: getString(properties.Overvaking_badevannskvalitet),
    distanceMeters: Math.round(nearest.distanceMeters),
  };
}

function createBeachMarkers(
  collection: BeachFeatureCollection,
): BeachMarkerFeatureCollection {
  return {
    type: "FeatureCollection",
    features: collection.features.flatMap((feature) => {
      const center = geometryCenter(feature.geometry);
      if (!center) return [];

      const properties = feature.properties ?? {};
      const id = feature.id ?? getString(properties.OBJECTID) ?? null;

      return [
        {
          type: "Feature" as const,
          id: feature.id,
          geometry: {
            type: "Point" as const,
            coordinates: center,
          },
          properties: {
            id,
            name: getString(properties.Navn) ?? "Badeplass",
            municipality: getString(properties.Kommunenavn),
            waterQuality: getString(properties.Tilstand),
          },
        },
      ];
    }),
  };
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=1800");

  const latitude = parseNumber(request.query.lat);
  const longitude = parseNumber(request.query.lon);
  const requestedRadius = parseNumber(request.query.radius);
  const radiusMeters = Math.min(
    Math.max(requestedRadius ?? DEFAULT_RADIUS_METERS, 100),
    MAX_RADIUS_METERS,
  );

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

  // Egen DB først; tom (område uten badeplasser eller før første ingest) => live.
  if (isDbConfigured) {
    try {
      const bbox = bboxForRadius(latitude, longitude, radiusMeters);
      const rows = await selectBeachesInBbox(bbox);
      if (rows.length > 0) {
        const safeCollection: BeachFeatureCollection = {
          type: "FeatureCollection",
          features: rows.map(rowToBeachFeature),
        };
        response.status(200).json({
          source: "SeaNav cache (Miljødirektoratet registrerte badeplasser)",
          radiusMeters,
          nearest: findNearestBeach(
            safeCollection,
            latitude,
            longitude,
            radiusMeters,
          ),
          featureCollection: safeCollection,
          markerFeatureCollection: createBeachMarkers(safeCollection),
        });
        return;
      }
    } catch {
      // Faller tilbake til live-API under.
    }
  }

  try {
    const upstream = await fetch(buildBeachUrl(latitude, longitude, radiusMeters), {
      headers: {
        accept: "application/geo+json, application/json",
      },
    });

    if (!upstream.ok) {
      response.status(502).json({
        error: "Miljødirektoratet beach service unavailable.",
        status: upstream.status,
      });
      return;
    }

    const collection = (await upstream.json()) as BeachFeatureCollection;
    const features = Array.isArray(collection.features) ? collection.features : [];
    const safeCollection: BeachFeatureCollection = {
      type: "FeatureCollection",
      features,
    };

    response.status(200).json({
      source: "Miljødirektoratet registrerte badeplasser",
      radiusMeters,
      nearest: findNearestBeach(safeCollection, latitude, longitude, radiusMeters),
      featureCollection: safeCollection,
      markerFeatureCollection: createBeachMarkers(
        safeCollection,
      ),
    });
  } catch (error) {
    response.status(502).json({
      error: "Miljødirektoratet beach service unavailable.",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

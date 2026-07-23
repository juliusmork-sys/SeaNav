type ApiRequest = {
  query: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  status: (statusCode: number) => ApiResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};

type DepthPoint = {
  latitude: number;
  longitude: number;
  depth: number;
  distanceMeters: number;
};

const WFS_ENDPOINT = "https://wfs.geonorge.no/skwms1/wfs.dybdedata";
const SEARCH_RADII_METERS = [150, 500, 1500, 4000];
const MAX_POINTS = 80;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

function parseNumber(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function distanceMeters(
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

function buildDepthPointUrl(
  latitude: number,
  longitude: number,
  radiusMeters: number,
) {
  const bbox = bboxForRadius(latitude, longitude, radiusMeters);
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: "app:Dybdepunkt",
    srsName: "EPSG:4326",
    bbox: `${bbox.west},${bbox.south},${bbox.east},${bbox.north},EPSG:4326`,
    count: String(MAX_POINTS),
  });

  return `${WFS_ENDPOINT}?${params.toString()}`;
}

function parseDepthPoints(xml: string, latitude: number, longitude: number) {
  const features = xml.match(/<app:Dybdepunkt[\s\S]*?<\/app:Dybdepunkt>/g) ?? [];

  return features.flatMap((feature) => {
    const depthText = feature.match(/<app:dybde>(-?\d+(?:\.\d+)?)<\/app:dybde>/)?.[1];
    const positionText = feature.match(/<gml:pos[^>]*>([^<]+)<\/gml:pos>/)?.[1];
    if (!depthText || !positionText) return [];

    const coordinates = positionText
      .trim()
      .split(/\s+/)
      .map((value) => Number.parseFloat(value));

    if (coordinates.length < 2 || coordinates.some((value) => !Number.isFinite(value))) {
      return [];
    }

    const [pointLongitude, pointLatitude] = coordinates;
    const depth = Number.parseFloat(depthText);
    if (!Number.isFinite(depth)) return [];

    return [
      {
        latitude: pointLatitude,
        longitude: pointLongitude,
        depth: Math.abs(depth),
        distanceMeters: distanceMeters(
          latitude,
          longitude,
          pointLatitude,
          pointLongitude,
        ),
      },
    ];
  });
}

function estimateDepth(points: DepthPoint[]) {
  const sorted = [...points].sort((a, b) => a.distanceMeters - b.distanceMeters);
  const nearest = sorted[0];
  if (!nearest) return null;

  if (nearest.distanceMeters <= 25) {
    return {
      depth: nearest.depth,
      confidence: "high",
      nearestPointMeters: Math.round(nearest.distanceMeters),
      sampleCount: sorted.length,
    };
  }

  const sample = sorted.slice(0, 8);
  const weighted = sample.reduce(
    (accumulator, point) => {
      const weight = 1 / Math.max(point.distanceMeters, 1) ** 2;
      return {
        depth: accumulator.depth + point.depth * weight,
        weight: accumulator.weight + weight,
      };
    },
    { depth: 0, weight: 0 },
  );
  const depth = weighted.depth / weighted.weight;
  const confidence =
    nearest.distanceMeters <= 100 && sample.length >= 3
      ? "high"
      : nearest.distanceMeters <= 500
        ? "medium"
        : "low";

  return {
    depth,
    confidence,
    nearestPointMeters: Math.round(nearest.distanceMeters),
    sampleCount: sample.length,
  };
}

async function fetchKartverketDepth(latitude: number, longitude: number) {
  for (const radiusMeters of SEARCH_RADII_METERS) {
    const response = await fetch(buildDepthPointUrl(latitude, longitude, radiusMeters), {
      headers: {
        accept: "application/gml+xml, text/xml",
      },
    });

    if (!response.ok) {
      continue;
    }

    const points = parseDepthPoints(await response.text(), latitude, longitude);
    if (points.length === 0) {
      continue;
    }

    const estimate = estimateDepth(points);
    if (estimate) {
      return {
        ...estimate,
        radiusMeters,
      };
    }
  }

  return null;
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=1800");

  const latitude = parseNumber(request.query.lat);
  const longitude = parseNumber(request.query.lon);

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

  try {
    const estimate = await fetchKartverketDepth(latitude, longitude);
    if (!estimate) {
      response.status(404).json({
        error: "No Kartverket depth points found near this position.",
      });
      return;
    }

    response.status(200).json({
      depth: Number(estimate.depth.toFixed(1)),
      source: "Kartverket Sjøkart dybdedata WFS",
      confidence: estimate.confidence,
      nearestPointMeters: estimate.nearestPointMeters,
      sampleCount: estimate.sampleCount,
      searchRadiusMeters: estimate.radiusMeters,
    });
  } catch (error) {
    response.status(502).json({
      error: "Kartverket depth service unavailable.",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

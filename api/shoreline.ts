type ApiRequest = {
  query: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  status: (statusCode: number) => ApiResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};

type ShorelinePoint = {
  latitude: number;
  longitude: number;
  distanceMeters: number;
};

const WFS_ENDPOINT = "https://wfs.geonorge.no/skwms1/wfs.dybdedata";
const SEARCH_RADII_METERS = [250, 750, 1500, 3000, 5000];
const MAX_FEATURES = 200;

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

function pointToLocalMeters(
  longitude: number,
  latitude: number,
  originLongitude: number,
  originLatitude: number,
) {
  return {
    x: (longitude - originLongitude) * 111320 * Math.cos(toRadians(originLatitude)),
    y: (latitude - originLatitude) * 111320,
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
      point.x / (111320 * Math.max(Math.cos(toRadians(originLatitude)), 0.01)),
    latitude: originLatitude + point.y / 111320,
  };
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

function buildShorelineUrl(latitude: number, longitude: number, radiusMeters: number) {
  const bbox = bboxForRadius(latitude, longitude, radiusMeters);
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: "app:Kystkontur",
    srsName: "EPSG:4326",
    bbox: `${bbox.west},${bbox.south},${bbox.east},${bbox.north},EPSG:4326`,
    count: String(MAX_FEATURES),
  });

  return `${WFS_ENDPOINT}?${params.toString()}`;
}

function parseShorelinePoints(
  xml: string,
  latitude: number,
  longitude: number,
): ShorelinePoint[] {
  const posLists = [...xml.matchAll(/<gml:posList[^>]*>([^<]+)<\/gml:posList>/g)];
  const origin = { x: 0, y: 0 };

  return posLists.flatMap((match) => {
    const values = match[1]
      .trim()
      .split(/\s+/)
      .map((value) => Number.parseFloat(value));
    if (values.length < 4 || values.some((value) => !Number.isFinite(value))) {
      return [];
    }

    const points: { longitude: number; latitude: number }[] = [];
    for (let index = 0; index < values.length - 1; index += 2) {
      points.push({
        longitude: values[index],
        latitude: values[index + 1],
      });
    }

    let nearest: ShorelinePoint | null = null;
    for (let index = 1; index < points.length; index += 1) {
      const start = pointToLocalMeters(
        points[index - 1].longitude,
        points[index - 1].latitude,
        longitude,
        latitude,
      );
      const end = pointToLocalMeters(
        points[index].longitude,
        points[index].latitude,
        longitude,
        latitude,
      );
      const localNearest = nearestPointOnSegment(origin, start, end);
      const nearestPoint = localMetersToPoint(localNearest, longitude, latitude);
      const candidate = {
        latitude: nearestPoint.latitude,
        longitude: nearestPoint.longitude,
        distanceMeters: distanceMeters(
          latitude,
          longitude,
          nearestPoint.latitude,
          nearestPoint.longitude,
        ),
      };

      if (!nearest || candidate.distanceMeters < nearest.distanceMeters) {
        nearest = candidate;
      }
    }

    return nearest ? [nearest] : [];
  });
}

async function fetchNearestShoreline(latitude: number, longitude: number) {
  for (const radiusMeters of SEARCH_RADII_METERS) {
    const response = await fetch(buildShorelineUrl(latitude, longitude, radiusMeters), {
      headers: {
        accept: "application/gml+xml, text/xml",
      },
    });

    if (!response.ok) {
      continue;
    }

    const points = parseShorelinePoints(await response.text(), latitude, longitude);
    const nearest = points.sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
    if (nearest) {
      return {
        ...nearest,
        searchRadiusMeters: radiusMeters,
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
    const nearest = await fetchNearestShoreline(latitude, longitude);
    if (!nearest) {
      response.status(404).json({
        error: "No Kartverket shoreline found near this position.",
      });
      return;
    }

    response.status(200).json({
      distanceMeters: Math.round(nearest.distanceMeters),
      latitude: Number(nearest.latitude.toFixed(6)),
      longitude: Number(nearest.longitude.toFixed(6)),
      source: "Kartverket Sjøkart dybdedata WFS Kystkontur",
      searchRadiusMeters: nearest.searchRadiusMeters,
    });
  } catch (error) {
    response.status(502).json({
      error: "Kartverket shoreline service unavailable.",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

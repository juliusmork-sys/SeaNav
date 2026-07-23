type ApiRequest = {
  query: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  status: (statusCode: number) => ApiResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};

type MetForecast = {
  properties?: {
    timeseries?: Array<{
      data?: {
        instant?: {
          details?: Record<string, unknown>;
        };
      };
    }>;
  };
};

const LOCATION_FORECAST_ENDPOINT =
  "https://api.met.no/weatherapi/locationforecast/2.0/compact";
const OCEAN_FORECAST_ENDPOINT =
  "https://api.met.no/weatherapi/oceanforecast/2.0/complete";
const MET_HEADERS = {
  accept: "application/json",
  "user-agent": "SeaNav/1.0 (https://www.seanav.no)",
};

function parseNumber(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function readNumber(details: Record<string, unknown> | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function getForecast(endpoint: string, latitude: number, longitude: number) {
  const params = new URLSearchParams({
    lat: latitude.toFixed(5),
    lon: longitude.toFixed(5),
  });
  const result = await fetch(`${endpoint}?${params.toString()}`, {
    headers: MET_HEADERS,
  });

  if (!result.ok) {
    throw new Error(`MET returned ${result.status}`);
  }

  return (await result.json()) as MetForecast;
}

function getDetails(forecast: MetForecast) {
  return forecast.properties?.timeseries?.[0]?.data?.instant?.details;
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1800");

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
    const locationForecast = await getForecast(
      LOCATION_FORECAST_ENDPOINT,
      latitude,
      longitude,
    );
    const locationDetails = getDetails(locationForecast);

    let oceanDetails: Record<string, unknown> | undefined;
    try {
      oceanDetails = getDetails(
        await getForecast(OCEAN_FORECAST_ENDPOINT, latitude, longitude),
      );
    } catch {
      // Ocean data is not available for every location. Wind remains useful inland.
    }

    response.status(200).json({
      windSpeed: readNumber(locationDetails, "wind_speed"),
      windDirection: readNumber(locationDetails, "wind_from_direction"),
      waveHeight: readNumber(oceanDetails, "sea_surface_wave_height"),
      waveDirection: readNumber(oceanDetails, "sea_surface_wave_from_direction"),
      currentSpeed: readNumber(oceanDetails, "sea_water_speed"),
      currentDirection: readNumber(oceanDetails, "sea_water_to_direction"),
      source: "MET Norway",
    });
  } catch {
    response.status(502).json({ error: "Weather service unavailable." });
  }
}

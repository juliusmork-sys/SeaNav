type ApiRequest = {
  query: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  status: (statusCode: number) => ApiResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};

// Kartverkets vannstands-API. Merk endepunktet: `api.sehavniva.no`, som eldre
// dokumentasjon og de fleste eksempler på nett peker på, svarer ikke lenger.
const TIDE_ENDPOINT = "https://vannstand.kartverket.no/tideapi.php";
const TIDE_HEADERS = {
  accept: "text/xml",
  "user-agent": "SeaNav/1.0 (https://www.seanav.no)",
};

// Bakover i tid for å få med forrige ekstremverdi. Uten den vet vi ikke om
// vannet stiger eller synker akkurat nå, og kan heller ikke tegne hvor langt i
// syklusen vi er. Et halvt tidevannsdøgn er drøyt 6 timer, så 8 dekker det.
const HOURS_BEFORE = 8;
const HOURS_AFTER = 30;

type TideExtreme = {
  type: "high" | "low";
  time: string;
  value: number;
};

function parseNumber(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function toApiTime(date: Date) {
  // Kartverket vil ha `YYYY-MM-DDTHH:MM` uten sone. Vi ber om UTC via `tzone`,
  // så tidsstemplene vi sender må også være UTC.
  return date.toISOString().slice(0, 16);
}

function decodeEntities(value: string) {
  // Kartverkets meldingstekster inneholder navngitte entiteter (`&aring;`,
  // `&apos;`). Vi trenger bare de som faktisk forekommer i norske svar.
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&aring;/g, "å")
    .replace(/&oslash;/g, "ø")
    .replace(/&aelig;/g, "æ")
    .replace(/&Aring;/g, "Å")
    .replace(/&Oslash;/g, "Ø")
    .replace(/&AElig;/g, "Æ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function readAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match ? decodeEntities(match[1]) : null;
}

/**
 * Svaret er flat XML med siterte attributter, så regex holder — det er også
 * grunnen til at api/-mappa er avhengighetsfri. Node har ingen DOM, og en
 * XML-parser bare for dette ville vært en avhengighet å vedlikeholde for fire
 * attributter.
 */
function parseTideXml(xml: string) {
  const nodata = xml.match(/<nodata\b[^>]*>/);
  if (nodata) {
    return {
      available: false as const,
      station: null,
      reason: readAttribute(nodata[0], "info"),
      extremes: [] as TideExtreme[],
    };
  }

  const locationTag = xml.match(/<location\b[^>]*>/);
  const station = locationTag ? readAttribute(locationTag[0], "name") : null;

  const extremes: TideExtreme[] = [];
  for (const match of xml.matchAll(/<waterlevel\b[^>]*>/g)) {
    const tag = match[0];
    const flag = readAttribute(tag, "flag");
    if (flag !== "high" && flag !== "low") continue;
    const value = Number.parseFloat(readAttribute(tag, "value") ?? "");
    const time = readAttribute(tag, "time");
    if (!Number.isFinite(value) || !time) continue;
    extremes.push({ type: flag, time, value });
  }

  return {
    available: extremes.length > 0,
    station,
    reason: extremes.length > 0 ? null : "Ingen vannstandsdata i svaret.",
    extremes,
  };
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  // Tidevann er astronomisk og endrer seg ikke — i motsetning til værmeldingen,
  // som api/weather.ts med rette bare holder i 30 minutter.
  response.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");

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

  const now = Date.now();
  const params = new URLSearchParams({
    // Én desimal ≈ 11 km. Kartverket velger uansett nærmeste målestasjon, så
    // finere oppløsning endrer ikke svaret — den gir bare en ny cache-nøkkel for
    // hver meter en båt i fart flytter seg.
    lat: latitude.toFixed(1),
    lon: longitude.toFixed(1),
    fromtime: toApiTime(new Date(now - HOURS_BEFORE * 3600_000)),
    totime: toApiTime(new Date(now + HOURS_AFTER * 3600_000)),
    datatype: "tab",
    // Sjøkartnull, samme nullnivå som dybdene i sjøkartet. Med `msl`
    // (middelvann) ville tallet ikke kunne legges til en kartlagt dybde.
    refcode: "cd",
    lang: "nb",
    interval: "10",
    dst: "0",
    tzone: "utc",
    tide_request: "locationdata",
  });

  try {
    const result = await fetch(`${TIDE_ENDPOINT}?${params.toString()}`, {
      headers: TIDE_HEADERS,
    });

    if (!result.ok) {
      throw new Error(`Kartverket returned ${result.status}`);
    }

    const parsed = parseTideXml(await result.text());

    response.status(200).json({
      available: parsed.available,
      station: parsed.station,
      reason: parsed.reason,
      extremes: parsed.extremes,
      reference: "CD",
      unit: "cm",
      source: "Kartverket",
    });
  } catch {
    response.status(502).json({ error: "Tide service unavailable." });
  }
}

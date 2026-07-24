import { ingestHarbors } from "./harbors.js";
import { ingestBeaches } from "./beaches.js";
import { isDbConfigured } from "./_lib/db.js";

type ApiRequest = {
  headers: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  status: (statusCode: number) => ApiResponse;
  json: (body: unknown) => void;
};

// Cron kjører dette daglig. Vercel sender Authorization: Bearer $CRON_SECRET
// når CRON_SECRET er satt; samme secret kreves for manuell trigger.
export const config = { maxDuration: 300 };

export default async function handler(request: ApiRequest, response: ApiResponse) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers?.authorization;
  if (!secret || authorization !== `Bearer ${secret}`) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!isDbConfigured) {
    response.status(500).json({ error: "Database not configured." });
    return;
  }

  const result: { harbors?: number; beaches?: number; errors: string[] } = {
    errors: [],
  };

  // Kjør parallelt, ikke sekvensielt: de treffer ulike upstreams (Overpass vs
  // Miljødirektoratet-ArcGIS), så samlet veggklokketid blir max(a, b) i stedet
  // for a + b. Sekvensiell kjøring sprengte 300s-budsjettet.
  const [harborsOutcome, beachesOutcome] = await Promise.allSettled([
    ingestHarbors(),
    ingestBeaches(),
  ]);

  if (harborsOutcome.status === "fulfilled") {
    result.harbors = harborsOutcome.value;
  } else {
    result.errors.push(
      `harbors: ${harborsOutcome.reason instanceof Error ? harborsOutcome.reason.message : "unknown"}`,
    );
  }

  if (beachesOutcome.status === "fulfilled") {
    result.beaches = beachesOutcome.value;
  } else {
    result.errors.push(
      `beaches: ${beachesOutcome.reason instanceof Error ? beachesOutcome.reason.message : "unknown"}`,
    );
  }

  response.status(result.errors.length > 0 ? 207 : 200).json(result);
}

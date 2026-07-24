import { ingestHarbors } from "./harbors";
import { ingestBeaches } from "./beaches";
import { isDbConfigured } from "./_lib/db";

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

  try {
    result.harbors = await ingestHarbors();
  } catch (error) {
    result.errors.push(
      `harbors: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  try {
    result.beaches = await ingestBeaches();
  } catch (error) {
    result.errors.push(
      `beaches: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  response.status(result.errors.length > 0 ? 207 : 200).json(result);
}

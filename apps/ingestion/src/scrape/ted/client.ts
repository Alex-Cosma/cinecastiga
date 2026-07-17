import { createTedClient, type TedClient } from "@seap/scraper-clients";

/**
 * Process-wide TED client singleton. TED has no auth/rate-limit/WAF, so this is
 * a thin, polite client. Separate host + budget from e-licitatie — safe to run
 * concurrently with the SICAP crawlers.
 */
let singleton: TedClient | null = null;

export function getTedClient(): TedClient {
  if (singleton) return singleton;
  const userAgent =
    process.env["SCRAPE_UA"] ??
    "seap-analytics/0.1 (contact: cineseuita@gmail.com)";
  singleton = createTedClient({
    userAgent,
    maxConcurrency: Number(process.env["TED_CONCURRENCY"] ?? "4"),
    minDelayMs: Number(process.env["TED_MIN_DELAY_MS"] ?? "150"),
  });
  return singleton;
}

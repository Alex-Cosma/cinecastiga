import {
  createElicitatieClient,
  type ElicitatieClient,
} from "@seap/scraper-clients";

/**
 * Process-wide singleton: politeness state (semaphore, throttle) lives in
 * the client instance, so multiple instances would multiply the request
 * budget against e-licitatie.ro. Every scrape job shares this one.
 */

let singleton: ElicitatieClient | null = null;
let testOverride: ElicitatieClient | null = null;

export function setElicitatieClientForTests(
  client: ElicitatieClient | null,
): void {
  testOverride = client;
}

export function getElicitatieClient(): ElicitatieClient {
  if (testOverride) return testOverride;
  if (singleton) return singleton;

  const userAgent = process.env["SCRAPE_UA"];
  if (!userAgent) {
    throw new Error(
      "SCRAPE_UA env var required — honest User-Agent with contact info, " +
        'e.g. "seap-analytics/0.1 (contact: you@example.com)"',
    );
  }

  const concurrency = Number(process.env["SCRAPE_CONCURRENCY"] ?? "3");
  const minDelayMs = Number(process.env["SCRAPE_MIN_DELAY_MS"] ?? "400");

  singleton = createElicitatieClient({
    userAgent,
    maxConcurrency: concurrency,
    minDelayMs,
  });
  return singleton;
}

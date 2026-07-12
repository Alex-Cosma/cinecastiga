import {
  createElicitatieClient,
  type ElicitatieClient,
} from "@seap/scraper-clients";

/**
 * Process-wide singleton: rate-limit state (semaphore, throttle) lives in
 * the client instance, so multiple instances would multiply the request
 * budget against e-licitatie.ro. Every scrape job shares this one.
 *
 * Defaults tuned for throughput (the platform tolerates high load — verified
 * firsthand + live smoke): concurrency 20, no inter-request delay ≈ ~55 req/s.
 * The client still honors 429/Retry-After with exponential backoff, so if the
 * server ever pushes back we auto-throttle rather than getting banned.
 * Override per-run via SCRAPE_CONCURRENCY / SCRAPE_MIN_DELAY_MS.
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

  const userAgent =
    process.env["SCRAPE_UA"] ??
    "seap-analytics/0.1 (contact: cineseuita@gmail.com)";

  const concurrency = Number(process.env["SCRAPE_CONCURRENCY"] ?? "20");
  const minDelayMs = Number(process.env["SCRAPE_MIN_DELAY_MS"] ?? "0");

  singleton = createElicitatieClient({
    userAgent,
    maxConcurrency: concurrency,
    minDelayMs,
  });
  return singleton;
}

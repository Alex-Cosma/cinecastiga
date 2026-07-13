import {
  createElicitatieClient,
  type ElicitatieClient,
} from "@seap/scraper-clients";

/**
 * Process-wide singleton: rate-limit state (semaphore, throttle) lives in
 * the client instance, so multiple instances would multiply the request
 * budget against e-licitatie.ro. Every scrape job shares this one.
 *
 * Defaults tuned moderate (concurrency 8, 120ms min inter-request delay ≈ ~8 req/s)
 * — the platform tolerates far more (verified firsthand + live smoke), but a
 * steady mid-rate keeps us well clear of any WAF heuristic and avoids coinciding
 * with the platform's own instability, while still finishing a 30-day backfill in
 * a few hours. The throttle gates request STARTS, so req/s ≈ 1000/minDelayMs;
 * concurrency is just headroom over latency. The client still honors
 * 429/Retry-After with exponential backoff on top. For a faster one-off
 * backfill, override per-run via SCRAPE_CONCURRENCY / SCRAPE_MIN_DELAY_MS.
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

  const concurrency = Number(process.env["SCRAPE_CONCURRENCY"] ?? "8");
  const minDelayMs = Number(process.env["SCRAPE_MIN_DELAY_MS"] ?? "120");
  // Server-protection knobs. Backoff base and the circuit breaker default ON;
  // for a fragile upstream, raise the base and/or lower the threshold via env.
  const backoffBaseMs = Number(process.env["SCRAPE_BACKOFF_BASE_MS"] ?? "1000");
  const circuitThreshold = Number(process.env["SCRAPE_CIRCUIT_THRESHOLD"] ?? "5");
  const circuitCooldownMs = Number(process.env["SCRAPE_CIRCUIT_COOLDOWN_MS"] ?? "60000");

  singleton = createElicitatieClient({
    userAgent,
    maxConcurrency: concurrency,
    minDelayMs,
    backoffBaseMs,
    circuitThreshold,
    circuitCooldownMs,
  });
  return singleton;
}

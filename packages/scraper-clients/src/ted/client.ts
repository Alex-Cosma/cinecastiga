import { createHttpClient, type HttpClient } from "../http-client.js";

/** TED Search API host. Notice XML lives on a DIFFERENT host (ted.europa.eu) —
 *  fetched via absolute URL, see search.ts. */
export const TED_API_BASE = "https://api.ted.europa.eu";

export interface TedClientOptions {
  /** Honest UA with contact info. TED has no auth, but identify anyway. */
  userAgent: string;
  maxConcurrency?: number;
  minDelayMs?: number;
  /** Test seam: inject a prebuilt HttpClient. */
  httpClient?: HttpClient;
}

export interface TedClient {
  http: HttpClient;
}

/**
 * TED is a stable EU service with NO rate limit and NO WAF — so no Referer, no
 * circuit breaker, just modest politeness (we don't need to hammer it). Runs
 * fully in parallel with the e-licitatie crawlers; different host, separate budget.
 */
export function createTedClient(opts: TedClientOptions): TedClient {
  const http =
    opts.httpClient ??
    createHttpClient({
      baseUrl: TED_API_BASE,
      userAgent: opts.userAgent,
      maxConcurrency: opts.maxConcurrency ?? 4,
      minDelayMs: opts.minDelayMs ?? 150,
      maxRetries: 3,
      backoffBaseMs: 1000,
      circuitThreshold: 0, // stable upstream — no breaker
    });
  return { http };
}

import { createHttpClient, type HttpClient } from "../http-client.js";

export const ELICITATIE_BASE_URL = "https://e-licitatie.ro";

/**
 * The public API expects the same-site Referer the portal's own interface sends. Identity stays honest via User-Agent.
 */
const DEFAULT_REFERER = "https://e-licitatie.ro/pub/notices/contract-notices/list/1";

export interface ElicitatieClientOptions {
  /** Honest UA with contact info — required, no default. */
  userAgent: string;
  baseUrl?: string;
  referer?: string;
  /** High-throughput default; 429/Retry-After backoff is the safety net. */
  maxConcurrency?: number;
  minDelayMs?: number;
  maxRetries?: number;
  /** Test seam: inject a prebuilt HttpClient (mock server). */
  httpClient?: HttpClient;
}

export interface ElicitatieClient {
  http: HttpClient;
  baseUrl: string;
}

export function createElicitatieClient(
  opts: ElicitatieClientOptions,
): ElicitatieClient {
  const baseUrl = opts.baseUrl ?? ELICITATIE_BASE_URL;
  const http =
    opts.httpClient ??
    createHttpClient({
      baseUrl,
      userAgent: opts.userAgent,
      maxConcurrency: opts.maxConcurrency ?? 20,
      minDelayMs: opts.minDelayMs ?? 0,
      maxRetries: opts.maxRetries ?? 3,
      defaultHeaders: {
        referer: opts.referer ?? DEFAULT_REFERER,
        // Must match the apex host (live-verified)
        origin: "https://e-licitatie.ro",
      },
    });
  return { http, baseUrl };
}

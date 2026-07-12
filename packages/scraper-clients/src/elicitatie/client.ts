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
  /** Post-2025 the API rate-limits; stay conservative (DEC-005). */
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
      maxConcurrency: opts.maxConcurrency ?? 3,
      minDelayMs: opts.minDelayMs ?? 400,
      maxRetries: opts.maxRetries ?? 3,
      defaultHeaders: {
        referer: opts.referer ?? DEFAULT_REFERER,
        origin: "https://www.e-licitatie.ro",
      },
    });
  return { http, baseUrl };
}

import { createHttpClient, type HttpClient } from "../http-client.js";

export const ELICITATIE_BASE_URL = "https://e-licitatie.ro";

/**
 * The WAF hard-403s any api-pub request without a same-site Referer
 * (live-verified 2026-07-12; UA content is irrelevant to the WAF).
 * Referer is a technical requirement; identity stays honest via User-Agent.
 */
const DEFAULT_REFERER = "https://e-licitatie.ro/pub/notices/contract-notices/list/1";

/**
 * Page-accurate Referer per api-pub endpoint — the exact SPA page a real user
 * would be on when the call fires (URLs mirror the 2020 ro.cineseuita scraper).
 * Verified 2026-07-16 to NOT affect the rate-limit ceiling, but it shapes
 * traffic like a browser session and is free. Unknown paths → DEFAULT_REFERER.
 */
function refererForPath(path: string): string {
  const base = "https://e-licitatie.ro/pub";
  const id = (p: string) => p.split("/").filter(Boolean).pop() ?? "";
  if (path.includes("DirectAcquisitionCommon/GetDirectAcquisitionList"))
    return `${base}/direct-acquisitions/list/1`;
  if (path.includes("PublicDirectAcquisition/getView/") || path.includes("DirectAcquisitionCommon/getQuickView/"))
    return `${base}/direct-acquisition/view/${id(path)}`;
  if (path.includes("Participants/GetParticipants")) return `${base}/participants`;
  if (path.includes("NoticeCommon/GetCNoticeList")) return `${base}/notices/contract-notices/list/1`;
  if (path.includes("NoticeCommon/GetCANoticeList")) return `${base}/notices/contract-award-notices/list/18/1`;
  if (path.includes("C_PUBLIC_CANotice/GetCANoticeContracts")) return `${base}/notices/contract-award-notices/list/18/1`;
  if (path.includes("C_PUBLIC_CANotice/get/")) return `${base}/notices/contract-notices/view/${id(path)}`;
  if (path.includes("ComboPub/")) return `${base}/direct-acquisitions/list/1`;
  return DEFAULT_REFERER;
}

export interface ElicitatieClientOptions {
  /** Honest UA with contact info — required, no default. */
  userAgent: string;
  baseUrl?: string;
  referer?: string;
  /** High-throughput default; 429/Retry-After backoff is the safety net. */
  maxConcurrency?: number;
  minDelayMs?: number;
  maxRetries?: number;
  backoffBaseMs?: number;
  circuitThreshold?: number;
  circuitCooldownMs?: number;
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
      maxConcurrency: opts.maxConcurrency ?? 8,
      minDelayMs: opts.minDelayMs ?? 120,
      maxRetries: opts.maxRetries ?? 3,
      backoffBaseMs: opts.backoffBaseMs ?? 1000,
      // Circuit breaker on by default: stop after 5 consecutive server failures.
      circuitThreshold: opts.circuitThreshold ?? 5,
      circuitCooldownMs: opts.circuitCooldownMs ?? 60_000,
      defaultHeaders: {
        referer: opts.referer ?? DEFAULT_REFERER,
        // Must match the apex host — the WAF 403s a www Origin (live-verified)
        origin: "https://e-licitatie.ro",
      },
      // Per-endpoint page-accurate Referer (overrides the static default above).
      // If a fixed referer was explicitly injected, respect it (tests).
      ...(opts.referer ? {} : { refererFor: refererForPath }),
    });
  return { http, baseUrl };
}

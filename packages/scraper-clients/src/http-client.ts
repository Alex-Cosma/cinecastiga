/**
 * Polite HTTP client for unofficial government endpoints.
 *
 * Politeness is not optional here: this project has no contractual right
 * to the e-licitatie.ro API, so low concurrency, honest identification,
 * and automatic backoff are what keep ingestion alive long-term.
 */

export interface HttpClientOptions {
  baseUrl: string;
  /** Required, no default — identify honestly, include contact info. */
  userAgent: string;
  /** Max in-flight requests. Keep low; prior art uses ~5, post-2025 intel says lower. */
  maxConcurrency?: number;
  /** Minimum delay between request starts, per client. */
  minDelayMs?: number;
  maxRetries?: number;
  /** Baseline headers sent on every request (e.g. Referer — WAF requires same-site). */
  defaultHeaders?: Record<string, string>;
}

export interface FetchResult<T = unknown> {
  data: T;
  status: number;
  url: string;
  fetchedAt: Date;
}

export class ScrapeError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly status: number | null,
    public readonly attempts: number,
  ) {
    super(message);
    this.name = "ScrapeError";
  }
}

const RETRYABLE_STATUS = new Set([403, 408, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

/** Simple counting semaphore. */
class Semaphore {
  private queue: Array<() => void> = [];
  private inFlight = 0;

  constructor(private readonly limit: number) {}

  async acquire(): Promise<void> {
    if (this.inFlight < this.limit) {
      this.inFlight += 1;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.inFlight += 1;
  }

  release(): void {
    this.inFlight -= 1;
    const next = this.queue.shift();
    if (next) next();
  }
}

export interface HttpClient {
  /** GET a JSON resource relative to baseUrl. */
  getJson<T = unknown>(path: string, init?: RequestInit): Promise<FetchResult<T>>;
  /** POST a JSON body and parse a JSON response, same politeness path as getJson. */
  postJson<T = unknown>(
    path: string,
    body: unknown,
    init?: RequestInit,
  ): Promise<FetchResult<T>>;
}

export function createHttpClient(opts: HttpClientOptions): HttpClient {
  const {
    baseUrl,
    userAgent,
    maxConcurrency = 5,
    minDelayMs = 500,
    maxRetries = 3,
    defaultHeaders = {},
  } = opts;

  if (!userAgent.trim()) {
    throw new Error("userAgent is required — identify the scraper honestly");
  }

  const semaphore = new Semaphore(maxConcurrency);
  let lastRequestAt = 0;

  async function throttle(): Promise<void> {
    const now = Date.now();
    const wait = lastRequestAt + minDelayMs - now;
    lastRequestAt = Math.max(now, lastRequestAt + minDelayMs);
    if (wait > 0) await sleep(wait);
  }

  async function request<T>(
    method: "GET" | "POST",
    path: string,
    body: unknown | undefined,
    init?: RequestInit,
  ): Promise<FetchResult<T>> {
    const url = new URL(path, baseUrl).toString();
    let lastStatus: number | null = null;
    let retryAfterMs: number | null = null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
      await semaphore.acquire();
      try {
        await throttle();
        let response: Response;
        try {
          response = await fetch(url, {
            ...init,
            method,
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            headers: {
              accept: "application/json",
              ...(body === undefined
                ? {}
                : { "content-type": "application/json;charset=UTF-8" }),
              ...defaultHeaders,
              "user-agent": userAgent,
              ...init?.headers,
            },
          });
        } catch {
          lastStatus = null; // network error — retryable
          continue;
        }

        lastStatus = response.status;
        retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
        if (response.ok) {
          const data = (await response.json()) as T;
          return { data, status: response.status, url, fetchedAt: new Date() };
        }
        if (!RETRYABLE_STATUS.has(response.status)) {
          throw new ScrapeError(
            `Non-retryable HTTP ${response.status} for ${url}`,
            url,
            response.status,
            attempt,
          );
        }
      } finally {
        semaphore.release();
      }

      if (attempt <= maxRetries) {
        // Exponential backoff with jitter: 1s, 2s, 4s... ±25%.
        // A server-sent Retry-After overrides when longer.
        const base = 1000 * 2 ** (attempt - 1);
        const jitter = base * (Math.random() * 0.5 - 0.25);
        const backoff = base + jitter;
        await sleep(Math.max(backoff, retryAfterMs ?? 0));
      }
    }

    throw new ScrapeError(
      `Gave up on ${url} after ${maxRetries + 1} attempts (last status: ${lastStatus})`,
      url,
      lastStatus,
      maxRetries + 1,
    );
  }

  return {
    getJson: (path, init) => request("GET", path, undefined, init),
    postJson: (path, body, init) => request("POST", path, body, init),
  };
}

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
  /** Max in-flight requests. Keep low; prior art uses ~5. */
  maxConcurrency?: number;
  /** Minimum delay between request starts, per client. */
  minDelayMs?: number;
  maxRetries?: number;
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
}

export function createHttpClient(opts: HttpClientOptions): HttpClient {
  const {
    baseUrl,
    userAgent,
    maxConcurrency = 5,
    minDelayMs = 500,
    maxRetries = 3,
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

  async function getJson<T>(
    path: string,
    init?: RequestInit,
  ): Promise<FetchResult<T>> {
    const url = new URL(path, baseUrl).toString();
    let lastStatus: number | null = null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
      await semaphore.acquire();
      try {
        await throttle();
        let response: Response;
        try {
          response = await fetch(url, {
            ...init,
            headers: {
              accept: "application/json",
              "user-agent": userAgent,
              ...init?.headers,
            },
          });
        } catch {
          lastStatus = null; // network error — retryable
          continue;
        }

        lastStatus = response.status;
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
        // Exponential backoff with jitter: 1s, 2s, 4s... ±25%
        const base = 1000 * 2 ** (attempt - 1);
        const jitter = base * (Math.random() * 0.5 - 0.25);
        await sleep(base + jitter);
      }
    }

    throw new ScrapeError(
      `Gave up on ${url} after ${maxRetries + 1} attempts (last status: ${lastStatus})`,
      url,
      lastStatus,
      maxRetries + 1,
    );
  }

  return { getJson };
}

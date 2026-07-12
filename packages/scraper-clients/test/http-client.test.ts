import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpClient, ScrapeError } from "../src/http-client.js";

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise((resolve) => server!.close(resolve));
    server = undefined;
  }
});

function startServer(
  handler: Parameters<typeof createServer>[1],
): Promise<string> {
  server = createServer(handler);
  return new Promise((resolve) => {
    server!.listen(0, "127.0.0.1", () => {
      const { port } = server!.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

describe("createHttpClient", () => {
  it("requires a user agent", () => {
    expect(() =>
      createHttpClient({ baseUrl: "http://x", userAgent: "  " }),
    ).toThrow(/userAgent/);
  });

  it("sends the honest User-Agent and parses JSON", async () => {
    let seenUa: string | undefined;
    const baseUrl = await startServer((req, res) => {
      seenUa = req.headers["user-agent"];
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });

    const client = createHttpClient({
      baseUrl,
      userAgent: "seap-analytics/0.1 (contact: contact@example.test)",
      minDelayMs: 0,
    });

    const result = await client.getJson<{ ok: boolean }>("/api/test");
    expect(result.data.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(seenUa).toContain("seap-analytics");
  });

  it("retries on 429 then succeeds", async () => {
    let calls = 0;
    const baseUrl = await startServer((_req, res) => {
      calls += 1;
      if (calls === 1) {
        res.statusCode = 429;
        res.end();
        return;
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ attempt: calls }));
    });

    const client = createHttpClient({
      baseUrl,
      userAgent: "test-agent",
      minDelayMs: 0,
      maxRetries: 2,
    });

    // Backoff makes this take ~1s (first retry delay)
    const result = await client.getJson<{ attempt: number }>("/retry");
    expect(result.data.attempt).toBe(2);
    expect(calls).toBe(2);
  }, 10_000);

  it("throws ScrapeError immediately on non-retryable status", async () => {
    const baseUrl = await startServer((_req, res) => {
      res.statusCode = 404;
      res.end();
    });

    const client = createHttpClient({
      baseUrl,
      userAgent: "test-agent",
      minDelayMs: 0,
    });

    const err = await client
      .getJson("/missing")
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ScrapeError);
    expect((err as ScrapeError).status).toBe(404);
    expect((err as ScrapeError).attempts).toBe(1);
  });

  it("caps concurrency", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const baseUrl = await startServer((_req, res) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      setTimeout(() => {
        inFlight -= 1;
        res.setHeader("content-type", "application/json");
        res.end("{}");
      }, 50);
    });

    const client = createHttpClient({
      baseUrl,
      userAgent: "test-agent",
      maxConcurrency: 2,
      minDelayMs: 0,
    });

    await Promise.all(
      Array.from({ length: 8 }, (_, i) => client.getJson(`/c/${i}`)),
    );
    expect(maxInFlight).toBeLessThanOrEqual(2);
  }, 10_000);
});

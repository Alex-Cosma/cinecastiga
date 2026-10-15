import { describe, it, expect, vi, afterEach } from "vitest";
import { createHttpClient, CircuitOpenError } from "./http-client.js";

const opts = {
  baseUrl: "https://upstream.test",
  userAgent: "test (contact: t@t)",
  minDelayMs: 0,
  maxRetries: 0,
  backoffBaseMs: 0,
  circuitThreshold: 3,
  circuitCooldownMs: 60_000,
};

afterEach(() => vi.restoreAllMocks());

describe("http-client circuit breaker", () => {
  it.each(['CollectionSuspendedError','CollectionProxyFailureError'])('preserves %s from the metered transport without wrapping or retrying',async name=>{
    const original=Object.assign(new Error('Metered transport owns recovery'),{name});
    const transport=vi.fn(async()=>{throw original;});
    const client=createHttpClient({...opts,maxRetries:3,transport});
    await expect(client.getJson('/fixture')).rejects.toBe(original);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("opens after N consecutive server failures and then fails fast without hitting the server", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return new Response("boom", { status: 500 });
      }),
    );
    const c = createHttpClient(opts);

    // Three failing requests trip the breaker (threshold = 3).
    for (let i = 0; i < 3; i += 1) {
      await expect(c.getJson("/x")).rejects.toBeInstanceOf(Error);
    }
    expect(calls).toBe(3);

    // Circuit now open: next request fails fast, no additional fetch.
    await expect(c.getJson("/y")).rejects.toBeInstanceOf(CircuitOpenError);
    expect(calls).toBe(3);
  });

  it("resets the failure streak on a success", async () => {
    let status = 500;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: true }), {
            status,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const c = createHttpClient(opts);

    await expect(c.getJson("/a")).rejects.toBeTruthy(); // failures: 1
    await expect(c.getJson("/a")).rejects.toBeTruthy(); // failures: 2
    status = 200;
    await expect(c.getJson("/a")).resolves.toMatchObject({ status: 200 }); // reset
    status = 500;
    // Only one failure since reset — breaker still closed, so a normal give-up.
    await expect(c.getJson("/a")).rejects.not.toBeInstanceOf(CircuitOpenError);
  });
});

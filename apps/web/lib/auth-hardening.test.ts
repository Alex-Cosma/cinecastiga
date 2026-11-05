import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { getIp } from "better-auth/api";
import { describe, expect, it } from "vitest";
import { AUTH_IP_ADDRESS } from "./auth-hardening";

const BASE = "http://localhost:3000";
// Production's chain: Cloudflare, then Caddy, append one hop each; Caddy sets X-Feedback-Client-IP from CF-Connecting-IP.
const viaProxies = (client: string, extra: Record<string, string> = {}) => new Headers({
  "x-forwarded-for": `${client}, 172.70.1.1`,
  "x-feedback-client-ip": client,
  ...extra,
});

function testAuth() {
  return betterAuth({
    baseURL: BASE,
    secret: "test-secret-for-auth-hardening-0123456789",
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    emailAndPassword: { enabled: true, disableSignUp: true },
    rateLimit: { enabled: true },
    advanced: { ipAddress: AUTH_IP_ADDRESS },
  });
}

describe("better-auth client address (audit S1F1)", () => {
  it("reads one address per visitor behind a two-hop X-Forwarded-For", () => {
    const options = { advanced: { ipAddress: AUTH_IP_ADDRESS } };
    expect(getIp(new Request(BASE, { headers: viaProxies("203.0.113.5") }), options)).toBe("203.0.113.5");
    expect(getIp(new Request(BASE, { headers: viaProxies("198.51.100.7") }), options)).toBe("198.51.100.7");
    // The default header alone: a two-value chain resolves no address, so every visitor shared one key.
    const defaults = getIp(new Request(BASE, { headers: viaProxies("203.0.113.5") }), {});
    expect(defaults).not.toBe("203.0.113.5");
  });

  it("limits sign-in attempts per visitor, not for everyone at once", async () => {
    const auth = testAuth();
    const signIn = (client: string) => auth.handler(new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: viaProxies(client, { "content-type": "application/json", origin: BASE }),
      body: JSON.stringify({ email: "nobody@example.test", password: "wrong-password-1" }),
    }));
    // better-auth's default sign-in rule: 3 requests per 10 s.
    for (let i = 0; i < 3; i++) expect((await signIn("203.0.113.5")).status).not.toBe(429);
    expect((await signIn("203.0.113.5")).status).toBe(429);
    expect((await signIn("198.51.100.7")).status).not.toBe(429);
  });
});

import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { getIp } from "better-auth/api";
import { admin } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { ADMIN_HTTP_PATHS, AUTH_IP_ADDRESS, adminHttpDisabledPaths } from "./auth-hardening";

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

describe("better-auth admin routes over HTTP (audit S1F2)", () => {
  const ADMIN_OPTIONS = { defaultRole: "watchdog", adminRoles: ["admin"] };
  const adminAuth = () => betterAuth({
    baseURL: BASE,
    secret: "test-secret-for-auth-hardening-0123456789",
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    emailAndPassword: { enabled: true, disableSignUp: true },
    plugins: [admin(ADMIN_OPTIONS)],
    disabledPaths: adminHttpDisabledPaths(admin(ADMIN_OPTIONS)),
  });

  it("covers every route the installed admin plugin declares", () => {
    const declared = Object.values(admin(ADMIN_OPTIONS).endpoints).map((e) => e.path).filter((p) => p.startsWith("/admin/"));
    expect(declared.length).toBeGreaterThan(0);
    expect([...declared].sort()).toEqual([...ADMIN_HTTP_PATHS]);
    expect(adminHttpDisabledPaths(admin(ADMIN_OPTIONS))).toEqual([...ADMIN_HTTP_PATHS]);
  });

  it("answers 404 over HTTP and keeps auth.api.* for the server actions", async () => {
    const auth = adminAuth();
    await auth.api.createUser({ body: { email: "admin@example.test", password: "admin-password-1", name: "Admin", role: "admin" } });
    await auth.api.createUser({ body: { email: "user@example.test", password: "user-password-1", name: "User" } });
    const signedIn = await auth.api.signInEmail({ body: { email: "admin@example.test", password: "admin-password-1" }, returnHeaders: true });
    const cookie = (signedIn.headers.getSetCookie?.() ?? [signedIn.headers.get("set-cookie") ?? ""]).map((c) => c.split(";")[0]).join("; ");
    const headers = new Headers({ cookie });

    const listed = await auth.api.listUsers({ query: {}, headers });
    expect(listed.users.map((u) => u.email).sort()).toEqual(["admin@example.test", "user@example.test"]);

    for (const path of ADMIN_HTTP_PATHS) {
      for (const method of ["GET", "POST"]) {
        const res = await auth.handler(new Request(`${BASE}/api/auth${path}`, {
          method,
          headers: { cookie, origin: BASE, "content-type": "application/json" },
          ...(method === "POST" ? { body: JSON.stringify({ userId: listed.users[0]!.id }) } : {}),
        }));
        expect(res.status, `${method} ${path}`).toBe(404);
      }
    }
    // Trailing slash and case variants do not reach the routes either.
    for (const path of ["/admin/list-users/", "/Admin/list-users", "/admin/List-Users"]) {
      const res = await auth.handler(new Request(`${BASE}/api/auth${path}`, { headers: { cookie } }));
      expect(res.status, path).toBe(404);
    }
    // The rest of the router still answers.
    const session = await auth.handler(new Request(`${BASE}/api/auth/get-session`, { headers: { cookie } }));
    expect(session.status).toBe(200);
  });
});

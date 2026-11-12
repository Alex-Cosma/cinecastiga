/**
 * Request-level better-auth settings, kept apart from lib/auth.ts so they can be tested against a real better-auth
 * instance without the database.
 */

/**
 * Where better-auth reads the visitor's address (rate limits, session ipAddress). Production runs behind Cloudflare and
 * Caddy, so X-Forwarded-For carries two hops; better-auth trusts only a single-value header without trustedProxies,
 * resolved no address and keyed every visitor's sign-in and 2FA attempts on one shared bucket (audit S1F1, 5 Nov 2026).
 * Caddy (infra/prod/Caddyfile) overwrites X-Feedback-Client-IP with {client_ip}, which it takes from CF-Connecting-IP
 * only for Cloudflare's ranges; the feedback and document routes already read it. Without the header (next dev, tests)
 * better-auth falls back to 127.0.0.1.
 */
export const AUTH_IP_ADDRESS = { ipAddressHeaders: ["x-feedback-client-ip"] };

/** The admin plugin's HTTP routes in better-auth 1.6.25 (a floor: routes a later version adds are read from the plugin). */
export const ADMIN_HTTP_PATHS = [
  "/admin/ban-user", "/admin/create-user", "/admin/get-user", "/admin/has-permission", "/admin/impersonate-user",
  "/admin/list-user-sessions", "/admin/list-users", "/admin/remove-user", "/admin/revoke-user-session",
  "/admin/revoke-user-sessions", "/admin/set-role", "/admin/set-user-password", "/admin/stop-impersonating",
  "/admin/unban-user", "/admin/update-user",
] as const;

/**
 * The paths better-auth's HTTP router answers 404 for (audit S1F2, 5 Nov 2026): every route of the admin plugin. The
 * site manages accounts only through the /admin server actions, which call auth.api.* directly; better-auth checks
 * `disabledPaths` in its router only, so those calls are unaffected. Open over HTTP, an admin session could impersonate
 * a user (skipping that user's 2FA and reaching investigations shared only with them), create another admin without the
 * forced 2FA record, or remove a user and with it their frozen evidence.
 */
export function adminHttpDisabledPaths(plugin: { endpoints: Record<string, { path?: string }> }): string[] {
  const fromPlugin = Object.values(plugin.endpoints).map((e) => e.path).filter((p): p is string => !!p?.startsWith("/admin/"));
  return [...new Set([...ADMIN_HTTP_PATHS, ...fromPlugin])].sort();
}

/** The only two-factor routes the site calls over HTTP: the login form and the invitation's email check. */
export const TWO_FACTOR_HTTP_PATHS = ["/two-factor/send-otp", "/two-factor/verify-otp"] as const;

/**
 * Every other route of the two-factor plugin answers 404 over HTTP (launch audit M3, 12 November 2026): with
 * `/two-factor/disable` a user, or anyone holding one stolen session, turned the mandatory emailed code off and kept a
 * password-only login. Enable, TOTP, backup codes: the site uses none of them, and accounts get their 2FA from
 * forceTwoFactor through auth.api (lib/auth.ts), which `disabledPaths` does not touch.
 */
export function twoFactorHttpDisabledPaths(plugin: { endpoints: Record<string, { path?: string }> }): string[] {
  const keep = new Set<string>(TWO_FACTOR_HTTP_PATHS);
  return Object.values(plugin.endpoints).map((e) => e.path)
    .filter((p): p is string => !!p?.startsWith("/two-factor/") && !keep.has(p)).sort();
}

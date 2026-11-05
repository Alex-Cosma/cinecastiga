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

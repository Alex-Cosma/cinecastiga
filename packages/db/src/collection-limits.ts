/**
 * Ceilings of the shared SEAP request gate (owner, 11 November 2026: with 500 proxies, at most 1,000 requests a
 * minute in total; each IP still waits 35–45 seconds between its own requests).
 *
 * In flight is a resource bound, not a pace: every request holds one database session (its advisory locks) from
 * admission until its body is read, and PostgreSQL serves the site, the workers and the nightly processing from 100
 * connections. 30 sessions already reach what the pool can send (500 IPs, one request per 35–45 s each, about 750 a
 * minute) at the measured 1.3 seconds a request. The collector runs one lane per possible request.
 */
export const SEAP_MAX_IN_FLIGHT=30;
export const SEAP_MAX_REQUESTS_PER_MINUTE=1000;
/** A proxied 403 stops only that IP. Several IPs that were working refused within this window point at our traffic,
 * and the same address refused on several IPs points at the request: both stop everything, as every 403 did before. */
export const RESTRICTED_PROXY_LIMIT=5,RESTRICTED_PROXY_WINDOW_MINUTES=30,REFUSED_ENDPOINT_LIMIT=3;

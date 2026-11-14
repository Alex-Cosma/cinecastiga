/**
 * Ceilings of the shared SEAP request gate (owner, 11 November 2026: with 500 proxies, at most 1,000 requests a
 * minute in total; each IP still waits 35–45 seconds between its own requests. Owner, 14 November 2026: the ceiling
 * goes to 2,500 a minute and the pause per IP to 20–30 seconds, then 1,000 proxies if the source and the server keep
 * up; the per-IP pause and the number of IPs set the real pace, about 60 / 25 s per IP).
 *
 * In flight is a resource bound, not a pace: every request holds one database session (its advisory locks) from
 * admission until its body is read, and PostgreSQL serves the site, the workers and the nightly processing from 100
 * connections. 30 sessions already reach what the pool can send (500 IPs, one request per 35–45 s each, about 750 a
 * minute) at the measured 1.3 seconds a request. The collector runs one lane per possible request.
 *
 * Owner, 14 November 2026: 50 in flight, with PostgreSQL at 150 connections (infra/prod/docker-compose.yml). With
 * 1,000 proxies the 500 new answer in ~1.4 s (the first 500 in ~0.5 s): ~25 of the 30 lanes were waiting on SEAP at
 * any moment and the pace stayed at ~1,580 a minute, below the ~2,280 the per-IP pause allows.
 */
export const SEAP_MAX_IN_FLIGHT=50;
export const SEAP_MAX_REQUESTS_PER_MINUTE=2500;
/** A proxied 403 stops only that IP. Several IPs that were working refused within this window point at our traffic,
 * and the same address refused on several IPs points at the request: both stop everything, as every 403 did before. */
export const RESTRICTED_PROXY_LIMIT=5,RESTRICTED_PROXY_WINDOW_MINUTES=30,REFUSED_ENDPOINT_LIMIT=3;

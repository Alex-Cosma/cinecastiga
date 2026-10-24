/**
 * postgres.js prepares every statement. From the sixth execution of the same
 * statement on one pooled connection, PostgreSQL may switch to a generic plan
 * chosen without the bound values. On the national marts that plan was up to
 * ten times slower (Întreabă, national sources: 2 s for runs 1–5, then 14–20 s).
 * Issued as the first statement of a transaction, it keeps every query of that
 * transaction on plans made for its own parameters. `lib/intent/server.ts`
 * does the same for the vocabulary lookups, and `withMonitoringSnapshot`
 * (@seap/db) for comparisons, relations, captures and watches.
 */
export const FORCE_CUSTOM_PLANS = "set local plan_cache_mode = force_custom_plan";

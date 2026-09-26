# Optional daily monitoring digests

Email is an explicitly enabled convenience for private monitoring. Each watch starts with `preferences.digest=false`. Its owner must have a verified email address to enable a digest. Paused watches, disabled/banned or unverified users, baseline runs, and updates already reviewed in the application are excluded.

The in-app monitoring inbox remains the complete source of updates. A message contains watch titles, counts, and private authenticated links; it never includes contract amounts, source rows, evidence snapshots, or generated accusations. A long digest lists the first 20 updates and links to the remaining inbox results. Titles are escaped for HTML and header control characters are removed. Users should understand that their chosen watch title will appear in the email before opting in.

## Available UI contract

`GET /api/urmariri/digest` requires the current authenticated user and returns:

```ts
{
  available: boolean;
  reason: string | null;
  optedInWatches: number;
  latest: {
    period: string; // YYYY-MM-DD, completed UTC day
    status: "queued" | "sending" | "sent" | "failed" | "uncertain" | "cancelled";
    updateCount: number;
    sentAt: string | null;
    error: string | null;
  } | null;
}
```

The settings UI should disable new opt-ins when `available=false` and display `reason`. Turning an existing opt-in off must remain possible. Delivery errors are safe Romanian messages; raw SMTP responses or credentials are never returned. An old `sending` state (>10 minutes) is displayed as `uncertain` even before another worker runs.

## Configuration and execution

The worker needs `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_SECURE`, optional `SMTP_USER`/`SMTP_PASS`, and a sender from `SMTP_FROM` or `SMTP_USER`. Links use only `MONITORING_SITE_URL`, falling back to `BETTER_AUTH_URL`. Actual delivery requires a configured HTTPS origin with no credentials, path, query or fragment. Local HTTP origins are permitted for configuration inspection only and cannot send digests.

Preview is read-only, creates no outbox rows and sends no messages:

```sh
pnpm --filter web monitoring:digests
pnpm --filter web monitoring:digests --day=2026-09-18
```

Actual delivery requires the explicit flag:

```sh
pnpm --filter web monitoring:digests --send
```

The default window is the previous completed UTC calendar day. `--day=YYYY-MM-DD` selects another completed day. A deployment can schedule the explicit send command once a day at 06:00 UTC (08:00 or 09:00 in Romania), with the application's configured environment and working directory. This scheduling example is a deployment instruction only: no cron, service, real SMTP connection or automatic delivery was enabled during implementation. Refresh evaluation never invokes email delivery.

Operational output contains only period and counts. It omits recipient addresses, private watch titles, source data and SMTP responses.

## Delivery guarantees and limits

`app.monitoring_digest_deliveries` is a durable outbox with a unique `(owner_user_id, period)` key. Concurrent workers and normal retries cannot create another digest for the same owner/day. Before SMTP begins, a worker atomically claims one pending row and rechecks current verified email, ban status, current opt-in and paused state, ownership, and reviewed updates. An email change cancels the old queued recipient even if the new address is already verified. These checks happen immediately before starting delivery; a message already handed to SMTP cannot be recalled.

The message ID and selected run IDs are persisted before contacting SMTP. A definite zero-recipient rejection produces `failed`, visible in the UI, and may be retried by a later explicit worker run for the same day. The default command processes only the previous UTC day; it does not retry older failed days. After resolving delivery configuration, the operator must run `pnpm --filter web monitoring:digests --day=YYYY-MM-DD --send` for the affected period. A successful SMTP acceptance produces `sent` and is never automatically retried. `sent` means the SMTP server accepted the message; it is not proof that it reached the inbox.

An exception may occur after the SMTP server accepted the message. Similarly, the worker could stop after sending but before recording success. Those cases become `uncertain`, with an explanation in the UI. A stale `sending` record becomes `uncertain` after ten minutes. Neither state is ever returned to the automatic queue. SMTP cannot provide exactly-once delivery; this design avoids guessing and duplicate automatic resend. The updates remain available in the application.

Stopping all participating watches, opting out, losing verified status, or reviewing every included update before claim produces `cancelled`. Re-enabling a watch does not resend a cancelled or sent digest for the same day. New eligible updates appear in subsequent daily windows. The ledger and app/auth data must be preserved across procurement refreshes.

## Tests

`monitoring-digests.test.ts` covers configuration/origin validation, UTC periods including invalid days and DST transitions, HTML escaping/private links, and the disclosed 20-item email limit.

`monitoring-digests.integration.test.ts` exercises an isolated `seap_test_*` PostgreSQL database: read-only preview, concurrent delivery deduplication, default opt-out and exclusions, changes after enqueue, transport/crash ambiguity, and definite rejection retries. Every sender is injected as an in-memory mock; no email is sent. Fixtures use their own user, watch, run and checkpoint IDs and clean up by those IDs.

```sh
pnpm --filter web exec vitest run lib/monitoring-digests.test.ts
TEST_DATABASE_URL=postgres://seap:seap_dev@localhost:5432/seap_test_batch3_20260919 pnpm --filter web exec vitest run lib/monitoring-digests.integration.test.ts
```

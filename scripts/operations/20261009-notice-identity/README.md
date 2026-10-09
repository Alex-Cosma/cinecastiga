# 9 October 2026 — notice identity and coverage recovery

Incident procedures authorized for this specific repair. **Not setup scripts and not scheduled maintenance.** Check the [implementation report](../../../docs/implementation/notice-identity-20261009/README.md) and live state before using anything here.

Already executed in production:

1. `pause.sql`: guarded revision101 →102, preserving maintenance and request settings.
2. Backup `/srv/seap/backups/notice-identity-20261009`, SHA-256 verified; migration0064 deployed in `e948a9c`.
3. `import-reviewed-lists.mjs`: exact checksum-bound221-record source bundle archived. Run inside the collector, with its normal DB environment. The public source bundle is in the server backup directory, not Git.
4. `node /app/apps/ingestion/dist/scripts/replay-notice-identities.js --apply`, under host `/srv/seap/src/.git/deploy.lock`:18,388records replayed, zero remaining raw/core identity mismatches. No source requests, watermark reset, marts or publication.
5. `recover-known-gaps.sql`: guarded revision102 →103; archived old errors/retry budgets, resumed76known detail failures and seeded2022-04-21award recovery. All115award lists and115contract inventories (1,382memberships) archived; details still being recovered at this checkpoint.

Follow-up operations (executed at22:49–22:50RO; do not rerun):

- `retry-confirmed-source-transactions.sql`: one further attempt for exactly four inspected HTTP400responses with SEAP's `EnlistTransaction` failure. Requires at least five minutes since their failures. Preserves diagnostics; audit marker prevents rerunning. This does not introduce blanket automatic400retries.
- `start-inventory-pilot.sql`:16daily list partitions across eight years, both notice families. Deployed `b95cc8a`;24pages reconciled,34missing identities archived, zero conflicts.
- `start-historical-inventory.sql`: after pilot validation, seeded5,844daily list partitions,2018-01-01through2025-12-31. Separate `:inventory` keys; idempotent insertion; lower priority than ongoing current collection. Pagination is discovered from responses. No forms/contracts/PDF expansion. **Running, not complete.**

Read-only reports:

- `known-gap-status.sql`: original76tasks and exact2022-04-21contract/form graphs.
- `inventory-status.sql`: per-year daily inventory reconciliation and matched/missing/unverified normalized identities at collection time.

All source calls run through the existing production collector and shared request gate. Operator settings, quiet window, pause and nightly drain apply. A task marked complete means its particular page reconciled; an entire day requires all pages and unique identities to agree with the source total. A completed list inventory does **not** certify historical contract inventories, forms, DA or PDFs. Missing-at-collection entries remain an audit snapshot even if subsequent normalization restores them.

The separate contract-publication/deduplication blocker remains. Keep maintenance until the normal publication checks succeed; never bypass that guard because notice collection succeeded.

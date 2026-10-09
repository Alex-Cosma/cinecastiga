# Notice namespace repair — 9 October 2026

User authorized: fix notice identity in production, recover known gaps, then reconcile historical inventories with correct identities. Preserve source rate settings and public maintenance; do not bypass the separate contract-publication integrity blocker.

## Implementation

- Participation public IDs belong to CN/DC/PC/RFQInvitation endpoint namespaces. Types12/17/19 share RFQInvitation. Generated `core.notices.notice_namespace` plus public ID replaces the invalid global public-ID unique constraint. Existing internal core IDs remain unchanged.
- Retain internal SEAP notice ID when present. Upserts reject a conflicting notice number or internal SEAP ID inside the same namespace; sparse payloads cannot erase an existing identity.
- Namespace collector detail task keys, page identity reconciliation, list/detail archive keys and state-rescan lookups. Old archives remain immutable/readable. Legacy pages lacking scoped identities cannot silently resume mixed pagination.
- Namespace the explicit award/participation association and admin detail aggregation. Existing document keys already contain type; the supported document association remains type17 and exact authority.
- Migration0064 preserves existing task IDs, results/retries/status; backfills verified source links and namespaces legacy tender-detail keys. It refuses active processing/tender tasks or unrecognized source identities. No history reset or automatic full normalization.
- Explicit `replay-notice-identities` CLI replays only retained participation-list records; no source requests, watermark resets or statistical rebuild. Applying requires paused collection/maintenance and inactive processing. Run under the host deploy/processing flock as well.

## Validation so far

- Scraper-client35unit tests and ingestion217unit tests passed, including colliding IDs on one page/across pages and shared RFQ type identity.
- Isolated `seap_test_notice_identity_20261009`: migration through0064;11normalizer/collector integration tests passed. Document association integration passed. Web/ingestion typechecks passed before the scoped replay CLI was added; final replay build passed.
- Isolated `seap_test_notice_rehearsal_20261009`: copied the identity projection of all193,011production notices (not private tables/full DB), migrated successfully without loss:CN34,728;DC1;PC1,125;RFQ157,157. This is a migration rehearsal, not a full application publication rehearsal.
- Production before rollout:revision101,paused=false,maintenance=true,blocked_reason=null; all executable tasks exhausted,76failed award details.94proxies,200/min,10simultaneous,35–45sec/IP unchanged.

## Rollout and remaining work

Production backup directory `/srv/seap/backups/notice-identity-20261009`: notice rows, verified source links, schema and tender task keys, with checksums. Backup completed and all three SHA-256 checks passed. Production collection is temporarily paused at revision102 for rollout.

The221saved source records were archived and replayed successfully in the isolated database (numeric raw-ID order, no source traffic).

Next: commit/push/verify deploy; replay retained raw participation lists, restore221known displaced sample notices from saved source responses; recover115missing2022awards and76detail failures; run resumable historical inventory reconciliation. Do not report the repair/deployment/recovery complete until verified. No historical sweeps have started at this checkpoint.

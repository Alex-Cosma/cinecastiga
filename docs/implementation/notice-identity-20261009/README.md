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

## Production verification — 9 October, 22:40 RO

Identity fix `e948a9c` is on main and live. CI/deploy37981465501 both passed;65migrations installed. The migration preserved all193,011existing notice rows.

Restored all221known displaced source notices using the checksum-verified saved audit responses, without source traffic. Replayed18,388retained participation list records under the deployment/processing lock. Final reconciliation: zero missing identities, zero mismatched notice numbers. Public ID100004524 now correctly has both `cn/CN1002119` and `rfq/SCN1002813`.

Recovery activated at controlrevision103:76failed detail tasks received a fresh manual attempt after their old state/retry budgets were preserved in `collection_audit`; all historical request attempts remain. Added the missing2022-04-21award list. Its two pages reconcile to115notices and are archived; their contract/form tasks are still running. Public maintenance and all rate/proxy settings unchanged. This does **not** resolve the separate publication/deduplication gate.

## Historical inventory implementation

Explicit `inventoryOnly` notice-list tasks have separate task keys, exact namespace-aware pagination, and retain every source list response. They compare against normalized identities before archival, recording matched/missing/unverified names. Contradictory identities stop before feeding normalization. Null legacy notice numbers are unverified, not matches. Missing list identities do not prove missing contracts.

These tasks do not automatically expand to forms, lots, contract inventories or PDFs. Normal daily recovery retains full expansion. Continuation pages preserve inventory mode; admin forecasting counts inventory pages without inventing detail work. Existing request gate, concurrency, retries, quiet window, operator pause and processing drain apply unchanged.

Tested218ingestion units,11isolated inventory/collector integration tests and8web recovery-status integration tests. Ingestion build/typecheck and web typecheck passed.

Next deployment adds this mode. Run the16partitionpilot (eight days, both families), verify exact results, then seed all5,844daily partitions for2018–2025. More pages are discovered from actual totals. Operations and read-only report are in `scripts/operations/20261009-notice-identity/`. No historical sweep has started at this checkpoint. A completed notice-list inventory must never be described as complete contract/form/DA/PDF collection.

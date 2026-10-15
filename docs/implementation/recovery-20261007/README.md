# 7 October: failed normalization and contract pagination

The owner authorized repairing the production incident now. Scheduled run `a089c12c-592d-4700-8749-77f24dcd17ee` started 05:00 RO, failed 05:32 during normalization, and correctly retained maintenance. Backup completed and was verified before normalization. A separate source block had begun at 02:46 for task 190888, request 51915.

## Confirmed causes and permanent safeguards

- Four award-contract envelopes (raw IDs 17438578, 17545919, 17556115, 17556311) attempted to enrich old SICAP winner profiles with valid CUIs already owned by canonical profiles. MEDI SENSE: typo `3324092`, canonical `33240921`, old entity 2276078 → 2071542. Wigstein: typo `273906673`, canonical `27390673`, old 2276333 → 2084714. Source SICAP keys and normalized names corroborate the two reviewed repairs; no fuzzy merge. The resolver now uses an exact existing valid CUI for the incoming record instead of assigning it to a placeholder. It does not silently move historical edges or overwrite valid conflicting identities. Reviewed redirects also apply during future invalid-CUI/foreign-key resolution.
- `GetCANoticeContracts`, notice 100646288, returned 201 rows for take 200. Two explicit, ledger-recorded maintenance probes (requests 51980, 51981, one healthy fixed proxy, 70-second spacing reservation, no retries/direct fallback) checked offsets 200 and 400. Page sizes 201/201/185, total 585; 587 returned rows reconcile to 585 distinct IDs. Two overlaps have complementary empty winner/lot fields. This is not simply an extra framework row on every page.
- Contract pagination retains offsets in steps of 200, permits at most one extra row, rejects within-page duplicates, retains stable totals, fills only empty winner/lot fields on cross-page overlap, and rejects conflicting facts. The combined envelope is archived only when distinct IDs exactly reconcile to total. Other endpoints retain strict pagination checks. No dropped records or silent skipping.
- Processing failures now write sanitized technical diagnostics to the private server log; public error wording stays generic.

## Validation

Nineteen targeted tests passed: 9 planner units, 3 entity-resolution PostgreSQL tests, 7 recovery-runner PostgreSQL tests. TypeScript and full Turbo (20 tasks) passed. Source traffic from these tests: zero.

[Targeted production-copy rehearsal](copy-validation.json): copied the affected public entities, source relationships, contracts, TED lots and dependencies into `seap_test_incident_copy_20261007`. Reviewed alias repair moves 36 SEAP winner associations and 88 TED winner associations; old profiles and frozen evidence remain. Four formerly quarantined envelopes replayed twice with stable counts, zero old references. This is a targeted stage rehearsal, not a full database/pipeline rehearsal.

[Actual-response pagination rehearsal](pagination-validation.json): all three captured pages successfully reconcile and produce one envelope containing exactly 585 contracts. Private snapshots and source payloads stay outside Git, under `/tmp/seap-recovery-20261007` locally and `/srv/seap/repairs/recovery-20261007` on the server.

## Recovery procedure and status

Runtime `5400f5c` deployed successfully (CI/deploy `37569432796`), followed by the reviewed recovery operations in `65cc86d` (CI/deploy `37571381653`). Recovery is complete; the dated evidence below supersedes earlier pending notes. Dated scripts under `scripts/operations/20261007-recovery` are incident procedures, never scheduled or onboarding commands. `run-recovery.sh` pins the deployed SHA, holds the deployment lock, verifies the original full backup checksum, requires the passed copy proof, stops drained workers, applies reviewed aliases and replays four source envelopes. Original quarantine rows, failed run and HTTP attempts are retained; resolution is audited. The three captured contract pages are archived offline without extra source requests, and only that exact source block is cleared.

A one-time manual **full** publication was necessary and completed because historical supplier identities, TED associations and existing signal references change. The ordinary daily/weekly schedule is unchanged. The new run freezes the current raw boundary, recomputes statistics and risk, validates the complete snapshot and search, then reopens only under the normal revision/checkpoint guard. Any error retains maintenance. Proxy settings and six disabled endpoints are unchanged.

## Additional preflight: approved publication fingerprints

Before applying either incident repair, the source guard reported all 16,090 stored member hashes stale (zero invalid decisions). The same mismatch reproduces on the 05:00 backup restored into a separate server database, `seap_test_incident_reference_20261007`; it predates this failed normalization. A sample's contract/award/cohort rows are byte-identical before/after normalization. The exact origin of that historical stored-hash divergence is not established. Runtime guards are **not** weakened or disabled.

Comparing recomputed fingerprints between that backup and current production found 30 additionally changed members after normalization. A sampled change adds source references and explicit currency/notice metadata while preserving the projected business identity. Independent `prepareIdentityRepair` re-verification passed on both the backup copy and current production against the original checksum-pinned evidence bundle and available current archives: 8,045 groups, 7,300 repeated contributions, 7,100,577,914.82 RON reduction, unchanged. The two entity repairs and five affected notices do not intersect approved members.

The dated `revalidate-dedup.mjs` requires those exact counts, original approved member identities, unchanged canonical choices and valid existing decisions. It updates only the source fingerprints after that verification, preserves old/new hashes in a private checksummed incident file, and audits a compact reference. It is never called by scheduled processing. [Copy validation](dedup-copy-validation.json) proves 16,090 members validate afterward and an intentionally changed contract value rejects revalidation. This is not blanket approval of changed source identities.

The entire initial operation script was also exercised against a separate isolated local fixture copied from the incident: two aliases, four replays, three reconciled completed page tasks, one archived envelope, a new manual full run and maintenance retained at revision 90. No extra source requests occurred. The final dated operation includes the independently rehearsed deduplication re-verification before applying those steps.

## Production recovery completed — 09:22 RO

Runtime and reviewed incident scripts `65cc86d` deployed through successful CI/deploy `37571381653`. Backup checksum passed. Reverification, two aliases and four replays applied; all three contract page tasks completed offline with 585 distinct contracts archived. Only the inspected pagination block was cleared. No proxy settings changed.

Manual full publication `c741d751-4d0d-46da-b9ea-14b865e2dbee` finished **ready**, 07:29:19–09:22:26 RO (1 h 53 min 7 s; the host procedure including repairs began 07:28:14). Frozen raw boundary: 17561344. Normalize processed the newly reconciled envelope with zero quarantine. All **13** publication checks passed; checkpoint **19** is ready, including all 16,090 approved publication members with zero stale fingerprints or invalid decisions. This certifies the implemented consistency checks, not completeness of SEAP or resolution of every excluded monetary record.

Measured stages: TED–SEAP reconciliation 10 m 9 s; general marts 3 m 52 s; risk calculation 65 m 46 s; transactions 12 m 51 s; Radiografie 9 m 55 s; final validation 1 m 2 s; search 5 m 3 s. Search verified 182,028 entity documents and 20,732,740 acquisition-title records. The normal schedule remains daily statistics at 05:00 RO and risk on Sunday at 05:00 RO.

Control revision **91**, maintenance **false**, paused **false**, no global source block. Public health, home, domains and both canonical entity pages return 200 without an error/maintenance fallback. Old profiles return 307 to relative canonical URLs: 2276078 → 2071542 and 2276333 → 2084714. No SEAP/TED winner references remain on the old profiles.

Collection and document workers restarted. By 09:29 RO, verification recorded 949 successful source requests after restart and one isolated response-body timeout (request 52009, proxy-40). The ordinary five-minute retry succeeded at 09:28:31 RO; task 190970 is complete and its retry is resolved. No global stop occurred. Existing 94 enabled proxies, six excluded bad endpoints, 200/minute ceiling, 10 concurrent requests and 35–45 seconds/IP are preserved. The rolling batch targets 6 October with daily follow enabled; it is still collecting, not marked complete.

[Production evidence](production-completion.json) includes stage timings, all checks, settings, repaired page tasks and HTTP results. Total explicit diagnostic SEAP probes for this repair: **two**; normal collection resumes afterward. Original failed requests, quarantine history, backup and private before/after fingerprint audit remain. Neither the dated operation nor the probes should be rerun. The ordinary local application database was not repaired or refreshed by this production intervention.

[Follow-up observations](FOLLOW-UP.md) record the unresolved historical fingerprint origin and a separate framework/call-off aggregation audit lead. They do not invalidate the completed, scoped repair.

## Follow-up: winner order on a later notice — 09:46 RO

Collection subsequently stopped on task 256792, request 55309, notice 100648909 (total 1041). This is a new source-pagination guard failure, not another normalization failure; checkpoint 19 and the public site remain ready. Three pages returned 201/200/200 rows, 600 distinct contract IDs. Overlapping contract 107959041 has identical full supplier records under their source IDs, but their array/caption order changes; empty lot captions are also filled. Values, dates and other facts are unchanged. The original overlap check was unnecessarily order-sensitive.

The planner now compares full supplier records by unique positive source IDs, and permits a changed caption only if both strings are exact permutations of the same complete supplier names. Names containing commas are handled as whole names, not split fragments. First-page ordering is retained in the combined envelope; original page responses remain available. Changed identities, metadata, amounts, dates, singular winner or nonempty lot facts still reject. Missing/duplicate IDs and unprovable captions do not gain relaxed treatment. Existing exact-total validation and final-envelope-only archiving remain.

[Saved-response replay and comparison](winner-order-validation.json): the real failed page succeeds offline, enqueues page 3 and archives nothing prematurely; a deliberately changed amount still fails. 21 planner tests and all 20 Turbo tasks passed. No source calls were made for diagnosis or validation.

`resume-winner-order.mjs` is a dated, single-use procedure, defaulting to dry-run. After deployment it requires revision 91, the exact failure, drained work and the pinned saved response. Applying it transactionally accepts page 2, queues page 3 and clears only this source block, preserving original diagnostics and auditing the change. No analytical rebuild or maintenance is required: remaining pages are normal collection and new archives follow scheduled publication. Winner-order runtime `bd30ff0` deployed through successful CI/deploy `37585207979`; dry-run passed, then the dated operation completed page 2 offline at revision 92. The next source page revealed a second assumption below.

### Surplus is not limited to one record

The next normal source request, 55358 (skip 600/take 200), returned **203 distinct rows** with no overlap against the first three pages; total remained 1041. The one-extra-row bound stopped task 256794. Four saved pages reconcile to 803 distinct IDs. This observation supersedes the initial one-extra-row assumption in the earlier repair.

Contract-page size is now bounded by the declared total, not an arbitrary surplus allowance. Requested offsets still advance by 200. Minimum expected page size, unique IDs within each page, stable totals, strict overlap equivalence and exact final distinct population are still required. Other endpoints retain their strict requested page size. No combined archive is emitted before full reconciliation. [Four-page offline replay](surplus-page-validation.json) passes; dedicated regression covers multiple surplus rows followed by overlap and rejects excess distinct contracts.

`resume-surplus-page.mjs` is a separate single-use procedure pinned to revision 92, task 256794 and request 55358. It accepts that saved page offline and enqueues page 4; the original failed diagnostics remain. Applied successfully at revision 93; the final 1041-record reconciliation is verified below.

### Follow-up recovery verified — 10:18 RO

Final runtime `3a5b23d` is deployed. CI in run `37585911462` passed, but its SSH deployment job failed before updating the remote checkout; the exact CI transport failure was not established (log endpoint requires repository-admin API access). The standard host `infra/prod/deploy.sh` was then run successfully, completing 10:16:18 RO; private log `/srv/seap/repairs/recovery-20261007/surplus-deploy.log`. Do not describe the failed GitHub deploy job as passed. No migrations were pending (62 applied).

Both dated recovery procedures passed their production dry-run and applied once. The second cleared only the exact surplus-page block, at revision 93. All six tasks are **complete**, with page sizes **201 / 200 / 200 / 203 / 211 / 41**; 1056 returned rows reconcile to **1041 distinct contract IDs**. One combined archive, raw ID **17564842**, contains exactly 1041 records, matching the source total. The later page with 211 rows confirms why a fixed one-extra-row allowance was inappropriate. Overlap consistency and full-population checks passed without discarding contracts.

[Final production verification](winner-order-production.json): collection resumed, 253 successful requests and zero failures observed after the second recovery; 5 in flight at the snapshot. No global source block, no maintenance/pause, health 200, checkpoint 19 remains ready. 94 proxies, ceiling 200/min, 10 concurrent and 35–45 seconds/IP remain unchanged. 22 planner tests and all 20 Turbo tasks passed after the final change. All recovery replay was offline; later pages were fetched by the normal collector under the shared budget. New archives follow the existing nightly publication schedule; no second analytical rebuild was run. Do not rerun either dated procedure.

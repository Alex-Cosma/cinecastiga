# 10 October: latest verified contract version, with source history

Owner approved: **latest verified version once; preserve version history**. Deployment and a backed-up full recovery are authorized by the preceding instruction to repair autonomously and reopen only after successful publication. This supersedes the9October policy hold. The independent historical collection pagination blocker is unchanged.

## Verified semantics

- Only previously approved economic identities enter automatic revalidation. Original publication fields must still match their saved evidence. New unrelated candidates are not approved implicitly.
- A version family shares exact official notice number, authority, procedure, acquisition type, CPV, contract number/date, currency and lot. Each member has a distinct publication and source contract ID. Every normalized amount/title/fiscal supplier ID is independently checked against all available archives, including the checksum-pinned historical bundle. Conflicting revisions under one source ID still fail closed.
- Changed amount/title/suppliers require unambiguous timestamped published notices and source modification evidence (`hasModifiedVersions` with positive `modifiedCount`, or the explicit addendum wording in the verified title). Modification counters are corroboration, **not** version IDs: historical copies can acquire a higher counter without changing their amount. Numeric source IDs never establish the latest changed version. Equal dates with different economic fields fail.
- Select the latest verified changed version chronologically, including decreases and supplier amendments. Identical copies of the same economic version may retain their existing stable representative; they have identical statistical fields.
- Two different records coexisting in one source publication are not collapsed by a partial key. The CAN1025198sibling104380499is independently verified and stays distinct. If a new amendment could belong to either coexisting record, the operation stops for review.
- Append-only observations and revision history preserve every previous decision, canonical choice, source membership and fingerprint. Source contracts/raw archives/private frozen evidence are not deleted or rewritten.
- A full transaction verifies every group before changing the registry. Existing identity quality checks still run in the pipeline, direct builders and final validation. A failed check retains maintenance.

## Copied-production verification

Frozen boundary18294756; copied cohort23,346contracts,327awards,372archived envelopes plus pinned historical bundle. All372current envelopes replayed through the real normalizer before revalidation.

- All8,045approved groups pass without exclusions;20,519source publications retained,4,425groups extended.
-34canonical representatives change to verified amended versions; the35thcandidate was the distinct coexisting record above.
- Zero stale members/invalid decisions; repeating is a no-op.
- Actual `runMarts` on the cohort:10,004eligible economic contracts,12,633supplier allocations,exact9,950,461,813.41RON. Every expected contract/allocation reconciles; zero differences.
- Constanța example: only108153641contributes57,143,904.29RON; older107338420/108116431remain accessible with49,781,431.91RON. The old page does not show the newer version's supplier allocation or competition fields as its own.
- Two web DBintegration checks cover duplicate-source URLs and amended-source/history/statistics behavior.
-14ingestion DBintegration checks cover real marts/TED, one-time repair, amendment evidence, source-date ties, value/source contradictions, canonical history/idempotence and maintenance/backup/revision guards.
-228ingestion units,406web units and10DBunits pass in the workspace suite.187optional webDB tests are skipped in that general suite, not claimed passed. Workspace20build/typecheck/lint/test tasks passed. The extra explicit DBsuites above are run separately.
- UI component inspected at390pxand1280pxin both themes, keyboard disclosure tested, no horizontal overflow. Existing styles retained; history is collapsed by default and opened when viewing an older economic version. The mechanical detector's type-size advisory was corrected to the existing15pxstep.

[Initial copied cohort proof](initial-copy-proof.json). This is not a whole-production snapshot validation; the full production pipeline/search gate remains required before reopening.

## Operations

Production morning run45928c24-9856-42d0-90b4-161286eb2c8afailed atidentity-quality, boundary18294756. Revision105,paused+maintenance+archivegate; source block542533. Migration0065is additive audit history; deployment alone does not change approved decisions or reopen.

Dated `scripts/operations/20261010-publication-recovery/run.sh` requires pinned deployedSHA, exact old revision/run/sourceblock, copied proof and a fresh read-only live source preflight. Creates one manual full run, drains/stops workers, takes a **new full backup+checksum**, then uses the ordinary processing CLI, snapshot validation, search validation, health and reopen gates. Failure retains maintenance. No source HTTP traffic, rate change, collector unblocking or historical repair-marker reset. Do not rerun after an attempt; inspect run/audit first.

Next normal schedule remains daily05:00RO /Sundayrisk. Full recovery now is necessary after failed partial publications. A successful reopening keeps collection paused/blocked independently.

## Current state

**Code deployed and recovery running, not yet published.** See the latest operational checkpoint below. Earlier sections describe their respective copied datasets; the refreshed live-state proof supersedes the initial counts.

### Release check, 07:22 RO

Commit035050eis onmain. First Actions run38023675065passed host checks but failed the web build; deploy was skipped, so production was unchanged. GitHub's public annotations only expose the failed build command; detailed job logs require authentication. A fresh local production web build of the same committed source passed completely. This does not establish the CI failure's cause. Repeating CI through this recorded verification update; no bypass of deployment checks.

### Live preflight and refreshed cohort, 10 October morning

CI and deploy38023871947 succeeded for b1e265c; all66migrations applied. The first recovery attempt stopped **before claiming or changing data**: morning normalization had materialized more of the archived data than the9October copied cohort. This is why a fresh live preflight is mandatory. The same raw boundary18294756 now has24,279contracts,338awards and394archived envelopes in the affected cohort.

A new isolated local copy (`seap_test_currency_publication_20261010`) was exported read-only from that exact normalized live state. All8,045groups pass;21,241publications retained;4,465groups extended;37canonical versions updated;zero stale/invalid decisions;repeat is a no-op. The three additional amendments have source-verified changed amounts: CAN1121795 decreases483,837.35→480,786.57; CAN1132215 increases933,939.24→962,556.07; CAN1042407 increases1,509,308.44→1,623,146.18RON. Existing sibling104380499remains distinct.

Actual cohort marts reconcile all10,214eligible economic contracts and13,196supplier allocations, exact10,129,056,141.84RON, with zero differences. [Refreshed exact-state proof](copy-proof.json). This copy intentionally verifies the normalized live state; the earlier real-envelope replay and integration tests remain separately recorded above.

The dated claim now pins these refreshed counts and checks copy/live boundary, membership and canonical-change agreement. Initial failed preflight/claim log is preserved; no run-id or audit claim existed. Full production backup, processing and final publication validation still required; the collector remains blocked independently.

### Production recovery running — 10 October, 07:38 RO

CI **38024557775** and deploy both succeeded; server checkout **4f4137f0d10598d20eaec0fdd7891ffb8110bc94**,66migrations. The repeated live preflight matches the refreshed copy:8,045groups,21,241publications,37canonical changes, boundary18294756. No source HTTP requests were made.

Manual full run **4e67b730-618a-4182-9310-fe97356c68bc** was claimed successfully and is **running at backup**, heartbeat04:38:36UTC. Controlrevision106,maintenance=true,paused=true,collection_during_maintenance=false; source block542533preserved. Collection and document workers are stopped during processing. The host recovery started04:37:26UTC under `nohup`, with deployment lock held. It continues independently of the local terminal.

- Durable log: `/srv/seap/repairs/publication-20261010/run.log` (includes initial pre-claim rejection and the successful second attempt).
- Run identity: `/srv/seap/repairs/publication-20261010/run-id`.
- Backup: `/srv/seap/backups/processing/4e67b730-618a-4182-9310-fe97356c68bc/database.dump.partial` until complete; verified dump/list/SHA256 thereafter.
- The prior morning backup took about18minutes; the full rebuild previously took roughly1.5–2hours. These are historical observations, not a completion promise.
- Public pages must still return503 now. The ordinary finish gate reopens only after ready snapshot, verified search, restart/health and unchanged operator revision. It preserves the independent source pause/block.

**Continuation:** inspect this exact run and log; do not start another recovery or clear run-id/audit. If failed, inspect the failed stage and diagnostics, retain maintenance, repair only after validation. If ready, confirm `stage=complete`, `search_verified`, latest monitoring checkpoint ready with all checks passed, controlmaintenance=false/paused=true/sourceblock542533 unchanged. Verify `/api/health`, `/intreaba`, `/domenii` and old/new contract107338420/108153641routes, including49,781,431.91vs57,143,904.29RON history. Then record actual timings/results here. No final production publication validation has yet been observed at this checkpoint.

Ordinary local application DB is unchanged. Isolated copied DBs, logs and UI screenshots remain in `.local/publication-recovery-20261009/` and `.local/publication-recovery-20261010/`. Temporary scoped export was deleted from the server after the refreshed local copy passed. No production account/session data were exported for this verification.

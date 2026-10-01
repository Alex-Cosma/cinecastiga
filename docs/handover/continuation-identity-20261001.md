# Identity repair handoff — 1 October 2026, 18:37 Romania

> Historical implementation/checkpoint notes. The [live publication report](../implementation/entity-identity-release-20261001.md) supersedes the operational states below. Do not restart jobs based on this document.

**Resumed after owner reset the usage budget. Update18:43RO:** preview rebuilt on
b7b9061; clone maintenance cleared (still paused, processing disabled). All
**24 public browser/navigation/data checks passed**, including query retention on
Radiografie, old/canonical Ask and source rows, six profiles, derived pages,
search and unchanged official links. Browser/API errors:zero. Actual
`preview-checks.json` copied to server; `release-validation.json` generated from
the real proof/search/browser artifacts. Next:merge/deploy and guarded live
publication. Older “browser checks pending/no marker” statements below are the
historical handoff checkpoint, superseded by this update. No copy job rerun.

**Read this before older “active operation” notes.** The owner asked for a quick
handoff because the model's remaining credit budget is low. The task is not
finished. All expensive copy jobs have now finished successfully; do not rerun
them. Production is still unchanged and serving normally.

## Goal and authorization

Repair the historical authority identity error systematically, not merely hide
Cluj duplicates. Accepted sequence: archive audit, importer fix, isolated pilot,
complete-copy repair and rebuild, public navigation validation, then guarded live
publication with fresh backup and maintenance. Preserve exact source records,
old URLs/questions, distinct fiscal identities and frozen investigation evidence.
No renewed approval is needed for the accepted scope. Do not start the live
repair before the remaining browser checks pass.

No SEAP/TED HTTP requests were made for this repair. The existing production
collector has continued independently. Do not change its operator settings.

## Git and environments

- Workspace `~/Desktop/Personal/code/seap`.
- Branch `fix/historical-authority-identities`, pushed through **b7b9061**.
- Earlier feature commits:22c186d,96388a2,aaf7b83,cd83bf2.
- Main/origin main and live checkout are still **b293eea** at this check.
- No merge to main, deploy or live procurement repair yet.
- Ordinary local database `seap`: migration0046 applied properly, redirect table
  empty; procurement data is still unrepaired. Do not confuse it with the copies.
- SSH `cinecastiga`, live checkout `/srv/seap/src`, compose `infra/prod`.
- User's local dev port3000 and mock server4185 remain running; don't stop them.
- Local pilot preview3013 was stopped after successful tests.

Pending working-tree changes from earlier work must be preserved:
`.impeccable/surfaces/signal-citation-mockup.md`, `mockups/signal-citation/README.md`,
`.impeccable/critique/2026-10-01T11-47-43Z__apps-web-app-cauta-topicsearch-tsx.md`,
`docs/reviews/user-journeys-20261001/`; HANDOFF.md and roadmap also contain earlier
user decisions and audit updates. Do not indiscriminately stage/drop those files.

## Root cause and validated results

The old DA importer treated numeric authority prefixes as SICAP participant IDs;
the archive uses fiscal identifiers. Original BSON dimension + source rows prove
the repair, independently of already-polluted core mappings.

- Entire archive:4,781,249 unique DA rows,15,842 raw authority strings.
- 4,746,926 rows corroborated by CUI and normalized name in original dimension.
- 34,323 rows/313 unresolved groups remain unforced; name alone never merges IDs.
- Complete repair plan: **4,231,642 rows**,14,536 old IDs.
- Complete server copy: **14,264 verified aliases**;2,414 old UAT mappings archived
  and removed,3 canonical mappings added; conflicting mappings would abort.
- All non-authority fields, sums, counts and fingerprints conserved. A second
  application changes **zero** rows. Original entities/old evidence remain.
- Cluj `2147251 → 2146445` (CUI4305857, genuine SICAP1226). Canonical profile now
  has5,953 accepted DA and569 procedural contracts in the copy.
- Cluj `2165580`, CUI14920794, is distinct and stays separate:102 DA/4 contracts.
- **231 rows were on a real wrong institution**, not a dummy: museum2130379,
  CUI9486029, actual SICAP201802. Source prefix201802 is the CUI of institute1986102,
  genuine SICAP11137. Correct only the rows; preserve museum's actual identity and
  SICAP mapping. Examples DA102321228/102310351/102212038. Correct institute now has
  1,124 accepted DA; museum has no authority mart after correction but still exists.

## Finished validation jobs — DO NOT RELAUNCH

### Complete server copy

Private directory **`/srv/seap/backups/identity-repair-20261001/`**, mode700.
Database **`seap_test_identity_full_20261001`**. Full snapshot includes private app
data: keep on server, never Git or local/public export. Snapshot~6.6GB with SHA256.
Migration0046 was applied manually to this COPY schema, not its journal; never
promote the copy as the live database.

`apply-copy.sh` completed apply→verify→apply(0 changes)→verify→aliases→verify→full
pipeline. Full pipeline began16:27:31.687RO and ended18:15:13.459RO (**1:47:41.772**),
raw boundary17363865. Every full snapshot check passed.

- Ready checkpoint **5988d154-8e40-4616-b71c-d6a1d881a784**.
- Markers `rows.ready`, `refresh.ready`, `search.ready`; no failure markers.
- `search-copy.sh` also finished at18:22:07RO; no watcher remains to restart.
- `search-report.json`:20,588,021 topic records;180,979 Meili entity documents.
- All row/transaction/profile/topic/redirect discrepancy counts are **zero**.
- Eight representative profile/core/transaction comparisons passed.
- `plan-proof.json`: plannedRows=`4231642`, aliases=`14264`,
  planFingerprint=`-27804067446331219630579` (strings).
- Logs `apply-copy.log`, `search-copy.log`, report `search-report.json`.

### Local partial full-row rehearsal

`seap_test_identity_repair_20261001`: schema complete but data only entities,
SICAP/CPV/UAT and20,795,132 DA. Apply, global verify, idempotent apply all finished.
No local repair job remains running. Logs in `/tmp/seap-identity-audit-20261001/`:
`full-apply.log`, `full-verify.log`, `full-idempotence.log` (`INSERT 0 0`).
Do not derive aliases from this partial copy: omitted source tables cannot prove
absence of other roles. Full-copy aliases were validated on the server instead.

Pilot database `seap_test_identity_pilot_20261001`:1,569 corrected Cluj rows,
1,388 accepted; separate CUI preserved, conservation/idempotence passed. Five
actual307 redirects passed; `route-checks.json` records exactly which parameters
were tested (the pilot Radiografie URL had no query parameters).

## Immediate next step: updated preview + browser checks

Containers on server:

- `identity-preview-web`: **still image `cinecastiga-identity-preview:aaf7b83`**,
  loopback127.0.0.1:3014→3000, networkcinecastiga_default, memory1GB/cpu1.
- `identity-preview-meili`: separate index/key, no public port.
- Separate checkout `/srv/seap/identity-preview-src` still aaf7b83.
- Private env files in the report directory: `preview-web.env`,
  `preview-meili.env`, `preview-meili.key`. Never print their contents.
- Web env points explicitly to clone DB/isolated Meili, new auth secret, SMTP
  blank, DOCUMENTS_ENABLED=false. Retain that isolation when recreating web.
- Clone has web grants and explicit CONNECT for seap_web. Earlier503 due missing
  CONNECT was fixed; health200 alone doesn't prove DB connectivity.
- Clone maintenance is **explicitly true**; paused=true, processing_enabled=false.
- SSH tunnel local3014 from exec session3354 was left running. Verify/recreate if
  needed: `ssh -N -L127.0.0.1:3014:127.0.0.1:3014 cinecastiga`.

1. Fetch feature branch in isolated preview checkout and build the web image
   from **b7b9061 or the current branch tip** using `infra/prod/Dockerfile.web`.
   Recreate ONLY `identity-preview-web`, same private env/network/loopback binding.
   The latest tiny fix preserves query parameters on `/radiografie` redirects.
   Typecheck passed, but this fix has not yet been built into the preview.
2. Verify actual `refresh.ready`/`search.ready` and report/checkpoint; then set
   `maintenance=false` **ONLY in seap_test_identity_full_20261001**. Keep paused
   and processing_enabled unchanged. No action on production control.
3. Run local prepared script:
   `node /tmp/seap-identity-audit-20261001/verify-preview.mjs`.
   It uses installed Playwright Core and local Google Chrome. It checks nine
   redirects with query parameters, old/canonical Ask answer and source drawer,
   search, six public profiles, actual Radiografie/links/comparison destinations,
   two DA pages and exact unchanged SEAP links (does not open SEAP), browser errors.
   It writes `preview-checks.json`, `preview-cluj.png`, `preview-search.png` only
   after success. Inspect/fix any actual failure; do not fake a success artifact.
4. **No `release-validation.json` exists yet.** After actual browser success,
   copy `preview-checks.json` into private server reports, and create this release
   marker from real search-report/plan-proof/manifest/browser artifacts. Required
   fields:status=`validated`,routesPassed=true,checkpointId,proofFiles (manifest
   files object),plannedRows,planFingerprint,aliases. Record checked SHA/date too.
   Coordinator refuses to run without it; never fabricate it to skip validation.

## Then finish the authorized release

Read `scripts/identity-repair/README.md`, `publish.sh`, `publication*.mjs`, and
`docs/handover/05-operations.md` before live changes.

1. Final review/commit, fetch main for concurrent changes, merge feature to main
   and push (CI→automatic deploy). Preserve unrelated dirty files. No `gh` CLI
   installed; public GitHub Actions API was used previously.
2. Verify BOTH CI/deploy, actual server SHA, migration0046 in the genuine journal
   (47 migrations expected), health/public endpoints/workers. Deployment alone
   does not repair rows: empty redirects make code backward compatible.
3. Reinspect live control; last verified18:37RO:revision24,paused=false,
   maintenance=false,blocked_reason=null,delay40–60s,processing_enabled=true,
   daily05:00RO,risk_weekday0(Sunday). Preserve them, including source blocks.
4. Tell owner before beginning maintenance. Run the explicit dated coordinator
   on SERVER, pinned FULL deployed SHA, with private logs/nohup:
   `bash scripts/identity-repair/publish.sh prepare <sha> <inspected-revision>`
   then `publish <sha>` only after successful prepare; inspect verified report
   before `reopen <sha>`. This is not a cron command or migration hook.
5. Coordinator uses common deploy lock, pauses+maintenance, drains source/docs/
   queued or running captures, waits3quiet observations, stops source workers,
   pins boundary, fresh full backup `-Fc -Z1`+checksum/list, exact copy plan
   fingerprint, repair+aliases+conservation, FULL rebuild+both indexes+validation.
   Private live directory **`/srv/seap/backups/identity-live-20261001`** does not
   exist yet. Guarded Python live mode accepts only this fixed path/DB/container
   and explicit dated env; do not bypass it with ad-hoc SQL.
6. Any error retains maintenance. Private report/log now stores sanitized error
   detail. Inspect artifacts; existing directories deliberately prevent blind
   reruns. New backup is rollback source. Never reopen over stale marts.
7. Reopen restarts web/cache and workers while paused, validates exact checkpoint
   and unchanged revision, restores previous pause while retaining source blocks.
8. Verify public old URLs, corrected profiles/search/sources and worker settings.
   Same browser script supports `IDENTITY_CHECK_BASE=https://cinecastiga.ro` and
   writes separate `production-*` artifacts. Do not run until live is reopened.
9. Document actual release SHA, runtime, checkpoint, remaining unresolved groups.
   Ordinary local DB and prior onboarding dump still need separate explicit
   treatment; don't claim they were repaired by the production publication.

Expect substantial remaining wall time: copy full pipeline alone took1h48,
plus fresh backup, core repair, search and final tests in live. Don't promise a
five-minute finish or confuse code deployment with completed data publication.

## Code and tests already complete

Importer resolves historical fiscal IDs correctly and doesn't create orphan IDs
on replay; strict BSON framing and audit manifestv2. Redirect table/function with
cycle/chain prevention; canonical IDs across profiles, Ask, peers, connections,
drawers, monitoring and recaptures. Existing saved JSON/captures aren't rewritten.
Captures now use publication gates and actual checkpoint risk methodology.

Passed:101 ingestion units;8 reader/classifier cases; real importer integration;
364 web units (148 DB cases skipped in default run, not claimed passing);
2 real identity integrations;9 real capture integrations including100,001rows and
immutability;6connection and12peer capture integrations;8 DB units;20 deploy/
scheduler tests; Python safety regression; real publication-control rollback
test; typechecks and production builds (through aaf7b83); latest b7b9061 typecheck.

Fixture DB **seap_test_identity_import** is for destructive fixture tests ONLY.
Never point those tests at real-data copies or `seap`. Do not run a fixture write
and Python template-copy test concurrently; they share the fixture template.
Do not edit already-applied migration0046/checksums.

## Safety, paths and later cleanup

- Read `docs/implementation/entity-identity-repair.md` for detailed history and
  `docs/reviews/entity-identities-20261001/report.md` for original diagnosis.
- Local proof bundle `/tmp/seap-identity-audit-20261001/verified-v2`; pilot bundle
  sibling `pilot`. Old manifestv1 is superseded.
- Server retains snapshot.dump+checksum, schema/row proof and all private logs.
  Extra duplicate `/tmp/identity-repair-20261001.dump` inside PG container can be
  removed later only after confirming retained verified snapshot. Disk760GB free
  at last measurement; no urgency to delete unrelated backups.
- Stop owned preview containers/tunnel only when no longer needed; preserve copy
  and rollback evidence as appropriate. Never stop user's dev/mock servers.
- Shared source budget/file minimum60s/quiet02:59–03:30/retries5min then10min are
  unchanged. No automatic PDF collection, no emails, no accounts modified.
- When piping SQL via SSH use `docker exec -i`; without it stdin is discarded.
- Source request URLs/tokens, env files, dumps/private contents never belong in Git.

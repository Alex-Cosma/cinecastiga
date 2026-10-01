# Identity repair — live publication, 1 October 2026

**PRODUCTION DATA REPAIR COMPLETE. Site reopened at21:18:46RO.**
Do not rerun this dated repair. The logs below preserve the actual sequence,
including the recoverable search initialization failure. All24 public browser checks passed at21:19:24RO, with no browser/API errors.
Permanent index initialization fix **c6763f3** is deployed; CI and deploy
**36906296990** both succeeded. Verified checkout and built collection module.

-4,231,642 authority associations corrected;14,264 verified aliases; conservation
  and final projection checks all passed, zero discrepancies.
-Checkpoint11 (`1b4d434e-7f8a-464f-959b-706940c397fe`) ready,11 snapshot checks passed;
  full pipeline1h52m21.939s. Search20,588,242 records /180,979 entities verified.
-Publication validated21:17:46.315RO after bounded search recovery. Maintenance
 18:47:38–21:18:46RO (approximately2h31m08s including backup, repair and recovery).
-Control revision26,paused=false,maintenance=false,no block;40–60s operator
  budget and daily05:00RO / Sunday risk unchanged. First resumed collection
  request6350 succeeded200 at21:18:50RO; no manual SEAP requests used for repair.
-Local ordinary database and previously exported local bundle are **not repaired**.
  Migration0046 alone does not repair data.313 unresolved archive groups remain
  unforced; distinct CUI14920794 and the real museum institution remain separate.
-Private backup/audit/proof retained on server; frozen private evidence untouched.

## Verified prerequisites

- Full isolated server-copy repair/conservation/idempotence/aliases passed.
- Full pipeline1h47m41.772s, checkpoint5988d154-8e40-4616-b71c-d6a1d881a784 ready.
- Search20,588,021 topic rows /180,979 entities, all identity comparisons passed.
-24 actual browser/API/navigation checks on previewb7b9061 passed; no browser/API
  errors. Report and source validation marker stored privately on server.
- Main and production code **663cc2760031b736c2459a7c25b190b7bf4155ab**.
- GitHub Actions **36886537522**: both CI and deploy succeeded.
-47 genuine migrations; redirect table empty before live repair; profile/health200,
  anonymous admin API403; workers running, source requests succeeding.

## Live operation started

`publish.sh prepare` launched via nohup, PID**1134651**, inspected revision24,
pinned663cc2760031b736c2459a7c25b190b7bf4155ab. Private directory
**`/srv/seap/backups/identity-live-20261001/`**. Launcher log sibling
`identity-prepare-launch-20261001.log`, main log `prepare.log`.

Before state:paused=false,maintenance=false,blocked_reason=null,delay40–60s,
daily05:00RO,risk Sunday,processing_enabled=true. Preserve settings/source blocks.
Owner was told maintenance begins and estimated2–3hours, including backup and
full recalculation. No automatic PDF collection or extra SEAP requests.

Prepare began **18:47:38RO**. Maintenance503 confirmed; source/document workers
drained and stopped. Frozen boundary:revision**25**,rawBoundary**17364352**,
lastRequest**6349**. Before checkpoint85f6f2d2-a097-4073-9261-29ec1d1d82cc.
Backup completed **18:56:44RO**,6.6GB, archive list+SHA256 saved, genuine `prepared`
marker. Prepare finished successfully; no longer running.

**Publish launched next**, PID**1139018**, same pinned SHA, launcher log
`/srv/seap/backups/identity-publish-launch-20261001.log`, main `publish.log` inside
live directory. Do not rerun prepare or publish. Follow stage/log/failed/validated
markers; reopen remains a separate action after successful validation.

At19:02RO, live audit/plan fingerprint checks passed and the transaction updating
4,231,642 authority associations is active (`WITH changed AS ... UPDATE ...`).
Schema/manifest and baseline are staged; no failure marker. Do not repeat phases.

At19:10RO, apply committed **4,231,642 rows**. First full conservation verification
is running; aliases and rebuild are subsequent coordinator phases. Live core is
now corrected but marts/search are stale, so maintenance MUST remain active.

First conservation check passed; **14,264 aliases** applied and checked against
copy count. Second full conservation check active at next observation. No failure
marker. Public maintenance still required until complete rebuild/search validation.

**Full live rebuild started19:15:16.830RO**, container
`cinecastiga-processor-run-040e79799f22`. All repair/conservation/alias checks passed.
`report.json` now tracks stage/status; normalize finished with zero quarantined
records (award-list355,award-contracts451,DA-list1086; others0). Reconcile began
19:15:34RO. Await full pipeline, both indexes and final identity checks; do NOT
start another processor or reopen on an intermediate ready database marker.

Reconcile completed; TED mart completed; **marts stage began19:30:30RO**. No errors
at this checkpoint. `report.json`/`publish.log` are authoritative for later progress.

Marts completed:182,668 role profiles,567,916 top-partner rows,1,110,721 procedural
transaction rows. **Flags began19:34:26.323RO**. This is the long stage (the copy
took roughly an hour for flags). Await it; do not relaunch or reopen early.

Later observation: the individual-acquisition threshold query finished and the
CPV/year/partner grouping query for slicing is active. No error/failure marker;
control remains revision25,paused=true,maintenance=true. Documentation checkpoint
9037367 was pushed with `[skip ci]` only; runtime/server remain pinned663cc27.

Flags finished20:41:13RO; flag-marts finished20:42:12RO. Transactions stage active
from20:42:12.440RO. Counts so far:172,740 entity_flags,84,258 flag_instances,
19,529 concentration rows,567,916 top-partner rows. No errors. Still wait for
transactions/Radiografie/coverage/complete validation/search/identity checks.

Transactions finished; **Radiografie began20:55:34.825RO**. `notice_meta` and
supplier_dependency finished normally; the “relation already exists, skipping”
message is an expected PostgreSQL NOTICE, not a failure. Report still running.

All pipeline stages and **11 complete snapshot checks passed** at
**21:07:38.839RO**. Checkpoint **11**, **1b4d434e-7f8a-464f-959b-706940c397fe**,
ready; pipeline duration **1h52m21.939s**. Methodology rf-2026.6 /
Europe/Bucharest-v1, zero profile/signal/source membership discrepancies.
Search began21:07:38.850RO; publication still requires both indexes and final
identity verification. Checkpoint10 is the intentional pre-repair invalidation,
not a failed attempt at this full rebuild.

## Search validation interruption and bounded recovery

At21:13:38.792RO publication stopped safely at search validation. All180,979
entity documents were present, no indexing active; the only failed task was191,
`indexCreation` / `index_already_exists`. The existing importer called
`createIndex(...).catch(...)` even for an existing index; Meili acknowledges
creation asynchronously, so that catch cannot catch the later failed task.
The isolated preview had a new index and therefore did not expose this path.
No procurement data or pipeline validation failed; maintenance remained active.

The importer now checks index existence, creates only on `index_not_found`, and
requires successful completion for creation/deletion/settings/document tasks.
Six regression tests and ingestion build passed. Dated `recover-search.mjs`
accepts only this precise failure/checkpoint/task, preserves the failure report,
reindexes entities with the corrected module, checks the existing topic index
against transaction populations, and repeats all final identity/boundary checks.
It cannot reopen the site. Recovery was started once under the deploy lock,
PID1188450, private `recover-search.log`; no full recalculation repeated.

Recovery and reopening succeeded. Original failure evidence remains in
`report-search-failure.json` and `search-diagnostic.json`; successful recovery
archived the failed marker as `failed-search-recovered`.

Full prior context: [handoff](../handover/continuation-identity-20261001.md)
and [procedure](../../scripts/identity-repair/README.md).

## Public verification and cleanup

All24 actual production browser/API checks passed at21:19:24.604RO:
five city profile redirects plus four Cluj subroutes preserve query parameters;
old/canonical Ask results and source rows match; search includes the canonical
Cluj and excludes its erroneous fragment; six profiles and three derived routes
render; two acquisition details point to the corrected authority and unchanged
SEAP links. Screenshots visually inspected; no browser/API errors. Health and
public page200, anonymous admin403. Public report copied to the private live
audit directory. No SEAP link was opened by these checks.

Preview web/Meili containers removed and local3014 tunnel stopped. Full private
copy/backup/proof retained. Ordinary local dev3000/mock4185 left untouched.
Ingestion107 unit tests and TypeScript build passed, including six new Meili
initialization/task failure regressions. Earlier integration/copy/publication
checks are recorded in the implementation/handoff documents; do not report
skipped default database tests as passing.

The temporary6.6GB dump inside the PostgreSQL container was removed only after
its SHA256 matched the retained full-copy archive. Both private host backup
archives remain. Normal collection requests6350–6355 succeeded after reopening.
Permanent search fix pushed as **c6763f3712e3005beda2cce4065f5050a7efbc2c**;
GitHub Actions36906296990 is the corresponding final CI/deploy run.

Final deployment verification: checkout **c6763f3712e3005beda2cce4065f5050a7efbc2c**,
CI/deploy **36906296990** both successful; corrected `getIndex`/task-success code
present in the deployed collection image. Web healthy, checkpoint11 still ready,
control revision26 unchanged, requests6357–6359 success200. No pipeline or repair
rerun during this ordinary deploy. Any later documentation-only commit uses
`[skip ci]`; deployed runtime remains c6763f3.

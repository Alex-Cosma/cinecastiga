# TED production source recovery — 27 September 2026

**Repair/rehearsal completed and schedule activated. See the latest verified status below; older pending notes are historical. The subsequent collector schema fault is resolved; see the completed follow-up at the end.**

Work in progress. User authorized resolving the missing historical normalization baseline. Start on the isolated production clone; never replace the public dataset with a partly repaired snapshot.

## Verified source inventory

Production and local manifests of `(notice ID, publication number, raw ID)` are byte-identical: 161,633 notices. Every local notice has normalization version2 and its original raw source; production has versionNULL and no historical TED raw rows.

- eForms:62,294 original records.
- F03:99,339 original records.
- Raw IDs range16,071,606–17,129,558, below production's active raw sequence.
- Original payload, source, endpoint, external ID, content hash and fetched-at timestamp are preserved. No TED/SEAP requests are required for this recovery.
- 14,638 legacy notice identifiers retain leading zeros that the archive's external ID omits. Canonical comparison strips leading zeros for validation only; stored identifiers are not changed. No remaining publication identity mismatch after canonical comparison.

Local binary COPY export of referenced TED source rows only: `/tmp/seap-ted-repair-20260927/ted-raw.copy.gz`, transferred to `/srv/seap/backups/ted-raw.copy.gz`.

SHA-256 verified at both ends:

`70bd913b219b8e44757f9b7becf9df1370c04960d9cd0d80ea16f4846eeb332b`

The compressed file is approximately1.3GiB. XML expands substantially during PostgreSQL import. The exact original production manifest is alongside it as `production-manifest.csv`.

## Guarded recovery

The staging table `repair_20260927.ted_raw` was fully loaded and restored into `seap_benchmark_20260927`. The SQL in `scripts/operations/restore-ted-archive-20260927.sql` requires the exact notice population, valid TED source/endpoint/XML/hash fields, complete notice-to-source coverage, no conflicting existing raw IDs and an already-safe raw sequence. It restores source rows transactionally, retains the sequence and ingestion cursors, and supports an identical rerun.

`ted-repair-command.mjs` is an adapter for existing replay/reconciliation CLIs. It requires an explicit isolated benchmark database name and does not permit the live database. Mount it under the collection image's ingestion `dist/scripts` directory. The pilot uses `63449-2026` (eForms) and `274263-2019` (F03), then compares lot-field hashes and canonical winner identities with the already-normalized local records. Both pilots passed: all lot fields and canonical winner identities matched the already-normalized local dataset. Full replay and all-notice lot signatures passed. The complete coordinated refresh finished at16:21Bucharest with all10checks passing:2,541,752crosswalk links,362,014matchedSEAPcontracts and155,997contractcompetitionrecords. Livepublication is inprogress.

## Publication

User explicitly chose application immediately after clone validation. Live maintenance began at 16:27:48 Bucharest. Collection is paused; production has received the complete original archive and replayed all 161,633 notices. All-notice lot signatures match the local normalized reference. The live coordinated refresh is in progress, so the repaired dataset is not yet public. Normalization, reconciliation, dependent reporting tables, consistency validation and search readiness must all succeed before reopening. The full earlier benchmark took 94m29.510s and failed only the missing TED normalization check; it is a prior measurement, not a validation of this repair.

Future processing direction requested by the user: daily new-data normalization/reconciliation/statistics/Radiografie/search, with full historical risk recalculation weekly. This requires distinct risk freshness and snapshot validation; it is not yet implemented and does not weaken the current repair checks.

This one-off repair runs the existing full coordinated pipeline, including all risk calculations. Corrected TED competition data affects dependent analytics, but the unrelated direct-acquisition risk stages also rerun because the current pipeline is monolithic. This is not activation of nightly risk processing. At 17:42 Bucharest, live reconciliation had finished and the TED reporting-table stage had begun; risk calculation had not yet started.

## Running coordinators and failure behavior

- Clone coordinator: `/srv/seap/backups/run-ted-clone-repair-20260927.sh`; its log is the same path with `.log` in place of `.sh`. It uses two bounded replay batches, compares per-notice lot signatures for all 161,633 notices, then runs the full coordinated refresh and validation. Success writes `clone-validated`; failure writes `clone-failed`.
- Live coordinator: `/srv/seap/backups/apply-ted-repair-20260927.sh`; log `/srv/seap/backups/ted-live-repair-20260927.log`. It waits for the validated clone, locks deployments, requires unchanged operator state, enables maintenance and pauses collection, drains workers, and takes a fresh full backup. It then imports/replays/verifies the archive, updates canonical legal eras without overwriting calibrated statistical settings, performs the full refresh, verifies search task outcomes and document count, and restarts the web application before reopening. Any failed stage retains maintenance; later administrator changes prevent automatic reopening.
- Evidence directory: `/srv/seap/backups/ted-repair-20260927/`. `clone-validation.json`, `live-validation.json` and `live-ready` establish completion; mere process/container exit does not.
- Frozen image: `cinecastiga-ted-repair:20260927`, tagged from deployed7a4af4e. One-off overlay limits the repair container to2CPU/2GiB. These dated scripts are operational records, not a recurring scheduler.
- SQL and shell/Node syntax checked. The live wrapper was tested to refuse execution while production was outside maintenance; guarded start/reopen SQL was EXPLAIN-checked without applying the mutations. No extra source requests were made.

The UI extension documents policy and shows the live file queue independently; see [admin implementation](admin-document-queue-20260927.md). Do not interpret a successful UI deployment as evidence of repaired historical data.

## Connection cleanup correction

The validated clone CLI remained open during pool cleanup. Its only remaining database connection was idle, outside a transaction, with no advisory locks. The postgres.js default connection lifetime had elapsed while the publication connection was reserved. Terminating only that verified idle connection allowed a normal exit and report finalization; no data checks were bypassed and no calculation was repeated.

Monitored CLI, coordinated refresh, and shared ingestion pool shutdown now use a10second cleanup bound after work and gate release. A real PostgreSQL regression forces lifetime expiry during a reserved session and verifies the finished work result and disappearance of the connection. The pinned one-off live repair image uses `max_lifetime=0` in its isolated wrapper/children to prevent expiry during these long stages, without changing processing logic. Live maintenance started at16:27:48; the fresh backup began at16:30:19 after worker drain.

## Verified production status — 27 September, 20:39 Bucharest

TED repair completed and the site reopened at **19:18:19 Bucharest**. All 161,633 notices normalized, zero pending, all ten snapshot checks passed. Full recalculation took **1h47m49s**, excluding archive repair/backup/search; the maintenance interval was **2h50m31s**. Search verified 194,519 entities. The initial release through8997ded passed CI/deployment (run36332770987).

The isolated daily rehearsal passed all ten checks in **41m15.247s**, excluding risk fingerprints, backup and search. Core flags, entity risk profiles and saved risk samples retained identical counts and dual fingerprints, and retained the original risk provenance. No source HTTP or live search writes were performed by this rehearsal.

The continuation installed cron and proved the disabled heartbeat, but its activation SQL did not run: a Compose command inherited the SSH script input. The postcondition correctly detected that the schedule was still disabled. The runner and caller now detach command stdin; the host regression passes caller input and ensures it never reaches the container. The preserved failed continuation report is historical evidence, not proof the repair or rehearsal failed.

Activation SQL was applied separately and committed at **20:38:18 Bucharest**, audited as a settings change. Enabled: daily05:00 Europe/Bucharest and Sunday risk. Next daily: **28 September05:00**; next full risk: **4 October05:00**. Existing cron jobs and the50–70second budget are preserved.

**Separate unresolved collection stop:** after reopening, requests772–776 succeeded. Task36017 (participation notices,26July2026,page0) failed at19:21:52 before any request ledger entry for that task. Its generic task error does not preserve the original pre-request exception. The source block is retained; no retry/unblock was performed during this status check. Schedule activation preserves this block and the site remains available. Do not describe crawling as currently resumed or blame SEAP without evidence. The exception coincided with release deployment, but causation is unconfirmed.

Evidence: `/srv/seap/backups/ted-repair-20260927/live-validation.json`, `/srv/seap/backups/daily-rehearsal-20260927/daily-validation.json`, and local `/tmp/seap-processing-release-20260927/`. These checks establish internal consistency, not full external source coverage.

## Completed follow-up — 2026-09-27T20:59:54.286855+03:00

Pagination and the stable-query collector fix are deployed on main at **e458690**, with CI/deploy run36338505537 successful. `/admin` journal and file queue show at most10 entries/page; filters and stable historical journal navigation passed production-build browser verification. Scoped finish review: ship. Public pages/health200, anonymous admin queue403.

The reviewed recovery SQL was applied after verifying the fixed admission query inside the running collector. Task36017 **completed successfully**: request779 returnedHTTP200 with1record, archived1, duplicates0. Requests777(awards,5records) and778(direct purchases,0records) also returned200. The original failure and confirmed PostgreSQL schema/plan diagnosis are preserved in the retry-task audit. Controlrevision11: processing enabled, maintenancefalse, pausedfalse, no source block. No diagnostic/test source requests were added; these were ordinary resumed collection tasks.

Schedule remains daily05:00 Europe/Bucharest, with full risk Sundays05:00; first daily28September and next risk4October. TED repair and daily clone rehearsal remain verified as recorded below. All local changes are committed; a final evidence-only commit follows this release. Local test preview/fixture databases were removed; ordinary dev3113 was untouched. The old failed continuation must not be restarted.

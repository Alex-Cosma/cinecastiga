# TED production source recovery — 27 September 2026

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

User explicitly chose application immediately after clone validation. Pending. Production core/marts are unchanged by this recovery so far; collection continues under the existing shared50–70second budget. Restoring XML alone does not complete the repair. Normalization, reconciliation, dependent reporting tables, consistency validation and search readiness must all succeed before a repaired live snapshot is exposed. The full earlier benchmark took94m29.510s and failed only the missing TED normalization check; it is a prior measurement, not a validation of this repair.

Future processing direction requested by the user: daily new-data normalization/reconciliation/statistics/Radiografie/search, with full historical risk recalculation weekly. This requires distinct risk freshness and snapshot validation; it is not yet implemented and does not weaken the current repair checks.

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

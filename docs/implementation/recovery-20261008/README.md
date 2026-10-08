# 8 October 2026: archive collection independent of a failed publication

Owner instruction: resume production collection today; no normalization or analytical rebuild today. Public maintenance until the next verified publication was explicitly accepted. Do not change source pacing/proxy settings.

## Observed incident

Scheduled run `6a186851-6a54-4d94-af23-9607f76f8132`, 05:00–05:59 RO, failed normalization with three quarantined `award-contracts:v1` envelopes. Backup verified, boundary 18004783, failed checkpoint 20; checkpoint 19 is the last ready publication. Control revision95 paused+maintenance, no source block. Final source request161340 succeeded; this was a publication failure, not a stopped proxy pool. Core data was partially updated; reopening over it is unsafe.

Raw documents 17564513 / 17571264 / 17668857 cover notices 100650119 / 100655849 / 100656430, 58 contracts. Sources remain unchanged.

## Narrow identity corrections

`reviewed-winner.ts` requires the exact contract ID, incoming SICAP ID, fiscal identifier and normalized name:

- Contracts107982497/108090948: HABAU PPS PIPELINE SYSTEMS, SICAP54428, was labelled with Transgaz's CUI13068733; use HABAU's13092995. Confirmed by the existing canonical profile and the [public project document published by Transgaz](https://www.transgaz.ro/sites/default/files/users/user824/Plan%20prev%20combatere%20poluare%20accid.pdf), section2.
- Contract108105778: THEOTOP, SICAP64188, was labelled5394305; use391391, also on [THEOTOP's official contact page](https://www.theotop.ro/CONTACT-010/) and other contracts in this envelope.
- Contracts108105777/108105782/108105798: UTI GRUP, CUI5394305, carries SICAP14779 belonging to CAR TOP, CUI6895096. Resolve these records by the valid UTI CUI without rebinding CAR TOP's SICAP ID. Both canonical entities and correct CAR TOP records coexist in the same archive.

No general preference for CUI over SICAP; unknown valid-identity conflicts still fail. No fuzzy merges. Six corrected winner references, with other consortium members retained. [Isolated replay evidence](replay-validation.json): all58 contracts loaded twice with stable winner associations. Production normalization is deferred until night.

## Durable behavior

- New `collection_during_maintenance` gate defaults false. Only archive collection can use it, with no running processor. Document jobs and public maintenance retain their old protection.
- Failure after a verified backup/frozen boundary can restore archive collection automatically, only with no running source/task/document/processing work and unchanged operator revision. Manual pause/source block are preserved. Host restarts only a previously running collector. Early/unsafe failures stay paused.
- Next scheduled publication atomically revokes archive permission, drains collectors, freezes and backs up again. It runs **full once** to recover the failed checkpoint/risk baseline. Normal daily statistics / Sunday risk schedule resumes after verified success.
- Quarantine rows now track `retry_required` / `resolved_at`. Failures below the ordinary normalization cursor are retried once each run; successful retries resolve history in the same transaction. Failed retries continue to prevent publication. No silent omission or source rewriting.
- Migration62 marks only failures after the last ready publication as pending. Older historical quarantine rows remain visible, neither retried blindly nor falsely marked resolved.
- `/admin` distinguishes archive collection from public maintenance, keeps archive pause/resume available, and shows the next full recovery in the schedule.

## Additional open publication blocker

Read-only production preflight found 8,854 stale approved member fingerprints (16,090 total), zero invalid decisions. Independent verification against the original checksum-pinned dedup bundle stopped at `Publication multiplicity changed: 107775175`. Therefore **do not reset hashes or promise the next publication will succeed**. For CAN1086297, the same identifying fields appear in contracts107775175 (notice100638155),108112409 (100656791) and newly normalized108167589 (100659131): three publications, where the approved registry expected two. The cohort now contains6,856 records. Further source review is needed before extending deduplication to the third publication. Archive resumption does not bypass this control. No dedup decisions were changed in this intervention.

## Validation before deployment

- PostgreSQL fixture `seap_test_recovery_20261008`; copied schema from prior isolated incident fixture, applied migration62. Ordinary local database untouched. A fresh full migration bootstrap exited unsuccessfully before creating history; not counted as passed.
- 36 database integration tests: publication scheduling, failures, operator changes, archive admission, document rejection and Romanian quiet window.
- 7 collector integration tests; 5 normalization/identity integration tests; 6 reviewed-winner unit cases.
- 9 database units; 209 ingestion units; six host publication tests.
- Full local `pnpm turbo typecheck lint test build`: all20 tasks passed; web395 unit tests passed,181 integration/browser tests skipped (not counted as verified). Isolated activation procedure succeeded once, kept public maintenance, then correctly rejected its second execution.
- Database/ingestion builds and web typecheck passed. No SEAP diagnostic HTTP traffic; actual sources and entity mappings read from archived production data.

## One-time activation

`/scripts/operations/20261008-recovery/resume-archive.sh` is a dated incident operation, not onboarding or a cron command. Requires deployed code/migration62, original revision95, exact failed run and no active work. Verifies the 5.6GB backup checksum, explicitly builds the stopped collector from the deployed release, audits revision96, retains maintenance, stops document worker and starts collector. Does not normalize/rebuild/index data. Repeat execution must fail its revision guard.

## Production activation verified

Runtime `a621ee4`, CI/deploy [37730728160](https://github.com/Alex-Cosma/seap-new/actions/runs/37730728160) successful,63 migrations. Earlier run37730597261 failed its web build before deployment; a full local build and the subsequent CI passed. No unverified override of CI was needed.

The dated activation completed at08:10RO. Backup SHA-256 verified. At08:11:25RO:140 new requests,136 successful,4 in flight,zero failed; revision96 unpaused with maintenance+archive-only gate, no source block. Collector running, document worker stopped, public page503, health200, no processor running. Proxy settings unchanged:94 enabled,200/min ceiling,10 concurrent,35–45s/IP. The three quarantine rows remain pending for night; no normalization or analytical rebuild was performed today.

Cron remains installed. Runtime `processingSchedule` reports **9 October05:00RO** for both next processing and the one-off full recovery. The unresolved third-publication dedup blocker above must be addressed before promising successful reopening. A publication failure after verified backup will preserve maintenance and resume eligible raw collection rather than losing another day.

[Production evidence](production-verification.json). Private source fixtures/logs: `/tmp/seap-recovery-20261008`; never commit raw/private dumps.

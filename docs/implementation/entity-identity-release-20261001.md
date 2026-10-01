# Identity repair — live publication, 1 October 2026

**IN PROGRESS. Read this before the earlier handoff checkpoint.** Owner reset
the model budget and instructed continuation. Do not restart already running jobs
or assume the data repair is finished merely because code has deployed.

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

Next: monitor the running **publish** phase. Never
rerun prepare or publish over the existing directory. Failure keeps maintenance; inspect the
logs and guards. Once publish produces genuine validated report/marker, inspect
them before invoking **reopen**. Then public browser checks and worker/control
verification. Update this report with actual results/times.

Do not push new code during the coordinator lock. This in-progress report is
intentionally saved locally for continuation; commit final documentation after
publication. Full prior context: [handoff](../handover/continuation-identity-20261001.md)
and [procedure](../../scripts/identity-repair/README.md).

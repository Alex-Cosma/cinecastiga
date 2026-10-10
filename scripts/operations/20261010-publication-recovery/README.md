# One-shot publication recovery, 10 October 2026

Only for the owner-authorized recovery documented in `docs/implementation/publication-recovery-20261010/README.md`. Not a setup/cron script.

Requires the validated deployed SHA and `/srv/seap/repairs/publication-20261010/copy-proof.json`. Run under a durable host session; `run.sh` holds the deployment lock and writes `run.log`. It performs live source preflight, guarded claim, fresh verified backup, full ordinary publication and conditional reopening. `/reports/run-id` and `app.collection_audit` prevent replay. Failed operations require inspection; do not reset their evidence.

Collection block542533 is preserved. Never use this procedure to accept179of180notice IDs or restart the crawler.

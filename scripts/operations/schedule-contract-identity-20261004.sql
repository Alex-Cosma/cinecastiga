-- Owner authorized 2026-10-03. Run ONLY after deploying the tested identity
-- runner and verifying the pinned evidence bundle through the processor image.
-- Does not activate aliases or rebuild data. No recurring/new cron entry.
BEGIN;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.collection_control WHERE id=1 AND processing_enabled AND processing_time='05:00' AND risk_weekday=0 AND NOT maintenance)
 THEN RAISE EXCEPTION 'Expected enabled Sunday 05:00 Romanian full schedule'; END IF;
 IF EXISTS(SELECT 1 FROM app.processing_runs WHERE scheduled_day='2026-10-04')
 THEN RAISE EXCEPTION 'Target publication already claimed; do not attach a late repair'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.data_repairs WHERE id='contract-money-v1' AND scheduled_day='2026-10-04' AND status='scheduled')
 THEN RAISE EXCEPTION 'Expected scheduled monetary prerequisite'; END IF;
 IF to_regclass('marts.contract_identity_decisions') IS NULL THEN RAISE EXCEPTION 'Identity migrations missing'; END IF;
 IF EXISTS(SELECT 1 FROM marts.contract_identity_decisions) THEN RAISE EXCEPTION 'Identity decisions already exist; review state'; END IF;
 IF (clock_timestamp() AT TIME ZONE 'Europe/Bucharest') >= '2026-10-04 05:00'::timestamp THEN RAISE EXCEPTION 'Scheduling window closed'; END IF;
END $$;
INSERT INTO app.data_repairs(id,scheduled_day,report)
VALUES('contract-publication-identity-v1','2026-10-04','{"configuration":{"path":"/repairs/dq02-20261004/approved-bundle.json.gz","sha256":"c3a570b5ad4638778183c77b2e0a7385a3467ae6c22af1e012afd22151621596"},"expected":{"groups":8045,"duplicates":7300,"reductionRon":"7100577914.82"}}');
INSERT INTO app.collection_audit(actor_id,actor_name,action,before,after)
VALUES('operator:codex','Programare autorizată de proprietar','schedule-contract-identity-repair','{}','{"repairId":"contract-publication-identity-v1","day":"2026-10-04","time":"05:00","timezone":"Europe/Bucharest","oneTime":true}');
COMMIT;
SELECT r.id,r.scheduled_day,r.status,r.report,
 ((r.scheduled_day+c.processing_time::time) AT TIME ZONE 'Europe/Bucharest') scheduled_at_utc
FROM app.data_repairs r CROSS JOIN app.collection_control c WHERE c.id=1 ORDER BY r.id;

-- Authorized one-time production scheduling, 2026-10-03. Never a recurring seed.
-- Applies NO contract updates. Requires deployed migrations through 0049.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$
DECLARE c app.collection_control%ROWTYPE; r app.data_repairs%ROWTYPE;
BEGIN
 SELECT * INTO STRICT c FROM app.collection_control WHERE id=1 FOR UPDATE;
 IF NOT c.processing_enabled OR c.maintenance OR c.processing_time<>'05:00' OR c.risk_weekday<>0 THEN
  RAISE EXCEPTION 'Expected enabled Sunday 05:00 schedule, with no maintenance in progress';
 END IF;
 IF clock_timestamp() >= ('2026-10-04 05:00:00'::timestamp AT TIME ZONE 'Europe/Bucharest') THEN
  RAISE EXCEPTION 'Scheduling window has passed; inspect before choosing another run';
 END IF;
 IF EXISTS(SELECT 1 FROM app.processing_runs WHERE scheduled_day='2026-10-04') THEN
  RAISE EXCEPTION 'Target publication already has an attempt; inspect it first';
 END IF;
 INSERT INTO app.data_repairs(id,scheduled_day) VALUES('contract-money-v1','2026-10-04') ON CONFLICT(id) DO NOTHING;
 SELECT * INTO STRICT r FROM app.data_repairs WHERE id='contract-money-v1';
 IF r.scheduled_day<>'2026-10-04' OR r.status<>'scheduled' THEN
  RAISE EXCEPTION 'Repair already applied/failed or scheduled differently; refusing to reset it';
 END IF;
END $$;
COMMIT;
SELECT id,scheduled_day,status,processing_run_id FROM app.data_repairs WHERE id='contract-money-v1';

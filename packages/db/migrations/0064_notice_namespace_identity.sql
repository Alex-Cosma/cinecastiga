-- Preserve core IDs and provenance. Public participation counters overlap across endpoint families.
-- Refuse a live normalization/task rollout instead of changing keys underneath workers.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM app.processing_runs WHERE status='running')
 OR EXISTS(SELECT 1 FROM app.collection_tasks WHERE stream='tenders' AND status='running') THEN
  RAISE EXCEPTION 'Drain processing and participation collection before notice identity migration';
 END IF;
 IF EXISTS(SELECT 1 FROM core.notices WHERE sys_notice_type_id IS NULL OR sys_notice_type_id NOT IN (2,6,7,12,17,19)) THEN
  RAISE EXCEPTION 'Unknown participation namespace; inspect data before migration';
 END IF;
 IF EXISTS(SELECT 1 FROM core.notice_award_sources s LEFT JOIN core.notices n ON n.c_notice_id=s.c_notice_id
   WHERE n.id IS NULL OR s.evidence->>'noticeNo' IS DISTINCT FROM n.notice_no) THEN
  RAISE EXCEPTION 'Source association lacks matching notice identity evidence';
 END IF;
END $$;--> statement-breakpoint
ALTER TABLE core.notices ADD COLUMN notice_namespace text GENERATED ALWAYS AS
 (case when sys_notice_type_id=2 then 'cn' when sys_notice_type_id=6 then 'dc' when sys_notice_type_id=7 then 'pc' when sys_notice_type_id in (12,17,19) then 'rfq' end) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE core.notices ADD COLUMN internal_notice_id bigint;--> statement-breakpoint
CREATE UNIQUE INDEX notices_namespace_public_id_uq ON core.notices (notice_namespace,c_notice_id);--> statement-breakpoint
CREATE INDEX notices_public_id_idx ON core.notices (c_notice_id);--> statement-breakpoint
ALTER TABLE core.notice_award_sources ADD COLUMN notice_namespace text;--> statement-breakpoint
UPDATE core.notice_award_sources s SET notice_namespace=n.notice_namespace FROM core.notices n
 WHERE n.c_notice_id=s.c_notice_id AND s.evidence->>'noticeNo'=n.notice_no;--> statement-breakpoint
ALTER TABLE core.notice_award_sources ALTER COLUMN notice_namespace SET NOT NULL;--> statement-breakpoint
ALTER TABLE core.notice_award_sources DROP CONSTRAINT notice_award_sources_ca_notice_id_c_notice_id_pk;--> statement-breakpoint
ALTER TABLE core.notice_award_sources ADD CONSTRAINT notice_award_sources_ca_notice_id_notice_namespace_c_notice_id_pk
 PRIMARY KEY(ca_notice_id,notice_namespace,c_notice_id);--> statement-breakpoint
DROP INDEX core.notices_c_notice_id_uq;--> statement-breakpoint
-- Existing completed/failed tasks retain their IDs, retries, results and timestamps.
-- Completed list pages remain historical evidence; new pages record scoped identities.
UPDATE app.collection_tasks SET
 key=regexp_replace(key,'^tenders:detail:', 'tenders:detail:' || CASE (params->>'noticeType')::int WHEN 2 THEN 'cn' WHEN 6 THEN 'dc' WHEN 7 THEN 'pc' ELSE 'rfq' END || ':'),
 partition=regexp_replace(partition,'^tenders:detail:', 'tenders:detail:' || CASE (params->>'noticeType')::int WHEN 2 THEN 'cn' WHEN 6 THEN 'dc' WHEN 7 THEN 'pc' ELSE 'rfq' END || ':')
 WHERE stream='tenders' AND kind='detail' AND key ~ '^tenders:detail:[0-9]+:'
 AND (params->>'noticeType')::int IN (2,6,7,12,17,19);

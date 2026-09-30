-- Read-only signal queries need only these DA fields, not the wide source row.
-- INCLUDE is maintained here because Drizzle's index API does not represent it.
CREATE INDEX IF NOT EXISTS "direct_acquisitions_signal_lookup_idx"
  ON "core"."direct_acquisitions" USING btree ("id")
  INCLUDE ("authority_entity_id", "supplier_entity_id", "closing_value", "sicap_da_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "flags_signal_subject_idx"
  ON "core"."flags" USING btree ("subject_type", "subject_id", "flag_code", "partner_id")
  WHERE "triggered";--> statement-breakpoint
-- A prebuilt concurrent index is allowed, but never silently accept an invalid
-- or differently defined object under one of these names.
DO $$
DECLARE r record; ok boolean;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('core.direct_acquisitions_signal_lookup_idx', 'core.direct_acquisitions', 1,
     ARRAY['id','authority_entity_id','supplier_entity_id','closing_value','sicap_da_id']::text[], NULL::text),
    ('core.flags_signal_subject_idx', 'core.flags', 4,
     ARRAY['subject_type','subject_id','flag_code','partner_id']::text[], 'triggered'::text)
  ) AS expected(index_name, table_name, key_count, columns, predicate)
  LOOP
    SELECT i.indisvalid AND i.indisready AND NOT i.indisunique
      AND i.indrelid = r.table_name::regclass AND i.indnkeyatts = r.key_count
      AND am.amname = 'btree'
      AND (SELECT array_agg(a.attname::text ORDER BY k.ordinality)
           FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ordinality)
           JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum) = r.columns
      AND pg_get_expr(i.indpred, i.indrelid) IS NOT DISTINCT FROM r.predicate
    INTO ok FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
      JOIN pg_am am ON am.oid=c.relam WHERE i.indexrelid=r.index_name::regclass;
    IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Unexpected or invalid index: %', r.index_name; END IF;
  END LOOP;
END $$;--> statement-breakpoint
ANALYZE "core"."flags";--> statement-breakpoint
ANALYZE "core"."direct_acquisitions";

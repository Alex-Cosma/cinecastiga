CREATE MATERIALIZED VIEW "marts"."signal_lookup" AS (
  select f.id, f.flag_code, f.subject_type, f.subject_id entity_id, f.partner_id,
    f.severity::numeric severity,
    coalesce(nullif(f.evidence->>'total',''), nullif(f.evidence->>'public_total',''), nullif(f.evidence->>'combined',''))::numeric total_ron,
    null::bigint source_id
  from core.flags f where f.triggered and f.subject_type in ('authority','supplier','pair')
  union all
  select f.id, f.flag_code, f.subject_type, da.authority_entity_id, da.supplier_entity_id,
    f.severity::numeric, da.closing_value, da.sicap_da_id
  from core.flags f join core.direct_acquisitions da on da.id=f.subject_id
  where f.triggered and f.subject_type='da'
  union all
  select f.id, f.flag_code, f.subject_type, aw.authority_entity_id, null::bigint,
    f.severity::numeric, aw.ron_contract_value, aw.ca_notice_id
  from core.flags f join core.awards aw on aw.id=f.subject_id
  where f.triggered and f.subject_type='award'
);--> statement-breakpoint
-- PostgreSQL indexes on materialized views are maintained explicitly here.
CREATE UNIQUE INDEX signal_lookup_id_idx ON marts.signal_lookup(id);--> statement-breakpoint
CREATE INDEX signal_lookup_page_idx ON marts.signal_lookup(flag_code, total_ron DESC NULLS LAST, severity DESC NULLS LAST, id);--> statement-breakpoint
CREATE INDEX signal_lookup_entity_idx ON marts.signal_lookup(entity_id, flag_code);--> statement-breakpoint
CREATE INDEX signal_lookup_partner_idx ON marts.signal_lookup(partner_id, flag_code);--> statement-breakpoint
ANALYZE marts.signal_lookup;

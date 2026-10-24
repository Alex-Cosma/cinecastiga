-- Firm attributes for Ask's filters (plan F5 and F6a phase 2), all built
-- nightly from data already in the database (ONRC import, SEAP, DAs):
--   entity_profile.registered_year  oldest ONRC registration year of the CUI
--   entity_profile.seat_county      latest ONRC registration, else SEAP county
--   entity_profile.seat_source      'onrc' | 'seap' | 'foreign' (null: unknown)
--   entity_flags.main_cpv_div       CPV division with >= half the DA value
-- Nullable, no default: catalog-only changes, no rewrite. Each ALTER holds
-- ACCESS EXCLUSIVE until the migrations commit (profile pages wait that
-- long); behind the nightly marts/flag-marts stages it gives up after the
-- migrator's lock_timeout, unchanged. The columns stay null until the next
-- marts build (main_cpv_div: the next weekly flag-marts); the web probes
-- them (apps/web/lib/ask/mart-columns.ts) and falls back until then.
ALTER TABLE "marts"."entity_flags" ADD COLUMN "main_cpv_div" text;--> statement-breakpoint
ALTER TABLE "marts"."entity_profile" ADD COLUMN "registered_year" integer;--> statement-breakpoint
ALTER TABLE "marts"."entity_profile" ADD COLUMN "seat_county" text;--> statement-breakpoint
ALTER TABLE "marts"."entity_profile" ADD COLUMN "seat_source" text;

-- The risk score's sharper signals (rf-2026.18, owner decision of 1 November 2026):
-- "Chiar sub plafonul achiziției directe" starts at 96% of the ceiling (was 90%), and
-- "Dependență de o autoritate" needs 250,000 lei of the firm's direct acquisitions and
-- at least 5 of them with that institution (was 50,000 lei and any number).
UPDATE "core"."risk_thresholds" SET "value_num" = 0.96, "note" = 'rf-2026.18: 96% of the ceiling (was 0.9)' WHERE "key" = 'da_round_floor_pct';--> statement-breakpoint
UPDATE "core"."risk_thresholds" SET "value_num" = 250000, "note" = 'rf-2026.18: 250,000 lei (was 50,000)' WHERE "key" = 'da_dep_min_total';--> statement-breakpoint
INSERT INTO "core"."risk_thresholds" ("key", "valid_from", "value_num", "note")
VALUES ('da_dep_min_count', '2000-01-01T00:00:00Z', 5, 'rf-2026.18: direct acquisitions with the main institution')
ON CONFLICT ("key", "valid_from") DO NOTHING;--> statement-breakpoint
-- "Finalizare rapidă" (da_rapid) is retired: its threshold goes with it. The next
-- flag build drops its core.flags rows (the build truncates and recomputes).
DELETE FROM "core"."risk_thresholds" WHERE "key" = 'da_rapid_hours';

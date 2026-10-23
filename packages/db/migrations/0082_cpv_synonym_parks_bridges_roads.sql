-- Vocabulary fixes from the first-visitor test (23 October 2026).
-- 1. "parcuri" reaches 77310000 again: town halls file park and green-space
--    maintenance under that code (Timișoara 211,2 mil. lei, Brașov 193,1 mil.
--    lei), so without it "parcuri" answered 0 lei for them. The whole class
--    replaces its two children (77311000, 77313000) and carries a note, because
--    it covers all green-space planting and maintenance, not only parks.
-- 2. "pod" (exact word) means bridge works 45221000 like "poduri", not the
--    catalogue product "Pod" 44212100 (a prefabricated bridge).
-- 3. "lucrari de drumuri" / "lucrari drumuri" mean the whole road-works family
--    45233000 like "drumuri" (which has no exclusions), not only the narrow
--    leaf 45233140 "Lucrări de drumuri".
-- Rows are deleted only on exact (term, prefix) include pairs; re-running
-- changes nothing. packages/db/seeds/cpv-synonyms.sql holds the same state.
DELETE FROM reference.cpv_synonym WHERE NOT exclude AND (term, cpv_prefix) IN (VALUES
('parcuri','77311000'),
('parcuri','77313000'));
--> statement-breakpoint
INSERT INTO reference.cpv_synonym (term, cpv_prefix, note, exclude) VALUES
('parcuri','77310000','Include amenajarea și întreținerea tuturor spațiilor verzi, nu doar a parcurilor: primăriile trec întreținerea parcurilor mai ales sub acest cod.',false),
('pod','45221000',null,false),
('lucrari de drumuri','45233000',null,false),
('lucrari drumuri','45233000',null,false)
ON CONFLICT DO NOTHING;

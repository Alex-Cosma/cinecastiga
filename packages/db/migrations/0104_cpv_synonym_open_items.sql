-- Open items of the /cauta re-judging (owner decisions, 10 November 2026).
-- "servicii juridice" keeps the whole class 79100000 and says it holds electronic signature certificates too (its first
-- firms are certSIGN and DigiSign, under 79130000 „documentare și certificare juridică”).
-- "mașini de gunoi" are waste collection vehicles (34144510 and its children), not cars plus waste services: with the
-- general rule in lib/intent/rules.ts, „X de Y” no longer adds two curated subjects together.
-- packages/db/seeds/cpv-synonyms.sql holds the same state.
INSERT INTO reference.cpv_synonym (term, cpv_prefix, note, exclude) VALUES
('servicii juridice','79100000','Include și certificatele de semnătură electronică (certificare juridică).',false),
('masini de gunoi','34144510',null,false),
('masina de gunoi','34144510',null,false),
('autogunoiere','34144510',null,false),
('autogunoiera','34144510',null,false);

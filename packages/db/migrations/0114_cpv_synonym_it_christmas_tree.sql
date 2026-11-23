-- Search probe of 23 November 2026 (agents-work/search-probe-20261123; owner approved the rows the same day).
-- „IT” alone („achiziții IT”, „piața de IT”) reached no domain and the answer said so; it now names the three classes
-- the site already reads for „calculatoare”, „software” and „servicii IT”. „brad de crăciun” was read as the town Brad;
-- it joins the Christmas trees and decorations class „pom de crăciun” has.
-- Insert only, idempotent. packages/db/seeds/cpv-synonyms.sql holds the same state.
INSERT INTO reference.cpv_synonym (term, cpv_prefix, note, exclude) VALUES
('it','30200000',null,false),
('it','48000000',null,false),
('it','72000000',null,false),
('brad de craciun','39298910',null,false),
('brazi de craciun','39298910',null,false)
ON CONFLICT DO NOTHING;

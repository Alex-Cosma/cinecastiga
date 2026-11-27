-- Owner, 27 November 2026, on the five contracts above 1 billion lei that the guard of migration 0113 still held
-- („wait for a look at the source”). Read again in the source's own rows:
--  - the three call-offs of one framework for military trucks are real: together 3,370.8 mil. lei against the
--    framework's 3,363.7 mil.; the guard held them because its sum of the notice adds the framework to its call-offs;
--  - the rails row and the well-services row are frameworks recorded as contracts: the rows after them in the same
--    notice are their call-offs („Contract subsecvent la Acordul cadru nr 43/28.04.2022”, „Contract Subsecvent nr 1”)
--    and alone add up to the notice's total. A ceiling is not added to what was ordered under it.
INSERT INTO "app"."contract_value_decisions" ("contract_nat_id", "decision", "reason", "decided_by") VALUES
	(107516553, 'include', 'Contract subsecvent nr. 1 la acordul-cadru 13/1/CFA-C/2019: cele trei subsecvente adună 3,37 mld. lei, cât acordul.', 'analiza din 27 noiembrie 2026'),
	(107516550, 'include', 'Contract subsecvent nr. 2 la acordul-cadru 13/1/CFA-C/2019: cele trei subsecvente adună 3,37 mld. lei, cât acordul.', 'analiza din 27 noiembrie 2026'),
	(107516556, 'include', 'Contract subsecvent nr. 3 la acordul-cadru 13/1/CFA-C/2019: cele trei subsecvente adună 3,37 mld. lei, cât acordul.', 'analiza din 27 noiembrie 2026'),
	(105798131, 'exclude', 'Acord-cadru trecut drept contract: 1,12 mld. lei e plafonul. Contractele lui subsecvente, din același anunț, adună 88,3 mil. lei și sunt numărate.', 'analiza din 27 noiembrie 2026'),
	(102090567, 'exclude', 'Acord-cadru trecut drept contract: 1,05 mld. lei e plafonul. Contractul lui subsecvent, din același anunț, are 94,7 mil. lei și e numărat.', 'analiza din 27 noiembrie 2026')
ON CONFLICT ("contract_nat_id") DO NOTHING;

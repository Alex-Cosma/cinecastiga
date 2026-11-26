-- Owner, 26 November 2026, after the reading of the 18 notices whose contracts are at least ten times their estimate
-- (16 of them have a right value and a wrong estimate field, and stay as they are): sixteen more contracts are held out
-- of the totals as a probable error of the value, like the nine of migration 0116.
--  - two lots of forest exploitation of one notice, a thousand times above their estimate and above the price per
--    cubic metre of the notice's other seven lots;
--  - fourteen call-offs of one framework for vehicle repairs, each declared at the framework's whole value.
-- The reason is shown on the contract's page. They take effect at the next processing run.
INSERT INTO "app"."contract_value_decisions" ("contract_nat_id", "decision", "reason", "decided_by") VALUES
	(104438472, 'exclude', 'Estimarea lotului: 60.085,93 lei, pentru 536,29 mc de lemn. Valoarea din SEAP e de 830 de ori mai mare; celelalte loturi ale anunțului au circa 93 lei pe metru cub.', 'analiza din 26 noiembrie 2026'),
	(104438461, 'exclude', 'Estimarea lotului: 35.612,53 lei, pentru 312,61 mc de lemn. Valoarea din SEAP e de 816 ori mai mare; celelalte loturi ale anunțului au circa 93 lei pe metru cub.', 'analiza din 26 noiembrie 2026'),
	(106643085, 'exclude', 'Contract subsecvent declarat cu valoarea întregului acord-cadru: 538.465 lei pentru cel mult 260 de operații. Un contract subsecvent are cel mult 16 operații.', 'analiza din 26 noiembrie 2026'),
	(106643086, 'exclude', 'Contract subsecvent declarat cu valoarea întregului acord-cadru: 538.465 lei pentru cel mult 260 de operații. Un contract subsecvent are cel mult 16 operații.', 'analiza din 26 noiembrie 2026'),
	(106643087, 'exclude', 'Contract subsecvent declarat cu valoarea întregului acord-cadru: 538.465 lei pentru cel mult 260 de operații. Un contract subsecvent are cel mult 16 operații.', 'analiza din 26 noiembrie 2026'),
	(106643088, 'exclude', 'Contract subsecvent declarat cu valoarea întregului acord-cadru: 538.465 lei pentru cel mult 260 de operații. Un contract subsecvent are cel mult 16 operații.', 'analiza din 26 noiembrie 2026'),
	(106643089, 'exclude', 'Contract subsecvent declarat cu valoarea întregului acord-cadru: 538.465 lei pentru cel mult 260 de operații. Un contract subsecvent are cel mult 16 operații.', 'analiza din 26 noiembrie 2026'),
	(106643090, 'exclude', 'Contract subsecvent declarat cu valoarea întregului acord-cadru: 538.465 lei pentru cel mult 260 de operații. Un contract subsecvent are cel mult 16 operații.', 'analiza din 26 noiembrie 2026'),
	(106643091, 'exclude', 'Contract subsecvent declarat cu valoarea întregului acord-cadru: 538.465 lei pentru cel mult 260 de operații. Un contract subsecvent are cel mult 16 operații.', 'analiza din 26 noiembrie 2026'),
	(106643092, 'exclude', 'Contract subsecvent declarat cu valoarea întregului acord-cadru: 538.465 lei pentru cel mult 260 de operații. Un contract subsecvent are cel mult 16 operații.', 'analiza din 26 noiembrie 2026'),
	(106643093, 'exclude', 'Contract subsecvent declarat cu valoarea întregului acord-cadru: 538.465 lei pentru cel mult 260 de operații. Un contract subsecvent are cel mult 16 operații.', 'analiza din 26 noiembrie 2026'),
	(106643096, 'exclude', 'Contract subsecvent declarat cu valoarea întregului acord-cadru: 538.465 lei pentru cel mult 260 de operații. Un contract subsecvent are cel mult 16 operații.', 'analiza din 26 noiembrie 2026'),
	(106643097, 'exclude', 'Contract subsecvent declarat cu valoarea întregului acord-cadru: 538.465 lei pentru cel mult 260 de operații. Un contract subsecvent are cel mult 16 operații.', 'analiza din 26 noiembrie 2026'),
	(106643098, 'exclude', 'Contract subsecvent declarat cu valoarea întregului acord-cadru: 538.465 lei pentru cel mult 260 de operații. Un contract subsecvent are cel mult 16 operații.', 'analiza din 26 noiembrie 2026'),
	(106643099, 'exclude', 'Contract subsecvent declarat cu valoarea întregului acord-cadru: 538.465 lei pentru cel mult 260 de operații. Un contract subsecvent are cel mult 16 operații.', 'analiza din 26 noiembrie 2026'),
	(106643100, 'exclude', 'Contract subsecvent declarat cu valoarea întregului acord-cadru: 538.465 lei pentru cel mult 260 de operații. Un contract subsecvent are cel mult 16 operații.', 'analiza din 26 noiembrie 2026')
ON CONFLICT ("contract_nat_id") DO NOTHING;

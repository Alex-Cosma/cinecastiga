-- Owner, 26 November 2026: a contract whose value is most probably a drafting error at the source stays out of every
-- total and statistic, but is still listed, marked, wherever single contracts are listed, and its page says so.
-- Until now only contracts above 1 billion lei could be held; nine contracts between 10 and 815 million lei carried a
-- value ten, a hundred or a thousand times too large and were counted. No rule decides these: each is an
-- administrator's decision with a written reason (app.contract_value_decisions, now open to a contract of any size).
--
-- marts.contract_transactions_held: the held contracts in the shape of marts.contract_transactions (one row per
-- contract and winner, the declared value split equally), rebuilt by every processing run right after it. Lists read
-- it beside the counted table; nothing that sums reads it.
CREATE TABLE "marts"."contract_transactions_held" (
	"contract_id" bigint NOT NULL,
	"supplier_id" bigint NOT NULL,
	"contract_no" text,
	"ca_notice_id" bigint,
	"notice_no" text,
	"authority_id" bigint,
	"authority_name" text,
	"supplier_name" text,
	"county" text,
	"cpv_code" text,
	"cpv_name" text,
	"procedure_type" text,
	"acquisition_type" text,
	"closing_value" numeric,
	"contract_value_full" numeric,
	"n_winners" integer DEFAULT 1 NOT NULL,
	"finalization_date" text,
	"tenders_received" integer,
	"is_single_bidder" boolean,
	"also_in_ted" boolean DEFAULT false NOT NULL,
	"ted_pubnum" text,
	CONSTRAINT "contract_transactions_held_contract_id_supplier_id_pk" PRIMARY KEY("contract_id","supplier_id")
);--> statement-breakpoint
CREATE INDEX "ctxh_authority_idx" ON "marts"."contract_transactions_held" USING btree ("authority_id");--> statement-breakpoint
CREATE INDEX "ctxh_supplier_idx" ON "marts"."contract_transactions_held" USING btree ("supplier_id");--> statement-breakpoint
-- The nine contracts the owner confirmed on 26 November 2026, each read against its award notice and the estimate of
-- its procedure. The reason is shown on the contract's page.
INSERT INTO "app"."contract_value_decisions" ("contract_nat_id", "decision", "reason", "decided_by") VALUES
	(1638720, 'exclude', 'Estimarea procedurii: 9.178.703 lei. Valoarea din SEAP e de 89 de ori mai mare.', 'analiza din 26 noiembrie 2026'),
	(2160177, 'exclude', 'Estimarea procedurii: 16.496.585,38 lei. Valoarea din SEAP e de 47 de ori mai mare.', 'analiza din 26 noiembrie 2026'),
	(101612512, 'exclude', 'Estimarea procedurii: 360.000 lei. Valoarea din SEAP e de 933 de ori mai mare.', 'analiza din 26 noiembrie 2026'),
	(106638979, 'exclude', 'Estimarea procedurii: 22.048.639,96 lei. Valoarea din SEAP e de 13 ori mai mare.', 'analiza din 26 noiembrie 2026'),
	(107574234, 'exclude', 'Estimarea procedurii: 8.921.230 lei. Valoarea din SEAP e de 20 de ori mai mare.', 'analiza din 26 noiembrie 2026'),
	(100015305, 'exclude', 'Estimarea procedurii: 141.216 lei. Valoarea din SEAP e de 998 de ori mai mare.', 'analiza din 26 noiembrie 2026'),
	(103131173, 'exclude', 'Estimarea procedurii: 7.704.154 lei. Valoarea din SEAP e de aproape 9 ori mai mare.', 'analiza din 26 noiembrie 2026'),
	(103612127, 'exclude', 'Estimarea procedurii: 4.695.786,38 lei. Valoarea din SEAP e de 10 ori mai mare.', 'analiza din 26 noiembrie 2026'),
	(100177214, 'exclude', 'Estimarea procedurii: 205.480 lei. Valoarea din SEAP e de 50 de ori mai mare.', 'analiza din 26 noiembrie 2026')
ON CONFLICT ("contract_nat_id") DO NOTHING;
--> statement-breakpoint
-- Until the first processing run after this migration fills the table, the contracts the last review already holds
-- (those above 1 billion lei) are listed from here: the institution's page no longer has a separate list for them.
-- The equal split is to the ban, without the run's remainder rule; the run rebuilds the table.
INSERT INTO "marts"."contract_transactions_held" ("contract_id", "supplier_id", "contract_no", "ca_notice_id", "notice_no", "authority_id",
	"authority_name", "supplier_name", "county", "cpv_code", "cpv_name", "procedure_type", "acquisition_type", "closing_value",
	"contract_value_full", "n_winners", "finalization_date")
SELECT c.id, w.entity_id, c.contract_no, c.ca_notice_id, aw.notice_no, aw.authority_entity_id, ae.name_display, se.name_display, ae.county,
	aw.cpv_code, cpv.name_ro, aw.procedure_type, aw.acquisition_type, round(vr.value_ron / w.n, 2), vr.value_ron, w.n,
	to_char(c.contract_date AT TIME ZONE 'Europe/Bucharest', 'YYYY-MM-DD')
FROM "marts"."contract_value_review" vr
JOIN "core"."contracts" c ON c.ca_notice_contract_id = vr.contract_nat_id
JOIN "core"."awards" aw ON aw.ca_notice_id = c.ca_notice_id
JOIN (
	SELECT d.contract_id, d.entity_id, count(*) OVER (PARTITION BY d.contract_id)::int n
	FROM (SELECT DISTINCT cw.contract_id, cw.entity_id FROM "core"."contract_winners" cw
		JOIN "core"."contracts" c2 ON c2.id = cw.contract_id JOIN "core"."awards" a2 ON a2.ca_notice_id = c2.ca_notice_id
		WHERE cw.entity_id IS DISTINCT FROM a2.authority_entity_id) d
) w ON w.contract_id = c.id
LEFT JOIN "core"."entities" ae ON ae.id = aw.authority_entity_id
LEFT JOIN "core"."entities" se ON se.id = w.entity_id
LEFT JOIN "core"."cpv_codes" cpv ON cpv.code = aw.cpv_code
WHERE NOT vr.admitted
ON CONFLICT ("contract_id", "supplier_id") DO NOTHING;

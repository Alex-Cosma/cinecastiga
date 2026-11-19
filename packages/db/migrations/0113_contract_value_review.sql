-- Owner, 19 November 2026: procedure contracts above 1 billion lei enter the totals by default. Until now the value cap
-- kept all of them out; on that day 81 of the 94 it held in production were real (motorways, railways, defence, the
-- Cluj metro) and 3 were typing errors a thousand times too large.
--
-- A contract above the cap is admitted unless
--   * its own award notice contradicts the value (the guard, computed at every processing run), or
--   * an administrator has excluded it;
-- and an administrator can admit one the guard holds back.
--
-- app.contract_value_decisions: the administrators' decisions, by the contract's public SEAP number (the one in
-- /contracte/<number>). Operator data: read live by the nightly build, never copied or swapped.
CREATE TABLE "app"."contract_value_decisions" (
	"contract_nat_id" bigint PRIMARY KEY NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"decided_by" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_value_decision" CHECK ("app"."contract_value_decisions"."decision" in ('include','exclude'))
);--> statement-breakpoint
-- marts.contract_value_review: every otherwise counted contract above the cap, as the last processing run judged it.
-- The totals, their nightly validation and the site all read `admitted` from here, so one run has one answer whatever
-- an administrator decides while it runs; a decision takes effect at the next run. Derived, but never emptied between
-- runs: `first_seen_at` is what the "new contract above 1 billion" message to the administrators goes by.
CREATE TABLE "marts"."contract_value_review" (
	"contract_nat_id" bigint PRIMARY KEY NOT NULL,
	"value_ron" numeric NOT NULL,
	"admitted" boolean NOT NULL,
	"guard" text,
	"decision" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_value_review_guard" CHECK ("marts"."contract_value_review"."guard" in ('lowest_offer','notice_value_missing','notice_sum')),
	CONSTRAINT "contract_value_review_decision" CHECK ("marts"."contract_value_review"."decision" in ('include','exclude')),
	CONSTRAINT "contract_value_review_admitted" CHECK ("marts"."contract_value_review"."admitted" = coalesce("marts"."contract_value_review"."decision" = 'include', "marts"."contract_value_review"."guard" is null))
);--> statement-breakpoint
-- The decisions the owner confirmed on 19 November 2026, from the review of the 94 contracts then above the cap.
-- The other held contracts of that day (three call-offs of one framework, rails, well services) are held by the
-- guard itself and wait for a look at the source.
INSERT INTO "app"."contract_value_decisions" ("contract_nat_id", "decision", "reason", "decided_by") VALUES
	(100252733, 'exclude', 'Posturi de transformare, 5,88 mld. lei: valoare de o mie de ori prea mare, repetată și în anunț.', 'analiza din 19 noiembrie 2026'),
	(102371096, 'exclude', 'Materiale de curățenie, 3,2 mld. lei: oferta din anunț e de 11,3 mil. lei.', 'analiza din 19 noiembrie 2026'),
	(105555425, 'exclude', 'Medicamente, 1,26 mld. lei, unul din 125 de contracte: celelalte adună cât oferta din anunț.', 'analiza din 19 noiembrie 2026'),
	(105580321, 'exclude', 'Acord-cadru centralizat de combustibil trecut drept contract: e un plafon, nu se adună.', 'analiza din 19 noiembrie 2026'),
	(103014873, 'include', 'Trenuri cu mentenanță pe mulți ani: anunțul are 1,31 mld. lei, contractul 2,42 mld.; ordinul de mărime e credibil.', 'analiza din 19 noiembrie 2026');

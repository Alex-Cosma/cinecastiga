CREATE TABLE "marts"."contract_money_quality" (
	"id" integer PRIMARY KEY NOT NULL,
	"observation" jsonb NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."contracts" ADD CONSTRAINT "contracts_money_consistent" CHECK (coalesce(case when amount_status is null then
  original_value is null and original_currency is null and value_ron is null
  and currency_rate is null and amount_raw_id is null and amount_evidence is null
else amount_raw_id is not null and amount_evidence->>'version' = '1'
  and amount_status in ('ron','converted','missing_value','missing_currency','missing_conversion','inconsistent','invalid')
  and (original_currency is null or original_currency ~ '^[A-Z]{3}$')
  and case when amount_status = 'ron' then
    original_currency = 'RON' and original_value >= 0 and value_ron = original_value
  when amount_status = 'converted' then
    original_currency <> 'RON' and original_value >= 0 and value_ron >= 0 and currency_rate > 0
    and abs(value_ron - original_value * currency_rate) <= 0.01
  else value_ron is null end end, false));
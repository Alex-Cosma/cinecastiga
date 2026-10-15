import type { DbSql } from './client.js';
type MoneySql = DbSql | Parameters<Parameters<DbSql['begin']>[1]>[0];

/** Shared by the database constraint and the publication guard. */
export const CONTRACT_MONEY_VALID_SQL = `coalesce(case when amount_status is null then
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
  else value_ron is null end end, false)`;

// All fragments use the contract alias c. Historic RON records retain their
// declared unit; foreign legacy values are ambiguous and never guessed.
export function contractRonValue(q: MoneySql) {
  return q`case
    when c.amount_status in ('ron','converted') and c.amount_raw_id = c.raw_id then c.value_ron
    when c.amount_status is null and upper(trim(c.currency)) = 'RON' then c.contract_value
    else null end`;
}
export function contractOriginalValue(q: MoneySql) {
  return q`case when c.amount_status is not null and c.amount_raw_id = c.raw_id then c.original_value
    when c.amount_status is null and upper(trim(c.currency)) = 'RON' then c.contract_value else null end`;
}
export function contractOriginalCurrency(q: MoneySql) {
  return q`case when c.amount_status is not null and c.amount_raw_id = c.raw_id then c.original_currency
    else upper(trim(c.currency)) end`;
}
export function contractAmountStatus(q: MoneySql) {
  return q`case when c.amount_status is not null and c.amount_raw_id is distinct from c.raw_id then 'stale'
    when c.amount_status is not null then c.amount_status
    when upper(trim(c.currency)) = 'RON' then 'legacy_ron' else 'legacy_unknown' end`;
}

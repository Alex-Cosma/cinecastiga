import type { DbSql } from "@seap/db";

/**
 * SICAP award notices have no estimated value of their own (data audit F22,
 * 21 October 2026).
 *
 * The award-list parser used to store `estimatedValueExport` as the award's
 * `estimated_value_ron`. In the SEAP award list that field is only
 * `ronContractValue` formatted as text ("7088051,28 RON"): on the local
 * snapshot of 1 October all 312,609 awards with both values had them equal
 * (e.g. award notices 100657530, 100657501, 100656890), and 49,713 of them were
 * 0. The contract and award-notice pages showed it as a separate "Valoare
 * estimată", so every notice looked awarded exactly at its estimate.
 *
 * The parser no longer stores it; this step empties the copies written before
 * the fix. `core.awards` is filled only by that parser, so no independent
 * estimate is lost. If an independent estimate source (e.g. the participation
 * notice) is ever added, remove this step. Idempotent; returns the rows cleared.
 */
type TransactionSql = Parameters<Parameters<DbSql["begin"]>[1]>[0];

export async function clearCopiedAwardEstimates(q: TransactionSql): Promise<number> {
  const result = await q`
    update core.awards set estimated_value_ron = null
    where estimated_value_ron is not null`;
  return result.count;
}

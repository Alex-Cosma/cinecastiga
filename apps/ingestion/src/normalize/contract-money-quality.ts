import { readContractMoneyQuality, type DbSql } from '@seap/db';

/** Store diagnostics before throwing, so the admin can inspect a failed run. */
export async function runContractMoneyQuality(sql: DbSql) {
  const [previous] = await sql`select observation from marts.contract_money_quality where id=1`;
  const report = await readContractMoneyQuality(sql, previous?.observation?.rawBoundary);
  await sql`insert into marts.contract_money_quality(id,observation,calculated_at)
    values(1,${JSON.stringify(report)}::jsonb,now())
    on conflict(id) do update set observation=excluded.observation,calculated_at=excluded.calculated_at`;
  if (report.structuralErrors || report.sourceErrors) throw Error(`Contract currency integrity failed: ${report.structuralErrors} structural errors, ${report.sourceErrors} source mismatches. Publication blocked.`);
  return report;
}

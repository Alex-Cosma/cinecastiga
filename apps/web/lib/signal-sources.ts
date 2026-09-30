import { createDb, type DbSql } from "@seap/db";

export interface SourceFinding {
  id: string; code: string; period: string | null; methodology: string;
  evidence: Record<string, unknown>;
  sourceIds: string[];
  records: { available: boolean; id: string; code: string | null; date: string | null; value: string | null; cpv: string | null }[];
  totalExact: string;
  recordedTotalExact: string | null;
  ceilingExact: string | null;
  found: number;
  reconciled: boolean;
  contractMembershipValid: boolean;
  page: number;
  contracts: { linked: boolean; available: boolean; id: string; value: string | null; currency: string | null; tedPublication: string | null; lot: string | null; tenders: number | null }[];
}
const globalDb = globalThis as unknown as { __seapSql?: DbSql };

export function numericSourceIds(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && /^\d{1,18}$/.test(id)))] : [];
}

/** Exact source membership recorded by the rule; never silently expand to a pair/year. */
export async function getSignalSources(id: string, page: number, database?: DbSql): Promise<SourceFinding | null> {
  if (!/^\d{1,18}$/.test(id)) return null;
  const sql = database ?? (globalDb.__seapSql ??= createDb().sql);
  return sql.begin("isolation level repeatable read read only", async (sql) => {
  const [flag] = await sql`select id::text, flag_code code, period, methodology_version methodology, evidence,
    evidence->>'total' recorded_total_exact, evidence->>'ceiling' ceiling_exact
    from core.flags where id = ${id} and triggered = true`;
  if (!flag) return null;
  const evidence = (flag.evidence ?? {}) as Record<string, unknown>;
  const sourceIds = numericSourceIds(evidence.source_ids);
  const recordedTotal = String(flag.recorded_total_exact ?? "");
  const membershipValid = Array.isArray(evidence.source_ids) && sourceIds.length === evidence.source_ids.length;
  const expectedTotal = /^-?\d+(\.\d+)?$/.test(recordedTotal) ? recordedTotal : null;
  const [stats] = sourceIds.length ? await sql`select count(*)::int n, coalesce(sum(closing_value), 0)::text total,
    coalesce(sum(closing_value), 0) = ${expectedTotal}::numeric totals_match
    from core.direct_acquisitions where sicap_da_id = any(${sourceIds}::bigint[])` : [{ n: 0, total: "0", totals_match: false }];
  const safePage = Math.max(0, Math.min(Number.isSafeInteger(page) ? page : 0, Math.ceil(sourceIds.length / 50) - 1));
  const records = sourceIds.length ? await sql`select expected.id::text id, da.id is not null available, da.da_code code,
    (da.finalization_date at time zone 'Europe/Bucharest')::date::text date, da.closing_value::text value, da.cpv_code cpv
    from unnest(${sourceIds}::bigint[]) expected(id)
    left join core.direct_acquisitions da on da.sicap_da_id = expected.id
    order by expected.id limit 50 offset ${safePage * 50}` : [];
  const contractEvidence = Array.isArray(evidence.contracts)
    ? evidence.contracts.filter((row): row is Record<string, unknown> => row !== null && typeof row === "object" && !Array.isArray(row)) : [];
  const pairs = contractEvidence.filter(row => numericSourceIds([row.contract_id]).length && numericSourceIds([row.ted_lot_result_id]).length)
    .map(row => ({ contract_id: row.contract_id, lot_id: row.ted_lot_result_id }));
  const contracts = pairs.length ? await sql`select expected.contract_id id,
      c.id is not null and tl.id is not null available,
      coalesce(cc.ted_lot_result_id = tl.id and cc.match_score >= 0.9::real, false) linked,
      c.contract_value::text value, c.currency,
      tn.publication_number "tedPublication", tl.lot_id lot, tl.tenders_received tenders
    from jsonb_to_recordset(${JSON.stringify(pairs)}::jsonb) expected(contract_id text, lot_id text)
    left join core.contracts c on c.ca_notice_contract_id = expected.contract_id::bigint
    left join core.ted_lot_results tl on tl.id = expected.lot_id::bigint
    left join core.ted_notices tn on tn.id = tl.ted_notice_id
    left join marts.contract_competition cc on cc.contract_id = c.id
    order by expected.contract_id::bigint, expected.lot_id::bigint` : [];
  return { id, code: String(flag.code), period: flag.period, methodology: String(flag.methodology), evidence, sourceIds,
    records: records as SourceFinding["records"], found: Number(stats?.n ?? 0), totalExact: String(stats?.total ?? "0"), page: safePage,
    recordedTotalExact: flag.recorded_total_exact ?? null, ceilingExact: flag.ceiling_exact ?? null,
    reconciled: membershipValid && !!stats?.totals_match && Number(stats?.n) === sourceIds.length && sourceIds.length === Number(evidence.count),
    contractMembershipValid: Array.isArray(evidence.contracts) && evidence.contracts.length === pairs.length,
    contracts: contracts as SourceFinding["contracts"] };
  });
}

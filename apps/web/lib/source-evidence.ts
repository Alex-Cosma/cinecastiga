import type { DbSql } from "@seap/db";
import type { DrillRow } from "./ask/compile";
import { sumDecimalStrings } from "./ask/evidence";
export type SourceRecord = DrillRow & { originalValueExact?: string | null };

/** A server-selected population, suitable for viewing and freezing in a case. */
export interface SourceEvidence {
  title: string;
  methodology: string;
  records: SourceRecord[];
  totalExact: string;
  sourceCount: number;
  context: Record<string, unknown>;
  warnings: string[];
}

// Fail explicitly before saving an incomplete finding. Query captures have their
// own paged pipeline; these named findings are deliberately bounded.
export const FINDING_SOURCE_LIMIT = 200_000;
export function completeFindingRows<T extends DrillRow>(rows: T[]): T[] {
  if (rows.length > FINDING_SOURCE_LIMIT) throw new Error("Această selecție depășește 200.000 de surse. Nu am salvat o captură parțială. Restrânge perioada în Construiește.");
  return rows;
}

export function sourceEvidence(input: Omit<SourceEvidence, "sourceCount" | "totalExact">): SourceEvidence {
  const records = completeFindingRows(input.records);
  const unknown = records.filter(row => row.originalValueExact === null).length;
  if (unknown) input.warnings.push(`${unknown} înregistrări nu au valoare publicată. Suma afișată include numai valorile cunoscute; lipsa nu este zero.`);
  return { ...input, records, sourceCount: records.length, totalExact: sumDecimalStrings(records.map(row => row.valueExact)) };
}

/** Aliases are da (raw acquisition), a (authority), s (supplier). */
export async function readDaEvidence(sql: DbSql, where: ReturnType<DbSql>): Promise<SourceRecord[]> {
  const rows = await sql`select da.da_code "daCode", (da.finalization_date at time zone 'Europe/Bucharest')::date::text date,
      da.authority_entity_id::text "authorityId", a.name_display authority, a.county,
      da.supplier_entity_id::text "supplierId", s.name_display supplier,
      da.cpv_code "cpvCode", cpv.name_ro "cpvName", coalesce(da.closing_value, 0)::text "valueExact",
      da.closing_value::text "originalValueExact",
      'da'::text src, da.sicap_da_id::text "refId", null::text "caNoticeId", null::text "tedPubnum",
      da.estimated_value_ron::text "estimatedValueRon", da.state,
      da.closing_value is null or da.closing_value <= 0 or da.closing_value > 2000000 "valueSuspect",
      null::int "nWinners", null::text "contractValueFull"
    from core.direct_acquisitions da
    left join core.entities a on a.id = da.authority_entity_id
    left join core.entities s on s.id = da.supplier_entity_id
    left join core.cpv_codes cpv on cpv.code = da.cpv_code
    where ${where} order by da.sicap_da_id limit ${FINDING_SOURCE_LIMIT + 1}`;
  return completeFindingRows(rows.map(row => ({ ...row, value: Number(row.valueExact), estimatedValueRon: row.estimatedValueRon === null ? null : Number(row.estimatedValueRon) })) as SourceRecord[]);
}

/** Canonical contract-supplier allocations; alias ct. */
export async function readContractEvidence(sql: DbSql, where: ReturnType<DbSql>): Promise<DrillRow[]> {
  const rows = await sql`select ct.notice_no "daCode", left(ct.finalization_date, 10) date,
      ct.authority_id::text "authorityId", ct.authority_name authority, ct.county,
      ct.supplier_id::text "supplierId", ct.supplier_name supplier,
      ct.cpv_code "cpvCode", ct.cpv_name "cpvName", ct.closing_value::text "valueExact",
      'contracts'::text src, contract.ca_notice_contract_id::text "refId", ct.ca_notice_id::text "caNoticeId", ct.ted_pubnum "tedPubnum",
      null::numeric "estimatedValueRon", null::text state, false "valueSuspect",
      ct.n_winners "nWinners", ct.contract_value_full::text "contractValueFull"
    from marts.contract_transactions ct join core.contracts contract on contract.id = ct.contract_id where ${where}
    order by ct.contract_id, ct.supplier_id limit ${FINDING_SOURCE_LIMIT + 1}`;
  return completeFindingRows(rows.map(row => ({ ...row, value: Number(row.valueExact) })) as DrillRow[]);
}

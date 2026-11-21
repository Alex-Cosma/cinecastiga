import { createDb, type DbSql } from "@seap/db";
import { unstable_cache } from "next/cache";
import { anchorIn, correctionGroups, type CorrectionGroup } from "./seap-corrections";

/*
 * The database's part of „Unde corectăm datele SEAP” (lib/seap-corrections.ts): the entity pages of the rows the lists
 * name by CUI, the reviewed merges that are in force (a row the processing skipped stays out), the merges made by a
 * verified rule (counted, not listed) and the administrators' decisions on contracts above 1 billion lei.
 */

/** A merge a verified rule made, by its reason in core.entity_redirects; the reviewed lists' reasons are rows instead. */
export const RULE_MERGES: Record<string, string> = {
  "legacy-authority-cui-as-sicap": "Instituții unite: importul istoric citise CUI-ul ca cod de participant SICAP",
  "da-supplier-vat-number": "Firme din achizițiile directe, unite după codul de TVA (RO + CUI)",
  "legacy-authority-cui-prefix": "Fragmente ale aceleiași instituții, după CUI-ul scris înaintea numelui",
  "foreign-country-spelling": "Firme străine cu țara scrisă în două feluri",
  "verified-sicap-cui-typo": "CUI scris greșit, verificat pe codul de participant SICAP",
};
const LISTED = new Set(["reviewed-supplier-merge", "reviewed-foreign-twin-merge"]);

export interface ContractDecision { natId: string; decision: "include" | "exclude"; reason: string; valueRon: string | null }

export interface CorrectionsData {
  groups: CorrectionGroup[];
  ruleMerges: { reason: string; label: string; n: number }[];
  contracts: { decisions: ContractDecision[]; heldByGuard: number } | null;
}

async function read(sql: DbSql): Promise<Omit<CorrectionsData, "groups"> & { ids: Record<string, string>; applied: string[] | null }> {
  const groups = correctionGroups();
  const cuis = [...new Set(groups.flatMap((g) => g.rows.filter((r) => !r.entityId && r.cui).map((r) => r.cui!)))];
  // A CUI names the profile that is not redirected elsewhere; of several, the one with the most records.
  const ids = await sql`
    select distinct on (e.cui_canonical) e.cui_canonical cui, e.id::text id
    from core.entities e
    where e.cui_valid and e.cui_canonical = any(${cuis}::text[])
      and not exists (select 1 from core.entity_redirects r where r.old_id = e.id)
    order by e.cui_canonical, e.id`;
  const redirects = await sql`select reason, count(*)::int n from core.entity_redirects group by reason`;
  const applied = await sql`select old_id::text id from core.entity_redirects where reason = any(${[...LISTED]}::text[])`;
  let contracts: CorrectionsData["contracts"] = null;
  try {
    const decisions = await sql`
      select d.contract_nat_id::text nat_id, d.decision, d.reason, r.value_ron::text value_ron
      from app.contract_value_decisions d left join marts.contract_value_review r using (contract_nat_id)
      order by d.decision desc, d.contract_nat_id`;
    const [held] = await sql`select count(*)::int n from marts.contract_value_review where not admitted and decision is null`;
    contracts = {
      decisions: decisions.map((d) => ({ natId: String(d.nat_id), decision: d.decision as "include" | "exclude", reason: String(d.reason), valueRon: d.value_ron == null ? null : String(d.value_ron) })),
      heldByGuard: Number(held?.n ?? 0),
    };
  } catch {
    contracts = null;
  }
  return {
    ids: Object.fromEntries(ids.map((r) => [String(r.cui), String(r.id)])),
    applied: applied.map((r) => String(r.id)),
    ruleMerges: redirects.filter((r) => !LISTED.has(String(r.reason))).map((r) => ({ reason: String(r.reason), label: RULE_MERGES[String(r.reason)] ?? "Alte unificări verificate", n: Number(r.n) }))
      .sort((a, b) => b.n - a.n),
    contracts,
  };
}

/** The rows with their entity pages; a reviewed merge the processing did not apply is left out. */
export function withDatabase(groups: CorrectionGroup[], ids: Record<string, string>, applied: readonly string[] | null): CorrectionGroup[] {
  const done = applied ? new Set(applied) : null;
  return groups.map((g) => ({
    ...g,
    rows: g.rows
      .filter((r) => !done || !r.mergedId || done.has(r.mergedId))
      .map((r) => (r.entityId || !r.cui || !ids[r.cui] ? r : { ...r, entityId: ids[r.cui]! })),
  }));
}

const g = globalThis as unknown as { __seapCorrectionsSql?: DbSql };
const cached = unstable_cache(async () => read((g.__seapCorrectionsSql ??= createDb().sql)), ["seap-corrections-1"], { revalidate: 600 });

/** The section without the database's part when it cannot be read: the lists alone. */
export async function getCorrections(): Promise<CorrectionsData> {
  const groups = correctionGroups();
  try {
    const d = await cached();
    return { groups: withDatabase(groups, d.ids, d.applied), ruleMerges: d.ruleMerges, contracts: d.contracts };
  } catch {
    return { groups, ruleMerges: [], contracts: null };
  }
}

/** The row an entity page links to, among the rows the section shows: a skipped merge's row is not one of them. */
export async function getCorrectionAnchor(id: string | number, cui: string | null | undefined): Promise<string | null> {
  return anchorIn((await getCorrections()).groups, id, cui);
}

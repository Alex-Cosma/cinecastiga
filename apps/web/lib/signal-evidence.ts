import type { DbSql } from "@seap/db";
import { FLAG_META } from "./flags";
import { numericSourceIds } from "./signal-sources";
import { awardUrl, daUrl } from "./elicitatie";
import { readDaEvidence, readContractEvidence, sourceEvidence, type SourceEvidence } from "./source-evidence";
import type { DrillRow } from "./ask/compile";

/** The transaction belongs to the caller: display and capture use the same selection. */
export async function readSignalEvidence(sql: DbSql, id: string): Promise<SourceEvidence | null> {
  if (!/^[1-9]\d{0,17}$/.test(id)) return null;
  const [flag] = await sql`select *, subject_id::text subject, partner_id::text partner,
    coalesce(evidence->>'total', evidence->>'public_total', evidence->>'combined', evidence->>'closing', evidence->>'value') recorded_total
    from core.flags where id = ${id} and triggered`;
  if (!flag) return null;
  const code = String(flag.flag_code), e = (flag.evidence ?? {}) as Record<string, unknown>;
  const warnings: string[] = [], context: Record<string, unknown> = {
    kind: "signal", signalId: id, code, subjectType: flag.subject_type, subjectId: flag.subject,
    partnerId: flag.partner, period: flag.period, evidence: e, recordedTotalExact: flag.recorded_total,
    membership: "reconstructed_from_current_records",
  };
  let records: DrillRow[] = [];
  const eligibleDa = sql`da.state = 'Oferta acceptata' and da.closing_value > 0 and da.closing_value <= 2000000`;
  if (flag.subject_type === "da") {
    records = await readDaEvidence(sql, sql`da.id = ${flag.subject}`);
    context.membership = "recorded_subject";
  } else if (code === "da_split") {
    const ids = numericSourceIds(e.source_ids);
    context.sourceIds = ids;
    context.sourceUrls = ids.map(daUrl);
    context.membership = "recorded_ids";
    records = ids.length ? await readDaEvidence(sql, sql`da.sicap_da_id = any(${ids}::bigint[])`) : [];
    if (!Array.isArray(e.source_ids) || ids.length !== e.source_ids.length || ids.length !== Number(e.count)) warnings.push("Lista de identificatori înregistrată în semnal este incompletă sau nevalidă.");
    if (records.length !== ids.length) warnings.push("Unele înregistrări nu mai sunt disponibile. Identificatorii și linkurile lor rămân în captura contextului.");
  } else if (flag.subject_type === "award") {
    const [award] = await sql`select ca_notice_id::text id from core.awards where id = ${flag.subject}`;
    context.awardId = award?.id ?? null;
    context.sourceUrls = award ? [awardUrl(award.id)] : [];
    if (code === "award_single_bid") {
      const pairs = Array.isArray(e.contracts) ? e.contracts as Record<string, unknown>[] : [];
      const ids = numericSourceIds(pairs.map(pair => pair?.contract_id));
      records = ids.length ? await readContractEvidence(sql, sql`contract.ca_notice_contract_id = any(${ids}::bigint[])`) : [];
      context.membership = "recorded_contract_ids";
      context.contractLotPairs = pairs;
      if (new Set(records.map(row => row.refId)).size !== ids.length || !ids.length) warnings.push("Nu toate contractele semnalului sunt disponibile în populația analitică actuală. Asocierile înregistrate cu loturile TED sunt păstrate în context.");
      warnings.push("Lista arată cotele furnizorilor din contractele identificate în semnal. Numărul de oferte se referă la loturile TED asociate, nu la toate loturile anunțului.");
    } else if (award) records = await readContractEvidence(sql, sql`ct.ca_notice_id = ${award.id}`);
    warnings.push("Valoarea anunțului și suma contractelor disponibile au definiții diferite. Verifică și anunțul SEAP original; nu presupune că sumele trebuie să coincidă.");
  } else if (["da_concentration", "da_dependence", "da_year_end"].includes(code)) {
    const roleWhere = flag.subject_type === "authority" ? sql`da.authority_entity_id = ${flag.subject}` : sql`da.supplier_entity_id = ${flag.subject}`;
    const period = code === "da_year_end" ? sql`and extract(year from da.finalization_date)::text = ${flag.period}` : sql``;
    const knownParties = code === "da_year_end" ? sql`` : sql`and da.authority_entity_id is not null and da.supplier_entity_id is not null`;
    records = await readDaEvidence(sql, sql`${eligibleDa} and ${roleWhere} ${period} ${knownParties}`);
  } else if (["award_concentration", "award_dependence"].includes(code)) {
    records = await readContractEvidence(sql, sql`ct.closing_value > 0 and ct.authority_id is not null and ct.supplier_id is not null
      and ${flag.subject_type === "authority" ? sql`ct.authority_id = ${flag.subject}` : sql`ct.supplier_id = ${flag.subject}`}`);
  } else if (["fin_tiny_staff", "fin_public_reliance"].includes(code)) {
    const financials = await sql`select f.year, f.employees, f.net_turnover::text turnover
      from reference.company_financials f join core.entities ent on ent.cui_canonical = f.cui where ent.id = ${flag.subject}
        and ${code === "fin_tiny_staff" ? sql`f.year::text = ${flag.period}` : sql`f.net_turnover > 0`}`;
    context.financials = financials;
    const years = financials.map(row => Number(row.year));
    if (years.length) records = [
      ...await readDaEvidence(sql, sql`${eligibleDa} and da.supplier_entity_id = ${flag.subject} and extract(year from da.finalization_date)::int = any(${years}::int[])`),
      ...await readContractEvidence(sql, sql`ct.supplier_id = ${flag.subject} and left(ct.finalization_date,4)::int = any(${years}::int[])`),
    ];
    warnings.push("Valorile contractate nu sunt plăți sau venituri încasate. Datele bilanțului sunt păstrate separat de înregistrările de achiziție.");
  } else if (code === "net_shared_admin") {
    // The old flag stores name/year, not a stable person key. Resolve only an
    // unambiguous identity associated with this subject; never merge namesakes.
    const matches = await sql`select distinct r.person_key from reference.company_reps r
      join core.entities ent on ent.cui_canonical = r.cui
      where ent.id = ${flag.subject} and r.person_name = ${String(e.person ?? "")}
        and extract(year from r.birth_date)::text = ${String(e.birth_year ?? "")}`;
    if (matches.length === 1 && matches[0]?.person_key) {
      const siblings = await sql`select distinct ent.id::text id from reference.company_reps r
        join core.entities ent on ent.cui_canonical = r.cui where r.person_key = ${matches[0].person_key}`;
      const ids = siblings.map(row => String(row.id));
      context.supplierIds = ids;
      if (ids.length && flag.partner) records = [
        ...await readDaEvidence(sql, sql`${eligibleDa} and da.authority_entity_id = ${flag.partner} and da.supplier_entity_id = any(${ids}::bigint[])`),
        ...await readContractEvidence(sql, sql`ct.authority_id = ${flag.partner} and ct.supplier_id = any(${ids}::bigint[])`),
      ];
    } else warnings.push("Identitatea reprezentantului nu poate fi reconstituită fără ambiguitate. Nu am substituit un grup de firme ales doar după nume.");
    warnings.push("Relațiile sunt cele din registrul disponibil acum. Un reprezentant legal nu este automat beneficiar real, iar relația curentă nu dovedește o legătură la data atribuirii.");
  } else warnings.push("Acest tip de semnal nu are încă o selecție de surse reproductibilă. Contextul calculat poate fi păstrat, dar nu înlocuiește documentele originale.");
  const result = sourceEvidence({ title: FLAG_META[code]?.title ?? code, methodology: String(flag.methodology_version), records, context, warnings });
  if (context.membership === "reconstructed_from_current_records") warnings.push("Selecția este reconstituită din datele actuale după criteriile semnalului. O captură o păstrează la momentul salvării.");
  if (flag.subject_type !== "award" && typeof flag.recorded_total === "string" && /^-?\d+(\.\d+)?$/.test(flag.recorded_total)) {
    const [check] = await sql`select ${result.totalExact}::numeric = ${flag.recorded_total}::numeric matches`;
    context.reconciled = !!check?.matches;
    if (!check?.matches) warnings.push("Suma surselor actuale diferă de suma înregistrată în semnal. Diferența rămâne vizibilă în captură și în export.");
  }
  return result;
}

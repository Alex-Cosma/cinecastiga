import { corroboratedCui, type DbSql } from "@seap/db";
import { getCompanyReps, type CompanyRep } from "./marts";
import { sharedSql } from "./shared-db";
import { readSignalEvidence } from "./signal-evidence";
import { withEvidenceSlot } from "./evidence-slots";
import { getSignalSources } from "./signal-sources";
import { readEntitySignalCounts } from "./signals";
import { readRecordTitles, type SourceEvidence } from "./source-evidence";
import { groupSourceRecords, sourcePage } from "./source-groups";

/*
 * What a signal's own page reads (/semnale/[id], owner 7 November 2026, on the record template): the signal, whom it is
 * about (the institution or the firm, and its partner), the award notice of a procedure signal, its records (the same
 * selection as its CSV and a saved capture: lib/signal-evidence.ts) with the titles of the rows on screen, a firm's
 * balance sheets and representatives, and the entity's other signals. Read-only.
 */

export interface SignalParty { id: string; name: string; county: string | null }

export interface SignalAward {
  caNoticeId: string;
  noticeNo: string | null;
  /** The notice's object, as published. */
  title: string | null;
  procedure: string | null;
  cpvCode: string | null;
  cpvName: string | null;
}

export interface FirmCardData {
  id: string;
  name: string;
  /** Only a corroborated CUI: it alone joins MF and ONRC (audit F03). */
  cui: string | null;
  county: string | null;
  financials: { year: number; employees: number | null; turnover: string | null }[];
  reps: CompanyRep[];
}

export interface SignalTedLot { publication: string | null; lot: string | null; tenders: number | null }

export interface SignalPageData {
  id: string;
  code: string;
  period: string | null;
  methodology: string;
  evidence: Record<string, unknown>;
  subjectType: string;
  /** Whom the signal is about, and in which role (an award signal's is its institution). */
  entity: (SignalParty & { role: "authority" | "supplier" }) | null;
  /** The institution of a shared-representative signal. */
  partner: SignalParty | null;
  award: SignalAward | null;
  source: SourceEvidence;
  /** Published titles of the rows on the requested page, by `${src}:${refId}`. */
  titles: Record<string, string>;
  /** A single-bid signal's TED lot per contract (ca_notice_contract_id). */
  tedLots: Record<string, SignalTedLot>;
  firm: FirmCardData | null;
  /** The entity's signals in this role, by code (this one included). */
  counts: Record<string, number>;
  /** The firms of a shared-representative signal. */
  related: SignalParty[];
}

const ID = /^[1-9]\d{0,17}$/;

/** A firm's balance sheets (all years) and its ONRC representatives, through its corroborated CUI only. */
export async function readFirmCard(entityId: string, database?: DbSql): Promise<FirmCardData | null> {
  if (!ID.test(entityId)) return null;
  const q = database ?? sharedSql();
  const [firm] = await q`select e.id::text id, e.name_display name, e.county, ${corroboratedCui(q, "e")} cui from core.entities e where e.id = ${entityId}`;
  if (!firm) return null;
  const cui = firm.cui ? String(firm.cui) : null;
  const [financials, reps] = await Promise.all([
    cui ? q`select year, employees, net_turnover::text turnover from reference.company_financials
      where cui = ${cui} and (employees is not null or net_turnover is not null) order by year` : Promise.resolve([]),
    cui ? getCompanyReps(cui).catch((error) => { console.error("signal-page: reps", error); return [] as CompanyRep[]; }) : Promise.resolve([] as CompanyRep[]),
  ]);
  return {
    id: String(firm.id), name: String(firm.name ?? ""), cui, county: (firm.county as string | null) ?? null,
    financials: financials.map((f) => ({ year: Number(f.year), employees: f.employees == null ? null : Number(f.employees), turnover: f.turnover == null ? null : String(f.turnover) })),
    reps,
  };
}

/** Everything the page shows, for the requested page of its records; null when the signal is not (or no longer) there. */
export async function readSignalPageData(id: string, page: number): Promise<SignalPageData | null> {
  if (!ID.test(id)) return null;
  const sql = sharedSql();
  // A few full source reads at once in the process (lib/evidence-slots.ts).
  const core = await withEvidenceSlot(() => sql.begin("isolation level repeatable read read only", async (tx) => {
    const q = tx as unknown as DbSql;
    await q`set local statement_timeout = '30s'`;
    const [flag] = await q`select f.flag_code code, f.subject_type, f.subject_id::text subject, f.partner_id::text partner,
        f.period, f.methodology_version methodology, f.evidence, sl.entity_id::text entity
      from core.flags f left join marts.signal_lookup sl on sl.id = f.id where f.id = ${id} and f.triggered`;
    if (!flag) return null;
    const source = await readSignalEvidence(q, id);
    if (!source) return null;
    const subjectType = String(flag.subject_type);
    const [award] = subjectType === "award" ? await q`select a.ca_notice_id::text "caNoticeId", a.notice_no "noticeNo", a.title,
        a.procedure_type procedure, a.cpv_code "cpvCode", cpv.name_ro "cpvName", a.authority_entity_id::text authority
      from core.awards a left join core.cpv_codes cpv on cpv.code = a.cpv_code where a.id = ${flag.subject}` : [];
    const entityId = subjectType === "authority" || subjectType === "supplier" ? String(flag.subject)
      : (flag.entity as string | null) ?? (award?.authority as string | null) ?? null;
    const role: "authority" | "supplier" = subjectType === "supplier" ? "supplier" : "authority";
    const related = Array.isArray(source.context.supplierIds) ? (source.context.supplierIds as unknown[]).map(String).filter((s) => ID.test(s)) : [];
    const partnerId = flag.partner ? String(flag.partner) : null;
    const ids = [...new Set([entityId, partnerId, ...related].filter((s): s is string => !!s && ID.test(s)))];
    const named = ids.length ? await q`select id::text id, name_display name, county from core.entities where id = any(${ids}::bigint[])` : [];
    const byId = new Map(named.map((r) => [String(r.id), { id: String(r.id), name: String(r.name ?? ""), county: (r.county as string | null) ?? null }]));
    // Titles only for the rows on screen: the same groups and page as the table (SourceEvidenceView).
    const { rows } = sourcePage(groupSourceRecords(source.records), page);
    const titles = Object.fromEntries(await readRecordTitles(q, rows.flatMap((g) => g.records)));
    return {
      code: String(flag.code), period: (flag.period as string | null) ?? null, methodology: String(flag.methodology),
      evidence: (flag.evidence ?? {}) as Record<string, unknown>, subjectType, source, titles,
      entity: entityId && byId.get(entityId) ? { ...byId.get(entityId)!, role } : null,
      partner: partnerId ? byId.get(partnerId) ?? null : null,
      award: award ? { caNoticeId: String(award.caNoticeId), noticeNo: award.noticeNo ?? null, title: award.title ?? null, procedure: award.procedure ?? null, cpvCode: award.cpvCode ?? null, cpvName: award.cpvName ?? null } : null,
      related: related.map((s) => byId.get(s)).filter((p): p is SignalParty => !!p),
    };
  }));
  if (!core) return null;
  const [tedLots, firm, counts] = await Promise.all([
    core.code === "award_single_bid"
      ? getSignalSources(id, 0).then((f) => Object.fromEntries((f?.contracts ?? []).map((c) => [c.id, { publication: c.tedPublication, lot: c.lot, tenders: c.tenders }])))
        .catch((error) => { console.error("signal-page: TED lots", error); return {}; })
      : Promise.resolve({}),
    core.entity?.role === "supplier" ? readFirmCard(core.entity.id).catch((error) => { console.error("signal-page: firm", error); return null; }) : Promise.resolve(null),
    core.entity ? readEntitySignalCounts(sharedSql(), core.entity.id, core.entity.role).catch((error) => { console.error("signal-page: counts", error); return {}; }) : Promise.resolve({}),
  ]);
  return { id, ...core, tedLots, firm, counts };
}

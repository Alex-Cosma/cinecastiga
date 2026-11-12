import type { DbSql } from "@seap/db";
import { getEntityFlags, type EntityFlagRow } from "./marts";
import { parseSignalState, readEntitySignalCounts, readSignalPage, signalPopulation, signalUrl, type SignalInstance, type SignalState } from "./signals";
import { readSignalEvidence, type AsideRecords } from "./signal-evidence";
import { readDaEvidence, readRecordTitles, type SourceRecord } from "./source-evidence";
import { riskNoScoreReason, riskPoints, type RiskCriterion, type ScoreParts } from "./risk-score";
import { sharedSql } from "./shared-db";
import { oldestFirst, RECORDS_SERVER_ABOVE, RECORDS_SHOWN } from "./record-rows";
import { decemberRecords } from "./signal-mirror";

/**
 * One pattern of one entity (/entitati/{id}/semnale?tip=…; owner, 6 November 2026, "Oglinda"): the entity's score and every
 * signal type it has (the tabs), this type's cases on long pages, and, for the direct-acquisition patterns, each
 * case's records with their published titles. The records are the signal's own sources (lib/signal-evidence.ts), so
 * the page, its CSV and a saved capture show the same acquisitions. Values are recorded, not payments.
 */

/** Cases per page on an entity's pattern page: the groups and sums of one profile, rarely more. */
export const CASE_PAGE_SIZE = 50;

/**
 * The patterns of one acquisition per case: the page reads all of an entity's (410 at most in November 2026, an
 * institution's sums under the ceiling) and its table filters and pages them in the browser.
 */
export const CASE_ROW_CODES: ReadonlySet<string> = new Set(["da_round", "da_above_ceiling"]);
export const CASE_ROW_LIMIT = 2000;

/** The acquisitions of one-acquisition signals, in one read (by signal id), as readSignalEvidence reads each. */
async function readDaSubjects(q: DbSql, ids: readonly string[]): Promise<Map<string, SourceRecord>> {
  if (!ids.length) return new Map();
  const links = await q`select f.id::text flag, da.sicap_da_id::text ref from core.flags f
    join core.direct_acquisitions da on da.id = f.subject_id
    where f.id = any(${ids}::bigint[]) and f.triggered and f.subject_type = 'da'`;
  const records = await readDaEvidence(q, q`da.id in (select subject_id from core.flags where id = any(${ids}::bigint[]) and triggered and subject_type = 'da')`);
  const byRef = new Map(records.map((r) => [r.refId, r]));
  const out = new Map<string, SourceRecord>();
  for (const l of links) { const r = byRef.get(String(l.ref)); if (r) out.set(String(l.flag), r); }
  return out;
}

/** The patterns whose records the page lists under each case; the others keep their own sources page. */
export const CASE_RECORD_CODES: ReadonlySet<string> = new Set(["da_split", "da_round", "da_above_ceiling", "da_year_end", "da_concentration", "da_dependence", "da_capacity"]);

export type CaseRecord = SourceRecord & { title: string | null };

export interface CaseInstance extends SignalInstance {
  records: CaseRecord[];
  /** A partner signal's other acquisitions (count, sum, the largest few), set aside. */
  aside: (Omit<AsideRecords, "top"> & { top: CaseRecord[] }) | null;
  /** The balance sheets a firm's capacity or staff signal read. */
  financials: { year: number; employees: number | null; turnover: string | null }[];
  warnings: string[];
}

export interface SignalCaseEntity {
  id: string;
  role: SignalState["role"];
  name: string;
  county: string | null;
  nDas: number;
  score: number;
  hasRiskScore: boolean;
  parts: ScoreParts;
  points: Partial<Record<RiskCriterion, number>>;
  noScoreReason: string | null;
  /** The entity also has a profile in the other role. */
  otherRole: SignalState["role"] | null;
}

export interface SignalCase {
  entity: SignalCaseEntity;
  /** Every signal type of the entity in this role, as /semnale counts them. */
  counts: Record<string, number>;
  code: string;
  instances: CaseInstance[];
  total: number;
  page: number;
  pageSize: number;
  /** The other patterns each of these records also shows in (sicap id → codes): "și sub plafon". */
  alsoIn: Record<string, string[]>;
}

/** The records of a case whose titles the page shows: all of a short list, the first rows of a long one (and of a year's December). */
function titleRecords(inst: CaseInstance): CaseRecord[] {
  const first = (rs: readonly CaseRecord[]) => (rs.length > RECORDS_SERVER_ABOVE ? oldestFirst(rs).slice(0, RECORDS_SHOWN) : [...rs]);
  if (inst.records.length <= RECORDS_SERVER_ABOVE) return inst.records;
  return inst.flagCode === "da_year_end" ? [...first(inst.records), ...first(decemberRecords(inst.records, String((inst.evidence as Record<string, unknown> | null)?.year ?? inst.period ?? "")))] : first(inst.records);
}

/** The entity's direct acquisitions flagged by the per-acquisition and per-group patterns, by sicap id. */
export async function readFlaggedDas(q: DbSql, state: Pick<SignalState, "role"> & { entity: string }): Promise<Record<string, string[]>> {
  const population = signalPopulation(q, { role: state.role, county: null, entity: state.entity });
  const rows = await q`select p.flag_code code, f.subject_type, f.evidence->'source_ids' ids, da.sicap_da_id::text da
    from ${population} p join core.flags f on f.id = p.id
    left join core.direct_acquisitions da on f.subject_type = 'da' and da.id = f.subject_id
    where p.flag_code in ('da_split', 'da_round', 'da_above_ceiling')`;
  const out: Record<string, string[]> = {};
  const add = (id: unknown, code: string) => {
    const key = id == null ? "" : String(id);
    if (!/^\d+$/.test(key)) return;
    (out[key] ??= []).includes(code) || out[key]!.push(code);
  };
  for (const r of rows) {
    if (r.code === "da_split" && Array.isArray(r.ids)) for (const id of r.ids) add(id, "da_split");
    else add(r.da, String(r.code));
  }
  return out;
}

const pickRow = (rows: EntityFlagRow[], role: SignalState["role"]) => rows.find((r) => r.role === role) ?? null;

export async function readSignalCase(state: SignalState & { entity: string }): Promise<SignalCase | null> {
  const sql = sharedSql();
  // The counts and the page open their own read-only transactions; the records are read together in one below.
  const [flags, counts, page] = await Promise.all([
    getEntityFlags(state.entity), readEntitySignalCounts(sql, state.entity, state.role),
    readSignalPage(sql, state, CASE_ROW_CODES.has(state.code) ? CASE_ROW_LIMIT : CASE_PAGE_SIZE),
  ]);
  const row = pickRow(flags, state.role);
  const [named] = row ? [{ name_display: row.name, county: row.county }] : await sql`select name_display, county from core.entities where id = ${state.entity}`;
  if (!named) return null;
  const { instances, alsoIn } = await sql.begin("isolation level repeatable read read only", async (tx) => {
    const q = tx as unknown as DbSql;
    await q`set local statement_timeout = '30s'`;
    const alsoIn = CASE_RECORD_CODES.has(state.code) ? await readFlaggedDas(q, state) : {};
    const instances: CaseInstance[] = [];
    // One acquisition per case: read together (one by one, 410 cases took 2,4 s).
    const subjects = CASE_ROW_CODES.has(state.code) ? await readDaSubjects(q, page.rows.filter((i) => i.subjectType === "da").map((i) => i.id)) : null;
    for (const inst of page.rows) {
      const one = subjects?.get(inst.id);
      if (subjects && inst.subjectType === "da") {
        instances.push({ ...inst, records: one ? [one as CaseRecord] : [], aside: null, financials: [], warnings: [] });
        continue;
      }
      const source = CASE_RECORD_CODES.has(inst.flagCode) ? await readSignalEvidence(q, inst.id) : null;
      const aside = (source?.context.aside ?? null) as AsideRecords | null;
      instances.push({ ...inst, records: (source?.records ?? []) as CaseRecord[],
        aside: aside ? { ...aside, top: aside.top as CaseRecord[] } : null,
        financials: Array.isArray(source?.context.financials) ? source!.context.financials as CaseInstance["financials"] : [],
        warnings: source?.warnings ?? [] });
    }
    // Titles for the rows that travel: a long list sends only its first rows (lib/record-rows.ts), the server pages
    // read the others' titles; the largest case had 24,000.
    const titles = await readRecordTitles(q, instances.flatMap((i) => [...titleRecords(i), ...(i.aside?.top ?? [])]));
    const titled = (r: SourceRecord): CaseRecord => ({ ...r, title: titles.get(`${r.src}:${r.refId}`) ?? null });
    for (const i of instances) {
      i.records = i.records.map(titled);
      if (i.aside) i.aside.top = i.aside.top.map(titled);
    }
    return { instances, alsoIn };
  });
  const score = row?.score ?? 0, parts = row?.scoreParts ?? {};
  return {
    entity: {
      id: state.entity, role: state.role, name: String(named.name_display ?? ""), county: (named.county as string | null) ?? null,
      nDas: row?.nDas ?? 0, score, parts, points: riskPoints(parts, score),
      // As the entity page reads it: a profile with criteria but a zero score was built before the score existed.
      hasRiskScore: Boolean(row) && !(score === 0 && (row?.nFlags ?? 0) > 0),
      noScoreReason: row ? riskNoScoreReason({ nDas: row.nDas, scoreNote: row.scoreNote, score }) : null,
      otherRole: flags.find((r) => r.role !== state.role)?.role ?? null,
    },
    counts, code: state.code, instances, total: page.total, page: page.page, pageSize: page.pageSize, alsoIn,
  };
}

/**
 * Where an old sources link (/semnale/[id]: investigations, captures, the entity page's groups table) now opens:
 * its case on the entity's pattern page, for the patterns whose records that page lists; null keeps the old page.
 */
export async function readCaseTarget(id: string): Promise<string | null> {
  if (!/^[1-9]\d{0,17}$/.test(id)) return null;
  const [r] = await sharedSql()`select flag_code, subject_type, entity_id::text entity from marts.signal_lookup where id = ${id} limit 1`;
  if (!r || !CASE_RECORD_CODES.has(String(r.flag_code)) || !r.entity) return null;
  // A group or an acquisition (pair, da) is the institution's; a firm's own signal (dependence, capacity) is the firm's.
  const role = r.subject_type === "supplier" ? "supplier" : "authority";
  return `${signalUrl(parseSignalState({ tip: String(r.flag_code), rol: role, ent: String(r.entity) }))}#caz-${id}`;
}

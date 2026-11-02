import { canonicalEntityId } from "@seap/db";
import { patternBinding } from "./radiografie-evidence";
import { createDb, type DbSql } from "@seap/db";
import { cleanName, formatRon } from "@/lib/format";
import { shortName, daysBetween } from "@/lib/radiografie-fmt";
import { yearRange } from "@/lib/radiografie-view";
import { daCeiling, daPurchaseType, type DaPurchaseType } from "@seap/domain";
export { shortName, daysBetween };

/**
 * Data for /entitati/{id}/radiografie (contracting authorities). Reads the
 * radiografie marts built by apps/ingestion/src/flags/radiografie.ts plus the
 * per-authority contract/DA rows the charts draw. Headline cards are derived
 * here from the same rows, never hand-written.
 */
const g = globalThis as unknown as { __seapRxSql?: DbSql };
function db(): DbSql {
  if (!g.__seapRxSql) g.__seapRxSql = createDb().sql;
  return g.__seapRxSql;
}
const num = (v: unknown): number => (v == null ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

/** The relation chart's bubbles: the authority's largest suppliers (the table holds every one). */
export const DEP_CHART_MAX = 25;

/**
 * A pair's value over both channels. A mart built before 2 November 2026 has neither v_all nor n_da_here (nor
 * the direct-acquisition-only pairs): they are read through to_jsonb, so the page keeps working until the next
 * daily radiografie rebuild.
 */
const depAll = (sql: DbSql) =>
  sql`coalesce((to_jsonb(sd) ->> 'v_all')::numeric, sd.v_here + coalesce((to_jsonb(sd) ->> 'da_here')::numeric, 0))`;
const depColumns = (sql: DbSql) => sql`
  supplier_id::text id, supplier_name, county, is_foreign, v_here, v_total, n_auth, n_here, ns_here, nk_here,
  y0, y1, c_frame, c_plain, yrs, turn_win, ny_win, turn_last, emp_last, win_from, win_to,
  to_jsonb(sd) ->> 'da_here' da_here, to_jsonb(sd) ->> 'v_da' v_da, to_jsonb(sd) ->> 'n_da_here' n_da_here,
  ${depAll(sql)} v_all`;

/** The authority's value over its suppliers, both channels: the denominator of „din autoritate”. */
async function depAuthorityTotal(sql: DbSql, id: string): Promise<{ value: number; suppliers: number }> {
  const [r] = (await sql`
    select count(*)::int n, coalesce(sum(${depAll(sql)}), 0)::text v from marts.supplier_dependency sd where authority_id = ${id}
  `) as unknown as { n: number; v: string }[];
  return { value: num(r?.v), suppliers: num(r?.n) };
}

const depWindow = (r: Record<string, unknown> | undefined) => ({ from: num(r?.["win_from"] ?? 2021), to: num(r?.["win_to"] ?? 2024) });

function depRow(r: Record<string, unknown>, authTotal: number): DepRow {
  const cFrame = num(r["c_frame"]),
    cPlain = num(r["c_plain"]);
  const turnWin = numOrNull(r["turn_win"]);
  const nyWin = num(r["ny_win"]);
  const c = cFrame + cPlain;
  const here = num(r["v_here"]),
    daHere = num(r["da_here"]),
    all = num(r["v_all"]),
    total = num(r["v_total"]);
  return {
    id: String(r["id"]),
    name: cleanName(r["supplier_name"] as string | null),
    county: (r["county"] as string | null) ?? null,
    foreign: Boolean(r["is_foreign"]),
    here,
    daHere,
    all,
    total,
    daTotal: numOrNull(r["v_da"]),
    nAuth: num(r["n_auth"]),
    n: num(r["n_here"]),
    nDa: num(r["n_da_here"]),
    ns: num(r["ns_here"]),
    nk: num(r["nk_here"]),
    y0: num(r["y0"]),
    y1: num(r["y1"]),
    cFrame,
    cPlain,
    yrs: ((r["yrs"] as number[] | null) ?? []).map(Number),
    turnWin,
    nyWin,
    turnLast: numOrNull(r["turn_last"]),
    empLast: numOrNull(r["emp_last"]),
    ratio: turnWin && nyWin >= 1 && c > 0 ? c / turnWin : null,
    // The supplier in what the authority awarded to its suppliers, and the authority in everything the firm won:
    // both over contracts and direct acquisitions (owner, 2 November 2026).
    shareHere: authTotal > 0 ? all / authTotal : 0,
    shareLife: total > 0 ? Math.min(1, all / total) : 0,
  };
}

export type DepSort = "value" | "here" | "life" | "recs" | "name";

export interface DepPage {
  rows: DepRow[];
  /** suppliers matching the search */
  total: number;
  /** every supplier of the authority */
  suppliers: number;
  win: { from: number; to: number };
}

/**
 * The relation table under the chart (owner, 2 November 2026, mockup B „Față în față”): every supplier of the
 * authority, 10 a page, sorted on any column, searched by name. „Din autoritate” orders as the value does.
 */
export async function getRadiografieSuppliers(
  entityId: string,
  q: { sort: DepSort; dir: "asc" | "desc"; page: number; search?: string },
): Promise<DepPage> {
  const sql = db();
  const id = await canonicalEntityId(sql, /^\d+$/.test(entityId) ? entityId : "0");
  const authTotal = await depAuthorityTotal(sql, id);
  const search = q.search?.trim() ? `%${q.search.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const where = sql`authority_id = ${id} ${search ? sql`and supplier_name ilike ${search}` : sql``}`;
  const key = q.sort === "life" ? sql`${depAll(sql)} / nullif(v_total, 0)`
    : q.sort === "recs" ? sql`n_here + coalesce((to_jsonb(sd) ->> 'n_da_here')::int, 0)`
      : q.sort === "name" ? sql`lower(supplier_name)`
        : depAll(sql);
  const order = q.dir === "asc" ? sql`${key} asc nulls last` : sql`${key} desc nulls last`;
  const [count] = (await sql`select count(*)::int c from marts.supplier_dependency sd where ${where}`) as unknown as { c: number }[];
  const rows = (await sql`
    select ${depColumns(sql)} from marts.supplier_dependency sd where ${where}
    order by ${order}, supplier_id limit 10 offset ${(Math.max(1, q.page) - 1) * 10}
  `) as unknown as Record<string, unknown>[];
  return { rows: rows.map((r) => depRow(r, authTotal.value)), total: num(count?.c), suppliers: authTotal.suppliers, win: depWindow(rows[0]) };
}

export interface RxProfile {
  id: string;
  name: string;
  county: string | null;
  totalContracts: number;
  nContracts: number;
  nDas: number;
  firstYear: string | null;
  lastYear: string | null;
}

export interface DepRow {
  id: string;
  name: string;
  county: string | null;
  foreign: boolean;
  /** the pair's contracts (procedures) */
  here: number;
  /** the pair's direct acquisitions */
  daHere: number;
  /** the pair over both channels: the bubble, the table's value and both shares */
  all: number;
  /** the pair's direct acquisitions, counted (`n` counts its contracts) */
  nDa: number;
  /** everything the firm won: contracts and direct acquisitions */
  total: number;
  /** the direct acquisitions in `total`; null while the mart predates them (built before 2 November 2026) */
  daTotal: number | null;
  nAuth: number;
  n: number;
  ns: number;
  nk: number;
  y0: number;
  y1: number;
  cFrame: number;
  cPlain: number;
  yrs: number[];
  turnWin: number | null;
  nyWin: number;
  turnLast: number | null;
  empLast: number | null;
  /** contracted (cFrame+cPlain) ÷ invoiced over the covered years; null when unknown */
  ratio: number | null;
  shareHere: number;
  shareLife: number;
}

export interface ElseRow {
  authorityId: string;
  authorityName: string;
  n: number;
  value: number;
  y0: string;
  y1: string;
}

export interface PatternRow {
  id: number;
  fingerprint:string;
  cpvClass: string;
  kind: "rotatie" | "impartire" | "maturare" | "consortiu";
  setKey: string;
  memberIds: string[];
  memberNames: string[];
  reps: number;
  nLotTenders: number;
  value: number;
  single: number;
  known: number;
  strength: "puternic" | "mediu" | "slab";
  sharedAdmin: string | null;
  y0: string;
  y1: string;
  notices: string[];
  elsewhere: ElseRow[];
}

/** One contract row for the lot matrix (winner = consortium as one). */
export interface MatrixRow {
  externalId?: string;
  title?: string;
  noticeId?: string | null;
  valueExact?: string;
  cls: string;
  notice: string;
  d: string;
  contractId: string;
  supplierId: string;
  supplierName: string;
  nWinners: number;
  single: boolean | null;
  tr: number | null;
  vFull: number;
  framework: boolean;
}

export interface SliceRow {
  supplierId: string;
  supplierName: string;
  cpvClass: string;
  cpvName: string;
  d0: string;
  d1: string;
  n: number;
  sum: number;
  ceiling: number;
  ratio: number;
  nTotal: number;
  vTotal: number;
  purchaseType?: DaPurchaseType | null;
  dateFallbackCount?: number;
  typeInferredCount?: number;
  methodologyVersion?: string;
  points: { d: string; v: number; cls: string; cpvName: string;
    id?: string; ceiling?: number | null; purchaseType?: DaPurchaseType | null; referenceDate?: string }[];
}

export interface Headline {
  k: string;
  t: string;
  w: string;
  go: "dep" | "mx" | "da";
  cls?: string | undefined;
  supplierId?: string | undefined;
}

export interface RxData {
  profile: RxProfile;
  dep: DepRow[];
  /** every supplier of the authority, both channels: the relation table pages through them */
  depSuppliers: number;
  patterns: PatternRow[];
  families: Record<string, { name: string; rows: MatrixRow[]; nAll: number }>;
  familiesWithLots: number;
  familiesTotal: number;
  slices: SliceRow[];
  nDaSuppliers: number;
  headlines: Headline[];
  win: { from: number; to: number };
}

export async function getRadiografie(entityId: string): Promise<RxData | null> {
  const sql = db();
  const id = await canonicalEntityId(sql, /^\d+$/.test(entityId) ? entityId : "0");
  const prof = (await sql`
    select ep.entity_id::text id, ep.name_display, ep.county, ep.n_contracts, ep.n_das,
           ep.total_ron_full, substr(ep.first_activity, 1, 4) y0, substr(ep.last_activity, 1, 4) y1,
           (select coalesce(sum(closing_value), 0) from marts.contract_transactions
             where authority_id = ep.entity_id and closing_value > 0) total_contracts
    from marts.entity_profile ep
    where ep.entity_id = ${id} and ep.role = 'authority'
  `) as unknown as Record<string, unknown>[];
  if (prof.length === 0) return null;
  const p = prof[0]!;
  const totalContracts = num(p["total_contracts"]);
  const profile: RxProfile = {
    id,
    name: cleanName(p["name_display"] as string | null),
    county: (p["county"] as string | null) ?? null,
    totalContracts,
    nContracts: num(p["n_contracts"]),
    nDas: num(p["n_das"]),
    firstYear: (p["y0"] as string | null) ?? null,
    lastYear: (p["y1"] as string | null) ?? null,
  };

  // ── dependency: every supplier of the authority over both channels, no threshold (owner, 2 November 2026); the
  // chart draws the 25 largest, the table (/api/radiografie/furnizori) pages through all of them.
  const authTotal = await depAuthorityTotal(sql, id);
  const depRows = (await sql`
    select ${depColumns(sql)} from marts.supplier_dependency sd
    where authority_id = ${id} order by ${depAll(sql)} desc, supplier_id limit ${DEP_CHART_MAX}
  `) as unknown as Record<string, unknown>[];
  const win = depWindow(depRows[0]);
  const dep: DepRow[] = depRows.map((r) => depRow(r, authTotal.value));

  // ── lot patterns + elsewhere
  const pr = (await sql`
    select id, cpv_class, kind, set_key, to_jsonb(member_ids::text[]) member_ids, to_jsonb(member_names) member_names, reps, n_lot_tenders,
           value, single, known, strength, shared_admin, y0, y1, to_jsonb(notices) notices
    from marts.lot_patterns where authority_id = ${id}
    order by (strength = 'puternic') desc, (strength = 'mediu') desc, value desc
  `) as unknown as Record<string, unknown>[];
  const setKeys = [...new Set(pr.map((r) => String(r["set_key"])))];
  const er = setKeys.length
    ? ((await sql`
        select set_key, authority_id::text authority_id, authority_name, n_notices, value, y0, y1
        from marts.pattern_elsewhere where set_key = any(${sql.array(setKeys)}::text[])
        order by n_notices desc, value desc
      `) as unknown as Record<string, unknown>[])
    : [];
  const elseBy = new Map<string, ElseRow[]>();
  for (const r of er) {
    const k = String(r["set_key"]);
    let l = elseBy.get(k);
    if (!l) elseBy.set(k, (l = []));
    l.push({
      authorityId: String(r["authority_id"]),
      authorityName: cleanName(r["authority_name"] as string | null),
      n: num(r["n_notices"]),
      value: num(r["value"]),
      y0: String(r["y0"] ?? ""),
      y1: String(r["y1"] ?? ""),
    });
  }
  const patterns: PatternRow[] = pr.map((r) => ({
    id: num(r["id"]), fingerprint:patternBinding(id,r).fingerprint,
    cpvClass: String(r["cpv_class"]),
    kind: r["kind"] as PatternRow["kind"],
    setKey: String(r["set_key"]),
    memberIds: (r["member_ids"] as string[]).map(String),
    memberNames: (r["member_names"] as string[]).map((n) => cleanName(n)),
    reps: num(r["reps"]),
    nLotTenders: num(r["n_lot_tenders"]),
    value: num(r["value"]),
    single: num(r["single"]),
    known: num(r["known"]),
    strength: r["strength"] as PatternRow["strength"],
    sharedAdmin: (r["shared_admin"] as string | null) ?? null,
    y0: String(r["y0"] ?? ""),
    y1: String(r["y1"] ?? ""),
    notices: (r["notices"] as string[]) ?? [],
    elsewhere: elseBy.get(String(r["set_key"])) ?? [],
  }));

  // ── matrix rows for the pattern families + family counts
  const classes = [...new Set(patterns.map((p) => p.cpvClass))];
  const mrows = classes.length
    ? ((await sql`
        select contract.ca_notice_contract_id::text external_id, contract.title contract_title, ct.ca_notice_id::text notice_id, coalesce(ct.contract_value_full,ct.closing_value,0)::text value_exact, left(ct.cpv_code, 4) cls, ct.notice_no, left(ct.finalization_date, 10) d, ct.contract_id::text contract_id,
               ct.supplier_id::text supplier_id, ct.supplier_name, ct.n_winners, ct.is_single_bidder single,
               ct.tenders_received tr, coalesce(ct.contract_value_full, ct.closing_value, 0) v_full,
               coalesce(m.assignment_type, '') like 'Acord%' framework
        from marts.contract_transactions ct
        join core.contracts contract on contract.id = ct.contract_id
        left join core.notice_meta m on m.notice_no = ct.notice_no
        where ct.authority_id = ${id} and left(ct.cpv_code, 4) = any(${sql.array(classes)}::text[])
          and ct.supplier_id is not null and ct.notice_no is not null
        order by d
      `) as unknown as Record<string, unknown>[])
    : [];
  const names = classes.length
    ? ((await sql`
        select left(code, 4) cls, min(name_ro) name from core.cpv_codes
        where code like any(${sql.array(classes.map((c) => c + "0000%"))}::text[]) group by 1
      `) as unknown as { cls: string; name: string }[])
    : [];
  const nameOf = new Map(names.map((n) => [n.cls, n.name]));
  const families: RxData["families"] = {};
  for (const c of classes) {
    const rows = mrows
      .filter((r) => r["cls"] === c)
      .map<MatrixRow>((r) => ({
        cls: c,
        externalId: String(r["external_id"]), title: String(r["contract_title"] ?? "Contract fără titlu"), noticeId: r["notice_id"] == null ? null : String(r["notice_id"]), valueExact: String(r["value_exact"]),
        notice: String(r["notice_no"]),
        d: r["d"] == null ? "" : String(r["d"]),
        contractId: String(r["contract_id"]),
        supplierId: String(r["supplier_id"]),
        supplierName: cleanName(r["supplier_name"] as string | null),
        nWinners: num(r["n_winners"]),
        single: (r["single"] as boolean | null) ?? null,
        tr: numOrNull(r["tr"]),
        vFull: num(r["v_full"]),
        framework: Boolean(r["framework"]),
      }));
    const nm = (nameOf.get(c) ?? rows[0]?.supplierName ?? c).replace(/^Lucr[ăa]ri de /i, "").replace(/^Servicii de /i, "");
    families[c] = { name: nm.charAt(0).toUpperCase() + nm.slice(1), rows, nAll: new Set(rows.map((r) => r.notice)).size };
  }
  const famCounts = (await sql`
    select count(distinct left(cpv_code, 4))::int total,
           count(distinct left(cpv_code, 4)) filter (where lots >= 3)::int with_lots
    from (select cpv_code, notice_no, count(distinct contract_id) lots
          from marts.contract_transactions where authority_id = ${id} and cpv_code is not null group by 1, 2) t
  `) as unknown as { total: number; with_lots: number }[];

  // ── direct-award slicing + the awards to draw
  const sr = (await sql`
    select supplier_id::text supplier_id, supplier_name, cpv_class, cpv_name, d0::text d0, d1::text d1, n, sum_window, ceiling, ratio, n_total, v_total,
      acquisition_type, date_fallback_count, type_inferred_count, methodology_version
    from marts.da_slicing where authority_id = ${id} order by ratio desc
  `) as unknown as Record<string, unknown>[];
  const sids = sr.map((r) => String(r["supplier_id"]));
  const dpts = sids.length
    ? ((await sql`
        select dt.sicap_da_id::text id, dt.supplier_id::text sid, left(dt.finalization_date, 10) d,
          dt.closing_value v, left(btrim(da.cpv_code), 4) cls, dt.cpv_name,
          da.cpv_code, da.acquisition_type,
          to_char(coalesce(da.publication_date, da.finalization_date) at time zone 'Europe/Bucharest', 'YYYY-MM-DD') reference_date
        from marts.da_transactions dt
        join core.direct_acquisitions da on da.sicap_da_id = dt.sicap_da_id
        where dt.authority_id = ${id} and dt.supplier_id = any(${sql.array(sids)}::bigint[]) and not dt.value_suspect and dt.closing_value > 0
        order by dt.finalization_date, dt.sicap_da_id
      `) as unknown as Record<string, unknown>[])
    : [];
  const ptsBy = new Map<string, SliceRow["points"]>();
  for (const r of dpts) {
    const k = String(r["sid"]);
    let l = ptsBy.get(k);
    if (!l) ptsBy.set(k, (l = []));
    const cpv = r["cpv_code"] as string | null;
    const acquisitionType = r["acquisition_type"] as string | null;
    const referenceDate = String(r["reference_date"] ?? "");
    l.push({ d: String(r["d"]), v: num(r["v"]), cls: String(r["cls"] ?? ""), cpvName: String(r["cpv_name"] ?? ""),
      id: String(r["id"]), referenceDate, ceiling: daCeiling(referenceDate, cpv, acquisitionType), purchaseType: daPurchaseType(cpv, acquisitionType) });
  }
  const slices: SliceRow[] = sr.map((r) => ({
    supplierId: String(r["supplier_id"]),
    supplierName: cleanName(r["supplier_name"] as string | null),
    cpvClass: String(r["cpv_class"]),
    cpvName: String(r["cpv_name"] ?? ""),
    d0: String(r["d0"]),
    d1: String(r["d1"]),
    n: num(r["n"]),
    sum: num(r["sum_window"]),
    ceiling: num(r["ceiling"]),
    ratio: num(r["ratio"]),
    nTotal: num(r["n_total"]),
    vTotal: num(r["v_total"]),
    purchaseType: r["acquisition_type"] === "da_ceiling_works" ? "works" : r["acquisition_type"] === "da_ceiling_goods_services" ? "goods_services" : null,
    dateFallbackCount: num(r["date_fallback_count"]),
    typeInferredCount: num(r["type_inferred_count"]),
    methodologyVersion: String(r["methodology_version"] ?? ""),
    points: ptsBy.get(String(r["supplier_id"])) ?? [],
  }));
  const [dsup] = (await sql`
    select count(*)::int c from (select supplier_id from marts.da_transactions
      where authority_id = ${id} and not value_suspect group by 1 having count(*) >= 3) t
  `) as unknown as { c: number }[];

  const headlines = buildHeadlines(patterns, dep, slices, families);
  return {
    profile,
    dep,
    depSuppliers: authTotal.suppliers,
    patterns,
    families,
    familiesWithLots: famCounts[0]?.with_lots ?? 0,
    familiesTotal: famCounts[0]?.total ?? 0,
    slices,
    nDaSuppliers: dsup?.c ?? 0,
    headlines,
    win,
  };
}

const fmtM = (v: number): string => formatRon(v).replace(" lei", "");
const yrs = yearRange;

/** Top three findings across the three lenses, worded from templates. */
/** CPV class name → short lowercase phrase usable after "de": "alte lucrări de finisare a construcțiilor" → "finisare a construcțiilor" */
function famLabel(name: string): string {
  let n = name.toLowerCase().replace(/^alte\s+/, "").replace(/^(lucr[ăa]ri|servicii|echipamente|produse)\s+de\s+/, "");
  if (n.length > 32) n = n.slice(0, 32).replace(/\s+\S*$/, "") + "…";
  return n;
}

export function buildHeadlines(
  patterns: PatternRow[],
  dep: DepRow[],
  slices: SliceRow[],
  families: RxData["families"],
): Headline[] {
  const out: (Headline & { score: number })[] = [];
  for (const p of patterns) {
    const fam = famLabel(families[p.cpvClass]?.name ?? p.cpvClass);
    const els = p.elsewhere;
    const elsN = els.reduce((s, e) => s + e.n, 0);
    const elsV = els.reduce((s, e) => s + e.value, 0);
    const base = p.strength === "puternic" ? 3 : p.strength === "mediu" ? 2 : 1;
    const score = base * 10 + Math.min(9, p.reps) + (p.sharedAdmin ? 5 : 0) + (els.length >= 3 ? 3 : 0) + (p.kind === "rotatie" ? 6 : 0) + (p.single >= 2 ? 5 : 0);
    if (p.kind === "rotatie")
      out.push({
        score,
        k: "loturi",
        t: `${p.memberIds.length} firme, aceleași loturi de ${fam}, ${yrs(p.y0, p.y1)}`,
        w: `${fmtM(p.value)} · ${p.known ? `${p.single}/${p.known} loturi cu un singur ofertant` : "oferte nepublicate"}${els.length ? ` · și la ${els.length === 1 ? els[0]!.authorityName : els.length + " alte autorități"}` : ""}`,
        go: "mx",
        cls: p.cpvClass,
      });
    else if (p.kind === "consortiu")
      out.push({
        score,
        k: p.sharedAdmin ? "aceiași actori" : "consorțiu stabil",
        t: p.sharedAdmin
          ? `${p.memberNames.map(shortName).join(" + ")}: un administrator, ${p.memberIds.length} firme, „consorțiu” de ${p.reps} ori`
          : `${p.memberNames.map(shortName).join(" + ")}: consorțiu de ${p.reps} ori la ${fam}`,
        w: `${fmtM(p.value)} aici${els.length ? ` · ${els.length} alte autorități, ${elsN} licitații, ${fmtM(elsV)}` : ""}${p.sharedAdmin ? ` · ${p.sharedAdmin}` : ""}`,
        go: "mx",
        cls: p.cpvClass,
      });
    else if (p.kind === "maturare")
      out.push({
        score,
        k: "loturi",
        t: `${shortName(p.memberNames[0] ?? "")} ia toate loturile de ${fam}, de ${p.reps} ori`,
        w: `${fmtM(p.value)} · ${yrs(p.y0, p.y1)} · ${p.reps} din ${p.nLotTenders} licitații cu loturi`,
        go: "mx",
        cls: p.cpvClass,
      });
    else
      out.push({
        score,
        k: "loturi",
        t: `${p.memberNames.map(shortName).join(" și ")} își împart toate loturile de ${fam}, ${yrs(p.y0, p.y1)}`,
        w: `${fmtM(p.value)} · ${p.reps} din ${p.nLotTenders} licitații cu loturi`,
        go: "mx",
        cls: p.cpvClass,
      });
  }
  // capacity: plain contracts far above the firm's turnover
  const cap = dep
    .filter((d) => d.ratio !== null && d.ratio > 3 && d.cPlain > d.cFrame && d.cPlain >= 1_000_000)
    .sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))[0];
  if (cap)
    out.push({
      score: 25 + Math.min(9, Math.round(cap.ratio ?? 0)),
      k: "capacitate",
      t: `${shortName(cap.name)}: contracte de ${fmtM(cap.cPlain)}, cifră de afaceri de ${fmtM(cap.turnWin ?? 0)}`,
      w: `contractează ${(cap.ratio ?? 0).toFixed(1).replace(".", ",")}× cât încasează · ${cap.yrs[0]}${cap.yrs.length > 1 ? `–${cap.yrs[cap.yrs.length - 1]}` : ""} · ${Math.round(cap.shareLife * 100)}% din tot ce a câștigat pe SEAP vine de aici`,
      go: "dep",
      supplierId: cap.id,
    });
  const captive = dep.filter((d) => d.shareLife >= 0.9 && d.all >= 10_000_000).sort((a, b) => b.all - a.all);
  if (captive.length >= 2)
    out.push({
      score: 22,
      k: "dependență",
      t: `${captive.length} furnizori de peste 10 mil lei trăiesc aproape numai din această autoritate`,
      w: captive
        .slice(0, 3)
        .map((d) => `${shortName(d.name)} ${Math.round(d.shareLife * 100)}%`)
        .join(" · "),
      go: "dep",
      supplierId: captive[0]!.id,
    });
  const s = slices[0];
  if (s)
    out.push({
      score: 20 + Math.min(9, Math.round(s.ratio)),
      k: "achiziții directe",
      t: `${shortName(s.supplierName)}: ${s.n} achiziții directe, ${fmtM(s.sum)}, în ${daysBetween(s.d0, s.d1)} zile`,
      w: `${s.d0.slice(0, 7)} · ${s.ratio.toFixed(1).replace(".", ",")}× plafonul de referință · ${s.cpvName.toLowerCase()}${slices.length > 1 ? ` · ${slices.length} furnizori cu grupuri similare` : ""}`,
      go: "da",
      supplierId: s.supplierId,
    });
  // one card per lens first (so a slicing story isn't crowded out by three lot patterns), then by score
  out.sort((a, b) => b.score - a.score);
  const picked: typeof out = [];
  for (const lens of ["mx", "dep", "da"] as const) {
    const first = out.find((h) => h.go === lens && !picked.includes(h));
    if (first) picked.push(first);
  }
  for (const h of out) if (picked.length < 4 && !picked.includes(h)) picked.push(h);
  return picked
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ score: _s, ...h }) => h);
}

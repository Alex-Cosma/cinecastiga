import { createDb, type DbSql } from "@seap/db";
import { cleanName, formatRon } from "@/lib/format";
import { shortName, daysBetween } from "@/lib/radiografie-fmt";
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

export interface RxProfile {
  id: string;
  name: string;
  county: string | null;
  totalContracts: number;
  nContracts: number;
  nDas: number;
  cri: number | null;
  nFlags: number;
  firstYear: string | null;
  lastYear: string | null;
}

export interface DepRow {
  id: string;
  name: string;
  county: string | null;
  foreign: boolean;
  here: number;
  total: number;
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
  points: { d: string; v: number; cls: string; cpvName: string; gap: number | null }[];
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
  const id = /^\d+$/.test(entityId) ? entityId : "0";
  const prof = (await sql`
    select ep.entity_id::text id, ep.name_display, ep.county, ep.n_contracts, ep.n_das,
           ep.total_ron_full, substr(ep.first_activity, 1, 4) y0, substr(ep.last_activity, 1, 4) y1,
           ef.cri, ef.n_flags,
           (select coalesce(sum(closing_value), 0) from marts.contract_transactions
             where authority_id = ep.entity_id and closing_value > 0) total_contracts
    from marts.entity_profile ep
    left join marts.entity_flags ef on ef.entity_id = ep.entity_id and ef.role = 'authority'
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
    cri: numOrNull(p["cri"]),
    nFlags: num(p["n_flags"]),
    firstYear: (p["y0"] as string | null) ?? null,
    lastYear: (p["y1"] as string | null) ?? null,
  };

  // ── dependency: suppliers worth a bubble (≥1% of the authority or ≥1 mil, top 150)
  const floor = Math.max(500_000, totalContracts * 0.001);
  const depRows = (await sql`
    select supplier_id::text id, supplier_name, county, is_foreign, v_here, v_total, n_auth, n_here, ns_here, nk_here,
           y0, y1, c_frame, c_plain, yrs, turn_win, ny_win, turn_last, emp_last, win_from, win_to
    from marts.supplier_dependency
    where authority_id = ${id} and v_here >= ${floor}
    order by v_here desc limit 150
  `) as unknown as Record<string, unknown>[];
  const win = {
    from: num(depRows[0]?.["win_from"] ?? 2021),
    to: num(depRows[0]?.["win_to"] ?? 2024),
  };
  const dep: DepRow[] = depRows.map((r) => {
    const cFrame = num(r["c_frame"]),
      cPlain = num(r["c_plain"]);
    const turnWin = numOrNull(r["turn_win"]);
    const nyWin = num(r["ny_win"]);
    const c = cFrame + cPlain;
    const here = num(r["v_here"]),
      total = num(r["v_total"]);
    return {
      id: String(r["id"]),
      name: cleanName(r["supplier_name"] as string | null),
      county: (r["county"] as string | null) ?? null,
      foreign: Boolean(r["is_foreign"]),
      here,
      total,
      nAuth: num(r["n_auth"]),
      n: num(r["n_here"]),
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
      shareHere: totalContracts > 0 ? here / totalContracts : 0,
      shareLife: total > 0 ? here / total : 0,
    };
  });

  // ── lot patterns + elsewhere
  const pr = (await sql`
    select id, cpv_class, kind, set_key, member_ids::text[] member_ids, member_names, reps, n_lot_tenders,
           value, single, known, strength, shared_admin, y0, y1, notices
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
    id: num(r["id"]),
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
        select left(ct.cpv_code, 4) cls, ct.notice_no, left(ct.finalization_date, 10) d, ct.contract_id::text contract_id,
               ct.supplier_id::text supplier_id, ct.supplier_name, ct.n_winners, ct.is_single_bidder single,
               ct.tenders_received tr, coalesce(ct.contract_value_full, ct.closing_value, 0) v_full,
               coalesce(m.assignment_type, '') like 'Acord%' framework
        from marts.contract_transactions ct
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
        notice: String(r["notice_no"]),
        d: String(r["d"]),
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
    select supplier_id::text supplier_id, supplier_name, cpv_class, cpv_name, d0::text d0, d1::text d1, n, sum_window, ceiling, ratio, n_total, v_total
    from marts.da_slicing where authority_id = ${id} order by ratio desc
  `) as unknown as Record<string, unknown>[];
  const sids = sr.map((r) => String(r["supplier_id"]));
  const dpts = sids.length
    ? ((await sql`
        select supplier_id::text sid, left(finalization_date, 10) d, closing_value v, left(cpv_code, 4) cls, cpv_name, gap_minutes gap
        from marts.da_transactions
        where authority_id = ${id} and supplier_id = any(${sql.array(sids)}::bigint[]) and not value_suspect and closing_value > 0
        order by finalization_date
      `) as unknown as Record<string, unknown>[])
    : [];
  const ptsBy = new Map<string, SliceRow["points"]>();
  for (const r of dpts) {
    const k = String(r["sid"]);
    let l = ptsBy.get(k);
    if (!l) ptsBy.set(k, (l = []));
    l.push({ d: String(r["d"]), v: num(r["v"]), cls: String(r["cls"] ?? ""), cpvName: String(r["cpv_name"] ?? ""), gap: numOrNull(r["gap"]) });
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
const yrs = (a: string, b: string): string => (a === b ? a : `${a}–${b}`);

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
  const captive = dep.filter((d) => d.shareLife >= 0.9 && d.here >= 10_000_000).sort((a, b) => b.here - a.here);
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
      w: `${s.d0.slice(0, 7)} · ${s.ratio.toFixed(1).replace(".", ",")}× plafonul · ${s.cpvName.toLowerCase()}${slices.length > 1 ? ` · ${slices.length} furnizori feliază` : ""}`,
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

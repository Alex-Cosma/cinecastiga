import type { DbSql } from "@seap/db";

/**
 * Radiografie marts — the structural lenses behind /entitati/{id}/radiografie
 * for contracting authorities. Precomputed for every authority so the page is
 * a lookup and "the same actors elsewhere" is a join, not a scan.
 *
 *   core.notice_meta            notice → acord-cadru / contract / SAD (from raw award-list)
 *   marts.supplier_dependency   authority × supplier: both shares, contracted vs invoiced
 *   marts.da_slicing            authority × supplier: densest 60-day window over the ceiling
 *   marts.lot_patterns          authority × CPV class: rotație / împărțire / măturare / consorțiu
 *   marts.pattern_elsewhere     member set → other authorities where they co-win
 *
 * Thresholds live in RULES and are documented on /metodologie.
 */
export const RULES = {
  /** a tender counts as "cu loturi" from this many contracts */
  minLots: 3,
  /** a pattern needs at least this many repetitions */
  minReps: 2,
  /** two winners are linked when they co-win in at least this many lot tenders */
  minShared: 2,
  /** direct-award slicing: same CPV class, within this many days */
  sliceWindowDays: 60,
  /** and at least this many awards whose sum exceeds the legal ceiling */
  sliceMinAwards: 3,
  /** legal direct-award ceiling for services/products (lei), by year */
  daCeiling: (year: number): number => (year <= 2022 ? 135_060 : 270_120),
  /** an acord-cadru's value is a ceiling over up to this many years */
  frameworkYears: 4,
  /** dependency window: the last N full years with balance sheets */
  dependencyYears: 4,
} as const;

export type PatternKind = "rotatie" | "impartire" | "maturare" | "consortiu";
export type Strength = "puternic" | "mediu" | "slab";

export interface RadiografieReport {
  noticeMeta: number;
  supplierDependency: number;
  daSlicing: number;
  lotPatterns: number;
  patternElsewhere: number;
}

// ── core.notice_meta ────────────────────────────────────────────────────────

async function buildNoticeMeta(sql: DbSql): Promise<number> {
  await sql`
    create table if not exists core.notice_meta (
      notice_no text primary key,
      assignment_type text,
      has_subsequent boolean,
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    insert into core.notice_meta (notice_no, assignment_type, has_subsequent)
    select distinct on (payload->>'noticeNo')
           payload->>'noticeNo',
           payload->'sysContractAssigmentType'->>'text',
           nullif(payload->>'hasSubsequentContracts', '')::boolean
    from raw.raw_documents
    where source = 'elicitatie' and endpoint_version = 'award-list:v1'
      and payload->>'noticeNo' is not null
    order by payload->>'noticeNo', fetched_at desc
    on conflict (notice_no) do update
      set assignment_type = excluded.assignment_type,
          has_subsequent = excluded.has_subsequent,
          updated_at = now()
  `;
  const [r] = (await sql`select count(*)::int c from core.notice_meta`) as unknown as { c: number }[];
  return r!.c;
}

// ── marts.supplier_dependency ───────────────────────────────────────────────

async function buildSupplierDependency(sql: DbSql): Promise<number> {
  const [fy] = (await sql`
    select max(year)::int y from reference.company_financials where net_turnover is not null
  `) as unknown as { y: number | null }[];
  const lastFin = fy?.y ?? new Date().getFullYear() - 1;
  const winTo = lastFin - 1; // last full year with balance sheets
  const winFrom = winTo - RULES.dependencyYears + 1;

  await sql`drop table if exists marts.supplier_dependency`;
  await sql`
    create table marts.supplier_dependency as
    with c as (
      select ct.authority_id a, ct.supplier_id s, ct.closing_value v,
             left(ct.finalization_date, 4)::int y,
             coalesce(m.assignment_type, '') like 'Acord%' fr,
             ct.is_single_bidder sb, ct.tenders_received tr
      from marts.contract_transactions ct
      left join core.notice_meta m on m.notice_no = ct.notice_no
      where ct.authority_id is not null and ct.supplier_id is not null and ct.closing_value > 0
    ),
    pair as (
      select a, s,
             sum(v) v_here, count(*) n_here,
             sum(sb::int) ns_here, count(tr) nk_here,
             min(y) y0, max(y) y1,
             sum(v) filter (where y between ${winFrom} and ${winTo} and fr) c_frame,
             sum(v) filter (where y between ${winFrom} and ${winTo} and not fr) c_plain
      from c group by a, s
    ),
    yrs as (
      select a, s, array_agg(distinct yy order by yy) yrs
      from c, generate_series(y, least(y + (case when fr then ${RULES.frameworkYears - 1} else 0 end), ${lastFin})) yy
      where y between ${winFrom} and ${winTo}
      group by a, s
    ),
    sup as (
      select supplier_id s, sum(closing_value) v_total, count(distinct authority_id) n_auth
      from marts.contract_transactions where closing_value > 0 and supplier_id is not null group by 1
    )
    select p.a authority_id, p.s supplier_id,
           e.name_display supplier_name, e.county, ep.is_foreign,
           p.v_here, sup.v_total, sup.n_auth, p.n_here, coalesce(p.ns_here, 0) ns_here, p.nk_here,
           p.y0, p.y1,
           coalesce(p.c_frame, 0) c_frame, coalesce(p.c_plain, 0) c_plain,
           y.yrs,
           (select sum(f.net_turnover) from reference.company_financials f
             where f.cui = e.cui_canonical and f.year = any(y.yrs)) turn_win,
           (select count(*)::int from reference.company_financials f
             where f.cui = e.cui_canonical and f.year = any(y.yrs) and f.net_turnover is not null) ny_win,
           (select max(f.net_turnover) from reference.company_financials f
             where f.cui = e.cui_canonical and f.year = ${winTo}) turn_last,
           (select max(f.employees) from reference.company_financials f
             where f.cui = e.cui_canonical and f.year = ${winTo}) emp_last,
           ${winFrom}::int win_from, ${winTo}::int win_to
    from pair p
    join sup on sup.s = p.s
    join core.entities e on e.id = p.s
    left join marts.entity_profile ep on ep.entity_id = p.s and ep.role = 'supplier'
    left join yrs y on y.a = p.a and y.s = p.s
  `;
  await sql`alter table marts.supplier_dependency add primary key (authority_id, supplier_id)`;
  await sql`create index supplier_dependency_auth_v_idx on marts.supplier_dependency (authority_id, v_here desc)`;
  const [r] = (await sql`select count(*)::int c from marts.supplier_dependency`) as unknown as { c: number }[];
  return r!.c;
}

// ── marts.da_slicing ────────────────────────────────────────────────────────

async function buildDaSlicing(sql: DbSql): Promise<number> {
  await sql`drop table if exists marts.da_slicing`;
  await sql`
    create table marts.da_slicing as
    with d as (
      select authority_id a, supplier_id s, left(cpv_code, 4) cls, cpv_name,
             left(finalization_date, 10)::date d, closing_value v
      from marts.da_transactions
      where not value_suspect and closing_value > 0
        and authority_id is not null and supplier_id is not null and cpv_code is not null
    ),
    w as (
      select a, s, cls, cpv_name, d, v,
             count(*) over win n,
             sum(v) over win sm,
             max(d) over win d1
      from d
      window win as (partition by a, s, cls order by d
                     range between current row and ${RULES.sliceWindowDays + " days"}::interval following)
    ),
    scored as (
      select a, s, cls, cpv_name, d d0, d1, n, sm,
             (case when extract(year from d) <= 2022 then 135060 else 270120 end) ceiling
      from w where n >= ${RULES.sliceMinAwards}
    ),
    best as (
      select distinct on (a, s) a, s, cls, cpv_name, d0, d1, n, sm, ceiling, sm / ceiling ratio
      from scored where sm > ceiling
      order by a, s, sm / ceiling desc, d0
    ),
    tot as (
      select authority_id a, supplier_id s, count(*) n_total, sum(closing_value) v_total, max(supplier_name) supplier_name
      from marts.da_transactions where not value_suspect and closing_value > 0 group by 1, 2
    )
    select b.a authority_id, b.s supplier_id, t.supplier_name,
           b.cls cpv_class, b.cpv_name, b.d0, b.d1, b.n, b.sm sum_window, b.ceiling, b.ratio,
           t.n_total, t.v_total
    from best b join tot t on t.a = b.a and t.s = b.s
  `;
  await sql`alter table marts.da_slicing add primary key (authority_id, supplier_id)`;
  await sql`create index da_slicing_auth_ratio_idx on marts.da_slicing (authority_id, ratio desc)`;
  const [r] = (await sql`select count(*)::int c from marts.da_slicing`) as unknown as { c: number }[];
  return r!.c;
}

// ── marts.lot_patterns + marts.pattern_elsewhere ────────────────────────────

interface CRow {
  authority_id: string;
  notice_no: string;
  contract_id: string;
  supplier_id: string;
  supplier_name: string;
  cls: string;
  d: string;
  n_winners: number;
  single: boolean | null;
  vfull: string | null;
  v: string | null;
}

interface Winner {
  key: string; // sorted member ids joined by '+'
  ids: string[];
  names: string[];
}

interface Tender {
  notice: string;
  d: string;
  lots: number;
  v: number;
  cells: Map<string, { w: Winner; lots: number; single: number; known: number; v: number }>;
}

export interface PatternRow {
  authority_id: string;
  cpv_class: string;
  kind: PatternKind;
  set_key: string;
  member_ids: string[];
  member_names: string[];
  reps: number;
  n_lot_tenders: number;
  value: number;
  single: number;
  known: number;
  strength: Strength;
  shared_admin: string | null;
  y0: string;
  y1: string;
  notices: string[];
}

function strength(p: { reps: number; big: boolean; proved: boolean }): Strength {
  if (p.proved || p.reps >= 3) return "puternic";
  if (p.reps >= RULES.minReps && p.big) return "mediu";
  return "slab";
}

/** One authority's contracts → its repeated lot patterns (shared_admin filled later). */
export function detectPatterns(rows: CRow[]): Omit<PatternRow, "shared_admin">[] {
  const out: Omit<PatternRow, "shared_admin">[] = [];
  const byCls = new Map<string, CRow[]>();
  for (const r of rows) {
    if (!r.cls) continue;
    let l = byCls.get(r.cls);
    if (!l) byCls.set(r.cls, (l = []));
    l.push(r);
  }
  for (const [cls, crows] of byCls) {
    // contracts → winner (consortium = one winner), tenders → contracts
    const byNotice = new Map<string, Map<string, CRow[]>>();
    for (const r of crows) {
      let n = byNotice.get(r.notice_no);
      if (!n) byNotice.set(r.notice_no, (n = new Map()));
      let c = n.get(r.contract_id);
      if (!c) n.set(r.contract_id, (c = []));
      c.push(r);
    }
    const winners = new Map<string, Winner>();
    const winnerOf = (members: CRow[]): Winner => {
      const ms = [...new Map(members.map((m) => [m.supplier_id, m])).values()].sort((a, b) =>
        a.supplier_id.localeCompare(b.supplier_id),
      );
      const key = ms.map((m) => m.supplier_id).join("+");
      let w = winners.get(key);
      if (!w) winners.set(key, (w = { key, ids: ms.map((m) => m.supplier_id), names: ms.map((m) => m.supplier_name) }));
      return w;
    };
    const all: Tender[] = [];
    for (const [notice, contracts] of byNotice) {
      const t: Tender = { notice, d: "9999", lots: contracts.size, v: 0, cells: new Map() };
      for (const members of contracts.values()) {
        const w = winnerOf(members);
        const first = members[0]!;
        const v = Number(first.vfull ?? first.v ?? 0);
        if (first.d < t.d) t.d = first.d;
        t.v += v;
        let c = t.cells.get(w.key);
        if (!c) t.cells.set(w.key, (c = { w, lots: 0, single: 0, known: 0, v: 0 }));
        c.lots += 1;
        c.v += v;
        if (first.single !== null) {
          c.known += 1;
          if (first.single) c.single += 1;
        }
      }
      all.push(t);
    }
    all.sort((a, b) => a.d.localeCompare(b.d));
    const lotTenders = all.filter((t) => t.lots >= RULES.minLots);

    // ── stable consortia (any lot count) ──
    const cons = new Map<string, { w: Winner; notices: Set<string>; v: number; y0: string; y1: string }>();
    for (const t of all) {
      for (const c of t.cells.values()) {
        if (c.w.ids.length < 2) continue;
        let s = cons.get(c.w.key);
        if (!s) cons.set(c.w.key, (s = { w: c.w, notices: new Set(), v: 0, y0: t.d, y1: t.d }));
        s.notices.add(t.notice);
        s.v += c.v;
        if (t.d < s.y0) s.y0 = t.d;
        if (t.d > s.y1) s.y1 = t.d;
      }
    }
    for (const s of cons.values()) {
      if (s.notices.size < 3) continue;
      out.push({
        authority_id: rows[0]!.authority_id,
        cpv_class: cls,
        kind: "consortiu",
        set_key: s.w.key,
        member_ids: s.w.ids,
        member_names: s.w.names,
        reps: s.notices.size,
        n_lot_tenders: lotTenders.length,
        value: s.v,
        single: 0,
        known: 0,
        strength: strength({ reps: s.notices.size, big: false, proved: false }),
        y0: s.y0.slice(0, 4),
        y1: s.y1.slice(0, 4),
        notices: [...s.notices],
      });
    }
    if (lotTenders.length === 0) continue;

    // ── sweeps: one winner takes every lot, repeatedly ──
    const sweeps = new Map<string, { w: Winner; ts: Tender[]; v: number }>();
    for (const t of lotTenders) {
      if (t.cells.size !== 1) continue;
      const c = [...t.cells.values()][0]!;
      let s = sweeps.get(c.w.key);
      if (!s) sweeps.set(c.w.key, (s = { w: c.w, ts: [], v: 0 }));
      s.ts.push(t);
      s.v += c.v;
    }

    // ── groups: winners linked when they co-win ≥minShared lot tenders ──
    const firmCols = new Map<string, Set<number>>();
    lotTenders.forEach((t, i) => {
      for (const k of t.cells.keys()) {
        let s = firmCols.get(k);
        if (!s) firmCols.set(k, (s = new Set()));
        s.add(i);
      }
    });
    const keys = [...firmCols.keys()];
    const parent = new Map(keys.map((k) => [k, k]));
    const find = (x: string): string => {
      let r = x;
      while (parent.get(r) !== r) r = parent.get(r)!;
      parent.set(x, r);
      return r;
    };
    for (let i = 0; i < keys.length; i++)
      for (let j = i + 1; j < keys.length; j++) {
        const a = firmCols.get(keys[i]!)!,
          b = firmCols.get(keys[j]!)!;
        let shared = 0;
        for (const x of a) if (b.has(x)) shared++;
        if (shared >= RULES.minShared) parent.set(find(keys[i]!), find(keys[j]!));
      }
    const comp = new Map<string, string[]>();
    for (const k of keys) {
      const r = find(k);
      let l = comp.get(r);
      if (!l) comp.set(r, (l = []));
      l.push(k);
    }
    const grouped = new Set<string>();
    for (const g of comp.values()) {
      if (g.length < 2) continue;
      const common = [...firmCols.get(g[0]!)!].filter((i) => g.every((k) => firmCols.get(k)!.has(i)));
      if (common.length < RULES.minReps) continue;
      const full = common.every(
        (i) => g.reduce((s, k) => s + (lotTenders[i]!.cells.get(k)?.lots ?? 0), 0) === lotTenders[i]!.lots,
      );
      if (g.length < 3 && !full) continue;
      let single = 0,
        known = 0,
        v = 0;
      for (const i of common)
        for (const k of g) {
          const c = lotTenders[i]!.cells.get(k)!;
          single += c.single;
          known += c.known;
          v += c.v;
        }
      const memberIds = [...new Set(g.flatMap((k) => firmCols.has(k) ? k.split("+") : []))].sort();
      const names = memberIds.map((id) => {
        for (const w of winners.values()) {
          const i = w.ids.indexOf(id);
          if (i >= 0) return w.names[i]!;
        }
        return id;
      });
      g.forEach((k) => grouped.add(k));
      const ds = common.map((i) => lotTenders[i]!.d).sort();
      out.push({
        authority_id: rows[0]!.authority_id,
        cpv_class: cls,
        kind: g.length >= 3 ? "rotatie" : "impartire",
        set_key: memberIds.join("+"),
        member_ids: memberIds,
        member_names: names,
        reps: common.length,
        n_lot_tenders: lotTenders.length,
        value: v,
        single,
        known,
        strength: strength({ reps: common.length, big: g.length >= 3, proved: single >= 2 }),
        y0: ds[0]!.slice(0, 4),
        y1: ds[ds.length - 1]!.slice(0, 4),
        notices: common.map((i) => lotTenders[i]!.notice),
      });
    }
    for (const s of sweeps.values()) {
      if (s.ts.length < RULES.minReps || grouped.has(s.w.key)) continue;
      out.push({
        authority_id: rows[0]!.authority_id,
        cpv_class: cls,
        kind: "maturare",
        set_key: s.w.key,
        member_ids: s.w.ids,
        member_names: s.w.names,
        reps: s.ts.length,
        n_lot_tenders: lotTenders.length,
        value: s.v,
        single: 0,
        known: 0,
        strength: strength({ reps: s.ts.length, big: true, proved: false }),
        y0: s.ts[0]!.d.slice(0, 4),
        y1: s.ts[s.ts.length - 1]!.d.slice(0, 4),
        notices: s.ts.map((t) => t.notice),
      });
    }
  }
  return out;
}

async function buildLotPatterns(sql: DbSql, log: (m: string) => void): Promise<[number, number]> {
  const patterns: Omit<PatternRow, "shared_admin">[] = [];
  let cur: CRow[] = [];
  let n = 0;
  const flush = () => {
    if (cur.length) patterns.push(...detectPatterns(cur));
    cur = [];
  };
  const q = sql`
    select authority_id::text, notice_no, contract_id::text, supplier_id::text, supplier_name,
           left(cpv_code, 4) cls, left(finalization_date, 10) d, n_winners,
           is_single_bidder single, contract_value_full vfull, closing_value v
    from marts.contract_transactions
    where authority_id is not null and supplier_id is not null and notice_no is not null
    order by authority_id
  `;
  for await (const batch of q.cursor(20_000)) {
    for (const r of batch as unknown as CRow[]) {
      if (cur.length && cur[0]!.authority_id !== r.authority_id) flush();
      cur.push(r);
      n++;
    }
  }
  flush();
  log(`lot patterns: ${n} contracts scanned, ${patterns.length} patterns`);

  // shared administrators inside multi-member sets (ONRC)
  const memberIds = [...new Set(patterns.filter((p) => p.member_ids.length > 1).flatMap((p) => p.member_ids))];
  const reps = memberIds.length
    ? ((await sql`
        select e.id::text id,
               -- person_key carries the locality spelling, which drifts between
               -- filings; name + birth date is the stable identity when we have it
               coalesce(lower(r.person_name) || '|' || r.birth_date::text, r.person_key) person_key,
               max(r.person_name) person_name
        from core.entities e
        join reference.company_reps r on r.cui = e.cui_canonical
        where e.id = any(${sql.array(memberIds)}::bigint[])
          and r.calitate ilike '%administrator%' and r.person_key is not null
        group by e.id, 2
      `) as unknown as { id: string; person_key: string; person_name: string }[])
    : [];
  const personsOf = new Map<string, Map<string, string>>();
  for (const r of reps) {
    let m = personsOf.get(r.id);
    if (!m) personsOf.set(r.id, (m = new Map()));
    m.set(r.person_key, r.person_name);
  }
  const rows: PatternRow[] = patterns.map((p) => {
    let shared: string | null = null;
    if (p.member_ids.length > 1) {
      const count = new Map<string, { n: number; name: string }>();
      for (const id of p.member_ids)
        for (const [k, name] of personsOf.get(id) ?? []) {
          const c = count.get(k) ?? { n: 0, name };
          c.n++;
          count.set(k, c);
        }
      const hits = [...count.values()].filter((c) => c.n >= 2).map((c) => c.name);
      if (hits.length) shared = hits.join("; ");
    }
    const st = shared ? "puternic" : p.strength;
    return { ...p, shared_admin: shared, strength: st };
  });

  await sql`drop table if exists marts.lot_patterns`;
  await sql`
    create table marts.lot_patterns (
      id serial primary key,
      authority_id bigint not null,
      cpv_class text not null,
      kind text not null,
      set_key text not null,
      member_ids bigint[] not null,
      member_names text[] not null,
      reps int not null,
      n_lot_tenders int not null,
      value numeric not null,
      single int not null,
      known int not null,
      strength text not null,
      shared_admin text,
      y0 text, y1 text,
      notices text[] not null
    )
  `;
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000).map((r) => ({
      authority_id: r.authority_id,
      cpv_class: r.cpv_class,
      kind: r.kind,
      set_key: r.set_key,
      member_ids: r.member_ids,
      member_names: r.member_names,
      reps: r.reps,
      n_lot_tenders: r.n_lot_tenders,
      value: r.value,
      single: r.single,
      known: r.known,
      strength: r.strength,
      shared_admin: r.shared_admin,
      y0: r.y0,
      y1: r.y1,
      notices: r.notices,
    }));
    await sql`insert into marts.lot_patterns ${sql(chunk)}`;
  }
  await sql`create index lot_patterns_auth_idx on marts.lot_patterns (authority_id)`;
  await sql`create index lot_patterns_set_idx on marts.lot_patterns (set_key)`;

  // ── elsewhere: same set co-winning at other authorities ──
  const sets = new Map<string, string[]>();
  for (const r of rows) sets.set(r.set_key, r.member_ids);
  const allMembers = [...new Set([...sets.values()].flat())];
  const memberContracts = allMembers.length
    ? ((await sql`
        select supplier_id::text s, authority_id::text a, authority_name, notice_no, contract_id::text c,
               left(finalization_date, 4) y, coalesce(contract_value_full, closing_value, 0)::float8 v
        from marts.contract_transactions
        where supplier_id = any(${sql.array(allMembers)}::bigint[]) and authority_id is not null
      `) as unknown as { s: string; a: string; authority_name: string; notice_no: string; c: string; y: string; v: number }[])
    : [];
  // notice → (authority, members present, contracts, value, year)
  const byNotice = new Map<
    string,
    { a: string; an: string; members: Set<string>; contracts: Set<string>; v: number; y: string }
  >();
  const memberNotices = new Map<string, Set<string>>();
  for (const r of memberContracts) {
    let n = byNotice.get(r.notice_no);
    if (!n) byNotice.set(r.notice_no, (n = { a: r.a, an: r.authority_name, members: new Set(), contracts: new Set(), v: 0, y: r.y }));
    n.members.add(r.s);
    if (!n.contracts.has(r.c)) {
      n.contracts.add(r.c);
      n.v += r.v;
    }
    let mn = memberNotices.get(r.s);
    if (!mn) memberNotices.set(r.s, (mn = new Set()));
    mn.add(r.notice_no);
  }
  const elsewhere: {
    set_key: string;
    authority_id: string;
    authority_name: string;
    n_notices: number;
    value: number;
    y0: string;
    y1: string;
  }[] = [];
  const homeOf = new Map<string, Set<string>>();
  for (const r of rows) {
    let h = homeOf.get(r.set_key);
    if (!h) homeOf.set(r.set_key, (h = new Set()));
    h.add(r.authority_id);
  }
  for (const [key, members] of sets) {
    const homes = homeOf.get(key)!;
    const seen = new Set<string>();
    const perAuth = new Map<string, { an: string; n: number; v: number; y0: string; y1: string }>();
    for (const m of members)
      for (const nn of memberNotices.get(m) ?? []) {
        if (seen.has(nn)) continue;
        seen.add(nn);
        const t = byNotice.get(nn)!;
        if (homes.has(t.a)) continue;
        let present = 0;
        for (const x of members) if (t.members.has(x)) present++;
        const ok = members.length > 1 ? present >= 2 : t.contracts.size >= RULES.minLots;
        if (!ok) continue;
        let p = perAuth.get(t.a);
        if (!p) perAuth.set(t.a, (p = { an: t.an, n: 0, v: 0, y0: t.y, y1: t.y }));
        p.n++;
        p.v += t.v;
        if (t.y < p.y0) p.y0 = t.y;
        if (t.y > p.y1) p.y1 = t.y;
      }
    for (const [a, p] of perAuth)
      elsewhere.push({ set_key: key, authority_id: a, authority_name: p.an, n_notices: p.n, value: p.v, y0: p.y0, y1: p.y1 });
  }
  await sql`drop table if exists marts.pattern_elsewhere`;
  await sql`
    create table marts.pattern_elsewhere (
      set_key text not null,
      authority_id bigint not null,
      authority_name text,
      n_notices int not null,
      value numeric not null,
      y0 text, y1 text,
      primary key (set_key, authority_id)
    )
  `;
  for (let i = 0; i < elsewhere.length; i += 1000) {
    await sql`insert into marts.pattern_elsewhere ${sql(elsewhere.slice(i, i + 1000))}`;
  }
  return [rows.length, elsewhere.length];
}

export async function runRadiografieMarts(
  sql: DbSql,
  opts: { log?: (m: string) => void } = {},
): Promise<RadiografieReport> {
  const log = opts.log ?? (() => {});
  const t0 = Date.now();
  const noticeMeta = await buildNoticeMeta(sql);
  log(`notice_meta: ${noticeMeta} (${Math.round((Date.now() - t0) / 1000)}s)`);
  const supplierDependency = await buildSupplierDependency(sql);
  log(`supplier_dependency: ${supplierDependency} (${Math.round((Date.now() - t0) / 1000)}s)`);
  const daSlicing = await buildDaSlicing(sql);
  log(`da_slicing: ${daSlicing} (${Math.round((Date.now() - t0) / 1000)}s)`);
  const [lotPatterns, patternElsewhere] = await buildLotPatterns(sql, log);
  log(`lot_patterns: ${lotPatterns}, pattern_elsewhere: ${patternElsewhere} (${Math.round((Date.now() - t0) / 1000)}s)`);
  return { noticeMeta, supplierDependency, daSlicing, lotPatterns, patternElsewhere };
}

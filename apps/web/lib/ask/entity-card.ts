import type { DbSql } from "@seap/db";
import type { AskSpec } from "./spec";
import {
  criteriaCount, ENTITY_CARD_VERSION, PODIUM_PLACES, TIES_LISTED, type PodiumFact, type PodiumPlace, type PodiumTotals, type Podium, type Ties,
} from "./entity-card-shared";

/*
 * "Cine conduce?" (entity_card-2, plan §4.13, final entity_card §3.9–§3.10):
 * the SQL of the podium's totals and facts and of the group at the top of the
 * index. The ranking by value is runSpec's (the table, stopped at place 3); the
 * words and the shapes are entity-card-shared.ts.
 */

type Fragment = ReturnType<DbSql>;

/** The ranking's own totals (the table's `totals` and `group`), as the podium reads them. */
export interface RankingTotalsInput { value: number; count: number; entities: number }

/**
 * A national selection with no condition: the table answered it from agg_top_entities and gave no total, so the
 * podium reads the nationwide one (agg_national, entity_profile). Anything else the table answers with its totals.
 */
export function bareNational(spec: Pick<AskSpec, "dataset" | "population" | "minimumRecords" | "filters">): boolean {
  if ((spec.dataset ?? "all") !== "all" || spec.population || spec.minimumRecords) return false;
  return Object.values(spec.filters).every((value) => value === undefined || value === null || value === "");
}

/** The nationwide totals kept per marts build (the files of agg_national and entity_profile, as the counts' stamp). */
const nationalKept = new Map<string, { value: PodiumTotals | null; at: number }>();
/** At most this long on the same files (a table changed in place keeps its file), as the counts. */
const NATIONAL_TTL_MS = 10 * 60_000;
/** Tests and ask-perf: forget the kept nationwide totals. */
export function forgetNationalTotals(): void { nationalKept.clear(); }

/**
 * The totals of the nationwide ranking by value: the value and records of both channels (the analysis ceilings
 * already applied, v_plaf/n_plaf) and the firms or institutions with value (their profiles' sums are the rollups').
 * Kept per build: the count over entity_profile (~15 ms) is paid once a build, then only the catalog stamp.
 */
export async function nationalTotals(sql: DbSql, role: "authority" | "supplier"): Promise<PodiumTotals | null> {
  // The rollup may not exist yet (a build before it, a fixture): then no total, and the answer says no share.
  const [stamp] = (await sql`
    select current_database() db, pg_relation_filenode(to_regclass('marts.agg_national'))::text agg,
           pg_relation_filenode(to_regclass('marts.entity_profile'))::text ep
  `) as unknown as { db: string; agg: string | null; ep: string | null }[];
  if (!stamp?.agg || !stamp.ep) return null;
  const build = `${stamp.db}:${stamp.agg}:${stamp.ep}:`;
  const hit = nationalKept.get(build + role);
  if (hit && Date.now() - hit.at <= NATIONAL_TTL_MS) return hit.value;
  const [national] = (await sql`select coalesce(sum(v_plaf), 0)::text v, coalesce(sum(n_plaf), 0)::text n from marts.agg_national`) as unknown as { v: string; n: string }[];
  const [pool] = (await sql`select count(*)::text n from marts.entity_profile where role = ${role} and total_ron_split > 0`) as unknown as { n: string }[];
  const value = !national || Number(national.v) <= 0 ? null : { value: Number(national.v), count: Number(national.n), entities: Number(pool?.n ?? 0) };
  // A new build has new files: the older builds' entries go.
  for (const old of nationalKept.keys()) if (!old.startsWith(build)) nationalKept.delete(old);
  nationalKept.set(build + role, { value, at: Date.now() });
  return value;
}

/**
 * The podium of a ranking's first rows: places 1–3 and the denominator of „% din total”. Under a band of
 * CÂȘTIGĂTORII the denominator is the band's (owner decision entity_card 4, plan §9 F6c) and the selection's totals
 * stay beside it; elsewhere the selection's. Null totals say nothing of a share.
 */
export function podiumOf(rows: readonly PodiumPlace[], totals: RankingTotalsInput | null | undefined, group: RankingTotalsInput | null | undefined): Podium {
  const total = group ?? totals ?? null;
  return {
    version: ENTITY_CARD_VERSION,
    places: rows.slice(0, PODIUM_PLACES).map((row) => ({ entityId: row.entityId, name: row.name, county: row.county, value: row.value, count: row.count })),
    total: total ? { value: total.value, count: total.count, entities: total.entities } : null,
    ...(group && totals ? { selection: { value: totals.value, count: totals.count, entities: totals.entities } } : {}),
  };
}

interface TiesRow {
  pool: string; lvl: string | null; cnt: string; nl: string | null; nc: string;
  entity_id: string | null; name_display: string | null; county: string | null; n_das: number | null; total_ron: string | null;
  n_flags: number | null; flags: string[] | null;
}

/**
 * The group at the top of the index (final entity_card §3.10): one statement over the profiles in the question's
 * group (`where`: profilePredicates), the level of the best, how many are on it, the next level and how many, and
 * the first TIES_LISTED at the top by value (then id). `county` is the profile row's own, a firm's seat.
 * Null without a profile.
 */
export async function tiesOf(sql: DbSql, o: { role: "authority" | "supplier"; where: Fragment; county: Fragment }): Promise<Ties | null> {
  const rows = (await sql`
    with p as materialized (
      select ef.entity_id, ef.name_display, ${o.county} county, ef.n_das, ef.total_ron, ef.cri, ef.n_flags, ef.flags
      from marts.entity_flags ef
      where ${o.where} and ef.cri is not null
    ), tp as (
      select count(*) pool, max(cri) lvl from p
    ), nxt as (
      select max(p.cri) nl from p, tp where p.cri < tp.lvl
    )
    select tp.pool::text pool, tp.lvl::text lvl,
           (select count(*) from p where p.cri = tp.lvl)::text cnt,
           nxt.nl::text nl, (select count(*) from p where p.cri = nxt.nl)::text nc,
           t.entity_id::text entity_id, t.name_display, t.county, t.n_das, t.total_ron::text total_ron, t.n_flags, t.flags
    from tp cross join nxt
    left join lateral (
      select * from p where p.cri = tp.lvl order by p.total_ron desc nulls last, p.entity_id limit ${TIES_LISTED}
    ) t on true
    order by t.total_ron desc nulls last, t.entity_id
  `) as unknown as TiesRow[];
  const head = rows[0];
  if (!head || head.lvl === null || Number(head.pool) === 0) return null;
  const listed = rows.filter((row) => row.entity_id !== null);
  return {
    version: ENTITY_CARD_VERSION,
    level: Number(head.lvl),
    maxFlags: Number(listed[0]?.n_flags ?? 0),
    criteria: criteriaCount(o.role),
    count: Number(head.cnt),
    pool: Number(head.pool),
    nextLevel: head.nl === null ? null : Number(head.nl),
    nextCount: Number(head.nc),
    rows: listed.map((row) => ({
      entityId: String(row.entity_id),
      name: row.name_display ?? "?",
      county: row.county,
      count: Number(row.n_das ?? 0),
      value: Number(row.total_ron ?? 0),
      nFlags: Number(row.n_flags ?? 0),
      flags: row.flags ?? [],
    })),
  };
}


export interface PodiumFactRows {
  id: string; joint: string; largest: string | null; largest_src: "da" | "contracts" | null;
}
export interface PodiumProfileRows {
  id: string; employees: number | null; employees_year: number | null; first_activity: string | null;
}

/** The facts of the places (ids) as the answer shows them, from the records' grouping and the firms' profiles. */
export function podiumFactsOf(records: readonly PodiumFactRows[], profiles: readonly PodiumProfileRows[], ids: readonly string[]): PodiumFact[] {
  return ids.map((id) => {
    const channels = records.filter((row) => row.id === id);
    const largest = channels
      .filter((row) => row.largest !== null && row.largest_src !== null)
      .sort((a, b) => Number(b.largest) - Number(a.largest) || String(a.largest_src).localeCompare(String(b.largest_src)))[0];
    const profile = profiles.find((row) => row.id === id);
    return {
      entityId: id,
      joint: channels.reduce((sum, row) => sum + Number(row.joint), 0),
      largest: largest ? { value: Number(largest.largest), src: largest.largest_src! } : null,
      employees: profile?.employees ?? null,
      employeesYear: profile?.employees_year ?? null,
      firstActivity: profile?.first_activity?.slice(0, 10) ?? null,
    };
  });
}

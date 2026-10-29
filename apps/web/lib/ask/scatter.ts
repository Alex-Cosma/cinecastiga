import type { DbSql } from "@seap/db";
import { readAuthorityKinds } from "./authority-kind";
import { fold } from "./predicates";
import { countyDisplay } from "./resolved-spec";
import { instanceFacts, recordFacts } from "./scatter-records";
import {
  SCATTER_CLOUD_MIN_DAS, SCATTER_CLOUD_MIN_PROFILES, SCATTER_LIST_MAX, SCATTER_LIST_MIN_DAS, SCATTER_POINTS_MAX, flagBit, scatterFlagsOf, scatterLevels, scatterRank,
  type ScatterBands, type ScatterCloudPoint, type ScatterData, type ScatterFlag, type ScatterFlagFact, type ScatterListRow, type ScatterRole,
} from "./scatter-shared";
import type { AskSpec, RankBy } from "./spec";
import type { LocateMatch } from "./facet-parts";

/*
 * The risk cloud's answer (scatter-2, plan §4.12, final scatter §3): one pass
 * over marts.entity_flags counts the group (the profiles with at least 10
 * direct acquisitions) and, per signal, those that have it; then the group's
 * points (every one up to 2,000, else the cells of the grey layer with the
 * named points exact) and the list (at least 20 acquisitions, the order and
 * the signal of the strip). The signals' years and shares come from
 * marts.flag_instances, for the 50 listed alone; the records behind each
 * signal and the shares of the two rates are the answer's facts, asked once it
 * is drawn (part=profile, facets.ts), never before it.
 */

type Fragment = ReturnType<DbSql>;
/** A fragment is a query nobody has awaited: the tagged template types it by its rows. */
const frag = (query: unknown): Fragment => query as Fragment;

export interface ScatterInput {
  spec: AskSpec;
  role: ScatterRole;
  /** profilePredicates(ctx, role, 10): the role, the threshold, the county or seat, the kind. */
  where: Fragment;
  /** The county beside a profile (profileCounty): an institution's own, a firm's seat. */
  county: Fragment;
  /** marts.entity_flags.log_total_ron exists (martColumns). */
  logTotal: boolean;
}

/** The list's order (final §3.3): signals, then value, then id — the order of "Cine conduce?" on the index; or value. */
export function scatterOrder(s: DbSql, rank: RankBy): Fragment {
  return frag(rank === "risk" ? s`ef.cri desc nulls last, ef.total_ron desc nulls last, ef.entity_id` : s`ef.total_ron desc nulls last, ef.entity_id`);
}

/** The profiles of a group that have the signal: the cloud's group, narrowed by the strip's choice. */
export const hasFlag = (s: DbSql, flag: ScatterFlag | null | undefined): Fragment => frag(flag ? s`ef.flags ? ${flag}` : s`true`);

const bit = (role: ScatterRole, flags: unknown): number => {
  if (!Array.isArray(flags)) return 0;
  let mask = 0;
  for (const flag of scatterFlagsOf(role)) if (flags.includes(flag)) mask |= flagBit(role, flag);
  return mask;
};

const BAND_CELLS = 80;
async function bands(s: DbSql, where: Fragment, x: Fragment, minLog: number, maxLog: number): Promise<ScatterBands> {
  const cells = (await s`
    select width_bucket(${x}, ${minLog}, ${maxLog + 1e-9}, ${BAND_CELLS}) bx, ef.n_flags k, count(*)::int n
    from marts.entity_flags ef where ${where} group by 1, 2
  `) as unknown as { bx: number; k: number; n: number }[];
  return { minLog, maxLog, nx: BAND_CELLS, total: cells.reduce((t, c) => t + c.n, 0), cells: cells.map((c) => [Number(c.bx), Number(c.k), Number(c.n)]) };
}

export async function scatterAnswer(s: DbSql, input: ScatterInput): Promise<ScatterData> {
  const { spec, role } = input;
  const rank = scatterRank(spec), flag = spec.scatter?.flag ?? null, flags = scatterFlagsOf(role);
  const group = frag(s`${input.where} and ef.cri is not null`);
  const x = frag(input.logTotal ? s`ef.log_total_ron` : s`log(greatest(coalesce(ef.total_ron, 0), 1))`);
  const per = flags.map((code, i) => s`count(*) filter (where ef.flags ? ${code})::int ${s(`c${i}`)}`);
  const chosenList = flag ? s`, count(*) filter (where ef.flags ? ${flag} and ef.n_das >= ${SCATTER_LIST_MIN_DAS})::int chosen_list` : s``;
  const [count] = (await s`
    select count(*)::int n, count(*) filter (where ef.n_das >= ${SCATTER_LIST_MIN_DAS})::int n_list,
           percentile_cont(0.9) within group (order by ef.total_ron) p90, min(${x}) mn, max(${x}) mx, ${per.reduce((a, b) => s`${a}, ${b}`)}${chosenList}
    from marts.entity_flags ef where ${group}
  `) as unknown as ({ n: number; n_list: number; p90: string | null; mn: string | null; mx: string | null; chosen_list?: number } & Record<string, number>)[];
  const n = Number(count?.n ?? 0);
  const criteria: ScatterData["criteria"] = {};
  flags.forEach((code, i) => { criteria[code] = Number(count?.[`c${i}`] ?? 0); });
  // A group of fewer than 10 profiles is no cloud: the whole group is the list, from 10 acquisitions (final §4.4).
  const small = n < SCATTER_CLOUD_MIN_PROFILES;
  const listMin = small ? SCATTER_CLOUD_MIN_DAS : SCATTER_LIST_MIN_DAS;
  const data: ScatterData = {
    version: 2, role, levels: scatterLevels(role), rankBy: rank, flag,
    group: { n, nList: small ? n : Number(count?.n_list ?? 0), ...(small ? { small: true as const } : {}) },
    criteria, p90: Number(count?.p90 ?? 0), cloud: { points: [] }, list: [],
    ...(flag ? { chosen: { n: criteria[flag] ?? 0, nList: small ? criteria[flag] ?? 0 : Number(count?.chosen_list ?? 0) } } : {}),
  };
  if (n === 0) return data;

  // The list: the strip's order and signal, at least 20 acquisitions, the first 50.
  const listed = (await s`
    select ef.entity_id::text id, ef.name_display name, ${input.county} county, ef.total_ron, ef.n_das, ef.cri, ef.n_flags, ef.flags
    from marts.entity_flags ef
    where ${group} and ef.n_das >= ${listMin} and ${hasFlag(s, flag)}
    order by ${scatterOrder(s, rank)} limit ${SCATTER_LIST_MAX}
  `) as unknown as { id: string; name: string | null; county: string | null; total_ron: string | null; n_das: number; cri: string; n_flags: number; flags: string[] | null }[];
  const ids = listed.map((r) => r.id);
  const years = await instanceFacts(s, role, ids);
  const kinds = role === "authority" && !spec.filters.authorityKind && ids.length ? (await readAuthorityKinds(s)).byId : null;
  const profiles = role === "supplier" && ids.length ? (await s`
    select ep.entity_id::text id, ep.employees, ep.employees_year from marts.entity_profile ep
    where ep.role = 'supplier' and ep.entity_id = any(${s.array(ids)}::bigint[])
  `) as unknown as { id: string; employees: number | null; employees_year: number | null }[] : [];
  const filed = new Map(profiles.map((p) => [p.id, p]));
  data.list = listed.map((r) => {
    const have = Array.isArray(r.flags) ? r.flags : [];
    const cheap = years.get(r.id) ?? [];
    // Every signal of the profile, in the strip's order, with the years or the share its instances say.
    const facts: ScatterFlagFact[] = flags.filter((code) => have.includes(code)).map((code) => cheap.find((f) => f.code === code) ?? { code });
    const row: ScatterListRow = {
      entityId: r.id, name: r.name ?? "?", county: r.county ? countyDisplay(r.county) : null, value: Number(r.total_ron ?? 0), nDas: Number(r.n_das), cri: Number(r.cri), nFlags: Number(r.n_flags), flags: facts,
    };
    if (kinds) row.kind = kinds.get(r.id) ?? null;
    if (role === "supplier") { const f = filed.get(r.id); row.employees = f?.employees ?? null; row.employeesYear = f?.employees_year ?? null; }
    return row;
  });
  const named = (): ScatterCloudPoint[] => data.list.map((r) => ({
    id: r.entityId, name: r.name, value: r.value, nFlags: r.nFlags, nDas: r.nDas, flags: bit(role, r.flags.map((f) => f.code)),
  }));

  // The cloud: every point up to 2,000; above, the grey cells of the group with the named points exact.
  if (small) return data;
  if (n <= SCATTER_POINTS_MAX) {
    const rows = (await s`
      select ef.entity_id::text id, ef.name_display name, ef.total_ron, ef.n_flags, ef.n_das, ef.flags
      from marts.entity_flags ef where ${group} order by ef.entity_id
    `) as unknown as { id: string; name: string | null; total_ron: string | null; n_flags: number; n_das: number; flags: string[] | null }[];
    data.cloud = { points: rows.map((r) => ({ id: r.id, name: r.name ?? "?", value: Number(r.total_ron ?? 0), nFlags: Number(r.n_flags), nDas: Number(r.n_das), flags: bit(role, r.flags) })) };
    return data;
  }
  const minLog = Number(count!.mn), maxLog = Math.max(Number(count!.mx), minLog + 0.01);
  const all = await bands(s, group, x, minLog, maxLog);
  data.cloud = {
    bands: all, named: named(),
    ...(flag ? { flagged: await bands(s, frag(s`${group} and ef.flags ? ${flag}`), x, minLog, maxLog) } : {}),
  };
  return data;
}

// --- the facts of the profiles on screen (part=profile) and the search in the group (part=locate)

export interface ProfileFacts {
  id: string;
  nDas: number;
  flags: ScatterFlagFact[];
}

/**
 * The facts of up to 50 profiles: every signal they have with its years or share and the records behind it. The
 * profile's own signals are the build's (entity_flags.flags); the years and the main partner's share its instances';
 * the two rates and the records come from the profile's acquisitions (scatter-records.ts).
 */
export async function scatterProfileFacts(s: DbSql, role: ScatterRole, ids: readonly string[]): Promise<ProfileFacts[]> {
  const asked = [...new Set(ids)].slice(0, SCATTER_LIST_MAX).filter((id) => /^[1-9]\d{0,17}$/.test(id));
  if (!asked.length) return [];
  const rows = (await s`
    select ef.entity_id::text id, ef.n_das, ef.flags from marts.entity_flags ef where ef.role = ${role} and ef.entity_id = any(${s.array(asked)}::bigint[])
  `) as unknown as { id: string; n_das: number; flags: string[] | null }[];
  const have = new Map(rows.map((r) => [r.id, (Array.isArray(r.flags) ? r.flags : []) as string[]]));
  const nDas = new Map(rows.map((r) => [r.id, Number(r.n_das)]));
  const cheap = await instanceFacts(s, role, [...have.keys()]);
  const records = await recordFacts(s, role, [...have.keys()], nDas, have);
  const order = scatterFlagsOf(role);
  return rows.map((r) => {
    const base = cheap.get(r.id) ?? [], withRecords = records.get(r.id) ?? [];
    const facts = order.filter((code) => have.get(r.id)?.includes(code)).map((code): ScatterFlagFact => ({
      ...base.find((f) => f.code === code), ...withRecords.find((f) => f.code === code), code,
    }));
    return { id: r.id, nDas: Number(r.n_das), flags: facts };
  });
}

/** The names a search matches: folded, every word of the text (the locate part's pattern). */
const namePattern = (q: string) => `%${fold(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * "Unde e o instituție / firmă?" in the cloud (final scatter §3.5): the profiles of the group whose name holds the
 * text, up to `limit`, each with its place in the list's order (the strip's signal and order), or why it has none.
 * Same predicates as the answer, so a profile out of the group is not found.
 */
export async function scatterLocate(s: DbSql, input: ScatterInput, q: string, limit: number): Promise<{ total: number; by: RankBy; matches: LocateMatch[] }> {
  const { spec, role } = input;
  const rank = scatterRank(spec), flag = spec.scatter?.flag ?? null;
  const group = frag(s`${input.where} and ef.cri is not null`);
  const [size] = (await s`select count(*)::int n from marts.entity_flags ef where ${group}`) as unknown as { n: number }[];
  const listMin = Number(size?.n ?? 0) < SCATTER_CLOUD_MIN_PROFILES ? SCATTER_CLOUD_MIN_DAS : SCATTER_LIST_MIN_DAS;
  const listCond = frag(s`${group} and ef.n_das >= ${listMin} and ${hasFlag(s, flag)}`);
  const [total] = (await s`select count(*)::int n from marts.entity_flags ef where ${listCond}`) as unknown as { n: number }[];
  const found = (await s`
    select ef.entity_id::text id, ef.name_display name, ${input.county} county, ef.total_ron, ef.n_das, ef.cri, ef.n_flags, ef.flags
    from marts.entity_flags ef
    where ${group} and lower(unaccent(ef.name_display)) like ${namePattern(q)}
    order by ${scatterOrder(s, rank)}
    limit ${limit * 5}
  `) as unknown as { id: string; name: string | null; county: string | null; total_ron: string | null; n_das: number; cri: string; n_flags: number; flags: string[] | null }[];
  // The place of each: the profiles of the list before it in the order (value ties by id).
  const eligible = found.filter((r) => Number(r.n_das) >= listMin && (!flag || (r.flags ?? []).includes(flag)));
  const placed = new Map<string, number>();
  if (eligible.length) {
    const places = (await s`
      with m as (select * from unnest(${s.array(eligible.map((r) => r.id))}::bigint[], ${s.array(eligible.map((r) => String(Number(r.cri))))}::numeric[], ${s.array(eligible.map((r) => String(Number(r.total_ron ?? 0))))}::numeric[]) t(id, cri, total_ron))
      select m.id::text id, (select count(*) from marts.entity_flags ef where ${listCond} and ${rank === "risk"
        ? s`(ef.cri > m.cri or (ef.cri = m.cri and (coalesce(ef.total_ron, 0) > m.total_ron or (coalesce(ef.total_ron, 0) = m.total_ron and ef.entity_id < m.id))))`
        : s`(coalesce(ef.total_ron, 0) > m.total_ron or (coalesce(ef.total_ron, 0) = m.total_ron and ef.entity_id < m.id))`})::int + 1 place
      from m
    `) as unknown as { id: string; place: number }[];
    for (const p of places) placed.set(p.id, p.place);
  }
  const matches: LocateMatch[] = found.map((r) => {
    const rankIn = placed.get(r.id) ?? null;
    const have = Array.isArray(r.flags) ? r.flags : [];
    const why = rankIn !== null ? null : Number(r.n_das) < listMin ? "below" as const : "signal" as const;
    return {
      id: r.id, name: r.name ?? "?", county: r.county ? countyDisplay(r.county) : null, rank: rankIn, value: Number(r.total_ron ?? 0), n: Number(r.n_das),
      profile: { flags: have, nFlags: Number(r.n_flags), cri: Number(r.cri), why },
    };
  });
  // The ones with a place first, by place; the rest in the order of the list.
  matches.sort((a, b) => a.rank === null && b.rank === null ? 0 : a.rank === null ? 1 : b.rank === null ? -1 : a.rank - b.rank);
  return { total: Number(total?.n ?? 0), by: rank, matches: matches.slice(0, limit) };
}

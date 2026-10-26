import type { DbSql } from "@seap/db";
import catalog from "../reference/population-rpl2021.json";
import { readPopulationMappingRows, sectorTownHallPopulations, uniquePopulationMappings } from "../peer-population";
import { readAuthorityKinds } from "./authority-kind";
import {
  PEER_MEMBERS_PAGE, PEER_MINIMUM, PEER_ROW_ORDER, PROFILE_MIN_DAS, countyDisplay, peerKey, peerRowLabel, peerRowTip, peerTicks, similarRuleName,
  type PeerCoverage, type PeerDialogData, type PeerFacts, type PeerRow, type PeerRowId, type SimilarFacts,
} from "./peer-groups-shared";
import { fold } from "./predicates";
import type { DistributionMember } from "./compile";
import { namedKind, type ParsedAuthorityKind, type PeersOptions } from "./spec";

/*
 * The comparison group of a distribution, on the server (plan §4.11 "Motor",
 * final distribution §7.2): the entity's facts that name its group, the SQL
 * of each tick over marts.entity_flags, and the size of every combination of
 * ticks for "Față de cine?" (GET /api/ask/peers). runSpec and runRows apply
 * the same conditions (compile.ts case "distribution"), beside the county and
 * an old link's kind, which profilePredicates already writes.
 *
 * The town halls come from the strict population mapping of /comparatii
 * (lib/peer-population.ts uniquePopulationMappings, level `local`), the county
 * councils from its `county` level, the six sector town halls from
 * sectorTownHallPopulations, hospitals and schools from the one
 * classification of institutions (lib/ask/authority-kind.ts). A name without
 * a strict mapping never falls back to a rank guessed from the name.
 */

type Fragment = ReturnType<DbSql>;

/** The profile of the entity placed in its group (marts.entity_flags), at any number of direct acquisitions. */
export interface PeerFocalRow {
  entityId: string; name: string; county: string | null; nDas: number; nFlags: number; cri: number | null; flags: string[];
}

export async function readPeerFocal(q: DbSql, role: "authority" | "supplier", entityId: string): Promise<PeerFocalRow | null> {
  const [row] = await q`
    select ef.entity_id::text id, ef.name_display, ef.county, ef.n_das, ef.n_flags, ef.cri, ef.flags
    from marts.entity_flags ef where ef.role = ${role} and ef.entity_id = ${entityId}
  ` as unknown as { id: string; name_display: string | null; county: string | null; n_das: number; n_flags: number; cri: string | null; flags: string[] | null }[];
  if (!row) return null;
  return {
    entityId: row.id, name: row.name_display ?? "?", county: row.county, nDas: Number(row.n_das), nFlags: Number(row.n_flags ?? 0),
    cri: row.cri === null ? null : Number(row.cri), flags: Array.isArray(row.flags) ? row.flags : [],
  };
}

/** The strict population index, by level: town halls (local), county councils, sector town halls. */
export interface PeerPopulations {
  local: ReadonlyMap<string, number>;
  county: ReadonlySet<string>;
  sectors: ReadonlyMap<string, number>;
  /** The SIRUTA codes the strict mapping identifies (one entity each). */
  mapped: ReadonlySet<number>;
}

/** One index per process, keyed by the marts build of the profiles (a rebuild truncates them), for 10 minutes. */
let cached: { marker: string; at: number; value: Promise<PeerPopulations> } | null = null;
const CACHE_MS = 600_000;

/** readPopulationMappingRows (~55 ms warm) once per build: every group of a distribution reads the same index. */
export async function readPeerPopulations(q: DbSql): Promise<PeerPopulations> {
  const [probe] = await q`select coalesce((select c.oid::text || '.' || c.relfilenode::text from pg_class c where c.oid = to_regclass('marts.entity_flags')), '') marker`;
  const marker = String(probe?.marker ?? "");
  if (cached && cached.marker === marker && Date.now() - cached.at < CACHE_MS) return cached.value;
  const value = (async () => {
    const rows = await readPopulationMappingRows(q);
    const local = new Map<string, number>(), county = new Set<string>(), mapped = new Set<number>();
    for (const [id, population] of uniquePopulationMappings(rows)) {
      if (population.level === "local") { local.set(id, population.value); if (population.siruta) mapped.add(population.siruta); }
      else if (population.level === "county") county.add(id);
    }
    const sectors = new Map([...sectorTownHallPopulations(rows)].map(([id, population]) => [id, population.value]));
    return { local, county, sectors, mapped };
  })();
  cached = { marker, at: Date.now(), value };
  value.catch(() => { if (cached?.value === value) cached = null; });
  return value;
}
/** Tests that write the reference rows inside one build. */
export function forgetPeerPopulations(): void { cached = null; }

/** The town halls of the band in the RPL 2021 catalog, and how many of them the strict mapping identifies (final §3.1). */
export function populationCoverage(min: number, max: number, mapped: ReadonlySet<number>): PeerCoverage {
  const inBand = catalog.units.filter((unit) => unit.kind !== "sector" && unit.population >= min && unit.population <= max);
  const missing = inBand.filter((unit) => !mapped.has(unit.siruta));
  // "MUNICIPIUL ALBA IULIA" → "Alba Iulia": the place, without its rank (final §3.1).
  const title = (name: string) => name.replace(/^(?:MUNICIPIUL|ORAȘ|ORAȘUL|ORAŞ|ORAŞUL|COMUNA) /u, "").toLocaleLowerCase("ro-RO")
    .replace(/(^|[\s-])\p{L}/gu, (m) => m.toLocaleUpperCase("ro-RO"));
  return { inBand: inBand.length, identified: inBand.length - missing.length, missing: missing.slice(0, 3).map((unit) => title(unit.name)) };
}

/** The facts of the entity's group and the members of its "același tip" (null: it has none). */
export interface PeerResolution {
  facts: PeerFacts;
  similarIds: readonly string[] | null;
  coverage?: PeerCoverage;
  /** The population of the members, where the group goes by it (the list shows it). */
  populations?: ReadonlyMap<string, number>;
}

const half = (n: number) => Math.ceil(n / 2);

export async function resolvePeerFacts(q: DbSql, role: "authority" | "supplier", focal: PeerFocalRow): Promise<PeerResolution> {
  const facts: PeerFacts = {
    role, entityId: focal.entityId, name: focal.name, county: countyDisplay(focal.county), nDas: focal.nDas, similar: null,
    activity: focal.nDas >= PROFILE_MIN_DAS ? { min: half(focal.nDas), max: focal.nDas * 2 } : null,
  };
  if (role === "supplier") return { facts, similarIds: null };
  const pops = await readPeerPopulations(q);
  const id = focal.entityId;
  const others = (ids: Iterable<string>) => [...ids].filter((other) => other !== id);
  let similar: SimilarFacts | null = null, similarIds: string[] | null = null, coverage: PeerCoverage | undefined, populations: ReadonlyMap<string, number> | undefined;
  if (pops.sectors.has(id)) {
    similar = { rule: "sectors" };
    similarIds = others(pops.sectors.keys());
    populations = pops.sectors;
  } else if (pops.local.has(id)) {
    const value = pops.local.get(id)!, min = half(value), max = value * 2;
    similar = { rule: "population", value, min, max };
    similarIds = others([...pops.local].filter(([, v]) => v >= min && v <= max).map(([other]) => other));
    coverage = populationCoverage(min, max, pops.mapped);
    populations = pops.local;
  } else if (pops.county.has(id)) {
    similar = { rule: "county_councils" };
    similarIds = others(pops.county);
  } else {
    const kinds = await readAuthorityKinds(q);
    const kind = kinds.byId.get(id);
    if (kind === "spital" || kind === "scoala") {
      similar = { rule: "kind", kind };
      similarIds = others(kinds.ids[kind]);
    } else {
      // A town hall without a strict mapping, or an institution the names do not place (final §3.2: never a guessed rank).
      facts.similarReason = kind === "comuna" || kind === "oras_municipiu" || kind === "consiliu_judetean"
        ? `Populația lui ${focal.name} nu se poate stabili sigur (RPL 2021).`
        : `Tipul lui ${focal.name} nu se poate stabili sigur.`;
    }
  }
  facts.similar = similar;
  return { facts, similarIds, ...(coverage ? { coverage } : {}), ...(populations ? { populations } : {}) };
}

/** Town halls, county councils and sectors are measured by their population: the number of acquisitions is offered only from a link (final §3.4). */
const activityOffered = (facts: PeerFacts, peers: PeersOptions | undefined) =>
  Boolean(peers?.activity) || !(facts.similar && facts.similar.rule !== "kind");

/** The rows of the window for this entity (final §3.1 table), in its order; a row it cannot use is disabled with its reason. */
export function peerRows(facts: PeerFacts, peers: PeersOptions | undefined): PeerRow[] {
  const ids = PEER_ROW_ORDER.filter((id) =>
    id === "similar" ? facts.role === "authority"
      : id === "domain" ? false // phase 2 (DECISIONS A3-main-cpv-div): marts.entity_flags.main_cpv_div, the row comes with it
        : id === "activity" ? activityOffered(facts, peers) && facts.activity !== null : true);
  return ids.map((id): PeerRow => {
    const row: PeerRow = { id, label: peerRowLabel(id, facts), rule: id === "similar" ? similarRuleName(facts.similar) : id === "county" ? "același județ" : id === "activity" ? "activitate apropiată" : "același domeniu principal", tip: peerRowTip(id, facts) };
    if (id === "similar" && !facts.similar) row.disabled = { short: "necunoscut", tip: row.tip };
    if (id === "county" && !facts.county) row.disabled = { short: "necunoscut", tip: row.tip };
    return row;
  });
}

/** The conditions of the ticks `peers` and their facts (the county and an old link's kind are profilePredicates'). */
export function peerConditions(sql: DbSql, resolution: PeerResolution, peers: PeersOptions | undefined): Fragment[] {
  const parts: Fragment[] = [];
  if (peers?.similar && resolution.similarIds) parts.push(sql`ef.entity_id = any(${sql.array([...resolution.similarIds])}::bigint[])`);
  const activity = resolution.facts.activity;
  if (peers?.activity && activity) parts.push(sql`ef.n_das between ${activity.min} and ${activity.max}`);
  return parts;
}

/**
 * Why the spec's ticks cannot form a group around this entity (a link, or an
 * entity changed under them): "același tip" without a sure type, activity
 * below the profile's threshold. Refused with the reason, never ignored.
 */
export function peerTickError(resolution: PeerResolution, peers: PeersOptions | undefined): string | null {
  const { facts } = resolution;
  if (peers?.similar && facts.role === "authority" && !facts.similar)
    return `${facts.similarReason ?? `Tipul lui ${facts.name} nu se poate stabili sigur.`} Scoate „același tip” sau alege altă instituție.`;
  if (peers?.activity && !facts.activity) return `${facts.name} are sub ${PROFILE_MIN_DAS} achiziții directe: activitatea apropiată nu se poate calcula.`;
  return null;
}

/** An old link's county: set and not the entity's own (final §4.5, "Județul Cluj ×"). */
export function legacyCounty(filters: Record<string, unknown>, facts: Pick<PeerFacts, "county">): string | null {
  const county = typeof filters.county === "string" && filters.county ? filters.county : null;
  return county && countyDisplay(county) !== facts.county ? county : null;
}

/**
 * GET /api/ask/peers (final §7.4): the rows of "Față de cine?" for the entity
 * of a draft, and the size of the group for every combination of them, in one
 * statement with FILTER, with an old link's kind and other county applied as
 * the answer applies them. Ticking "același județ" replaces the other county.
 */
export async function peerDialog(
  q: DbSql, role: "authority" | "supplier", entityId: string, spec: { peers?: PeersOptions | undefined; filters: Record<string, unknown> },
): Promise<PeerDialogData | null> {
  const focal = await readPeerFocal(q, role, entityId);
  if (!focal) return null;
  const resolution = await resolvePeerFacts(q, role, focal);
  const { facts } = resolution;
  const rows = peerRows(facts, spec.peers);
  const kind = role === "authority" ? namedKind(spec.filters.authorityKind as ParsedAuthorityKind | undefined) ?? null : null;
  const otherCounty = legacyCounty(spec.filters, facts);
  const legacy = { ...(otherCounty ? { county: otherCounty } : {}), ...(kind ? { authorityKind: kind } : {}) };
  const usable = rows.filter((row) => !row.disabled).map((row) => row.id);
  const conds: Partial<Record<PeerRowId, Fragment>> = {
    similar: resolution.similarIds ? q`ef.entity_id = any(${q.array([...resolution.similarIds])}::bigint[])` : q`false`,
    county: facts.county ? q`lower(unaccent(ef.county)) = ${fold(facts.county)}` : q`false`,
    ...(facts.activity ? { activity: q`ef.n_das between ${facts.activity.min} and ${facts.activity.max}` } : {}),
  };
  const kindIds = kind ? (await readAuthorityKinds(q)).ids[kind] : null;
  const combos: PeerRowId[][] = [[]];
  for (const id of usable) for (const combo of [...combos]) combos.push([...combo, id]);
  const filterOf = (combo: PeerRowId[]) => {
    const parts = combo.map((id) => conds[id] ?? q`false`);
    // An old link's other county stays until "același județ" replaces it.
    if (otherCounty && !combo.includes("county")) parts.push(q`lower(unaccent(ef.county)) = ${fold(otherCounty)}`);
    return parts.length ? parts.reduce((a, b) => q`${a} and ${b}`) : q`true`;
  };
  const columns = combos.map((combo, i) => q`count(*) filter (where ${filterOf(combo)})::int ${q(`c${i}`)}`).reduce((a, b) => q`${a}, ${b}`);
  const [counts] = await q`
    select ${columns} from marts.entity_flags ef
    where ef.role = ${role} and ef.n_das >= ${PROFILE_MIN_DAS} and ef.entity_id <> ${entityId}
      and ${kindIds ? q`ef.entity_id = any(${q.array([...kindIds])}::bigint[])` : q`true`}
  ` as unknown as Record<string, number>[];
  const sizes: Record<string, number> = {};
  combos.forEach((combo, i) => { sizes[peerKey(combo)] = Number(counts?.[`c${i}`] ?? 0); });
  // A sure "același tip" with fewer than 5 others alone says why, as the final words it (the Capital, a small kind).
  const similar = rows.find((row) => row.id === "similar");
  if (similar && !similar.disabled && (sizes.similar ?? 0) < PEER_MINIMUM) {
    const n = sizes.similar ?? 0;
    similar.disabled = {
      short: n === 0 ? "niciun alt membru" : `doar ${n}`,
      tip: facts.similar?.rule === "population"
        ? `${n === 0 ? "Nicio altă primărie nu are" : `Doar ${n === 1 ? "o altă primărie are" : `${n} alte primării au`}`} între jumătate și dublul populației lui ${facts.name}.`
        : `Rămân doar ${n}. Comparația cere cel puțin ${PEER_MINIMUM}.`,
    };
  }
  return { facts, profile: focal.nDas >= PROFILE_MIN_DAS, rows, sizes, legacy, ...(resolution.coverage ? { coverage: resolution.coverage } : {}) };
}

/**
 * GET /api/ask/peers/members (final distribution §3.6, §3.8): above 50 the
 * chart replaces the list, and a bar opens the members of the group with
 * exactly that many criteria, by direct acquisitions, a page at a time. The
 * group is the answer's: the ticks, the county (the entity's own or an old
 * link's other one) and an old link's kind, the role, the profile's threshold,
 * never the entity itself (distribution.ts runs the same conditions).
 */
export async function peerMembers(
  q: DbSql, role: "authority" | "supplier", entityId: string, spec: { peers?: PeersOptions | undefined; filters: Record<string, unknown> },
  criteria: number, offset: number,
): Promise<{ members: DistributionMember[]; total: number } | { error: string } | null> {
  const focal = await readPeerFocal(q, role, entityId);
  if (!focal || focal.nDas < PROFILE_MIN_DAS) return null;
  const resolution = await resolvePeerFacts(q, role, focal);
  const error = peerTickError(resolution, spec.peers);
  if (error) return { error };
  const county = typeof spec.filters.county === "string" && spec.filters.county ? spec.filters.county : null;
  const kind = role === "authority" ? namedKind(spec.filters.authorityKind as ParsedAuthorityKind | undefined) ?? null : null;
  const kindIds = kind ? (await readAuthorityKinds(q)).ids[kind] : null;
  const where = [
    q`ef.role = ${role}`, q`ef.n_das >= ${PROFILE_MIN_DAS}`, q`ef.entity_id <> ${entityId}`, q`ef.n_flags = ${criteria}`,
    ...(county ? [q`lower(unaccent(ef.county)) = ${fold(county)}`] : []),
    ...(kindIds ? [q`ef.entity_id = any(${q.array([...kindIds])}::bigint[])`] : []),
    ...peerConditions(q, resolution, spec.peers),
  ].reduce((a, b) => q`${a} and ${b}`);
  const rows = await q`
    select ef.entity_id::text id, ef.name_display, ef.county, ef.n_flags, ef.flags, ef.n_das, count(*) over ()::int total
    from marts.entity_flags ef where ${where}
    order by ef.n_das desc, ef.entity_id
    limit ${PEER_MEMBERS_PAGE} offset ${offset}
  ` as unknown as { id: string; name_display: string | null; county: string | null; n_flags: number; flags: string[] | null; n_das: number; total: number }[];
  return {
    total: rows[0]?.total ?? 0,
    members: rows.map((m): DistributionMember => ({
      entityId: m.id, name: m.name_display ?? "?", county: countyDisplay(m.county), population: resolution.populations?.get(m.id) ?? null,
      nFlags: Number(m.n_flags ?? 0), flags: Array.isArray(m.flags) ? m.flags : [], nDas: Number(m.n_das),
    })),
  };
}

/** The ticks of a spec on this entity, for the answer and its sources (peerTicks with the entity's county). */
export const ticksOf = (spec: { peers?: PeersOptions | undefined; filters: Record<string, unknown> }, facts: PeerFacts): PeerRowId[] => peerTicks(spec, facts);

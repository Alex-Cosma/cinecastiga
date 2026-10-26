import type { DbSql } from "@seap/db";
import { POPULATION_VERSION } from "../peer-population";
import type { DistributionData, DistributionMember } from "./compile";
import { legacyCounty, peerConditions, peerTickError, readPeerFocal, resolvePeerFacts, ticksOf, type PeerResolution } from "./peer-groups";
import { CRITERIA, PEER_LIST_LIMIT, PEER_MINIMUM, PROFILE_MIN_DAS, countyDisplay, peerGroupWords } from "./peer-groups-shared";
import { namedKind, type AskSpec } from "./spec";

/*
 * The distribution's answer (distribution-2, plan §4.11, final distribution
 * §3.6–§3.8): the entity's criteria, its position among the other members
 * of its group (more · same · fewer, which add up to the others), the others
 * by number of criteria, each criterion among them and in the country, and
 * the list of the others up to 50. One statement with FILTER over
 * marts.entity_flags for the group and the country (172 thousand profiles),
 * then the list when it is short.
 */

type Fragment = ReturnType<DbSql>;

export interface DistributionInput {
  spec: AskSpec;
  role: "authority" | "supplier";
  entityId: string;
  /** The grounded name, when the entity has no profile row. */
  name: string;
  /** profilePredicates(ctx, role, 10): the role, the threshold, the county, an old link's kind or town hall. */
  profileWhere: Fragment;
}

/** The group of the entity and its conditions, for the answer and its sources (runRows). */
export async function distributionGroup(s: DbSql, spec: AskSpec, role: "authority" | "supplier", entityId: string) {
  const focal = await readPeerFocal(s, role, entityId);
  if (!focal || focal.nDas < PROFILE_MIN_DAS) return { focal, resolution: null, error: null, conditions: [] as Fragment[] };
  const resolution = await resolvePeerFacts(s, role, focal);
  const error = peerTickError(resolution, spec.peers);
  const conditions: Fragment[] = [...peerConditions(s, resolution, spec.peers), s`ef.entity_id <> ${entityId}` as unknown as Fragment];
  return { focal, resolution, error, conditions };
}

const memberPopulation = (resolution: PeerResolution, id: string) => resolution.populations?.get(id) ?? null;

export async function distributionData(s: DbSql, input: DistributionInput): Promise<DistributionData | { error: string }> {
  const { spec, role, entityId } = input;
  const criteria = [...CRITERIA[role]];
  const { focal, resolution, error, conditions } = await distributionGroup(s, spec, role, entityId);
  const base = (nDas: number): DistributionData["focal"] => ({
    entityId, name: focal?.name ?? input.name, nFlags: focal?.nFlags ?? 0, cri: focal?.cri ?? null, flags: focal?.flags ?? [], nDas,
    county: countyDisplay(focal?.county), population: null, inGroup: false,
  });
  if (!focal || !resolution) {
    // Below the profile's threshold (final §4.5): no position in a group it is not part of.
    const facts = { role, entityId, name: focal?.name ?? input.name, county: countyDisplay(focal?.county), nDas: focal?.nDas ?? 0, similar: null, activity: null };
    return { version: 2, role, status: "below", criteria, focal: base(focal?.nDas ?? 0),
      group: { words: peerGroupWords(spec, role, facts), facts, ticks: [], legacy: {}, others: 0 } };
  }
  if (error) return { error };
  const { facts } = resolution;
  const kind = role === "authority" ? namedKind(spec.filters.authorityKind) : null;
  const other = legacyCounty(spec.filters, facts);
  const group: DistributionData["group"] = {
    words: peerGroupWords(spec, role, facts), facts, ticks: ticksOf(spec, facts),
    legacy: { ...(other ? { county: other } : {}), ...(kind ? { authorityKind: kind } : {}) }, others: 0,
    ...(spec.peers?.similar && resolution.coverage ? { coverage: resolution.coverage } : {}),
    ...(spec.peers?.similar && facts.similar && facts.similar.rule !== "kind" ? { populationVersion: POPULATION_VERSION } : {}),
  };
  const where = [input.profileWhere, ...conditions].reduce((a, b) => s`${a} and ${b}`);
  const max = criteria.length;
  const hist = Array.from({ length: max + 1 }, (_, k) => s`count(*) filter (where ${where} and ef.n_flags = ${k})::int ${s(`h${k}`)}`);
  const per = criteria.map((code, i) => s`count(*) filter (where ${where} and ef.flags ? ${code})::int ${s(`g${i}`)}, count(*) filter (where ef.flags ? ${code})::int ${s(`c${i}`)}`);
  const [row] = await s`
    select count(*) filter (where ${where})::int n, count(*)::int country, ${[...hist, ...per].reduce((a, b) => s`${a}, ${b}`)}
    from marts.entity_flags ef where ef.role = ${role} and ef.n_das >= ${PROFILE_MIN_DAS}
  ` as unknown as Record<string, number>[];
  const others = Number(row?.n ?? 0);
  group.others = others;
  // The entity in its own group: an old link's other county, kind or town hall can leave it out (final §4.5).
  const [inside] = await s`select exists(select 1 from marts.entity_flags ef where ${input.profileWhere} and ef.entity_id = ${entityId}) ok` as unknown as { ok: boolean }[];
  const focalOut: DistributionData["focal"] = { ...base(focal.nDas), population: memberPopulation(resolution, entityId), inGroup: Boolean(inside?.ok) };
  if (others < PEER_MINIMUM) return { version: 2, role, status: "small", criteria, focal: focalOut, group };
  const histRows = Array.from({ length: max + 1 }, (_, k) => ({ k, n: Number(row?.[`h${k}`] ?? 0) }));
  const k = Math.min(focal.nFlags, max);
  const position = {
    more: histRows.filter((h) => h.k > k).reduce((sum, h) => sum + h.n, 0),
    same: histRows.find((h) => h.k === k)?.n ?? 0,
    fewer: histRows.filter((h) => h.k < k).reduce((sum, h) => sum + h.n, 0),
  };
  const data: DistributionData = {
    version: 2, role, status: "ok", criteria, focal: focalOut, group, position, hist: histRows,
    perCriterion: criteria.map((code, i) => ({ code, others: Number(row?.[`g${i}`] ?? 0), country: Number(row?.[`c${i}`] ?? 0) })),
    countryTotal: Number(row?.country ?? 0),
  };
  if (others <= PEER_LIST_LIMIT) {
    const members = await s`
      select ef.entity_id::text id, ef.name_display, ef.county, ef.n_flags, ef.flags, ef.n_das
      from marts.entity_flags ef where ${where}
      order by ef.n_flags desc, ef.n_das desc, ef.entity_id
      limit ${PEER_LIST_LIMIT}
    ` as unknown as { id: string; name_display: string | null; county: string | null; n_flags: number; flags: string[] | null; n_das: number }[];
    data.members = members.map((m): DistributionMember => ({
      entityId: m.id, name: m.name_display ?? "?", county: countyDisplay(m.county), population: memberPopulation(resolution, m.id),
      nFlags: Number(m.n_flags ?? 0), flags: Array.isArray(m.flags) ? m.flags : [], nDas: Number(m.n_das),
    }));
    data.group.memberIds = data.members.map((m) => m.entityId);
    const names = data.members.map((m) => m.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim());
    if (new Set(names).size < names.length) data.sameNames = true;
  }
  return data;
}

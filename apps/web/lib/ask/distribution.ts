import type { DbSql } from "@seap/db";
import { POPULATION_VERSION } from "../peer-population";
import type { DistributionDataV3 } from "./compile";
import { legacyCounty, peerConditions, peerTickError, readPeerFocal, resolvePeerFacts, scoredMember, seatFilled, ticksOf, type MemberRow, type PeerResolution } from "./peer-groups";
import { CRITERIA, PEER_LIST_LIMIT, PEER_MINIMUM, PROFILE_MIN_DAS, SCORE_BANDS, countyDisplay, peerGroupWords } from "./peer-groups-shared";
import { profileCounty } from "./predicates";
import { namedKind, type AskSpec } from "./spec";

/*
 * The distribution's answer (distribution-3, rf-2026.18, owner decision of 1
 * November 2026; the group of plan §4.11, final distribution §3): the entity's
 * risk score, its position among the other members of its group (a higher,
 * the same or a lower displayed score, which add up to the others), the others
 * by band of the score, each pattern among them and in the country, and the
 * list of the others with their scores up to 50. One statement with FILTER
 * over marts.entity_flags for the group and the country (172 thousand
 * profiles), then the list when it is short.
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

export async function distributionData(s: DbSql, input: DistributionInput): Promise<DistributionDataV3 | { error: string }> {
  const { spec, role, entityId } = input;
  const criteria = [...CRITERIA[role]];
  const { focal, resolution, error, conditions } = await distributionGroup(s, spec, role, entityId);
  const base = (nDas: number): DistributionDataV3["focal"] => ({
    entityId, name: focal?.name ?? input.name, nDas, county: countyDisplay(focal?.county), population: null, inGroup: false,
    score: focal?.score ?? 0, parts: focal?.scoreParts ?? {}, nFlags: focal?.nFlags ?? 0, flags: focal?.flags ?? [],
  });
  if (!focal || !resolution) {
    // Below the profile's threshold (final §4.5): no position in a group it is not part of.
    const facts = { role, entityId, name: focal?.name ?? input.name, county: countyDisplay(focal?.county), nDas: focal?.nDas ?? 0, similar: null, activity: null };
    return { version: 3, role, status: "below", criteria, focal: base(focal?.nDas ?? 0),
      group: { words: peerGroupWords(spec, role, facts), facts, ticks: [], legacy: {}, others: 0 } };
  }
  if (error) return { error };
  const { facts } = resolution;
  const kind = role === "authority" ? namedKind(spec.filters.authorityKind) : null;
  const other = legacyCounty(spec.filters, facts);
  const group: DistributionDataV3["group"] = {
    words: peerGroupWords(spec, role, facts), facts, ticks: ticksOf(spec, facts),
    legacy: { ...(other ? { county: other } : {}), ...(kind ? { authorityKind: kind } : {}) }, others: 0,
    ...(spec.peers?.similar && resolution.coverage ? { coverage: resolution.coverage } : {}),
    ...(spec.peers?.similar && facts.similar && facts.similar.rule !== "kind" ? { populationVersion: POPULATION_VERSION } : {}),
  };
  const where = [input.profileWhere, ...conditions].reduce((a, b) => s`${a} and ${b}`);
  const score = focal.score;
  const position = [
    s`count(*) filter (where ${where} and ef.score > ${score})::int higher`,
    s`count(*) filter (where ${where} and ef.score = ${score})::int equal`,
    s`count(*) filter (where ${where} and ef.score < ${score})::int lower`,
  ];
  const hist = SCORE_BANDS.map((band, i) => s`count(*) filter (where ${where} and ef.score between ${band.from} and ${band.to})::int ${s(`h${i}`)}`);
  const per = criteria.map((code, i) => s`count(*) filter (where ${where} and ef.flags ? ${code})::int ${s(`g${i}`)}, count(*) filter (where ef.flags ? ${code})::int ${s(`c${i}`)}`);
  const [row] = await s`
    select count(*) filter (where ${where})::int n, count(*)::int country, ${[...position, ...hist, ...per].reduce((a, b) => s`${a}, ${b}`)}
    from marts.entity_flags ef where ef.role = ${role} and ef.n_das >= ${PROFILE_MIN_DAS}
  ` as unknown as Record<string, number>[];
  const others = Number(row?.n ?? 0);
  group.others = others;
  // The entity in its own group: an old link's other county, kind or town hall can leave it out (final §4.5).
  const [inside] = await s`select exists(select 1 from marts.entity_flags ef where ${input.profileWhere} and ef.entity_id = ${entityId}) ok` as unknown as { ok: boolean }[];
  const focalOut: DistributionDataV3["focal"] = { ...base(focal.nDas), population: memberPopulation(resolution, entityId), inGroup: Boolean(inside?.ok) };
  if (others < PEER_MINIMUM) return { version: 3, role, status: "small", criteria, focal: focalOut, group };
  const data: DistributionDataV3 = {
    version: 3, role, status: "ok", criteria, focal: focalOut, group,
    position: { higher: Number(row?.higher ?? 0), equal: Number(row?.equal ?? 0), lower: Number(row?.lower ?? 0) },
    hist: SCORE_BANDS.map((band, i) => ({ from: band.from, to: band.to, n: Number(row?.[`h${i}`] ?? 0) })),
    perCriterion: criteria.map((code, i) => ({ code, others: Number(row?.[`g${i}`] ?? 0), country: Number(row?.[`c${i}`] ?? 0) })),
    countryTotal: Number(row?.country ?? 0),
  };
  if (others <= PEER_LIST_LIMIT) {
    const members = await s`
      select ef.entity_id::text id, ef.name_display, ${profileCounty(s, role, await seatFilled(s, role))} county, ef.n_flags, ef.flags, ef.n_das, ef.score
      from marts.entity_flags ef where ${where}
      order by ef.score desc, ef.score_raw desc, ef.n_das desc, ef.entity_id
      limit ${PEER_LIST_LIMIT}
    ` as unknown as MemberRow[];
    data.members = members.map((m) => scoredMember(m, resolution));
    data.group.memberIds = data.members.map((m) => m.entityId);
    const names = data.members.map((m) => m.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim());
    if (new Set(names).size < names.length) data.sameNames = true;
  }
  return data;
}

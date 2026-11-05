import { createDb, type DbSql } from "@seap/db";
import { peerGroupWords, PEER_MINIMUM, PROFILE_MIN_DAS } from "./ask/peer-groups-shared";
import { readPeerFocal, resolvePeerFacts } from "./ask/peer-groups";
import { formatInt } from "./format";
import { riskBand } from "./risk-score";

const g = globalThis as unknown as { __seapRiskPeersSql?: DbSql };
const db = (): DbSql => (g.__seapRiskPeersSql ??= createDb().sql);

/**
 * "Locul 12 din 719 · primăriile cu 2–8 mii de locuitori" (rf-2026.22,
 * owner decisions M3/M27 of 5 November 2026): the profile's rank, the
 * members with a strictly higher score + 1, so the many profiles without a
 * score never inflate it as a share did ("peste 99%" for every strong one).
 */
export function riskPeerWords(line: RiskPeerLine): string {
  return `Locul ${formatInt(line.rank)} din ${formatInt(line.n)} · ${line.groupWords.replace(/^toate /, "")}`;
}

export interface RiskPeerLine {
  /** 1 + the members with a strictly higher score (a tie shares the place). */
  rank: number;
  /** The members of the group, the profile included (profiles with at least 10 DAs). */
  n: number;
  /** "primăriile cu 32–126 mii de locuitori", "firmele din domeniul Lucrări de construcții" … */
  groupWords: string;
}

/** An OUAI by its name (organizația utilizatorilor de apă pentru irigații): its own group (owner decision S1). */
export const OUAI_NAME = String.raw`(irigat|utilizatorilor de apa|^o\.?u\.?a\.?i\M|^ouai)`;
/** The fewest firms a main division needs to be a firm's group (M27); below it, no comparison. */
export const FIRM_DOMAIN_MINIMUM = 100;

/**
 * The profile's place among similar ones, only for a moderate or strong
 * score (owner decision of 1 November 2026, the rank since rf-2026.22). The
 * group is Ask's default for "Unde se situează?": a town hall among town
 * halls of close population, a school among schools, a county council among
 * county councils, an OUAI among OUAIs; a hospital has none (a county
 * hospital and a town's are not alike, M3); a firm among the firms of its
 * main CPV division with at least 100 of them (M27), else none; another
 * institution whose kind is not sure, among all institutions. Never the
 * entity itself in the count of the others.
 */
export async function readRiskPeerLine(q: DbSql, entityId: string, role: "authority" | "supplier", score: number): Promise<RiskPeerLine | null> {
  const band = riskBand(score);
  if (band !== "moderat" && band !== "puternic") return null;
  const focal = await readPeerFocal(q, role, entityId);
  if (!focal || focal.nDas < PROFILE_MIN_DAS) return null;
  const rank = async (group: ReturnType<DbSql>) => {
    const [row] = await q`
      select count(*)::int n, count(*) filter (where ef.score > ${score})::int higher
      from marts.entity_flags ef
      where ef.role = ${role} and ef.n_das >= ${PROFILE_MIN_DAS} and ef.entity_id <> ${entityId} and ${group}
    ` as unknown as { n: number; higher: number }[];
    return row ?? { n: 0, higher: 0 };
  };
  const line = (row: { n: number; higher: number }, groupWords: string): RiskPeerLine | null =>
    row.n < PEER_MINIMUM ? null : { rank: row.higher + 1, n: row.n + 1, groupWords };

  if (role === "supplier") {
    const [own] = await q`
      select ef.main_cpv_div div, (select c.name_ro from marts.spend_by_cpv c where c.division = ef.main_cpv_div and c.kind = 'all' limit 1) name
      from marts.entity_flags ef where ef.entity_id = ${entityId} and ef.role = 'supplier'
    ` as unknown as { div: string | null; name: string | null }[];
    if (!own?.div) return null;
    const row = await rank(q`ef.main_cpv_div = ${own.div}`);
    if (row.n + 1 < FIRM_DOMAIN_MINIMUM) return null;
    return line(row, own.name ? `firmele din domeniul „${own.name.replace(/\s+/g, " ").trim()}”` : "firmele din același domeniu principal");
  }

  const [ouai] = await q`select lower(unaccent(coalesce(name_display, ''))) ~ ${OUAI_NAME} yes from core.entities where id = ${entityId}` as unknown as { yes: boolean }[];
  if (ouai?.yes) {
    const row = await rank(q`ef.entity_id in (select e.id from core.entities e where lower(unaccent(coalesce(e.name_display, ''))) ~ ${OUAI_NAME})`);
    return line(row, "organizațiile utilizatorilor de apă pentru irigații");
  }
  const resolution = await resolvePeerFacts(q, role, focal);
  if (resolution.facts.similar?.rule === "kind" && resolution.facts.similar.kind === "spital") return null;
  // As Ask's default: "același tip" when the group is sure and has at least 5 others, else the whole country.
  let similar = resolution.similarIds !== null;
  let row = await rank(similar ? q`ef.entity_id = any(${q.array([...resolution.similarIds!])}::bigint[])` : q`true`);
  if (similar && row.n < PEER_MINIMUM) { similar = false; row = await rank(q`true`); }
  const spec = { peers: similar ? { similar: true as const } : undefined, filters: {} };
  return line(row, peerGroupWords(spec, role, resolution.facts));
}

export const getRiskPeerLine = (entityId: string, role: "authority" | "supplier", score: number) => readRiskPeerLine(db(), entityId, role, score);

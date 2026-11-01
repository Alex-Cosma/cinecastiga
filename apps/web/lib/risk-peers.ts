import { createDb, type DbSql } from "@seap/db";
import { peerGroupWords, PEER_MINIMUM, PROFILE_MIN_DAS } from "./ask/peer-groups-shared";
import { readPeerFocal, resolvePeerFacts } from "./ask/peer-groups";
import { riskBand } from "./risk-score";

const g = globalThis as unknown as { __seapRiskPeersSql?: DbSql };
const db = (): DbSql => (g.__seapRiskPeersSql ??= createDb().sql);

export interface RiskPeerLine {
  /** Share of the other members with a lower score (0–1). */
  share: number;
  /** The other members of the group (profiles with at least 10 DAs). */
  n: number;
  /** "primăriile cu 32–126 mii de locuitori", "toate firmele" … */
  groupWords: string;
}

/**
 * The profile's place among similar ones (owner decision, 1 November 2026):
 * "Mai multe tipare decât 93% dintre …", only for a moderate or strong score,
 * where it cannot mislead (a weak firm sits above the many firms with none).
 * The group is Ask's default for "Unde se situează?": a town hall among town
 * halls of close population, a hospital or school among its kind, a county
 * council among county councils; a firm, or an institution whose kind is not
 * sure, among all profiles of its role. Never the entity itself.
 */
export async function readRiskPeerLine(q: DbSql, entityId: string, role: "authority" | "supplier", score: number): Promise<RiskPeerLine | null> {
  const band = riskBand(score);
  if (band !== "moderat" && band !== "puternic") return null;
  const focal = await readPeerFocal(q, role, entityId);
  if (!focal || focal.nDas < PROFILE_MIN_DAS) return null;
  const resolution = await resolvePeerFacts(q, role, focal);
  const count = async (similar: boolean) => {
    const group = similar ? q`ef.entity_id = any(${q.array([...resolution.similarIds!])}::bigint[])` : q`true`;
    const [row] = await q`
      select count(*)::int n, count(*) filter (where ef.score < ${score})::int lower
      from marts.entity_flags ef
      where ef.role = ${role} and ef.n_das >= ${PROFILE_MIN_DAS} and ef.entity_id <> ${entityId} and ${group}
    ` as unknown as { n: number; lower: number }[];
    return row ?? { n: 0, lower: 0 };
  };
  // As Ask's default: "același tip" when the group is sure and has at least 5 others, else the whole country.
  let similar = role === "authority" && resolution.similarIds !== null;
  let row = await count(similar);
  if (similar && row.n < PEER_MINIMUM) { similar = false; row = await count(false); }
  if (row.n < PEER_MINIMUM) return null;
  const spec = { peers: similar ? { similar: true as const } : undefined, filters: {} };
  return { share: row.lower / row.n, n: row.n, groupWords: peerGroupWords(spec, role, resolution.facts) };
}

export const getRiskPeerLine = (entityId: string, role: "authority" | "supplier", score: number) => readRiskPeerLine(db(), entityId, role, score);

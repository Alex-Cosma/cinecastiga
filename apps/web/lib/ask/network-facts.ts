import type { DbSql } from "@seap/db";
import { runSpec } from "./compile";
import { FACET_TTL_MS, facetStamp, timedOut, type FacetFailure } from "./facets";
import { ground } from "./ground";
import type { NetworkData } from "./network-shared";
import { questionKey, type QuestionSpec } from "./question-ui";
import type { AskSpec } from "./spec";

/*
 * The whole relation of a network whose „Toți” on one channel or in a period
 * was answered from the records it bounds (relations.ts boundedNetwork, S4
 * review: SELGROS on „Proceduri” 4 ms before network-2, 575 ms with its whole
 * relation): POST /api/ask/facets part=network, asked by the screen once that
 * answer is drawn, so the groups' buttons, the relation's years and signals,
 * the firm's share and the strip's shares follow it and never delay it. The
 * same engine path as an answer on every channel without a period
 * (runSpec with networkWhole), behind the facets' own pool and slots; kept
 * for 10 minutes on the question, the data checkpoint and the marts build.
 */

export interface NetworkFacts { part: "network"; data: NetworkData; checkpoint: string | null; tookMs: number }

const kept = new Map<string, { value: NetworkFacts; at: number }>();
/** Whole relations kept at most (one per network answer on screen). */
const KEPT = 50;
export function forgetNetworkFacts(): void { kept.clear(); }

export async function networkFacts(sql: DbSql, spec: AskSpec): Promise<NetworkFacts | FacetFailure> {
  if (spec.block !== "network") return { error: "Relația întreagă descrie o rețea." };
  const stamp = await facetStamp(sql);
  const key = stamp.build ? JSON.stringify([stamp.build, stamp.checkpoint, "network", questionKey(spec as unknown as QuestionSpec)]) : null;
  const hit = key ? kept.get(key) : undefined;
  if (key && hit && Date.now() - hit.at <= FACET_TTL_MS) return { ...hit.value, tookMs: 0 };
  const started = Date.now();
  try {
    const r = await runSpec(sql, spec, await ground(sql, spec.filters, spec.population), { networkWhole: true });
    if ("error" in r) return { error: r.error };
    if (r.data.block !== "network") return { error: "Relația întreagă descrie o rețea." };
    const value: NetworkFacts = { part: "network", data: r.data, checkpoint: stamp.checkpoint, tookMs: Date.now() - started };
    if (key) {
      kept.delete(key);
      kept.set(key, { value, at: Date.now() });
      for (const oldest of kept.keys()) { if (kept.size <= KEPT) break; kept.delete(oldest); }
    }
    return value;
  } catch (e) {
    if (timedOut(e)) return { timeout: true };
    throw e;
  }
}

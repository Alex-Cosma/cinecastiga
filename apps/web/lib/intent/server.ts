import type { DbSql } from "@seap/db";
import { coveragePeriods } from "../ask/compile";
import type { CoveragePeriods } from "../ask/months-window";
import { RulesInterpreter } from "./rules";
import { resultFor } from "./to-spec";
import { loadSharedLists, sqlVocabulary } from "./vocabulary-sql";
import type { IntentResult, QuestionInterpreter, Vocabulary } from "./types";
import { peerDialog } from "../ask/peer-groups";
import { PEER_MINIMUM, defaultPeerTicks, peerKey, peerTicks, writePeerTicks } from "../ask/peer-groups-shared";
import { questionTitle } from "../ask/filters/title";

/** Per-statement bound for the vocabulary lookups of one question. */
export const INTENT_STATEMENT_TIMEOUT = "2000ms";

const bucharestYear = (now: Date): number =>
  Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric" }).format(now));

/** The archive's periods per channel (coveragePeriods: one source, cached per data checkpoint); null when unknown. */
export async function intentPeriods(sql: DbSql): Promise<CoveragePeriods | null> {
  try { return await coveragePeriods(sql); } catch { return null; }
}

/**
 * The key of a cached interpretation (plan §2.7): the question, the Romanian
 * calendar day (relative periods, "anul trecut") and the archive it read: the
 * data checkpoint, and each channel's "complet până la" and last day, from
 * which a trend's default years and same months come. A refresh that closes a
 * year changes the key at once, not at midnight.
 */
export function intentCacheKey(q: string, day: string, periods: CoveragePeriods | null): string {
  const archive = periods
    ? [periods.checkpoint ?? "", periods.da.completeUntil ?? "", periods.da.to ?? "", periods.contracts.completeUntil ?? "", periods.contracts.to ?? ""].join(",")
    : "no-coverage";
  return `${day}|${archive}|${q.toLowerCase()}`;
}

/**
 * Server entry point: free text → interpretation → AskSpec + sentence +
 * alternatives. The interpreter is injectable so an LLM-backed implementation
 * can replace or complement the rules later without changing callers.
 * `periods` (read when not given) gives a trend its default years and its
 * same months.
 *
 * Connection use: the cached reference lists are loaded first, on the pool;
 * only then one read-only transaction (one connection) serves every lookup of
 * the question, so concurrent questions can never wait on each other.
 */
export async function interpretQuestion(
  sql: DbSql,
  text: string,
  opts: { now?: Date; signal?: AbortSignal; interpreter?: (vocab: Vocabulary) => QuestionInterpreter; periods?: CoveragePeriods | null } = {},
): Promise<IntentResult> {
  const now = opts.now ?? new Date();
  const make = opts.interpreter ?? ((vocab: Vocabulary) => new RulesInterpreter(vocab));
  const shared = await loadSharedLists(sql);
  const periods = opts.periods !== undefined ? opts.periods : await intentPeriods(sql);
  if (opts.signal?.aborted) throw new Error("intent-aborted");
  const interpretation = await sql.begin("read only", async (tx) => {
    await tx.unsafe(`set local statement_timeout = '${INTENT_STATEMENT_TIMEOUT}'`);
    // bound parameters must still use the trigram index (ilike on ONRC names)
    await tx.unsafe("set local plan_cache_mode = force_custom_plan");
    // An aborted caller stops further lookups, so the transaction ends and frees its connection.
    return make(sqlVocabulary(tx as unknown as DbSql, shared, opts.signal ? { signal: opts.signal } : {})).interpret(text, { now });
  });
  return withPeerGroup(sql, resultFor(interpretation, { periods, year: bucharestYear(now) }));
}

/** The whole country said in words: the group stays every profile (final distribution §4.2). */
const NATIONAL = /\b(?:la nivel national|din toata tara|fata de toata tara|fata de toate (?:institutiile|firmele)|in toata tara)\b/;
/** "din județul lui", "din același județ": the entity's own county, ticked as "același județ". */
const OWN_COUNTY = /\bdin (?:acelasi judet|judetul (?:lui|ei|sau|sa))\b/;
const foldText = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * A distribution asked in words is a new question (F6a, final distribution
 * §4.2, §7.12): it ticks "populație apropiată" / "același tip" when the
 * institution's group is sure, unless the words ask for the whole country or
 * already name a group; "din județul lui" ticks the entity's own county. The
 * ticks are written in the spec, so its link says what was compared.
 */
export async function withPeerGroup(sql: DbSql, result: IntentResult, read: typeof peerDialog = peerDialog): Promise<IntentResult> {
  const spec = result.spec;
  if (!spec || spec.block !== "distribution") return result;
  const text = foldText(result.q);
  const ownCounty = OWN_COUNTY.test(text);
  if (NATIONAL.test(text) || (spec.peers && !ownCounty)) return result;
  const role = spec.filters.authorityId ? "authority" : spec.filters.supplierId ? "supplier" : null;
  if (!role) return result;
  try {
    const data = await sql.begin("read only", async (tx) => {
      await tx.unsafe(`set local statement_timeout = '${INTENT_STATEMENT_TIMEOUT}'`);
      return read(tx as unknown as DbSql, role, String(spec.filters[role === "authority" ? "authorityId" : "supplierId"]), spec);
    });
    if (!data || !data.profile) return result;
    const ticks = [...(spec.peers ? [] : defaultPeerTicks(data)), ...(spec.peers?.similar ? ["similar" as const] : []), ...(spec.peers?.activity ? ["activity" as const] : []),
      ...(ownCounty && data.facts.county ? ["county" as const] : [])];
    let next = writePeerTicks(spec, ticks, data.facts);
    // The default never leaves a group under 5: with the county that leaves too few, the county alone (final §3.1).
    if (ticks.length > 1 && !spec.peers?.similar && (data.sizes[peerKey(peerTicks(next, data.facts))] ?? 0) < PEER_MINIMUM)
      next = writePeerTicks(spec, ticks.filter((t) => t !== "similar"), data.facts);
    return { ...result, spec: next, sentence: questionTitle(next, { peerGroup: data.facts }) };
  } catch {
    return result;
  }
}

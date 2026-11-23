import type { DbSql } from "@seap/db";
import { coveragePeriods } from "../ask/compile";
import type { CoveragePeriods } from "../ask/months-window";
import { RulesInterpreter } from "./rules";
import { resultFor } from "./to-spec";
import { loadSharedLists, sqlVocabulary } from "./vocabulary-sql";
import type { IntentResult, QuestionInterpreter, Vocabulary } from "./types";
import { peerDialog } from "../ask/peer-groups";
import { PEER_MINIMUM, countyDisplay, defaultPeerTicks, peerKey, peerTicks, writePeerTicks, type PeerFacts } from "../ask/peer-groups-shared";
import { COUNTIES } from "../counties";
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
const foldText = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** "județul Buzău", "judetul bistrita nasaud": a county named in the words, by its display name (COUNTIES). */
const NAMED_COUNTY = COUNTIES.map((name) => ({ name, re: new RegExp(`\\bjudetul ${foldText(name).replace(/[-\s]+/g, "[-\\s]+")}\\b`) }));
export function namedCounty(folded: string): string | null {
  return NAMED_COUNTY.find((county) => county.re.test(folded))?.name ?? null;
}
/**
 * "față de spitalele", "față de alte primării": the group named by its noun (plan §2.7 precedence). The
 * noun of the entity's own "același tip" is the default's group; any other noun is a group the rule does
 * not cover, so the default does not replace it.
 */
const GROUP_NOUN = /\bfata de (?:toate |alte |celelalte )?(primari|comune|orase|municipii|consilii|sectoare|spitale|scoli|licee|gradinite|institutii|firme)/;
const SIMILAR_NOUNS: Record<string, readonly string[]> = {
  population: ["primari", "comune", "orase", "municipii"], county_councils: ["consilii"], sectors: ["sectoare", "primari"],
  spital: ["spitale"], scoala: ["scoli", "licee", "gradinite"],
};
function otherGroupNoun(folded: string, similar: PeerFacts["similar"]): boolean {
  const noun = GROUP_NOUN.exec(folded)?.[1];
  if (!noun) return false;
  const own = similar ? SIMILAR_NOUNS[similar.rule === "kind" ? similar.kind : similar.rule] ?? [] : [];
  return !own.includes(noun);
}

/**
 * A distribution asked in words is a new question (F6a, final distribution
 * §4.2, §7.12): it ticks "populație apropiată" / "același tip" when the
 * institution's group is sure, unless the words ask for the whole country or
 * already name a group (a noun the rule does not cover, "față de spitalele"); the
 * entity's own county, in words ("din județul lui", "din județul Buzău") or
 * written by the interpreter, ticks "același județ". Another county named stays
 * as the interpreter wrote it, without a default. The ticks are written in the
 * spec, so its link says what was compared.
 */
export async function withPeerGroup(sql: DbSql, result: IntentResult, read: typeof peerDialog = peerDialog): Promise<IntentResult> {
  const spec = result.spec;
  if (!spec || spec.block !== "distribution") return result;
  const text = foldText(result.q);
  if (NATIONAL.test(text)) return result;
  const named = namedCounty(text);
  const countyWords = OWN_COUNTY.test(text) || named !== null || Boolean(spec.filters.county);
  if (spec.peers && !countyWords) return result;
  const role = spec.filters.authorityId ? "authority" : spec.filters.supplierId ? "supplier" : null;
  if (!role) return result;
  try {
    const data = await sql.begin("read only", async (tx) => {
      await tx.unsafe(`set local statement_timeout = '${INTENT_STATEMENT_TIMEOUT}'`);
      return read(tx as unknown as DbSql, role, String(spec.filters[role === "authority" ? "authorityId" : "supplierId"]), spec);
    });
    if (!data || !data.profile) return result;
    // The county the reader named: written by the interpreter, or in the words. Another county than the entity's is an
    // old link's kind of group (final §4.5): kept as interpreted, never replaced by the default.
    const explicit = countyDisplay(typeof spec.filters.county === "string" ? spec.filters.county : null) ?? named;
    if (explicit && explicit !== data.facts.county) return result;
    const ownCounty = OWN_COUNTY.test(text) || explicit !== null;
    const fallback = spec.peers || otherGroupNoun(text, data.facts.similar) ? [] : defaultPeerTicks(data);
    const ticks = [...fallback, ...(spec.peers?.similar ? ["similar" as const] : []), ...(spec.peers?.activity ? ["activity" as const] : []),
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

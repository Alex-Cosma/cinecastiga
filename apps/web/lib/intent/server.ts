import type { DbSql } from "@seap/db";
import { RulesInterpreter } from "./rules";
import { resultFor } from "./to-spec";
import { loadSharedLists, sqlVocabulary } from "./vocabulary-sql";
import type { IntentResult, QuestionInterpreter, Vocabulary } from "./types";

/** Per-statement bound for the vocabulary lookups of one question. */
export const INTENT_STATEMENT_TIMEOUT = "2000ms";

/**
 * Server entry point: free text → interpretation → AskSpec + sentence +
 * alternatives. The interpreter is injectable so an LLM-backed implementation
 * can replace or complement the rules later without changing callers.
 *
 * Connection use: the cached reference lists are loaded first, on the pool;
 * only then one read-only transaction (one connection) serves every lookup of
 * the question, so concurrent questions can never wait on each other.
 */
export async function interpretQuestion(
  sql: DbSql,
  text: string,
  opts: { now?: Date; signal?: AbortSignal; interpreter?: (vocab: Vocabulary) => QuestionInterpreter } = {},
): Promise<IntentResult> {
  const now = opts.now ?? new Date();
  const make = opts.interpreter ?? ((vocab: Vocabulary) => new RulesInterpreter(vocab));
  const shared = await loadSharedLists(sql);
  if (opts.signal?.aborted) throw new Error("intent-aborted");
  const interpretation = await sql.begin("read only", async (tx) => {
    await tx.unsafe(`set local statement_timeout = '${INTENT_STATEMENT_TIMEOUT}'`);
    // bound parameters must still use the trigram index (ilike on ONRC names)
    await tx.unsafe("set local plan_cache_mode = force_custom_plan");
    // An aborted caller stops further lookups, so the transaction ends and frees its connection.
    return make(sqlVocabulary(tx as unknown as DbSql, shared, opts.signal ? { signal: opts.signal } : {})).interpret(text, { now });
  });
  return resultFor(interpretation);
}

import type { DbSql } from "@seap/db";
import { RulesInterpreter } from "./rules";
import { resultFor } from "./to-spec";
import { sqlVocabulary } from "./vocabulary-sql";
import type { IntentResult, QuestionInterpreter, Vocabulary } from "./types";

/** Per-statement bound for the vocabulary lookups of one question. */
export const INTENT_STATEMENT_TIMEOUT = "1500ms";

/**
 * Server entry point: free text → interpretation → AskSpec + sentence +
 * alternatives. The interpreter is injectable so an LLM-backed implementation
 * can replace or complement the rules later without changing callers.
 */
export async function interpretQuestion(
  sql: DbSql,
  text: string,
  opts: { now?: Date; signal?: AbortSignal; interpreter?: (vocab: Vocabulary) => QuestionInterpreter } = {},
): Promise<IntentResult> {
  const now = opts.now ?? new Date();
  const make = opts.interpreter ?? ((vocab: Vocabulary) => new RulesInterpreter(vocab));
  const interpretation = await sql.begin("read only", async (tx) => {
    await tx.unsafe(`set local statement_timeout = '${INTENT_STATEMENT_TIMEOUT}'`);
    // An aborted caller stops further lookups, so the transaction ends and frees its connection.
    return make(sqlVocabulary(tx as unknown as DbSql, sql, opts.signal ? { signal: opts.signal } : {})).interpret(text, { now });
  });
  return resultFor(interpretation);
}

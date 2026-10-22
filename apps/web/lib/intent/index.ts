/**
 * Free-text question interpreter (client-safe exports). The database-bound
 * entry point is `interpretQuestion` in ./server; the HTTP surface is
 * GET /api/intent.
 */
export type {
  IntentAlternative, IntentKind, IntentResult, Interpretation, InterpretContext, PlaceMatch,
  QuestionInterpreter, SubjectMatch, Vocabulary,
} from "./types";
export { MAX_QUESTION_LENGTH, RULES_INTERPRETER_ID, RulesInterpreter } from "./rules";
export { resultFor, sentenceFor, specFor } from "./to-spec";

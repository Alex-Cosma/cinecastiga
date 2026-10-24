import { cloneQuestion, type QuestionSpec } from "../question-ui";
import { BLOCK_OPTION_KEYS, optionBelongs, type Block } from "../spec";
import { filterContext, formOf } from "./context";
import { FILTER_DEFS, FILTERS } from "./registry";

/**
 * The only path for a derived link "›" (plan §2.4, R8): the applied question
 * asked as another block, or as the same one a level deeper. The conditions
 * are the question's and stay. Another block's options leave (parseSpec drops
 * them, and refuses a comparison group where none applies). Each filter's
 * onTransition keeps, moves or drops its key; a link holds no draft, so a
 * condition the builder would set aside ("park") is dropped. The measure stays
 * where the target applies it (the registry's `measure`); elsewhere the target
 * answers in lei, and the link says so.
 *
 * Key order is the input's, so a link that only changes the block keeps the
 * bytes of its permalink.
 */
export function retarget<S extends QuestionSpec>(spec: S, block: Block): S {
  let next: QuestionSpec = { ...cloneQuestion(spec), block };
  for (const key of [...BLOCK_OPTION_KEYS, "peers"] as const) if (!optionBelongs(key, block)) delete next[key];
  const form = formOf(next);
  for (const def of FILTER_DEFS) {
    const outcome = def.onTransition?.(next, form);
    if (!outcome || outcome.kind === "keep") continue;
    next = outcome.kind === "move" ? outcome.to(next) : def.write(next, undefined);
  }
  const measures = FILTERS.measure.engine[form] ? (FILTERS.measure.choices(next, filterContext(next)) as readonly unknown[]) : [];
  if (!measures.includes(next.measure)) next.measure = "value";
  return next as S;
}

import type { QuestionSpec } from "../question-ui";
import { NEWER_VERSION_QUESTION, unimplementedSpecKeys, validateSpec, type AskSpec } from "../spec";
import { filterContext } from "./context";
import { describeConditions, type ConditionLabels } from "./describe";
import { sentenceText, sentenceTokens } from "./sentence";
import type { FilterSpec } from "./types";

/*
 * The title of a question (plan G7, R11): its sentence as the builder says
 * it (sentence.ts), then the conditions under it (describeConditions' tail:
 * "…, în 2025, fără SYSTRA?"). One grammar for the answer's heading, a saved
 * question, a watch, the records drawer and the CSV file name. The map's
 * lens does not change it with today's keys (value or records: the same
 * question); the lenses with their own words come with F5 (plan §4.4).
 */

/** The title of a question; `labels` names a CPV code ("pentru [lucrări de construcții]"). */
export function questionTitle(input: QuestionSpec | AskSpec, labels: ConditionLabels = {}): string {
  const spec = input as FilterSpec;
  const text = sentenceText(sentenceTokens(spec, filterContext(spec), { cpvName: labels.cpvName }));
  if (!text) return "Întrebarea ta";
  const tail = describeConditions(spec, labels).tail;
  return tail ? text.replace(/([?.])$/, `, ${tail}$1`) : text;
}

/** A saved question in the list (SavedQuestions): its title, then the conditions a title does not repeat. */
export function savedQuestionSummary(raw: unknown): string {
  const spec = validateSpec(raw);
  if ("error" in spec) return "Deschide pentru a verifica această întrebare.";
  // Its sentence here would leave out the condition this release does not read.
  if (unimplementedSpecKeys(spec).length) return NEWER_VERSION_QUESTION;
  return [questionTitle(spec), ...describeConditions(spec).summary].join(" · ");
}

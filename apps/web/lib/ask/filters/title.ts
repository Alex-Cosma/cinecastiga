import type { BlockData, ExecutedWindow } from "../compile";
import type { QuestionSpec } from "../question-ui";
import { NEWER_VERSION_QUESTION, unimplementedSpecKeys, validateSpec, type AskSpec } from "../spec";
import { filterContext } from "./context";
import { askedLens, lensTitle, withoutFirm } from "../map-lens";
import { describeConditions, type ConditionLabels, type DescribedConditions } from "./describe";
import { sentenceText, sentenceTokens, type SentenceLabels } from "./sentence";
import type { FilterSpec } from "./types";

/*
 * The title of a question (plan G7, R11): its sentence as the builder says
 * it (sentence.ts), then the conditions under it (describeConditions' tail:
 * "…, în 2025, fără SYSTRA?"). One grammar for the answer's heading, a saved
 * question, a watch, the records drawer, the CSV file name and the
 * interpreter's "Am înțeles așa:" (lib/intent/to-spec.ts sentenceFor). The
 * map's lens changes it (F5, plan §4.4, map final §3.7: „Cât revine pe
 * locuitor din …”, „Ce parte din …”): the sentence stays the question's.
 */

/**
 * A ranking's order when it is not the value (P5, the presentation line):
 * a watch, a saved question, the CSV file name and a capture read only the
 * title, so a per-capita ranking is not named as the value ranking.
 */
const ORDER_WORDS: Partial<Record<string, string>> = { count: "după numărul de înregistrări", value_per_capita: "după valoarea pe locuitor" };

/** The presentation line's order when it is not the default: a ranking's measure, a trend's growths in percent with their base. */
function orderWords(spec: FilterSpec, described: DescribedConditions): string | undefined {
  if (spec.block === "table") return ORDER_WORDS[String(spec.measure)];
  // The network's partners by their records or years (F4, final network §3.5): the order of the list a watch sees.
  if (spec.block === "network") return described.byId.networkOrder?.words;
  if (spec.block !== "trend" || spec.trend?.change !== "up" || spec.trend.order !== "percent") return undefined;
  return [described.byId.trendOrder?.words, described.byId.trendMinBase?.words].filter(Boolean).join(", ");
}

/** What the caller knows besides the spec: names (a CPV code, the reader's subject) and what the answer ran (a trend's years and months). */
export type TitleLabels = ConditionLabels & Pick<SentenceLabels, "subject" | "allInstitutions" | "networkSince" | "peerGroup">;

/** The title of a question; `labels` names a CPV code ("pentru [lucrări de construcții]") and says what its answer ran. */
export function questionTitle(input: QuestionSpec | AskSpec, labels: TitleLabels = {}): string {
  const spec = input as FilterSpec;
  const text = sentenceText(sentenceTokens(spec, filterContext(spec), {
    cpvName: labels.cpvName, subject: labels.subject, trendYears: labels.trendYears, allInstitutions: labels.allInstitutions, networkSince: labels.networkSince,
    peerGroup: labels.peerGroup,
  }));
  if (!text) return "Întrebarea ta";
  const described = describeConditions(spec, labels);
  const tail = [orderWords(spec, described), described.tail].filter(Boolean).join(", ");
  const titled = tail ? text.replace(/([?.])$/, `, ${tail}$1`) : text;
  if (spec.block !== "map") return titled;
  // F5: the map's title follows its lens (map final §3.7, the exception to R11); the share's names the firm's whole.
  const lens = askedLens(spec);
  return lensTitle(titled, lens, spec, lens === "share" ? questionTitle(withoutFirm(spec), labels) : undefined);
}

/**
 * What an answer adds to its question's title (F1b-r-trend-years): a trend's
 * years when the spec has none (the archive's first and last, data.yearA/yearB)
 * and the months `auto` counted (executed.months, plan §2.8).
 */
export function answerLabels(answer: { data?: BlockData | undefined; executed?: ExecutedWindow | undefined } | null | undefined): Pick<TitleLabels, "executedMonths" | "trendYears" | "networkSince" | "peerGroup"> & { scatterGroup?: number } {
  const data = answer?.data;
  return {
    ...(answer?.executed ? { executedMonths: answer.executed.months } : {}),
    ...(data?.block === "trend" ? { trendYears: { yearA: data.yearA, yearB: data.yearB } } : {}),
    // A network's group counts from the year its answer used (the spec writes it; an old link's „din …” says the answer's).
    ...(data?.block === "network" ? { networkSince: data.since } : {}),
    // distribution-2 and -3: the bounds of the group it compared ("primăriile cu 52–207 mii de locuitori").
    ...(data?.block === "distribution" && data.distribution.version >= 2 ? { peerGroup: data.distribution.group.facts } : {}),
    // scatter-2: the pill counts the group the cloud drew.
    ...(data?.block === "scatter" && "scatter" in data ? { scatterGroup: data.scatter.group.n } : {}),
  };
}

/** A saved question in the list (SavedQuestions): its title, then the conditions a title does not repeat. */
export function savedQuestionSummary(raw: unknown): string {
  const spec = validateSpec(raw);
  if ("error" in spec) return "Deschide pentru a verifica această întrebare.";
  // Its sentence here would leave out the condition this release does not read.
  if (unimplementedSpecKeys(spec).length) return NEWER_VERSION_QUESTION;
  return [questionTitle(spec), ...describeConditions(spec).summary].join(" · ");
}

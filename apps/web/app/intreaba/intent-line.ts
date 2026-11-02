import type { AskSpec } from "../../lib/ask/spec";
import type { IntentResult } from "../../lib/intent/types";

/*
 * How a typed question was understood, as one line under the answer's title
 * (owner, 1 November 2026): "Am înțeles: am ales tot județul Suceava · Am
 * ignorat „x” · caută în titluri · Altfel (3) ›", the other readings in the
 * menu behind "Altfel" so the line stays one line (owner, 2 November 2026).
 * It took the place of the "Am înțeles așa" card above the builder.
 */

/** The interpretation the builder was seeded with: the main one or an alternative. */
export interface IntentChoice {
  spec: AskSpec;
  sentence: string;
  label?: string;
}

export interface UnderstoodLine {
  /** What the interpreter assumed or left out, as clauses after "Am înțeles:". */
  notes: string[];
  /** Other readings, each a whole question (the "Altfel (N) ›" menu). */
  options: IntentChoice[];
  /** Words it did not use ("Am ignorat „x” · caută în titluri"). */
  ignored: string[];
}

/** First words of the interpreter's notes that are not names: lower case after "Am înțeles:". */
const PLAIN_START = /^(?:Am|Arătăm|Nu|Un|O|Există|Perioada|Localitatea|Riscul|Valoarea|Comparația|Profilurile|Grupele|Pentru|Administratorii|Scrie|Numele|Căutarea|Codul|Niciun)\s/;

/** A note as a clause of the line: "„Suceava”: am ales tot județul." → "am ales tot județul Suceava". */
export function noteClause(note: string): string {
  const county = /^„([^”]+)”: am ales tot județul\.$/.exec(note);
  if (county) return `am ales tot județul ${county[1]}`;
  // "Am înțeles „cluj” ca Municipiul Cluj-Napoca." follows "Am înțeles:" without saying it twice.
  const text = note.trim().replace(/\.$/, "").replace(/^Am înțeles /, "");
  return PLAIN_START.test(text) ? text.charAt(0).toLocaleLowerCase("ro-RO") + text.slice(1) : text;
}

/** The line for the reading on screen, or null when there is nothing to say. */
export function understoodLine(result: IntentResult, chosen: IntentChoice): UnderstoodLine | null {
  const key = (spec: AskSpec) => JSON.stringify(spec);
  const main: IntentChoice | null = result.spec && result.sentence ? { spec: result.spec, sentence: result.sentence, label: "Cum am înțeles la început" } : null;
  // The reason for the main place choice only describes the main reading.
  const isMain = !!main && key(main.spec) === key(chosen.spec);
  const options: IntentChoice[] = [
    ...(main && key(main.spec) !== key(chosen.spec) ? [main] : []),
    ...result.alternatives.filter((alt) => key(alt.spec) !== key(chosen.spec)).map((alt) => ({ spec: alt.spec, sentence: alt.sentence, label: alt.label })),
  ];
  const notes = [...(isMain && result.interpretation.placeNote ? [result.interpretation.placeNote] : []), ...result.interpretation.notes].map(noteClause);
  const ignored = result.interpretation.leftover;
  return notes.length || options.length || ignored.length ? { notes, options, ignored } : null;
}

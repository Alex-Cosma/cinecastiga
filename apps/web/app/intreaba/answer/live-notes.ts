import type { AskSpec } from "../../../lib/ask/spec";
import { pillFilters, type PillLabels } from "../../../lib/ask/pill-filters";
import { ownPills } from "../../../lib/ask/pills";
import type { BuilderView } from "../builder/view";
import type { SentenceToken } from "../builder/kit-types";
import { pillWindow } from "./pill-windows";
import { SUBCLASSES_PILL } from "./subclasses";

/*
 * What stays of the pills once the answer's title is the editable sentence (UX audit Z2-03, variant B, owner 16
 * November 2026). The sentence, the presentation line and the chips under it say every condition a pill said and
 * opened; the pills' row is gone. What only a pill said stays as quiet words under the title: the measure and the
 * stream where no phrase names them („valoarea înregistrată”, „toate achizițiile: directe și din proceduri”), a
 * profile's „achiziții directe”, a distribution's group and its population source, the size of a cloud's group. The
 * answer's shape („clasament”, „pe domenii”) is said by the question itself and is left out. Pure, tested.
 */

const fold = (text: string) => text.toLocaleLowerCase("ro-RO").replace(/\s+/g, " ").trim();

/** The words of the sentence and of the presentation line, as the reader sees them. */
export function saidWords(tokens: readonly SentenceToken[]): string {
  return tokens.map((token) => token.kind === "slot" ? token.value : token.text).join("");
}

export interface LiveNotes {
  /** Quiet words under the title, in the pills' order. */
  notes: string[];
  /** The pill that says the domain leaves subclasses out („fără 3 subclase (vezi limitele)”), or null. */
  subclasses: string | null;
}

export function liveNotes(spec: AskSpec, pills: readonly string[], labels: PillLabels, view: BuilderView): LiveNotes {
  const said = fold(`${saidWords(view.sentence)} ${saidWords(view.presentation)}`);
  const own = ownPills(spec, labels);
  const filters = pillFilters(spec, pills, labels);
  const notes: string[] = [];
  let subclasses: string | null = null;
  pills.forEach((words, i) => {
    if (SUBCLASSES_PILL.test(words.trim())) { subclasses = words; return; }
    const part = own[i];
    // The answer's shape: the question says it.
    if (part && part.filter === null) return;
    // A cloud's group with its size („337 de instituții publice”): the sentence names the group, not how many.
    if (i === 0 && spec.block === "scatter" && labels.scatterGroup !== undefined) { notes.push(words); return; }
    // A pill that opened a window: its phrase, its chip or the presentation line opens the same one.
    if (pillWindow(view, filters[i] ?? null, spec.block)) return;
    if (said.includes(fold(words))) return;
    notes.push(words);
  });
  return { notes: [...new Set(notes)], subclasses };
}

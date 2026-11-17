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
 *
 * Less small print (owner, 17 November 2026): on the answers that carry a control for it right under the title, the
 * words that only repeat the selected control are left out too: the measure („Harta arată: Valoare”), the whole
 * stream („Toate · Directe · Proceduri”), a cloud's group size (the pill „Tot grupul 15.730”), its signal and its
 * order, a series' split.
 */

/** Answers whose controls show the measure, the stream, the group, the order and the split. */
const HAS_CONTROLS: ReadonlySet<string> = new Set(["table", "timeseries", "map", "compare", "breakdown", "scatter", "network"]);
/** The whole stream, in the pill's words (describe.ts STREAM_PILL.all): „Toate” is the selected control. */
const WHOLE_STREAM = /^toate achizițiile\b/;
/** The pills those controls repeat. */
const SHOWN_BY_CONTROL: ReadonlySet<string> = new Set(["measure", "dim", "timeseriesSplit", "scatterFlag", "scatterRankBy"]);

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
    // A control under the title shows the same choice, selected.
    const id = filters[i] ?? null;
    if (HAS_CONTROLS.has(spec.block) && id !== null && (SHOWN_BY_CONTROL.has(id) || (id === "dataset" && WHOLE_STREAM.test(words)))) return;
    // A pill that opened a window: its phrase, its chip or the presentation line opens the same one.
    if (pillWindow(view, filters[i] ?? null, spec.block)) return;
    if (said.includes(fold(words))) return;
    notes.push(words);
  });
  return { notes: [...new Set(notes)], subclasses };
}

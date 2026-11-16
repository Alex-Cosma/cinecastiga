"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { AskSpec } from "../../../lib/ask/spec";
import { pillFilters, type PillLabels } from "../../../lib/ask/pill-filters";
import { filterContext } from "../../../lib/ask/filters/context";
import type { Choice } from "../../../lib/ask/filters/pickers";
import { chooseValue } from "../../../lib/ask/filters/transition";
import type { FilterSpec } from "../../../lib/ask/filters/types";
import { questionKey, transitionQuestion, type QuestionSpec } from "../../../lib/ask/question-ui";
import BuilderWindow from "../builder/BuilderWindow";
import { useCoverage } from "../builder/coverage";
import { builderView, type BuilderWindowSpec } from "../builder/view";
import { pillWindow } from "./pill-windows";
import { G } from "../../../components/ghost/Ghost";
import { ghostPillWidth } from "../link-hint";

/*
 * The pills under the answer's title (owner, 1 November 2026): what the
 * answer counted, each pill with a window of the builder (the place, what was
 * bought, the period, the buyers, the list and its order…) a button that
 * opens it beside the pill, on a phone as the builder's bottom sheet. A
 * choice is applied at once, as a new question (a step of the history, so
 * "Înapoi" brings this answer back); Escape, × or a click outside close the
 * window and focus returns to the pill. A pill without a window is text.
 */

export interface AnswerPillsProps {
  /** The applied question the pills describe. */
  spec: AskSpec;
  pills: readonly string[];
  /** What the answer adds to its words (a trend's months, a cloud's group): which words are whose. */
  labels: PillLabels;
  /** The name of the question's CPV code, for the windows' words. */
  cpvName?: string | undefined;
  /** The question after a choice, with the notes of what the choice changed besides. */
  onApply: (next: QuestionSpec, notes: string[]) => void;
}

/** On a phone, this many pills or more wait under „Condiții · N”: two fit on a row or two and stay in sight. */
const FOLD_FROM = 3;

/** A domain's pill longer than this says the person's word and the code; its window and its label keep the whole name. */
const LONG_CPV_PILL = 34;

/**
 * A long CPV name as a pill, „drumuri” · CPV 45233000-9 (owner, 16 November 2026): the word the person wrote and the
 * code it was read as. A question that names the code itself has no word of the person's, so its pill stays whole.
 */
export function shortCpvPill(words: string, term: string): string {
  const match = /\((\d{8}-\d)\)(?: (\+\d+) CPV)?$/.exec(words.trim());
  if (!match || words.trim().length <= LONG_CPV_PILL || !term || /\d{8}/.test(term)) return words;
  return `„${term}” · CPV ${match[1]}${match[2] ? ` ${match[2]}` : ""}`;
}

export default function AnswerPills({ spec, pills, labels, cpvName, onApply }: AnswerPillsProps) {
  const coverage = useCoverage()?.periods ?? null;
  // The builder's draft of the applied question: the windows read and write it as the sentence's do.
  const question = useMemo(() => transitionQuestion(spec as unknown as QuestionSpec).spec, [spec]);
  const view = useMemo(() => builderView(question, { cpvName }, filterContext(question as FilterSpec, coverage ? { coverage } : {})), [question, cpvName, coverage]);
  const windows = useMemo(() => {
    const filters = pillFilters(spec, pills, labels);
    return pills.map((_, i) => pillWindow(view, filters[i] ?? null, spec.block));
  }, [spec, pills, labels, view]);
  // The pill that opened the window (two pills can share one: a domain and its excluded subclasses).
  const [open, setOpen] = useState<{ key: string; anchor: HTMLElement; index: number } | null>(null);
  // On a phone the pills wait under one button, „Condiții · N” (owner, 16 November 2026): the answer starts sooner.
  const [unfolded, setUnfolded] = useState(false);
  const win = open ? view.windows[open.key] ?? null : null;
  // Another answer («Înapoi», the strip) closes a window left open on this one.
  const key = questionKey(question);
  useEffect(() => setOpen(null), [key]);

  /** The choices of the window, in order, as the builder makes them (transition.ts); a new question only when it differs. */
  const choose = (target: BuilderWindowSpec, choices: readonly Choice[]) => {
    let next = question;
    const notes: string[] = [];
    for (const choice of choices) {
      const step = chooseValue(next, target.slot, choice, null, { coverage });
      next = step.spec;
      notes.push(...step.notes);
    }
    setOpen(null);
    if (questionKey(next) !== key) onApply(next, [...new Set(notes)]);
  };

  const term = spec.filters.cpvTerm === undefined ? "" : String(spec.filters.cpvTerm);
  // The pills that open a window: the ones the fold counts.
  const conditions = windows.filter(Boolean).length;
  return <>
    <div className="cq-scope" data-unfolded={unfolded}>
      {conditions >= FOLD_FROM && <>
        <button type="button" className="cq-scope-fold" aria-expanded={unfolded} onClick={() => setUnfolded((current) => !current)}>
          <span>Condiții · {conditions}</span><span className="cq-scope-chev" aria-hidden="true">›</span>
        </button>
        <span className="cq-scope-break" aria-hidden="true" />
      </>}
      {pills.map((words, i) => {
        const target = windows[i];
        // An answer's ghost (AskPanel AnswerGhost): a pill the engine names, unknown before it answers, is a line.
        const ghost = ghostPillWidth(words);
        const pill = ghost ? <G.Line inline w={ghost} /> : shortCpvPill(words, term);
        // A pill's tint is its own edge: the dot separates two words that are text.
        return <Fragment key={i}>
          {i > 0 && !target && !windows[i - 1] && <span className="cq-scope-sep" aria-hidden="true">·</span>}
          {target
            ? <button type="button" className="cq-pill" aria-haspopup="dialog" aria-expanded={open?.index === i && win !== null}
              aria-label={`${target.name}: ${words}`}
              onClick={(event) => { const anchor = event.currentTarget; setOpen((current) => current?.index === i ? null : { key: target.key, anchor, index: i }); }}>
              <span>{pill}<i className="qb-chev" aria-hidden="true" /></span>
            </button>
            : <span className="cq-scope-text">{pill}</span>}
        </Fragment>;
      })}
    </div>
    <BuilderWindow win={win} anchor={open?.anchor ?? null} draft={question}
      onClose={() => setOpen(null)} onChoose={(choices) => { if (win) choose(win, choices); }}
      onReplace={() => undefined} onRemoveExclusions={() => undefined} onCpvName={() => undefined} coverage={coverage} />
  </>;
}

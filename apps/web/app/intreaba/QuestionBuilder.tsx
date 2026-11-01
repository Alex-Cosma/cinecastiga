"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { AskSpec } from "@/lib/ask/spec";
import { keyVersionNotes } from "@/lib/ask/answer-core";
import { readableCpvName } from "@/lib/entity-summary";
import { withoutLinkConditions } from "@/lib/ask/filters/restore";
import { filterContext } from "@/lib/ask/filters/context";
import type { FilterSpec } from "@/lib/ask/filters/types";
import { chooseQuestion, chooseValue, restoreParked, type NoteLink, type Transition } from "@/lib/ask/filters/transition";
import { askLink } from "@/lib/ask/source-spec";
import type { Parked } from "@/lib/ask/filters/parked";
import type { Choice } from "@/lib/ask/filters/pickers";
import { splitExcluded, type Excluded } from "@/lib/ask/filters/origin";
import {
  QUESTION_GROUPS, QUESTION_TYPES, cloneQuestion, defaultQuestion, foldQuestion,
  questionErrors, questionKey, reconcileQuestionDraft, transitionQuestion, type QuestionSpec,
} from "@/lib/ask/question-ui";
import "./question-builder.css";
import "./builder/filters-kit.css";
import BuilderWindow from "./builder/BuilderWindow";
import { useCoverage } from "./builder/coverage";
import Chip from "./builder/Chip";
import ConditionRow from "./builder/ConditionRow";
import Toggle, { type ToggleProps } from "./builder/Toggle";
import Invitations from "./builder/Invitations";
import ParkedRow from "./builder/ParkedRow";
import ScopeLine from "./builder/ScopeLine";
import Sentence, { Presentation } from "./builder/Sentence";
import UnderChips from "./builder/UnderChips";
import { useEntityNames } from "./builder/use-entity-names";
import { useFacet } from "./builder/use-facet";
import { emptyReason, winnerCount } from "./builder/window-model";
import type { GlossaryId } from "@/lib/glossary";
import { usePeerDialog } from "./builder/use-peer-dialog";
import { peerDataFor } from "./builder/PeersWindow";
import { peerFollowUp } from "../../lib/ask/peer-groups-shared";
import KitLink from "./answer/KitLink";
import RowMenu from "./answer/RowMenu";
import { builderView, onlyExclusions, patchDraft, trendListSwitch, withoutExclusions, type BuilderWindowSpec, type StripPatch } from "./builder/view";
import type { TrendList } from "@/lib/ask/trend-shared";
import SaveQuestionButton from "./SaveQuestionButton";
import SavedQuestions, { type SavedQuestion } from "./SavedQuestions";

/*
 * The question builder (plan §2.3): the orchestrator of the draft, the
 * applied question, the run, saving and the catalogue. What it draws comes
 * from the registry (builder/view.ts: BLOCK_FILTERS, sentence.ts,
 * legacyConditions) through the kit's components: the sentence (P1), the
 * profile line, the partners' rows (P3b), the invitations (P2), the chips
 * under the sentence and the parked row (P4), the presentation line (P5) and
 * "⋯ › Selecție avansată" (P9). Every edit goes through transition.ts, so a
 * condition either stays, leaves with a note or waits in the parked row,
 * which is a draft state and never enters the link. The archive's periods
 * (/api/data-coverage, read at mount) give a new trend its years and its
 * "Aceleași luni" (trend-rules.ts).
 */

export type QuestionBuilderSpec = QuestionSpec;
type RunOutcome = boolean | QuestionSpec | AskSpec | void;
export type { StripPatch } from "./builder/view";
export interface QuestionBuilderProps {
  initial?: QuestionSpec | null;
  resolution?: { submitted: QuestionSpec; resolved: QuestionSpec } | null;
  fromAi?: boolean;
  onRun: (spec: QuestionSpec) => RunOutcome | Promise<RunOutcome>;
  running: boolean;
  onDraftChange?: (dirty: boolean) => void;
  /** False when `initial` is a proposal (an interpreted question or a link that waits) that has not been run yet. */
  initialApplied?: boolean;
  /** What opening a link changed (restoreLink's notes, e.g. a measure only rankings of institutions have): said with the builder's own notes. */
  initialNotes?: readonly string[];
  /** A key the strip beside the answer changed (plan §2.3): the builder writes it into its applied question and its draft. */
  stripPatch?: StripPatch | null;
  /**
   * The sentence chose another of the trend's groups, the rest of the question as applied: true when the
   * answer on screen holds that list and switched to it (no request; its StripPatch follows), as its button does.
   */
  onTrendList?: (list: TrendList) => boolean;
}

function Glyph({ name, className = "" }: { name: string; className?: string }) {
  const paths: Record<string, ReactNode> = {
    table: <><path d="M5 6h14M5 12h10M5 18h6" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
    stat: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 8h8M8 12h2m4 0h2m-8 4h2m4 0h2" /></>,
    timeseries: <><path d="M4 4v16h16M7 14l4-5 4 3 5-7" /></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15" /></>,
    breakdown: <><path d="M11 3a9 9 0 1 0 10 10H11zM15 3v6h6a9 9 0 0 0-6-6Z" /></>,
    compare: <><rect x="3" y="5" width="7" height="14" rx="2" /><rect x="14" y="5" width="7" height="14" rx="2" /><path d="M5 10h3m-3 4h3m8-4h3m-3 4h3" /></>,
    trend: <><path d="M4 18h16M5 14l5-5 4 3 6-8M15 4h5v5" /></>,
    network: <><circle cx="12" cy="12" r="3" /><circle cx="5" cy="5" r="2" /><circle cx="20" cy="7" r="2" /><circle cx="6" cy="20" r="2" /><circle cx="20" cy="19" r="2" /><path d="m7 7 3 3m4 0 4-2m-8 6-3 4m7-4 4 4" /></>,
    sankey: <><path d="M3 5h4c5 0 5 5 10 5h4M3 12h4c5 0 5-7 10-7h4M3 19h4c5 0 5-4 10-4h4" /><path d="M3 3v18m18-18v18" /></>,
    fact_check: <><path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7zM8 12l3 3 5-6" /></>,
    distribution: <><path d="M3 20h18M5 20v-5h4v5M9 20V6h4v14m0 0V3h4v17m0 0v-8h4v8" /></>,
    scatter: <><path d="M4 4v16h16" /><circle cx="8" cy="14" r="1" /><circle cx="12" cy="11" r="1" /><circle cx="17" cy="13" r="1" /><circle cx="18" cy="5" r="2" /></>,
    entity_card: <><path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.7l6.2-.9z" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  };
  return <svg viewBox="0 0 24 24" className={`qb-icon ${className}`} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name] ?? paths.table}</svg>;
}

const unique = (notes: readonly string[]) => [...new Set(notes)];
const isCode = (term: string) => /^(?:\d{2,8}|\d{8}-\d)$/.test(term.replace(/\s+/g, ""));

/** F5: the switches of the ranked winners and their option in the part `winners` (facet-parts.ts winnerOption). */
const WINNER_TOGGLES: Partial<Record<string, string>> = { mainClient: "main", dominantSupplier: "dominant" };
/** Their (?) (final table §3.6, §3.7): the glossary's words. */
const WINNER_TIPS: Partial<Record<string, GlossaryId>> = { mainClient: "client-principal", dominantSupplier: "o-firma-ia-jumatate" };

export default function QuestionBuilder({ initial, resolution, fromAi = false, onRun, running, onDraftChange, initialApplied = true, initialNotes, stripPatch = null, onTrendList }: QuestionBuilderProps) {
  const [seed] = useState(() => transitionQuestion(initial ?? defaultQuestion()));
  const [draft, setDraft] = useState<QuestionSpec>(seed.spec);
  const [applied, setApplied] = useState<QuestionSpec | null>(initial && initialApplied ? cloneQuestion(initial) : null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [changes, setChanges] = useState<string[]>(() => unique([...(initialNotes ?? []), ...seed.changes, ...(initial ? keyVersionNotes(initial as unknown as AskSpec) : [])]));
  const [parked, setParked] = useState<Parked | null>(null);
  // A note's link ("Cât câștigă X ›" for a tautology the change dropped), by the note's text.
  const [noteLinks, setNoteLinks] = useState<Record<string, NoteLink>>({});
  const initialKey = initial ? questionKey(initial) : "";
  const previousInitial = useRef(initialKey);
  const [open, setOpen] = useState<{ key: string; anchor: HTMLElement } | null>(null);
  const [catalogue, setCatalogue] = useState(false);
  const [catalogueTab, setCatalogueTab] = useState<"models" | "saved">("models");
  const [search, setSearch] = useState("");
  const [savedQuestion, setSavedQuestion] = useState<SavedQuestion | null>(null);
  const [savedNotice, setSavedNotice] = useState("");
  const [cpvNames, setCpvNames] = useState<Record<string, string>>({});
  const catalogueId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const catalogueTrigger = useRef<HTMLElement | null>(null);
  const moreRef = useRef<HTMLSpanElement>(null);
  const dialogTitleId = useId();
  const searchId = useId();

  const cpvTerm = String(draft.filters.cpvTerm ?? "");
  const cpvName = cpvNames[cpvTerm];
  // The archive's periods, read at mount (plan §2.6): a new trend's years and the months "Aceleași luni" counts.
  const coverage = useCoverage()?.periods ?? null;
  const transition = useMemo(() => ({ coverage }), [coverage]);
  // An old link's selection names its institutions and firms in the (?) once they are looked up (the answer does not wait).
  const entities = useEntityNames(draft.population);
  // A distribution's group (F6a): the window's rows and sizes, the sentence's bounds, a new question's default tick.
  const peerState = usePeerDialog(draft);
  const peerData = peerDataFor(draft, peerState);
  const view = useMemo(
    () => builderView(draft, { cpvName, entities, peerGroup: peerData?.facts }, filterContext(draft as FilterSpec, coverage ? { coverage } : {})),
    [draft, cpvName, entities, coverage, peerData],
  );
  // F5: the switches of the ranked winners say their number before the click (final table §4), read lazily.
  const winnerToggles = view.rows.some((row) => row.chips.some((chip) => chip.toggle && WINNER_TOGGLES[chip.id]));
  const winners = useFacet(draft, winnerToggles ? "winners" : null);
  // Their number, their (?) and, with 0, disabled with the reason (kit component 5; an active one still turns off).
  const winnerToggle = (chip: { id: string; active: boolean }): Pick<ToggleProps, "count" | "tip" | "availability"> => {
    const value = WINNER_TOGGLES[chip.id];
    if (!value) return {};
    const count = winnerCount(winners, value), empty = chip.active ? null : emptyReason(winners, value), tip = WINNER_TIPS[chip.id];
    return { ...(count ? { count } : {}), ...(tip ? { tip: { id: tip } } : {}), ...(empty ? { availability: { state: "disabled", reason: empty } } : {}) };
  };
  const dirty = questionKey(draft) !== questionKey(applied ?? seed.spec);
  // A refused link condition says its reason on its chip: the list under the buttons keeps the rest.
  const reasons = new Set(view.refused.map((c) => c.reason));
  const errors = questionErrors(draft).filter((error) => !reasons.has(error));
  // A trend's months the data do not confirm wait for a choice under the sentence (its chip says so).
  const blocked = errors.length > 0 || view.refused.length > 0 || view.waiting !== null;
  const win: BuilderWindowSpec | null = open ? view.windows[open.key] ?? null : null;

  useEffect(() => {
    if (previousInitial.current === initialKey) return;
    previousInitial.current = initialKey;
    const next = transitionQuestion(initial ?? defaultQuestion());
    setDraft(next.spec);
    setApplied(initial && initialApplied ? cloneQuestion(initial) : null);
    setChanges(unique([...(initialNotes ?? []), ...next.changes]));
    setParked(null);
    setSavedQuestion(null); setSavedNotice("");
  }, [initial, initialKey, initialApplied, initialNotes]);

  useEffect(() => {
    if (!resolution) return;
    setApplied(cloneQuestion(resolution.resolved));
    setDraft(current => reconcileQuestionDraft(current, resolution.submitted, resolution.resolved));
    if (questionKey(draftRef.current) === questionKey(resolution.submitted)) setChanges([]);
  }, [resolution]);

  // The strip wrote one key of the applied question: the draft gets that key, its other edits wait.
  const lastPatch = useRef(stripPatch?.seq ?? 0);
  useEffect(() => {
    if (!stripPatch || stripPatch.seq === lastPatch.current) return;
    lastPatch.current = stripPatch.seq;
    setApplied(current => current ? patchDraft(current, stripPatch) : current);
    setDraft(current => patchDraft(current, stripPatch));
  }, [stripPatch]);

  useEffect(() => { onDraftChange?.(dirty); }, [dirty, applied, onDraftChange]);

  // Links and saved questions contain the code, not presentation labels.
  // Resolve independently of the answer, so even a slow query has clear phrases.
  useEffect(() => {
    if (!isCode(cpvTerm) || cpvName) return;
    const ctrl = new AbortController();
    fetch(`/api/cpv/label?code=${encodeURIComponent(cpvTerm)}`, { signal: ctrl.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const data: { name?: string | null } = await response.json();
        if (!ctrl.signal.aborted && data.name) setCpvNames(current => ({ ...current, [cpvTerm]: readableCpvName(data.name!) }));
      })
      .catch(() => { /* Keep the explicit CPV code usable if lookup fails. */ });
    return () => ctrl.abort();
  }, [cpvTerm, cpvName]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!catalogue || !dialog) return;
    if (!dialog.open) dialog.showModal();
    const frame = requestAnimationFrame(() => dialog.querySelector<HTMLInputElement>("input[type=search]")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [catalogue]);

  // What waits for the entity's group to be read: a new question's default tick, or another entity's county and type.
  const followPeers = useRef<{ fresh?: boolean; previousCounty?: string | null } | null>(null);
  useEffect(() => {
    if (!followPeers.current || !peerData) return;
    const next = peerFollowUp(draftRef.current, peerData, followPeers.current);
    followPeers.current = null;
    if (next) settle({ spec: next.spec, notes: next.notes, parked });
  }, [peerData]); // eslint-disable-line react-hooks/exhaustive-deps -- once per group read

  /** The draft after an edit, with its notes and the parked row (transition.ts). */
  function settle(next: Pick<Transition, "spec" | "notes" | "parked" | "links">, replaceNotes = false) {
    setDraft(next.spec);
    setChanges(previous => unique([...(replaceNotes ? [] : previous), ...next.notes]));
    setNoteLinks(previous => ({ ...(replaceNotes ? {} : previous), ...next.links }));
    setParked(next.parked);
  }
  function openWindow(key: string, anchor: HTMLElement) {
    setOpen(current => current?.key === key ? null : { key, anchor });
  }
  const closeWindow = () => setOpen(null);
  /** The choices of a window, in order, each through chooseValue. "Față de cine?" stays open: a tick changes the group at once. */
  function choose(target: BuilderWindowSpec, choices: readonly Choice[], opts: { keepOpen?: boolean; note?: string } = {}) {
    let spec: QuestionSpec = draft, current = parked;
    const notes: string[] = opts.note ? [opts.note] : [], links: Record<string, NoteLink> = {};
    // Another entity of a distribution: its county follows and its type is checked once its group is read (final distribution §4.4).
    const picked = choices.find((c) => c.filter === "authority" || c.filter === "supplier")?.value as { id?: number } | undefined;
    if (draft.block === "distribution" && target.slot.picker === "focal" && picked?.id !== undefined
      && String(picked.id) !== String(draft.filters.authorityId ?? draft.filters.supplierId ?? ""))
      followPeers.current = draft.filters.authorityId || draft.filters.supplierId ? { previousCounty: peerData?.facts.county ?? null } : { fresh: true };
    for (const choice of choices) {
      const next = chooseValue(spec, target.slot, choice, current, transition);
      spec = next.spec; current = next.parked; notes.push(...next.notes); Object.assign(links, next.links);
    }
    settle({ spec, notes, parked: current, links });
    if (opts.keepOpen) return;
    closeWindow();
    // The trend's group in the sentence and the answer's group buttons are one control (plan §4.7 P1, P6):
    // a group the answer already holds is shown at once, the draft applied by the StripPatch that follows.
    const list = target.slot.id === "trendChange" && !running ? trendListSwitch(spec, applied) : null;
    if (list) onTrendList?.(list);
  }
  /** "⋯ › Selecție avansată" and its editors write the draft as they are edited (same question, normalized). */
  function replace(next: QuestionSpec) {
    const normalized = transitionQuestion(next);
    settle({ spec: normalized.spec, notes: normalized.changes, parked });
  }
  function removeUnder(id: string) {
    const removal = view.removals[id];
    if (!removal) return;
    if (removal.kind === "exclusion") return removeExclusions(removal.excluded);
    // The question's own chip (the trend's "Aceleași luni"): its × or its switch is a choice of its window.
    if (removal.kind === "choice") return choose(view.windows[id] ?? { key: id, slot: removal.slot, title: "", name: "" }, [removal.choice]);
    if (removal.kind === "advanced") {
      const next = cloneQuestion(draft);
      // The exclusions keep their own chips: "Selecție avansată" holds the rest.
      if (removal.key === "population") { const kept = onlyExclusions(next.population); if (kept) next.population = kept; else delete next.population; }
      else delete next.minimumRecords;
      return replace(next);
    }
    const { condition } = removal;
    if (condition.key === "population" && condition.origin === "link" && splitExcluded(draft.population).excluded.length) {
      const next = cloneQuestion(draft);
      const kept = onlyExclusions(next.population);
      if (kept) next.population = kept; else delete next.population;
      return replace(next);
    }
    const next = withoutLinkConditions(draft, [condition]);
    settle({ spec: next.spec, notes: next.notes, parked });
  }
  function removeExclusions(excluded: Excluded[]) {
    const next = cloneQuestion(draft);
    const population = withoutExclusions(next.population, excluded);
    if (population) next.population = population; else delete next.population;
    replace(next);
    if (open?.key.startsWith("x:")) closeWindow();
  }
  function removeRefused() {
    const next = withoutLinkConditions(draft, view.refused);
    settle({ spec: next.spec, notes: next.notes, parked });
  }
  function bringBackParked() {
    if (parked) settle(restoreParked(draft, parked, transition));
  }
  function chooseType(block: string) {
    // A new distribution writes its default tick once the entity's group is read (final distribution §4.2).
    if (block === "distribution" && draft.block !== "distribution") followPeers.current = { fresh: true };
    settle(chooseQuestion(draft, block, parked, transition), true);
    closeCatalogue();
  }
  function loadSavedQuestion(question: SavedQuestion) {
    const next = transitionQuestion(question.spec);
    settle({ spec: next.spec, notes: next.changes, parked: null }, true);
    setSavedQuestion(question);
    setSavedNotice(`Întrebare încărcată: „${question.title}”. Apasă „Vezi răspunsul” pentru a o rula.`);
    closeCatalogue();
  }
  function openCatalogue(trigger: HTMLElement) {
    catalogueTrigger.current = trigger;
    setSearch("");
    setCatalogue(true);
  }
  function closeCatalogue() {
    dialogRef.current?.close();
    setCatalogue(false);
    catalogueTrigger.current?.focus({ preventScroll: true });
  }
  async function apply() {
    if (blocked || running) return;
    const next = cloneQuestion(draft);
    const submittedKey = questionKey(next);
    try {
      const outcome = await onRun(next);
      if (outcome === false) return;
      const accepted = typeof outcome === "object" && outcome !== null ? cloneQuestion(outcome as QuestionSpec) : next;
      setApplied(accepted);
      // Edits made while the server works remain a separate, unapplied draft.
      setDraft((current) => reconcileQuestionDraft(current, next, accepted));
      if (questionKey(draftRef.current) === submittedKey) setChanges([]);
    } catch {
      // The parent owns the request error; keep the draft and previous answer.
    }
  }
  function discard() {
    const next = transitionQuestion(applied ?? seed.spec);
    settle({ spec: next.spec, notes: next.changes, parked: null }, true);
  }

  const catalogResults = QUESTION_TYPES.filter((item) => foldQuestion(`${item.label} ${item.description} ${item.keywords}`).includes(foldQuestion(search.trim())));
  const navigation = <div className="qb-navigation"><div className="qb-shortcuts" aria-label="Aceleași date, altă perspectivă">{[{ id: "table", label: "Cine câștigă?" }, { id: "timeseries", label: "Cum se schimbă?" }, { id: "compare", label: "Compară" }].map((item) => <button type="button" aria-pressed={draft.block === item.id} key={item.id} onClick={() => chooseType(item.id)}><Glyph name={item.id} />{item.label}</button>)}</div><button type="button" className="qb-catalogue-trigger" aria-haspopup="dialog" onClick={(event) => openCatalogue(event.currentTarget)}><Glyph name="plus" />Toate întrebările<span>13</span></button></div>;
  const removal = open ? view.removals[open.key] : undefined;

  return <div className="question-builder qb">
    {navigation}
    <section className={`qb-editor qb-editor-kit${dirty ? " is-pending" : ""}`} aria-label="Construiește întrebarea">
      {savedNotice && <p className="cq-loaded-question" role="status">{savedNotice}</p>}
      {fromAi && <p className="qb-ai-note">Am transformat întrebarea în condiții pe care le poți verifica și modifica.</p>}
      <Sentence tokens={view.sentence} openId={open?.key ?? null} onOpen={openWindow} className={`qb-kit-sentence qb-kit-sentence--${draft.block}`} />
      {view.scopeLine && <ScopeLine />}
      {view.rows.map((row) => <ConditionRow key={row.label} label={row.label} kind={row.kind}>
        {row.chips.map((chip) => chip.toggle
          // A switch (kit component 5): a second press turns it off, so it has no × and no window.
          ? <Toggle key={chip.key} id={chip.key} label={chip.name} pressed={chip.active}
            {...winnerToggle(chip)}
            onToggle={(_id, pressed) => { const target = view.windows[chip.key]; if (target) choose(target, [{ filter: chip.id, value: pressed ? true : undefined }]); }} />
          : <Chip key={chip.key} id={chip.key} label={chip.label} name={chip.name} active={chip.active} open={open?.key === chip.key} onOpen={openWindow}
            onRemove={() => { const target = view.windows[chip.key]; if (target) choose(target, [{ filter: chip.id, value: undefined }]); }} />)}
      </ConditionRow>)}
      <Invitations items={view.invites} openId={open?.key ?? null} onOpen={openWindow} />
      <UnderChips items={view.under} openId={open?.key ?? null} onOpen={openWindow} onRemove={removeUnder} onToggle={removeUnder} />
      <ParkedRow label={parked?.label ?? ""} {...(parked ? { tip: { title: parked.label, text: parked.tip } } : {})} items={parked?.items.map((item) => ({ id: item.id, label: item.label })) ?? []} onRestore={bringBackParked} />
      {view.refused.length > 0 && <div className="qb-refused" role="alert">
        <p>{view.refused[0]!.why ?? view.refused[0]!.reason}</p>
        <button type="button" className="qb-secondary" onClick={removeRefused}>Scoate condițiile din link</button>
      </div>}
      {changes.length > 0 && <div className="qb-notes" role="status"><Glyph name="info" /><div><strong>Ce se schimbă odată cu întrebarea</strong>{changes.map((note) => <p key={note}>{note}{noteLinks[note] && <KitLink className="qb-relax-link" link={{ label: noteLinks[note]!.label, glyph: "›", href: askLink(noteLinks[note]!.spec as QuestionSpec) }} />}</p>)}</div></div>}
      <div className="qb-bottom">
        <div className="qb-bottom-start">
          {view.presentation.length > 0 && <Presentation tokens={view.presentation} openId={open?.key ?? null} onOpen={openWindow} />}
          {view.advanced.length > 0 && <span className="qb-more-wrap" ref={moreRef}>
            <RowMenu name="Întrebarea" actions={[{ id: "advanced", label: "Selecție avansată", glyph: "▾", onSelect: () => {
              const button = moreRef.current?.querySelector<HTMLElement>(".qb-more");
              if (button) openWindow("advanced", button);
            } }]} />
          </span>}
        </div>
        <div className="qb-actions qb-bottom-end">
          {dirty ? <button type="button" className="qb-discard" onClick={discard}>Renunță la modificări</button> : applied && <span className="qb-ready"><Glyph name="check" />Întrebare aplicată</span>}
          <SaveQuestionButton spec={draft} unapplied={dirty && Boolean(applied)} active={savedQuestion} onSaved={question => { setSavedQuestion(question); setSavedNotice(`Salvată ${question.storage === "local" ? "pe acest dispozitiv" : "în cont"}: „${question.title}” · Toate întrebările → Salvate`); }} disabled={running || blocked} />
          <button type="button" className="qb-primary qb-apply" disabled={running || blocked} onClick={apply}>{running ? "Caut în date…" : dirty && applied ? "Actualizează răspunsul" : "Vezi răspunsul"}<Glyph name="arrow" /></button>
        </div>
      </div>
      {errors.length > 0 && <div className="qb-validation" aria-live="polite">{errors.map((error) => <p key={error}>{error}</p>)}</div>}
      {dirty && <p className="qb-pending-line" role="status"><span />Modificări neaplicate</p>}
    </section>
    <BuilderWindow win={win} anchor={open?.anchor ?? null} draft={draft} excluded={removal?.kind === "exclusion" ? removal.excluded : []}
      onClose={closeWindow} onChoose={(choices, opts) => { if (win) choose(win, choices, opts); }} onReplace={replace} onRemoveExclusions={removeExclusions} peers={peerState}
      onCpvName={(code, name) => setCpvNames(current => ({ ...current, [code]: name }))} coverage={coverage} />
    <dialog ref={dialogRef} className="qb-dialog qb-dialog-search qb-dialog-catalogue" aria-labelledby={dialogTitleId} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeCatalogue(); } }} onCancel={(event) => { event.preventDefault(); closeCatalogue(); }} onClick={(event) => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeCatalogue(); } }}>
      {catalogue && <><div className="qb-picker-head"><h2 id={dialogTitleId}>Ce ai vrea să afli?</h2><button className="qb-dialog-close" type="button" onClick={closeCatalogue} aria-label="Închide"><Glyph name="close" /></button></div>
        <p className="qb-picker-note">{catalogueTab === "saved" ? "Întrebările tale, cu filtrele păstrate. Cele mai recent salvate apar primele." : "13 feluri de a privi datele. Alege întrebarea, apoi fă-o a ta."}</p>
        <div className="cq-catalogue-tabs" role="tablist" aria-label="Alege o întrebare">{(["models", "saved"] as const).map(tab => <button key={tab} type="button" role="tab" id={`${catalogueId}-${tab}`} aria-selected={catalogueTab === tab} aria-controls={`${catalogueId}-panel`} tabIndex={catalogueTab === tab ? 0 : -1} onClick={() => { setCatalogueTab(tab); setSearch(""); }} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "models" : event.key === "End" ? "saved" : tab === "models" ? "saved" : "models"; setCatalogueTab(next); setSearch(""); document.getElementById(`${catalogueId}-${next}`)?.focus(); } }}>{tab === "models" ? "Modele de întrebări" : "Salvate"}</button>)}</div>
        <label className="qb-picker-search" htmlFor={searchId}><Glyph name="search" /><input id={searchId} type="search" autoComplete="off" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={catalogueTab === "saved" ? "Caută în întrebările salvate…" : "Caută o întrebare, de exemplu: relații, risc, evoluție…"} aria-label={catalogueTab === "saved" ? "Caută în întrebările salvate" : "Caută în cele 13 întrebări"} /></label>
        <div className="qb-picker-content" role="tabpanel" id={`${catalogueId}-panel`} aria-labelledby={`${catalogueId}-${catalogueTab}`}>
          {catalogueTab === "saved" ? <SavedQuestions search={search} current={draft} hasUnsavedChanges={questionKey(draft) !== questionKey(savedQuestion?.spec ?? seed.spec)} onLoad={loadSavedQuestion} />
            : <div className="qb-catalogue-grid">{QUESTION_GROUPS.map((group) => {
              const items = catalogResults.filter((item) => item.group === group.id);
              return items.length ? <section className="qb-catalogue-group" key={group.id}><h3>{group.label}</h3>{items.map((item) => <button key={item.id} type="button" className={`qb-catalogue-item${draft.block === item.id ? " is-selected" : ""}`} onClick={() => chooseType(item.id)}><span className="qb-catalogue-glyph"><Glyph name={item.id} /></span><span><strong>{item.label}</strong><small>{item.description}</small></span><Glyph name={draft.block === item.id ? "check" : "arrow"} /></button>)}</section> : null;
            })}{!catalogResults.length && <p className="qb-catalogue-empty">Nicio întrebare pentru „{search}”. Încearcă „bani”, „relații” sau „risc”.</p>}</div>}
        </div></>}
    </dialog>
  </div>;
}

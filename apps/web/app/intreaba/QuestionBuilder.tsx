"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { entityHref, type EntityRole } from "../../lib/entity-href";
import type { PillLabels } from "../../lib/ask/pill-filters";
import { liveNotes } from "./answer/live-notes";
import SubclassesPill from "./answer/SubclassesPill";
import { excludedSubclasses, subclassesWords, wholeDomainCode } from "./answer/subclasses";
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
  questionErrors, questionKey, reconcileQuestionDraft, transitionQuestion, unknownCounty, type QuestionSpec,
} from "@/lib/ask/question-ui";
import "./question-builder.css";
import "./builder/filters-kit.css";
import BuilderWindow from "./builder/BuilderWindow";
import { useCoverage } from "./builder/coverage";
import Chip from "./builder/Chip";
import ConditionRow from "./builder/ConditionRow";
import Toggle, { type ToggleProps } from "./builder/Toggle";
import Invitations, { Invite } from "./builder/Invitations";

/** The ranked firms' row of the registry (blocks.ts) and the invitations that belong in it or in „Achiziția” (Z2-17). */
const WINNERS_ROW = "Câștigătorii";
const FIRM_INVITES = new Set(["firmSeat", "seatCounty", "admin"]);
const PURCHASE_INVITES = new Set(["purchaseValue", "purchaseKind", "procedure", "singleBidder"]);
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
import { builderView, onlyExclusions, patchDraft, trendListSwitch, withoutExclusions, type BuilderWindowSpec, type StripPatch } from "./builder/view";
import type { TrendList } from "@/lib/ask/trend-shared";
import SaveQuestionButton from "./SaveQuestionButton";
import { arrive } from "@/components/motion/outline";
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

/**
 * The builder beside an answer (UX audit Z2-03, variant B; owner, 16 November 2026): its sentence is the answer's
 * title and every choice is applied at once, as the pills' were. The editor is drawn in the answer's head (`host`);
 * where the builder stands only the models stay, while „Schimbă întrebarea” is open (`expanded`), with the
 * invitations („+ …”) under the title. No draft, no „Vezi răspunsul”: a question that cannot run yet (a model that
 * needs a firm chosen) says what it waits for under the title, the answer on screen still the previous one.
 */
export interface LiveBuilder {
  /** The element in the answer's head the editor is drawn in (null until it is mounted). */
  host: HTMLElement | null;
  /** The question the answer on screen answers: «Înapoi», another reading or a row left out change it from outside the builder. */
  applied?: QuestionSpec | null;
  expanded: boolean;
  /** The entities the question names: each gets a „→” to its page after its phrase (the name itself opens its window). */
  entities?: readonly { id: string | number; name: string; role?: EntityRole | null | undefined }[];
  /** A title that is not the sentence (the map's lens): the heading says it, the sentence follows as a line. */
  title?: string | null;
  /** The server's pills of the answer and what it adds to their words: what only a pill said stays as quiet words. */
  pills?: readonly string[];
  labels?: PillLabels & { trendYears?: { yearA: number; yearB: number } | null | undefined; networkSince?: number | null | undefined };
  caveats?: readonly string[] | undefined;
  cpvName?: string | undefined;
  /** Under the title: how a typed question was understood. */
  afterTitle?: ReactNode;
  /** What a choice changed besides (transition.ts notes), once it is applied. */
  onNotes?: (notes: string[]) => void;
}
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
  /** Opens „Toate întrebările” on „Salvate” (UX audit Z2-27: the empty page's entry, „Vezi salvatele” after saving); then onSavedOpened. */
  openSaved?: boolean;
  onSavedOpened?: () => void;
  /** A key the strip beside the answer changed (plan §2.3): the builder writes it into its applied question and its draft. */
  stripPatch?: StripPatch | null;
  /**
   * The sentence chose another of the trend's groups, the rest of the question as applied: true when the
   * answer on screen holds that list and switched to it (no request; its StripPatch follows), as its button does.
   */
  onTrendList?: (list: TrendList) => boolean;
  /** Beside an answer: the sentence is its title and choices apply at once (LiveBuilder). */
  live?: LiveBuilder | null;
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

export default function QuestionBuilder({ initial, resolution, fromAi = false, onRun, running, onDraftChange, initialApplied = true, initialNotes, stripPatch = null, onTrendList, openSaved = false, onSavedOpened, live = null }: QuestionBuilderProps) {
  const [seed] = useState(() => transitionQuestion(initial ?? defaultQuestion()));
  const [draft, setDraft] = useState<QuestionSpec>(seed.spec);
  const [applied, setApplied] = useState<QuestionSpec | null>(initial && initialApplied ? cloneQuestion(initial) : null);
  const autoRun = useRef(false), autoNotes = useRef<string[]>([]);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [changes, setChanges] = useState<string[]>(() => unique([...(initialNotes ?? []), ...seed.changes, ...(initial && !unknownCounty(initial) ? keyVersionNotes(initial as unknown as AskSpec) : [])]));
  const [parked, setParked] = useState<Parked | null>(null);
  // A note's link ("Cât câștigă X ›" for a tautology the change dropped), by the note's text.
  const [noteLinks, setNoteLinks] = useState<Record<string, NoteLink>>({});
  const initialKey = initial ? questionKey(initial) : "";
  const previousInitial = useRef(initialKey);
  const [open, setOpen] = useState<{ key: string; anchor: HTMLElement } | null>(null);
  /** Beside an answer, the phrase or chip whose window made the last change: its outline draws once the answer is in (M-09). */
  const arrival = useRef<HTMLElement | null>(null);
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
  const cpvName = cpvNames[cpvTerm] ?? (live?.cpvName || undefined);
  // Beside an answer every choice is applied at once (LiveBuilder).
  const auto = Boolean(live) && applied !== null;
  // The archive's periods, read at mount (plan §2.6): a new trend's years and the months "Aceleași luni" counts.
  const coverage = useCoverage()?.periods ?? null;
  const transition = useMemo(() => ({ coverage }), [coverage]);
  // An old link's selection names its institutions and firms in the (?) once they are looked up (the answer does not wait).
  const entities = useEntityNames(draft.population);
  // A distribution's group (F6a): the window's rows and sizes, the sentence's bounds, a new question's default tick.
  const peerState = usePeerDialog(draft);
  const peerData = peerDataFor(draft, peerState);
  const view = useMemo(
    // Beside its answer the sentence says what the answer ran (a trend's years, a network's reference year), as its title did.
    () => builderView(draft, { cpvName, entities, peerGroup: peerData?.facts ?? (auto ? live?.labels?.peerGroup : undefined), ...(auto ? { trendYears: live?.labels?.trendYears, networkSince: live?.labels?.networkSince, executedMonths: live?.labels?.executedMonths } : {}) },
      filterContext(draft as FilterSpec, coverage ? { coverage } : {})),
    [draft, cpvName, entities, coverage, peerData, auto, live?.labels],
  );
  // Under a ranking of firms the invitations are grouped by what they narrow (UX audit Z2-17): the firms in their row
  // („Câștigătorii”), the purchase in its own („Achiziția”); the rest stay under the sentence.
  const grouped = useMemo(() => {
    const winners = view.rows.some((row) => row.label === WINNERS_ROW && row.kind === "group");
    const of = (item: { id: string }) => item.id.replace(/^i:/, "");
    return {
      firms: winners ? view.invites.filter((item) => FIRM_INVITES.has(of(item))) : [],
      purchase: winners ? view.invites.filter((item) => PURCHASE_INVITES.has(of(item))) : [],
      rest: winners ? view.invites.filter((item) => !FIRM_INVITES.has(of(item)) && !PURCHASE_INVITES.has(of(item))) : view.invites,
    };
  }, [view]);
  // A link's county the data do not know (UX audit Z2-31): its phrase is marked, its window opens to choose another,
  // and the error under the builder holds „Vezi răspunsul”.
  const badCounty = unknownCounty(draft);
  const isBadPhrase = (token: (typeof view.sentence)[number]) => Boolean(badCounty) && token.kind === "slot" && token.value.includes(badCounty!);
  const sentence = badCounty ? view.sentence.map((token) => isBadPhrase(token) && token.kind === "slot" ? { ...token, className: `${token.className ?? ""} qb-phrase--invalid`.trim() } : token) : view.sentence;
  const openedBad = useRef(false);
  useEffect(() => {
    if (!badCounty || openedBad.current) return;
    const token = view.sentence.find(isBadPhrase);
    if (!token || token.kind !== "slot") return;
    const frame = requestAnimationFrame(() => {
      const anchor = document.querySelector<HTMLElement>(".question-builder .qb-phrase--invalid");
      if (!anchor) return;
      openedBad.current = true;
      setOpen({ key: token.id, anchor });
    });
    return () => cancelAnimationFrame(frame);
    // Once per mount: the reader may close it and look around.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badCounty]);
  // F5: the switches of the ranked winners say their number before the click (final table §4), read lazily.
  const winnerToggles = view.rows.some((row) => row.chips.some((chip) => chip.toggle && WINNER_TOGGLES[chip.id]));
  // Folded beside an answer the switches are not drawn (only one that is on): their numbers are asked once it opens.
  const winners = useFacet(draft, winnerToggles && (!auto || live?.expanded) ? "winners" : null);
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

  // Beside an answer the title is the answer's question: one the builder did not ask («Înapoi», „Altfel”, a row left
  // out of the count) becomes its draft, as a new link would.
  const outerKey = live?.applied ? questionKey(live.applied) : "";
  useEffect(() => {
    if (!outerKey || !live?.applied || !applied || questionKey(applied) === outerKey) return;
    autoRun.current = false; autoNotes.current = [];
    setDraft(transitionQuestion(live.applied).spec);
    setApplied(cloneQuestion(live.applied));
    setChanges([]); setParked(null); setOpen(null);
  }, [outerKey]); // eslint-disable-line react-hooks/exhaustive-deps -- once per answer

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

  // Beside an answer a choice is on its way to being the answer: „Răspuns pentru întrebarea anterioară” is said only
  // for a question that waits (it cannot run yet, or its request failed).
  useEffect(() => {
    if (!auto) { onDraftChange?.(dirty); return; }
    if (!dirty || running) { onDraftChange?.(false); return; }
    const timer = window.setTimeout(() => onDraftChange?.(true), 400);
    return () => window.clearTimeout(timer);
  }, [dirty, applied, onDraftChange, auto, running]);

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
    if (auto) { autoRun.current = true; autoNotes.current = unique([...(replaceNotes ? [] : autoNotes.current), ...next.notes]); }
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
    if (auto) arrival.current = open?.anchor ?? null;
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
    setSavedNotice(auto ? "" : `Întrebare încărcată: „${question.title}”. Apasă „Vezi răspunsul” pentru a o rula.`);
    closeCatalogue();
  }
  function openCatalogue(trigger: HTMLElement) {
    catalogueTrigger.current = trigger;
    setSearch("");
    setCatalogue(true);
  }
  // The empty page's „Întrebările tale salvate ›”: the catalogue on its saved tab, focus back to that entry on close.
  useEffect(() => {
    if (!openSaved) return;
    catalogueTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCatalogueTab("saved");
    setSearch("");
    setCatalogue(true);
    onSavedOpened?.();
  }, [openSaved, onSavedOpened]);
  function closeCatalogue() {
    dialogRef.current?.close();
    setCatalogue(false);
    catalogueTrigger.current?.focus({ preventScroll: true });
  }
  async function apply() {
    // Beside an answer a newer choice replaces the one on its way (the panel aborts the older request).
    if (blocked || (running && !auto)) return;
    const next = cloneQuestion(draft);
    const submittedKey = questionKey(next);
    try {
      const outcome = await onRun(next);
      if (outcome === false) return;
      const accepted = typeof outcome === "object" && outcome !== null ? cloneQuestion(outcome as QuestionSpec) : next;
      setApplied(accepted);
      // The answer is in: the phrase or chip that changed it draws its outline once (M-09).
      const landed = arrival.current;
      arrival.current = null;
      if (auto && landed) requestAnimationFrame(() => { if (landed.isConnected) arrive(landed); });
      // Edits made while the server works remain a separate, unapplied draft.
      setDraft((current) => reconcileQuestionDraft(current, next, accepted));
      if (questionKey(draftRef.current) === submittedKey) {
        setChanges([]);
        if (auto && autoNotes.current.length) { live?.onNotes?.(autoNotes.current); autoNotes.current = []; }
      }
    } catch {
      // The parent owns the request error; keep the draft and previous answer.
    }
  }
  // A choice beside an answer runs at once; an editor that stays open while it is edited („Selecție avansată”, „Față
  // de cine?”) waits a moment after the last edit. A question that cannot run yet waits, said under the title.
  useEffect(() => {
    if (!auto || !autoRun.current) return;
    if (!dirty) { autoRun.current = false; return; }
    if (blocked) { autoRun.current = false; return; }
    const timer = window.setTimeout(() => { autoRun.current = false; void apply(); }, open ? 450 : 0);
    return () => window.clearTimeout(timer);
  }, [draft, open, auto, dirty, blocked]); // eslint-disable-line react-hooks/exhaustive-deps -- apply reads the draft of this render
  function discard() {
    const next = transitionQuestion(applied ?? seed.spec);
    settle({ spec: next.spec, notes: next.changes, parked: null }, true);
  }

  const catalogResults = QUESTION_TYPES.filter((item) => foldQuestion(`${item.label} ${item.description} ${item.keywords}`).includes(foldQuestion(search.trim())));
  const navigation = <div className="qb-navigation"><div className="qb-shortcuts" aria-label="Aceleași date, altă perspectivă">{[{ id: "table", label: "Cine câștigă?" }, { id: "timeseries", label: "Cum se schimbă?" }, { id: "scatter", label: "Cine iese din tipar?" }].map((item) => <button type="button" aria-pressed={draft.block === item.id} key={item.id} onClick={() => chooseType(item.id)}><Glyph name={item.id} />{item.label}</button>)}</div><button type="button" className="qb-catalogue-trigger" aria-haspopup="dialog" onClick={(event) => openCatalogue(event.currentTarget)}><Glyph name="plus" />Toate întrebările<span>13</span></button></div>;
  const removal = open ? view.removals[open.key] : undefined;

  const builderWindow = <BuilderWindow win={win} anchor={open?.anchor ?? null} draft={draft} excluded={removal?.kind === "exclusion" ? removal.excluded : []}
      onClose={closeWindow} onChoose={(choices, opts) => { if (win) choose(win, choices, opts); }} onReplace={replace} onRemoveExclusions={removeExclusions} peers={peerState}
      onCpvName={(code, name) => setCpvNames(current => ({ ...current, [code]: name }))} coverage={coverage} />;
  const catalogueDialog = <dialog ref={dialogRef} className="qb-dialog qb-dialog-search qb-dialog-catalogue" aria-labelledby={dialogTitleId} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeCatalogue(); } }} onCancel={(event) => { event.preventDefault(); closeCatalogue(); }} onClick={(event) => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeCatalogue(); } }}>
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
    </dialog>;
  const rowChips = (row: (typeof view.rows)[number], chips: typeof row.chips) => chips.map((chip) => chip.toggle
    // A switch (kit component 5): a second press turns it off, so it has no × and no window.
    ? <Toggle key={chip.key} id={chip.key} label={chip.name} pressed={chip.active}
      {...winnerToggle(chip)}
      onToggle={(_id, pressed) => { const target = view.windows[chip.key]; if (target) choose(target, [{ filter: chip.id, value: pressed ? true : undefined }]); }} />
    : <Chip key={chip.key} id={chip.key} label={chip.label} name={chip.name} active={chip.active} open={open?.key === chip.key} onOpen={openWindow}
      onRemove={() => { const target = view.windows[chip.key]; if (target) choose(target, [{ filter: chip.id, value: undefined }]); }} />);
  const underAndParked = <>
    <UnderChips items={view.under} openId={open?.key ?? null} onOpen={openWindow} onRemove={removeUnder} onToggle={removeUnder} />
    <ParkedRow label={parked?.label ?? ""} {...(parked ? { tip: { title: parked.label, text: parked.tip } } : {})} items={parked?.items.map((item) => ({ id: item.id, label: item.label })) ?? []} onRestore={bringBackParked} />
    {view.refused.length > 0 && <div className="qb-refused" role="alert">
      <p>{view.refused[0]!.why ?? view.refused[0]!.reason}</p>
      <button type="button" className="qb-secondary" onClick={removeRefused}>Scoate condițiile din link</button>
    </div>}
  </>;
  const notes = changes.length > 0 && <div className="qb-notes" role="status"><Glyph name="info" /><div><strong>Ce se schimbă odată cu întrebarea</strong>{changes.map((note) => <p key={note}>{note}{noteLinks[note] && <KitLink className="qb-relax-link" link={{ label: noteLinks[note]!.label, glyph: "›", href: askLink(noteLinks[note]!.spec as QuestionSpec) }} />}</p>)}</div></div>;
  const presentation = <>
    {view.presentation.length > 0 && <Presentation tokens={view.presentation} openId={open?.key ?? null} onOpen={openWindow} />}
    {/* A menu of one item was two clicks and a mystery (UX audit Z2-18): the item itself, as a link at the row's end. */}
    {view.advanced.length > 0 && <span className="qb-more-wrap" ref={moreRef}>
      <button type="button" className="qb-advanced-link" aria-haspopup="dialog" aria-expanded={open?.key === "advanced"}
        onClick={(event) => openWindow("advanced", event.currentTarget)}>Selecție avansată</button>
    </span>}
  </>;

  if (auto && live) {
    // The answer's title is the sentence (Z2-03 B). An entity's phrase opens its window; its page is the „→” after it.
    const named = (live.entities ?? []).filter((entity) => entity.name);
    const goTo = (token: { value: string }) => {
      const entity = named.filter((e) => token.value.includes(e.name)).sort((x, y) => y.name.length - x.name.length)[0];
      return entity ? <a className="qb-phrase-go" href={entityHref(entity.id, entity.role)} aria-label={`Pagina „${entity.name}”`} title="Deschide pagina">→</a> : null;
    };
    // What only a pill said stays as quiet words; the subclasses a domain leaves out keep their box and „Include-le”.
    const extra = live.pills ? liveNotes(applied as unknown as AskSpec, live.pills, live.labels ?? {}, view) : { notes: [], subclasses: null };
    const excluded = extra.subclasses && !dirty ? subclassesWords(extra.subclasses) : null;
    const subclasses = excluded ? excludedSubclasses(live.caveats) : [];
    const domain = Object.values(view.windows).find((w) => w.slot.id === "cpvTerm") ?? null;
    const code = live.pills ? wholeDomainCode(live.pills) : null;
    const expanded = live.expanded;
    // Folded, the head says what is set; „Schimbă întrebarea” adds what can be set („+ …”).
    const rows = view.rows.map((row) => {
      const chips = expanded ? row.chips : row.chips.filter((chip) => chip.active);
      const invites = expanded && row.label === WINNERS_ROW ? grouped.firms : [];
      return chips.length || invites.length ? <ConditionRow key={row.label} label={row.label} kind={row.kind}>
        {rowChips(row, chips)}
        {invites.map((item) => <Invite key={item.id} {...item} open={open?.key === item.id} onOpen={openWindow} />)}
      </ConditionRow> : null;
    });
    const editor = <section className={`qb qb-editor-kit qb-live${expanded ? " is-expanded" : ""}${dirty && blocked ? " is-waiting" : ""}`} aria-label="Întrebarea">
      {live.title && <h2 id="raspuns-titlu" tabIndex={-1}>{live.title}</h2>}
      <Sentence as={live.title ? "p" : "h2"} {...(live.title ? {} : { id: "raspuns-titlu", tabIndex: -1 })} tokens={sentence} openId={open?.key ?? null} onOpen={openWindow} after={goTo}
        className={`qb-live-sentence${live.title ? " qb-live-sentence--line" : ""} qb-kit-sentence--${draft.block}`} />
      {live.afterTitle}
      {(view.presentation.length > 0 || view.advanced.length > 0 || view.scopeLine || extra.notes.length > 0 || (excluded && subclasses.length > 0)) && <div className="qb-live-present">
        {presentation}
        {excluded && subclasses.length > 0 && <SubclassesPill words={excluded} subclasses={subclasses}
          onInclude={domain && code ? () => choose(domain, [{ filter: "cpvTerm", value: code }]) : null} />}
        {view.scopeLine && <ScopeLine />}
        {!dirty && extra.notes.filter((note) => !(view.scopeLine && note === "achiziții directe")).map((note) => <span className="qb-live-note" key={note}>{note}</span>)}
      </div>}
      {rows}
      {expanded && grouped.purchase.length > 0 && <ConditionRow label="Achiziția" kind="group">
        {grouped.purchase.map((item) => <Invite key={item.id} {...item} open={open?.key === item.id} onOpen={openWindow} />)}
      </ConditionRow>}
      {expanded && <Invitations items={grouped.rest} openId={open?.key ?? null} onOpen={openWindow} />}
      {underAndParked}
      {dirty && blocked && <>
        {notes}
        {errors.length > 0 && <div className="qb-validation" aria-live="polite">{errors.map((error) => <p key={error}>{error}</p>)}</div>}
        {view.waiting && <p className="qb-validation" aria-live="polite">{view.waiting}</p>}
        <button type="button" className="qb-discard" onClick={discard}>Renunță la modificări</button>
      </>}
    </section>;
    return <div className="question-builder qb question-builder--live">
      {expanded && navigation}
      {live.host && createPortal(editor, live.host)}
      {builderWindow}
      {catalogueDialog}
    </div>;
  }

  return <div className="question-builder qb">
    {navigation}
    <section className={`qb-editor qb-editor-kit${dirty ? " is-pending" : ""}`} aria-label="Construiește întrebarea">
      {savedNotice && <p className="cq-loaded-question" role="status">{savedNotice}</p>}
      {fromAi && <p className="qb-ai-note">Am transformat întrebarea în condiții pe care le poți verifica și modifica.</p>}
      <Sentence tokens={sentence} openId={open?.key ?? null} onOpen={openWindow} className={`qb-kit-sentence qb-kit-sentence--${draft.block}`} />
      {view.scopeLine && <ScopeLine />}
      {view.rows.map((row) => <ConditionRow key={row.label} label={row.label} kind={row.kind}>
        {rowChips(row, row.chips)}
        {/* The winners' own invitations join their row (UX audit Z2-17): the firms' seat and administrator are about the firms. */}
        {row.label === WINNERS_ROW && grouped.firms.map((item) => <Invite key={item.id} {...item} open={open?.key === item.id} onOpen={openWindow} />)}
      </ConditionRow>)}
      {/* The purchase's own size is no condition of the firms: its own row (UX audit Z2-17). */}
      {grouped.purchase.length > 0 && <ConditionRow label="Achiziția" kind="group">
        {grouped.purchase.map((item) => <Invite key={item.id} {...item} open={open?.key === item.id} onOpen={openWindow} />)}
      </ConditionRow>}
      <Invitations items={grouped.rest} openId={open?.key ?? null} onOpen={openWindow} />
      {underAndParked}
      {notes}
      <div className="qb-bottom">
        <div className="qb-bottom-start">
          {presentation}
        </div>
        <div className="qb-actions qb-bottom-end">
          {dirty ? <button type="button" className="qb-discard" onClick={discard}>Renunță la modificări</button> : applied && <span className="qb-ready"><Glyph name="check" />Întrebare aplicată</span>}
          {/* One „Păstrează”, the answer's (UX audit Z2-20): the builder saves only a draft that differs from the answer
              („Salvează ciorna”), or the question before any answer. */}
          {(!applied || dirty) && <SaveQuestionButton spec={draft} unapplied={dirty && Boolean(applied)} active={savedQuestion} onSaved={question => { setSavedQuestion(question); setSavedNotice(`Salvată ${question.storage === "local" ? "pe acest dispozitiv" : "în cont"}: „${question.title}” · Toate întrebările → Salvate`); }} disabled={running || blocked} />}
          {/* Applied and unchanged, there is nothing to apply: a link to the answer, not a filled button (UX audit Z2-19). */}
          {applied && !dirty && !running
            ? <a className="qb-go-answer" href="#raspuns" onClick={(event) => {
              const answer = document.getElementById("raspuns");
              if (!answer) return;
              event.preventDefault();
              answer.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
              document.getElementById("raspuns-titlu")?.focus({ preventScroll: true });
            }}>Mergi la răspuns <span aria-hidden="true">↓</span></a>
            : <button type="button" className="qb-primary qb-apply" disabled={running || blocked} onClick={apply}>{running ? "Caut în date…" : dirty && applied ? "Actualizează răspunsul" : "Vezi răspunsul"}<Glyph name="arrow" /></button>}
        </div>
      </div>
      {errors.length > 0 && <div className="qb-validation" aria-live="polite">{errors.map((error) => <p key={error}>{error}</p>)}</div>}
    </section>
    {builderWindow}
    {catalogueDialog}
  </div>;
}

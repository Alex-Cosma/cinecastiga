"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COUNTIES } from "@/lib/counties";
import { readableCpvName } from "@/lib/entity-summary";
import { IMPLAUSIBLE_BIRTH_DATE_LABEL } from "@/lib/format";
import { countWords } from "@/lib/ask/answer-text";
import { BLOCK_FILTERS, windowOf } from "@/lib/ask/filters/blocks";
import { filterContext } from "@/lib/ask/filters/context";
import type { Choice } from "@/lib/ask/filters/pickers";
import type { Excluded } from "@/lib/ask/filters/origin";
import type { FilterSpec } from "@/lib/ask/filters/types";
import { cloneQuestion, foldQuestion, type QuestionSpec } from "@/lib/ask/question-ui";
import { countyIsFirmSeat } from "@/lib/ask/population";
import { SEAT_COUNTY_BLOCKS, type Block } from "@/lib/ask/spec";
import type { EntityHit } from "@/lib/search";
import { MIN_TREND_YEAR, type CoveragePeriods } from "@/lib/ask/months-window";
import { choiceState } from "@/lib/ask/filters/pickers";
import { trendMonthsState } from "@/lib/ask/filters/trend-rules";
import PopulationEditor from "../PopulationEditor";
import { codeKinds, PURCHASE_KIND_ORDER, PURCHASE_KIND_WORDS, VALUE_RANGES, valueRangeIndex, type PurchaseKind, type ValueRange } from "@/lib/ask/purchase";
import Bands, { EMPLOYEE_BANDS, bandRange, bandsWords } from "./Bands";
import Pills, { RangeFields } from "./Pills";
import { useCoverage } from "./coverage";
import EntitySearch, { type SearchResult } from "./EntitySearch";
import PeriodPicker, { EMPTY_RANGE, MONTHS, PeriodRange, periodRangeError, type PeriodRangeValue } from "./PeriodPicker";
import HelpTip from "./HelpTip";
import Segmented from "./Segmented";
import OptionList from "./pickers/OptionList";
import Popover from "./pickers/Popover";
import PeersWindow, { peerDataFor } from "./PeersWindow";
import PersonFirms, { type PersonPick } from "./PersonFirms";
import type { PeerDialogState } from "./use-peer-dialog";
import { peerWindowTip } from "../../../lib/ask/peer-groups-shared";
import type { ChangeSource, KitRestRow } from "./kit-types";
import type { BuilderWindowSpec } from "./view";
import {
  CURRENT_ROW, SERIES_FIRST_YEAR, UNKNOWN_SEAT, bandCount, seatClearChoices, seatCurrentRow, seatOptions, bandValues, bandsChoice, choiceWords, countedOptions, countedRest, countySide, currentRow, emptyReason, fromTab, fromTabs,
  listOptions, optionValue, periodPresets, presetCounts, seriesMonthPresets, seriesMonthsError, shareText, windowKind, windowTip, type ChoiceOption, type CoverageSpan,
} from "./window-model";
import { useFacet } from "./use-facet";
import { useComparePeers, usePairFacts } from "./use-pair";
import {
  comparePeriodPresets, comparePeriodTip, generalCodesNote, kindLabel, pairCountyOptions, pairDomainGroup, pairDomainOptions, pairNames, pairRest, peerResults, withPairShares,
} from "./compare-windows";
import { FACET_REST, relativeSeat, SEAT_UNCOMPARED, SEAT_UNCOMPARED_TIP, type FacetView } from "../../../lib/ask/facet-parts";
import type { PeriodChoice } from "@/lib/ask/filters/defs/selection";

/*
 * The windows of the builder (kit components 7–13, plan §2.3): each place
 * opens one, beside its phrase on a desktop and as a bottom sheet under
 * 600 px (Popover). Lists choose at once; searches ask today's endpoints
 * (/api/suggest, /api/search) as the reader types; a window that needs a
 * confirmation (the bands, a free period) has "Folosește". What a choice
 * writes, and what it does to the rest of the draft, is the registry's
 * (pickers.ts, transition.ts): the window hands the choices to the builder.
 */

export interface BuilderWindowProps {
  win: BuilderWindowSpec | null;
  anchor: HTMLElement | null;
  draft: QuestionSpec;
  /** The exclusions of a collapsed "Fără 3 firme" chip. */
  excluded?: readonly Excluded[];
  onClose: () => void;
  /** Apply these choices in order (chooseValue each) and close. */
  onChoose: (choices: Choice[], opts?: { keepOpen?: boolean; note?: string }) => void;
  /** "Față de cine?": the entity's rows and sizes (use-peer-dialog.ts), F6a. */
  peers?: PeerDialogState;
  /** The precise selection and the threshold of "Selecție avansată", written as they are edited. */
  onReplace: (spec: QuestionSpec) => void;
  onRemoveExclusions: (excluded: Excluded[]) => void;
  /** The name of a CPV code the reader chose, for the sentence. */
  onCpvName: (code: string, name: string) => void;
  /** The archive's periods per channel (/api/data-coverage), when read: a trend's months. */
  coverage?: CoveragePeriods | null;
}

interface SuggestionData {
  authority?: { name: string; county: string | null; entityId?: number }[];
  supplier?: { name: string; county: string | null; entityId?: number }[];
  cpv?: { term: string; cpvName: string | null }[];
  division?: { code: string; name: string }[];
  uat?: { siruta: number; name: string; tip: string; county: string; population: number | null }[];
  person?: { key: string; name: string; birthYear: number | null; birthDateImplausible?: boolean; birthLocality: string | null; nFirms: number }[];
}
type Role = "authority" | "supplier";
/** A result and the choices picking it writes; a person unfolds into its firms instead (PersonFirms). */
interface Found extends SearchResult { choices: Choice[]; cpvName?: string; person?: PersonPick }

/** A CPV code (a division to a full code), not words. */
const isCode = (term: string) => /^(?:\d{2,8}|\d{8}-\d)$/.test(term.replace(/\s+/g, ""));
const TIP_PREFIX: Record<string, string> = { municipiu: "Municipiul", "oraș": "Orașul", "comună": "Comuna" };
const countyOf = (folded: string) => COUNTIES.find((name) => foldQuestion(name).replace(/[^a-z]+/g, " ") === foldQuestion(folded).replace(/[^a-z]+/g, " ")) ?? folded;
/** "Municipiul Buzău (Buzău)", the stored label of a locality (today's builder). */
const localityLabel = (item: NonNullable<SuggestionData["uat"]>[number]) => {
  const prefix = TIP_PREFIX[item.tip];
  return `${prefix ? `${prefix} ` : ""}${item.name} (${countyOf(item.county)})`;
};

/**
 * Today's suggestions, as the reader types: /api/suggest for every vocabulary,
 * and /api/search for entities by name or CUI. The last text wins; "" asks
 * for the starters where there are some (the biggest entities, CPV divisions).
 */
function useSuggestions(entities: boolean, county?: string, remote = true) {
  const [state, setState] = useState<{ query: string; loading: boolean; data: SuggestionData; hits: EntityHit[] }>({ query: "", loading: false, data: {}, hits: [] });
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const search = useCallback((query: string, starters = true) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    if (!remote || query.length < 2 && !starters) { setState({ query, loading: false, data: {}, hits: [] }); return; }
    setState((current) => ({ ...current, query, loading: true }));
    const params = new URLSearchParams(query.length >= 2 ? { q: query } : { top: "1" });
    if (county) params.set("county", foldQuestion(county));
    void Promise.allSettled([
      fetch(`/api/suggest?${params}`, { signal: ctrl.signal }).then(async (r) => { if (!r.ok) throw new Error("suggest"); return r.json() as Promise<SuggestionData>; }),
      entities && query.length >= 2 ? fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal }).then(async (r) => { if (!r.ok) throw new Error("search"); return r.json() as Promise<{ hits: EntityHit[] }>; }) : Promise.resolve({ hits: [] as EntityHit[] }),
    ]).then(([data, hits]) => {
      if (ctrl.signal.aborted) return;
      setState({ query, loading: false, data: data.status === "fulfilled" ? data.value : {}, hits: hits.status === "fulfilled" ? hits.value.hits ?? [] : [] });
    });
  }, [entities, county, remote]);
  return { ...state, search };
}

/** Entities of a role: exact search hits first (with their id), then the suggestions not already listed, then the exact name typed. */
function entityResults(role: Role, data: SuggestionData, hits: readonly EntityHit[], query: string, group?: string): Found[] {
  const exact = hits.filter((hit) => hit.roles.includes(role)).map((hit): Found => ({
    id: `${role}:h${hit.id}`, name: hit.name, detail: [hit.county, hit.cui ? `CUI ${hit.cui}` : null].filter(Boolean).join(" · "),
    ...(group ? { group } : {}), choices: [{ filter: role, value: { name: hit.name, id: hit.id } }],
  }));
  const seen = new Set(exact.map((hit) => `${foldQuestion(hit.name)}|${foldQuestion(hit.detail?.split(" · ")[0] ?? "")}`));
  const suggested = (data[role] ?? []).filter((item) => !seen.has(`${foldQuestion(item.name)}|${foldQuestion(item.county ?? "")}`)).map((item, i): Found => ({
    id: `${role}:s${i}`, name: item.name, detail: item.county ?? "Numele va fi verificat în date",
    ...(group ? { group } : {}), choices: [{ filter: role, value: { name: item.name, ...(item.entityId ? { id: item.entityId } : {}) } }],
  }));
  const typed: Found[] = query.length >= 2 ? [{
    id: `${role}:typed`, name: `Caută numele exact „${query}”`, detail: "Identitatea găsită apare lângă răspuns.",
    ...(group ? { group } : {}), choices: [{ filter: role, value: { name: query } }],
  }] : [];
  return [...exact, ...suggested, ...typed];
}

/** The town halls of the localities found (the engine scopes a locality to its own administration). */
function localityResults(data: SuggestionData, group?: string, clearCounty = false): Found[] {
  return (data.uat ?? []).map((item): Found => ({
    id: `uat:${item.siruta}`, name: `Primăria ${item.name}`,
    detail: [item.tip, item.population ? countWords(item.population, "locuitor", "locuitori") : null].filter(Boolean).join(" · "),
    side: countyOf(item.county), ...(group ? { group } : {}),
    // In the place window the locality is the narrower scope: a county beside it would only hide its rows without a county (today's place picker).
    choices: [...(clearCounty ? [{ filter: "county" as const, value: undefined }] : []), { filter: "locality", value: { siruta: item.siruta, name: localityLabel(item) } }],
  }));
}

/** The counties whose name holds the text, all of them for an empty one. */
function countyResults(query: string, group?: string, counts?: FacetView): Found[] {
  const q = foldQuestion(query.trim());
  return COUNTIES.filter((county) => !q || foldQuestion(county).includes(q)).map((county): Found => {
    // Each county's count on the right, where a locality says its county (R5).
    const side = counts ? countySide(counts, county) : undefined;
    return {
      id: `county:${county}`, name: /^bucure/i.test(county) ? "București" : `Județul ${county}`, ...(group ? { group } : {}),
      ...(side ? { side } : {}), choices: [{ filter: "county", value: county }],
    };
  });
}

/**
 * A radio list that chooses on a click, Enter or Space; the arrows only move (the window stays open).
 * `current` leads it, checked: the window's current choice (currentRow), which closes it unchanged.
 */
function ChoiceList({ label, options, value, onPick, rest, current }: { label: string; options: readonly ChoiceOption[]; value: string | null; onPick: (option: ChoiceOption) => void; rest?: readonly KitRestRow[]; current?: ChoiceOption | null }) {
  const all = current ? [current, ...options] : options;
  const [checked, setChecked] = useState(current ? CURRENT_ROW : value);
  return <OptionList label={label} options={all} value={checked} {...(rest ? { rest } : {})} onChange={(next: string, source: ChangeSource) => {
    setChecked(next);
    const option = all.find((o) => o.value === next);
    if (option && source === "activate") onPick(option);
  }} />;
}

type FilterContext = ReturnType<typeof filterContext>;

/**
 * An option's value among the counts of the institutions' kinds: a kind, the
 * window's first row (every institution: the total), or no count (firms,
 * counties, the dimension of a ranking).
 */
function kindValue(option: ChoiceOption): string | null | undefined {
  const { filter, value } = option.choice;
  if (filter === "authorityKind") return value === undefined ? undefined : String(value);
  if (filter === "dim" && typeof value === "object" && value) {
    const subject = value as { dim: string; kind?: string };
    return subject.dim !== "authority" ? null : subject.kind ?? undefined;
  }
  return null;
}

/**
 * A list window (kit item 9) with its counts (R5): "Ce fel de achiziții?"
 * counts its channels and, with the group „O procedură anume”, the
 * procedures (their shares of every purchase, as the channels'); a list of
 * institutions' kinds counts the institutions of each. Other lists (the
 * measure, the length, the trend's group) have no counts.
 */
function ListWindow({ win, draft, ctx, onPick }: { win: BuilderWindowSpec; draft: QuestionSpec; ctx: FilterContext; onPick: (choices: Choice[]) => void }) {
  const own = windowOf(win.slot);
  const { options, value, rest } = listOptions(win, draft, undefined, ctx);
  const channel = win.slot.id === "dataset";
  const procedures = channel && own.includes("procedure") ? listOptions(win, draft, "procedure", ctx).options.filter((option) => option.choice.value !== undefined) : [];
  const kinds = options.some((option) => kindValue(option) !== null) && (win.slot.picker !== "subject" || draft.dim === "authority");
  const counts = useFacet(draft, channel ? "channel" : kinds ? "kind" : null);
  const procedureCounts = useFacet(draft, procedures.length ? "procedure" : null);
  const counted = countedOptions(options, counts, channel ? (o) => o.choice.value === "all" ? undefined : String(o.choice.value) : kindValue, { checked: value });
  const restCounted = kinds ? countedRest(rest, counts) : rest;
  if (procedures.length) {
    const chosen = procedures.find((option) => option.choice.value === draft.filters.procedure);
    // The procedures' shares are of every purchase, once the channels are read (the contracts' row holds them).
    const over = counts.status === "ready" ? counts.counts.total.value_ron : undefined;
    const procedureView = counts.status === "loading" ? counts : procedureCounts;
    const countedProcedures = countedOptions(procedures, procedureView, (o) => String(o.choice.value), { checked: chosen?.value ?? null, ...(over ? { over } : {}) });
    return <ChoiceList label={win.name} options={[...counted, ...countedProcedures]} value={chosen?.value ?? value}
      onPick={(option) => onPick(option.choice.filter === "dataset" && draft.filters.procedure ? [option.choice, { filter: "procedure", value: undefined }] : [option.choice])} />;
  }
  return <ChoiceList label={win.name} options={counted} value={value} {...(restCounted ? { rest: restCounted } : {})} onPick={(option) => onPick([option.choice])} />;
}

/** "Cine a cumpărat?": every institution, a kind (with the institutions of each, R5), one institution or a town hall. */
function BuyerWindow({ win, draft, ctx, onPick }: { win: BuilderWindowSpec; draft: QuestionSpec; ctx: FilterContext; onPick: (choices: Choice[]) => void }) {
  if (draft.block === "compare") return <ClientsWindow win={win} draft={draft} ctx={ctx} onPick={onPick} />;
  return <BuyerLists win={win} draft={draft} ctx={ctx} onPick={onPick} />;
}

/**
 * "Cine a cumpărat?" between two firms (F4, final compare §3.5, kit §6 compare
 * 1): their clients' kind and county, each option with both firms' shares of
 * value (the pair's facts, without the window's own key), „Alte instituții”
 * and „Județ necunoscut” as rest rows; a kind or a county neither has is
 * disabled with the reason.
 */
function ClientsWindow({ win, draft, ctx, onPick }: { win: BuilderWindowSpec; draft: QuestionSpec; ctx: FilterContext; onPick: (choices: Choice[]) => void }) {
  const pair = usePairFacts(draft, true);
  const kinds = listOptions(win, draft, "authorityKind", ctx);
  const kindOptions = withPairShares(kinds.options.map((o) => o.choice.value === undefined ? o : { ...o, label: kindLabel(String(o.choice.value)) }), pair?.kinds ?? null,
    (o) => o.choice.value === undefined ? null : String(o.choice.value));
  const county = draft.filters.county ? String(draft.filters.county) : null;
  const counties = pairCountyOptions(pair?.counties ?? null);
  return <>
    <PairKey draft={draft} />
    <p className="qb-opt-group">Ce fel de instituții</p>
    <ChoiceList label="Tipul instituției" options={kindOptions} value={kinds.value} rest={pairRest(FACET_REST.kind!, pair?.kinds ?? null)} onPick={(option) => onPick([option.choice])} />
    <p className="qb-opt-group">Unde</p>
    <ChoiceList label="Unde" options={[{ value: "none", label: "Toată țara", choice: { filter: "county", value: undefined } }, ...counties]}
      value={county ? `county:${county}` : "none"} rest={pairRest(FACET_REST.county!, pair?.counties ?? null)} onPick={(option) => onPick([option.choice])} />
  </>;
}

/** Whose bar is whose in a comparison's window: the two entities, in the answer's colours (A, then B). */
function PairKey({ draft }: { draft: QuestionSpec }) {
  const names = pairNames(draft);
  return <p className="qb-pair-key"><span><i className="qb-pair-ka" aria-hidden="true" />{names.a}</span><span><i className="qb-pair-kb" aria-hidden="true" />{names.b}</span></p>;
}

function BuyerLists({ win, draft, ctx, onPick }: { win: BuilderWindowSpec; draft: QuestionSpec; ctx: FilterContext; onPick: (choices: Choice[]) => void }) {
  const own = windowOf(win.slot);
  const kinds = own.includes("authorityKind") ? listOptions(win, draft, "authorityKind", ctx) : null;
  const counts = useFacet(draft, kinds ? "kind" : null);
  const named = Boolean(draft.filters.authorityName || draft.filters.authorityId || draft.filters.uatSiruta);
  const searches = own.includes("authority") || own.includes("locality") && ctx.locality.ok;
  // A named institution or town hall leads the kinds, checked (it is no kind).
  const current = named ? currentRow("buyer", draft) : null;
  const rest = kinds ? countedRest(kinds.rest, counts) : undefined;
  return <>
    {/* The first row clears the whole window (pickers.ts): every institution, the total. */}
    {kinds && <ChoiceList label="Tipul instituției" options={countedOptions(kinds.options, counts, (o) => o.choice.value === undefined ? undefined : kindValue(o), { checked: named ? null : kinds.value })} value={named ? null : kinds.value} current={current}
      {...(rest ? { rest } : {})} onPick={(option) => onPick(option.value === CURRENT_ROW ? [] : [option.choice])} />}
    {!kinds && current && <ChoiceList label={win.name} options={[]} value={null} current={current} onPick={() => onPick([])} />}
    {searches && <InstitutionSearch draft={draft} authority={own.includes("authority")} locality={own.includes("locality") && ctx.locality.ok} onPick={onPick} />}
    {own.includes("county") && <CountySelect draft={draft} onPick={onPick} />}
  </>;
}

/**
 * "Unde?" (the institution's county), with its kinds of institution: the
 * first row counts the whole draft, each county its records beside its name
 * (R5). A firm's seat has its own window (SeatWindow, F4).
 */
function PlaceWindow({ win, draft, ctx, onPick }: { win: BuilderWindowSpec; draft: QuestionSpec; ctx: FilterContext; onPick: (choices: Choice[]) => void }) {
  const own = windowOf(win.slot);
  const kinds = own.includes("authorityKind") ? listOptions(win, draft, "authorityKind", ctx) : null;
  const counts = useFacet(draft, "county");
  const kindCounts = useFacet(draft, kinds ? "kind" : null);
  const first: ChoiceOption = { value: "none", label: "Toată țara", choice: { filter: "county", value: undefined } };
  const set = Boolean(draft.filters.county || draft.filters.uatSiruta);
  const kindRest = kinds ? countedRest(kinds.rest, kindCounts) : undefined;
  return <>
    <ChoiceList label={win.name} options={countedOptions([first], counts, () => undefined)} value={set ? null : "none"} current={set ? currentRow("place", draft) : null}
      onPick={(option) => onPick(option.value === CURRENT_ROW ? [] : [...(draft.filters.uatSiruta ? [{ filter: "locality" as const, value: undefined }] : []), first.choice])} />
    {kinds && <><p className="qb-opt-group">Ce fel de instituții</p><ChoiceList label="Tipul instituției" options={countedOptions(kinds.options, kindCounts, kindValue, { checked: kinds.value })} value={kinds.value}
      {...(kindRest ? { rest: kindRest } : {})} onPick={(option) => onPick([option.choice])} /></>}
    <PlaceSearch draft={draft} locality={own.includes("locality") && ctx.locality.ok} counts={counts} onPick={onPick} />
  </>;
}

/**
 * "Unde au sediul firmele?" (F4; kit §4 Sediul firmei, §6 table 1, entity_card
 * 1): "Oriunde"; on a ranking of firms the seat against the buyer's county of
 * each record; "În străinătate" where the question runs on the records; then
 * a county of the seat, searched (seatCounty), the buyers' county first. The
 * counts (R5): on a ranking the firms of each class and their records' value,
 * elsewhere each county's firms (or profiles); the rest is "Sediu necunoscut",
 * against the buyer's county "Nu se poate compara" (either side unknown). The
 * classes overlap (a firm sells in its county and elsewhere): "Oriunde" counts
 * the draft's firms once.
 */
function SeatWindow({ win, draft, ctx, onPick }: { win: BuilderWindowSpec; draft: QuestionSpec; ctx: FilterContext; onPick: (choices: Choice[]) => void }) {
  const counts = useFacet(draft, "seat");
  const { options, value } = seatOptions(win, draft, ctx, counts.status === "ready" ? counts.counts.centreCounty ?? null : null);
  const relative = options.some((option) => option.value === "same" || option.value === "other");
  const rest = countedRest([relativeSeat(draft) ? { label: SEAT_UNCOMPARED, tip: SEAT_UNCOMPARED_TIP } : { label: UNKNOWN_SEAT }], counts);
  const counted = countedOptions(options, counts, (option) => option.value === "none" ? undefined : option.value, { checked: value });
  return <>
    <ChoiceList label={win.name} options={counted} value={value} current={seatCurrentRow(draft)} {...(rest ? { rest } : {})}
      onPick={(option) => onPick(option.value === CURRENT_ROW ? [] : option.value === "none" ? seatClearChoices(draft) : [option.choice])} />
    {/* A county of the seat only where firms are the subject (SEAT_COUNTY_BLOCKS): around an institution the seat is against it. */}
    {SEAT_COUNTY_BLOCKS.includes(draft.block as Block) && <>
      <p className="qb-opt-group">În județul…</p>
      <SeatSearch draft={draft} {...(relative ? {} : { counts })} onPick={onPick} />
    </>}
  </>;
}

/** The county of the seat (seatCounty), searched; the buyers' county leads (kit §6 entity_card 1). */
function SeatSearch({ draft, counts, onPick }: { draft: QuestionSpec; counts?: FacetView; onPick: (choices: Choice[]) => void }) {
  const s = useSuggestions(false, undefined, false);
  const buyer = draft.filters.county && !isFirmProfileDraft(draft) ? foldQuestion(String(draft.filters.county)) : null;
  const results = useMemo(() => {
    const found = countyResults(s.query, undefined, counts).map((r): Found => ({ ...r, choices: [{ filter: "seatCounty", value: r.choices[0]!.value }] }));
    const lead = buyer ? found.filter((r) => foldQuestion(String(r.choices[0]!.value)) === buyer) : [];
    return [...lead, ...found.filter((r) => !lead.includes(r))];
  }, [s.query, counts, buyer]);
  return <EntitySearch label="Județul sediului" placeholder="Caută județul" results={results} minChars={1}
    onSearch={(q) => s.search(q, false)} onPick={(r) => onPick((r as Found).choices)} emptyText="Niciun județ cu acest nume." />;
}
const isFirmProfileDraft = (draft: QuestionSpec) => countyIsFirmSeat(draft, draft.dim === "supplier" ? "supplier" : "authority");

export default function BuilderWindow(props: BuilderWindowProps) {
  const { win, anchor, onClose, draft } = props;
  const kind = win ? windowKind(win) : null;
  const wide = kind !== null && ["advanced", "buyer", "from", "peers", "focal", "compareWith", "cpv", "place", "seat", "locality", "admin"].includes(kind);
  // A comparison's period (F4, final compare §3.1): its (?) says the common period and, once the pair's facts are read
  // (the window's own request, kept in the page), the records before 2018.
  const comparePeriod = Boolean(win) && kind === "period" && draft.block === "compare";
  const pair = usePairFacts(draft, comparePeriod);
  // "Față de cine?": the rules of the entity's rows, once read (kit §4: in the (?), not inline).
  const peerData = kind === "peers" && props.peers ? peerDataFor(draft, props.peers) : null;
  const tip = peerData ? peerWindowTip(peerData) : win ? comparePeriod ? comparePeriodTip(draft, pair) : windowTip(win, draft) : undefined;
  return <Popover open={Boolean(win)} anchor={anchor} onClose={onClose} title={win?.title ?? ""} wide={wide} {...(tip ? { tip } : {})}>
    {win && <WindowBody key={win.key} {...props} win={win} />}
  </Popover>;
}

/** Windows whose first choice is a list above a search: they open on the chosen row, not the field (on a phone its keyboard would cover the list). */
const LIST_FIRST = new Set(["buyer", "place", "locality", "from", "peers", "seat"]);

function WindowBody({ win, draft, excluded = [], onChoose, onReplace, onRemoveExclusions, onCpvName, onClose, coverage, peers }: BuilderWindowProps & { win: BuilderWindowSpec }) {
  const kind = windowKind(win);
  const body = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!LIST_FIRST.has(kind)) return;
    // After the window's own first focus (Popover), which goes to the search field.
    const frame = requestAnimationFrame(() => body.current?.closest("dialog")?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [kind]);
  const ctx = useMemo(() => filterContext(draft as FilterSpec, coverage ? { coverage } : {}), [draft, coverage]);
  const own = windowOf(win.slot);
  const pick = (choices: Choice[]) => onChoose(choices);
  const marker = <span ref={body} hidden />;

  switch (kind) {
    case "list": case "subject": return <ListWindow win={win} draft={draft} ctx={ctx} onPick={pick} />;
    case "size": return <SizeWindow draft={draft} onPick={pick} />;
    case "peers": return <>{marker}<PeersWindow spec={draft} state={peers ?? { data: null, loading: true, error: null }}
      onChange={(next, note) => onChoose(peerChoices(draft, next), { keepOpen: true, ...(note ? { note } : {}) })} /></>;
    case "buyer": return <>{marker}<BuyerWindow win={win} draft={draft} ctx={ctx} onPick={pick} /></>;
    case "place": return <>{marker}<PlaceWindow win={win} draft={draft} ctx={ctx} onPick={pick} /></>;
    case "seat": return <>{marker}<SeatWindow win={win} draft={draft} ctx={ctx} onPick={pick} /></>;
    case "locality":
      return <>
        {marker}
        <ChoiceList label={win.name} options={[{ value: "none", label: "Toată țara", choice: { filter: "locality", value: undefined } }]} value={draft.filters.uatSiruta ? null : "none"} current={currentRow("locality", draft)}
          onPick={(option) => pick(option.value === CURRENT_ROW ? [] : [{ filter: "locality", value: undefined }])} />
        <PlaceSearch draft={draft} locality counties={false} onPick={pick} />
      </>;
    case "focal": return <FocalSearch draft={draft} roles={win.slot.picker === "focal" ? ["authority", "supplier"] : [win.slot.id as Role]} onPick={pick} />;
    case "compareWith": return <FocalSearch draft={draft} roles={[ctx.role]} compareWith suggest onPick={pick} />;
    case "from": return <>{marker}<FromWindow win={win} draft={draft} onPick={pick} /></>;
    case "employees": return <BandsWindow draft={draft} onPick={pick} />;
    case "admin": return <>
      <PersonSearch onPick={pick} />
      {(draft.filters.adminName || draft.filters.adminPersonKey) && <div className="qb-pop-foot"><button type="button" className="qb-link" onClick={() => pick([{ filter: "admin", value: undefined }])}>Scoate condiția</button></div>}
    </>;
    case "cpv": return <>
      {own.includes("purchaseKind") && <KindSegmented win={win} draft={draft} ctx={ctx} onPick={pick} />}
      {draft.block === "compare" && <PairDomains draft={draft} onPick={pick} onCpvName={onCpvName} />}
      <CpvSearch draft={draft} onPick={pick} onCpvName={onCpvName} />
    </>;
    case "period": return <PeriodWindow draft={draft} year={ctx.year} onPick={pick} />;
    case "months": return <MonthsWindow win={win} draft={draft} ctx={ctx} onPick={pick} />;
    case "advanced": return <AdvancedWindow win={win} draft={draft} onReplace={onReplace} onClose={onClose} />;
    case "exclusions": return <div className="qb-opts">
      {excluded.map((e) => <div className="qb-opt qb-excluded" key={`${e.field}:${e.value}`}>
        <span className="qb-opt-mark" aria-hidden="true" />
        <span className="qb-opt-t"><strong>Fără {e.label}</strong></span>
        <button type="button" className="qb-link" onClick={() => onRemoveExclusions([e])}>Scoate</button>
      </div>)}
    </div>;
  }
}

function InstitutionSearch({ draft, authority, locality, onPick }: { draft: QuestionSpec; authority: boolean; locality: boolean; onPick: (choices: Choice[]) => void }) {
  const s = useSuggestions(authority, draft.filters.county ? String(draft.filters.county) : undefined);
  const results = useMemo(() => [
    ...(locality ? localityResults(s.data, "Primăria localității") : []),
    ...(authority && s.query.length >= 2 ? entityResults("authority", s.data, s.hits, s.query, "Instituții") : []),
  ], [s.data, s.hits, s.query, authority, locality]);
  return <>
    <p className="qb-opt-group">Sau una anume</p>
    <EntitySearch label={locality ? "Instituție sau localitate" : "Instituție"} placeholder={locality ? "Numele instituției sau al localității" : "Numele instituției sau CUI"} results={results} loading={s.loading}
      onSearch={(q) => s.search(q, false)} onPick={(r) => onPick((r as Found).choices)} emptyText="Nicio potrivire. Încearcă un nume mai scurt." />
  </>;
}

function PlaceSearch({ draft, locality, counties = true, counts, onPick }: { draft: QuestionSpec; locality: boolean; counties?: boolean; counts?: FacetView; onPick: (choices: Choice[]) => void }) {
  // The counties are listed here; the localities are asked for, within the chosen county when the window keeps it.
  const s = useSuggestions(false, !counties && draft.filters.county ? String(draft.filters.county) : undefined, locality);
  const results = useMemo(() => [
    ...(counties ? countyResults(s.query, locality ? "Județe" : undefined, counts) : []),
    ...(locality ? localityResults(s.data, "Primăria localității", counties) : []),
  ], [s.data, s.query, counties, locality, counts]);
  return <EntitySearch label={locality ? counties ? "Județ sau localitate" : "Localitate" : "Județ"} placeholder={locality ? counties ? "Un județ, un oraș sau o comună" : "Un oraș sau o comună" : "Caută județul"}
    results={results} loading={s.loading} minChars={1}
    onSearch={(q) => s.search(q, false)} onPick={(r) => onPick((r as Found).choices)}
    emptyText={locality ? "Niciun județ sau localitate. Verifică numele." : "Niciun județ cu acest nume."} />;
}

/**
 * "Față de cine?" (F6a, plan §4.11): the ticks of the entity's group
 * (PeersWindow), each written as the choices of the phrase's window (peers,
 * the county, an old link's kind), with the window kept open.
 */
export function peerChoices(before: QuestionSpec, after: QuestionSpec): Choice[] {
  const changed = (a: unknown, b: unknown) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
  return [
    ...(changed(before.peers, after.peers) ? [{ filter: "peers" as const, value: after.peers }] : []),
    ...(changed(before.filters.county, after.filters.county) ? [{ filter: "county" as const, value: after.filters.county }] : []),
    ...(changed(before.filters.authorityKind, after.filters.authorityKind) ? [{ filter: "authorityKind" as const, value: after.filters.authorityKind }] : []),
  ];
}

function CountySelect({ draft, onPick }: { draft: QuestionSpec; onPick: (choices: Choice[]) => void }) {
  return <label className="qb-field qb-place-field">
    <span>Unde?</span>
    <select value={String(draft.filters.county ?? "")} onChange={(event) => onPick([{ filter: "county", value: event.target.value || undefined }])}>
      <option value="">Toată țara</option>
      {COUNTIES.map((county) => <option key={county} value={county}>{county}</option>)}
    </select>
  </label>;
}

function FocalSearch({ draft, roles, compareWith = false, suggest = false, onPick }: { draft: QuestionSpec; roles: readonly Role[]; compareWith?: boolean; suggest?: boolean; onPick: (choices: Choice[]) => void }) {
  const ctx = filterContext(draft as FilterSpec);
  const [role, setRole] = useState<Role>(roles.includes(ctx.role) ? ctx.role : roles[0]!);
  // A verification's firm can be found through a person (final fact_check §3.4): the person unfolds into its firms.
  const persons = draft.block === "fact_check" && role === "supplier" && !compareWith;
  const [person, setPerson] = useState<PersonPick | null>(null);
  const s = useSuggestions(true);
  useEffect(() => { s.search(""); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- the starters, once
  // "Cu cine comparăm?" (F4, final compare §3.6): the chosen role's suggestions, asked lazily, above the results until the reader types.
  const peers = useComparePeers(draft, suggest);
  const focalId = Number(draft.filters.authorityId ?? draft.filters.supplierId) || undefined;
  const results = useMemo((): Found[] => [
    ...[
      ...(suggest && s.query.length < 2 ? peerResults(peers, { id: focalId }) : []),
      ...entityResults(role, s.data, s.hits, s.query, suggest && peers?.label && s.query.length < 2 ? "Cele mai mari"
        : persons && s.data.person?.length ? "Firme" : undefined),
    ].map((r) => compareWith
      ? { ...r, choices: r.choices.map((c) => ({ filter: "compareWith" as const, value: c.value })) } : r),
    ...(persons ? personResults(s.data, PERSONS_GROUP) : []),
  ], [s.data, s.hits, s.query, role, compareWith, suggest, peers, focalId, persons]);
  return <>
    {roles.length > 1 && <Segmented label="Instituție sau firmă" full value={role} options={[{ value: "authority", label: "Instituție" }, { value: "supplier", label: "Firmă" }]} onChange={(value) => setRole(value as Role)} />}
    <EntitySearch label={role === "authority" ? "Instituție" : persons ? "Firmă sau persoană" : "Firmă"} placeholder={role === "authority" ? "Numele instituției sau CUI" : persons ? "Firmă, CUI sau persoană" : "Numele firmei sau CUI"} results={person ? results.filter((r) => r.person?.key === person.key) : results} loading={s.loading}
      onSearch={(q) => { setPerson(null); s.search(q); }} onPick={(r) => {
        const found = r as Found;
        if (found.person) setPerson(found.person); else onPick(found.choices);
      }} />
    {person && <PersonFirms person={person} onPick={(firm) => onPick([{ filter: "supplier", value: { name: firm.name, id: Number(firm.id) } }])} />}
  </>;
}

/** "Persoane → firmele lor" (final fact_check §3.4): the people found, each to unfold into its firms (PersonFirms). */
const PERSONS_GROUP = "Persoane → firmele lor";
function personResults(data: SuggestionData, group: string): Found[] {
  return (data.person ?? []).map((p): Found => {
    const detail = [p.birthYear ? `n. ${p.birthYear}` : p.birthDateImplausible ? IMPLAUSIBLE_BIRTH_DATE_LABEL : null, p.birthLocality].filter(Boolean).join(" · ");
    return { id: `person:${p.key}`, name: p.name, detail: detail ? `${detail} · firmele ›` : "firmele ›", group, choices: [], person: { key: p.key, name: p.name, detail } };
  });
}

function PersonSearch({ onPick }: { onPick: (choices: Choice[]) => void }) {
  const s = useSuggestions(false);
  const results = useMemo(() => (s.data.person ?? []).map((person): Found => ({
    id: `person:${person.key}`, name: person.name,
    detail: [person.birthYear ? `n. ${person.birthYear}` : person.birthDateImplausible ? IMPLAUSIBLE_BIRTH_DATE_LABEL : null, person.birthLocality, countWords(person.nFirms, "firmă", "firme")].filter(Boolean).join(" · "),
    choices: [{ filter: "admin", value: { key: person.key, name: `${person.name}${person.birthYear ? ` (n. ${person.birthYear}${person.birthLocality ? `, ${person.birthLocality}` : ""})` : ""}` } }],
  })), [s.data]);
  return <EntitySearch label="Persoană" placeholder="Numele reprezentantului legal" results={results} loading={s.loading}
    onSearch={(q) => s.search(q, false)} onPick={(r) => onPick((r as Found).choices)} emptyText="Nicio persoană găsită. Încearcă numele complet." />;
}

function CpvSearch({ draft, onPick, onCpvName }: { draft: QuestionSpec; onPick: (choices: Choice[]) => void; onCpvName: (code: string, name: string) => void }) {
  const s = useSuggestions(false);
  useEffect(() => { s.search(""); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- the CPV divisions, once
  // The catalogue's names have cedilla letters; the window and the sentence say them with ș and ț.
  const results = useMemo((): Found[] => [
    ...(s.data.cpv ?? []).map((item): Found => {
      const code = isCode(item.term), name = item.cpvName ? readableCpvName(item.cpvName) : null;
      return { id: `cpv:${item.term}`, name: code ? name ?? `CPV ${item.term}` : item.term, detail: code ? `CPV ${item.term}` : name ?? "", choices: [{ filter: "cpvTerm", value: item.term }], ...(code && name ? { cpvName: name } : {}) };
    }),
    ...(s.data.division ?? []).map((item): Found => ({ id: `div:${item.code}`, name: readableCpvName(item.name), detail: `CPV ${item.code}`, choices: [{ filter: "cpvTerm", value: item.code }], cpvName: readableCpvName(item.name) })),
    // A verification never runs on words the catalogue only matches approximately (final fact_check §3.2): a "Nu"
    // must not come from a match the reader has not seen, so it chooses among the codes and terms found.
    ...(s.query.length >= 2 && draft.block !== "fact_check" ? [{ id: "cpv:typed", name: `Folosește „${s.query}”`, detail: "Corespondența cu codurile CPV apare lângă răspuns.", choices: [{ filter: "cpvTerm" as const, value: s.query }] }] : []),
  ], [s.data, s.query, draft.block]);
  return <>
    {draft.filters.cpvTerm && <ChoiceList label="Ce s-a cumpărat" options={[{ value: "none", label: "Orice domeniu", choice: { filter: "cpvTerm", value: undefined } }]} value={null} current={currentRow("cpv", draft)}
      onPick={(option) => onPick(option.value === CURRENT_ROW ? [] : [option.choice])} />}
    <EntitySearch label="Domeniu, produs sau cod CPV" placeholder="medicamente, asfaltare, 45…" results={results} loading={s.loading}
      onSearch={(q) => s.search(q)} onPick={(r) => { const found = r as Found; if (found.cpvName) onCpvName(String(found.choices[0]!.value), found.cpvName); onPick(found.choices); }} />
  </>;
}

/**
 * "Cumpără amândouă" / "Vând amândouă" (F4, final compare §3.2, kit §6
 * compare 7): the CPV groups both entities have, by the smaller value, with
 * the two bars; under them, the share of general codes when either has at
 * least 10% of its value there, its (?) saying why a domain leaves them out.
 */
function PairDomains({ draft, onPick, onCpvName }: { draft: QuestionSpec; onPick: (choices: Choice[]) => void; onCpvName: (code: string, name: string) => void }) {
  const pair = usePairFacts(draft, true);
  const options = pairDomainOptions(pair);
  const note = generalCodesNote(pair);
  if (!options.length && !note) return null;
  const chosen = options.find((o) => o.choice.value === draft.filters.cpvTerm)?.value ?? null;
  return <>
    {options.length > 0 && <><PairKey draft={draft} /><p className="qb-opt-group">{pairDomainGroup(draft)}</p>
      <ChoiceList label={pairDomainGroup(draft)} options={options} value={chosen} onPick={(option) => { onCpvName(String(option.choice.value), option.label); onPick([option.choice]); }} /></>}
    {note && <p className="qb-pop-note">{note} <HelpTip tip={{ id: "coduri-generale" }} /></p>}
  </>;
}

/**
 * "Orice · Produse · Servicii · Lucrări" above the domain's search (F3, kit §4 Domeniul): the kind from
 * the CPV code, which combines with the domain. With a code, the one kind it implies is dotted while
 * none is chosen and the kinds it has no codes of are disabled with the reason (choiceState).
 */
function KindSegmented({ win, draft, ctx, onPick }: { win: BuilderWindowSpec; draft: QuestionSpec; ctx: ReturnType<typeof filterContext>; onPick: (choices: Choice[]) => void }) {
  const current = (draft.filters.purchaseKind as PurchaseKind | undefined) ?? "any";
  const [value, setValue] = useState<string>(current);
  const implied = codeKinds(draft.filters.cpvTerm);
  // Each kind's share of the domain's value (R5); a kind with no record in the draft is disabled with the reason.
  const counts = useFacet(draft, "domain");
  const options = [
    { value: "any", label: "Orice" },
    ...PURCHASE_KIND_ORDER.map((kind) => {
      const state = choiceState(win.slot, { filter: "purchaseKind", value: kind }, draft as FilterSpec, ctx);
      const empty = kind !== current ? emptyReason(counts, kind) : null;
      const count = state.state === "disabled" ? undefined : shareText(counts, kind);
      return {
        value: kind, label: PURCHASE_KIND_WORDS[kind].label,
        ...(state.state === "disabled" ? { disabled: state.reason } : empty ? { disabled: empty } : {}),
        ...(count ? { count } : {}),
        ...(current === "any" && implied?.size === 1 && implied.has(kind) ? { inferred: true } : {}),
      };
    }),
  ];
  return <Segmented label="Tipul, după codul CPV" full value={value} options={options} onChange={(next, source) => {
    setValue(next);
    if (source === "activate" && next !== current) onPick([{ filter: "purchaseKind", value: next === "any" ? undefined : next }]);
  }} />;
}

/** Digits of a bound typed in ("1.000.000", "250 000"): a whole number of lei, or null. */
const leiOf = (text: string): number | null => {
  const digits = text.replace(/[\s.]/g, "");
  return /^\d{1,15}$/.test(digits) ? Number(digits) : null;
};

/**
 * "Cât de mare e fiecare achiziție?" (F3, kit §4 "Mărimea achiziției"): a range at once, or two bounds
 * typed in ("Între … și … lei", the lower one in the range, the upper one not). The size is the whole
 * purchase's: the (?) of the title says so.
 */
function SizeWindow({ draft, onPick }: { draft: QuestionSpec; onPick: (choices: Choice[]) => void }) {
  const counts = useFacet(draft, "size");
  const f = draft.filters;
  const range: ValueRange = {
    ...(f.purchaseValueMin !== undefined ? { purchaseValueMin: Number(f.purchaseValueMin) } : {}),
    ...(f.purchaseValueMax !== undefined ? { purchaseValueMax: Number(f.purchaseValueMax) } : {}),
  };
  const set = Object.keys(range).length > 0, index = valueRangeIndex(range);
  const [pill, setPill] = useState<string | null>(index >= 0 ? String(index) : null);
  const [from, setFrom] = useState(set && index < 0 && range.purchaseValueMin !== undefined ? String(range.purchaseValueMin) : "");
  const [to, setTo] = useState(set && index < 0 && range.purchaseValueMax !== undefined ? String(range.purchaseValueMax) : "");
  const [error, setError] = useState<string | null>(null);
  const use = () => {
    const min = from.trim() ? leiOf(from) : undefined, max = to.trim() ? leiOf(to) : undefined;
    if (min === null || max === null) { setError("Scrie sumele în lei, fără zecimale."); return; }
    if (min === undefined && max === undefined) { setError("Scrie cel puțin o limită."); return; }
    if (min !== undefined && max !== undefined && min >= max) { setError("Limita de sus trebuie să fie peste cea de jos."); return; }
    onPick([{ filter: "purchaseValue", value: { ...(min !== undefined ? { purchaseValueMin: min } : {}), ...(max !== undefined ? { purchaseValueMax: max } : {}) } }]);
  };
  return <>
    <Pills label="Mărimea achiziției" options={VALUE_RANGES.map((r, i) => {
      // Each range's share of the value (R5); an empty one is struck through with the reason.
      const count = shareText(counts, String(i)), empty = String(i) !== pill ? emptyReason(counts, String(i)) : null;
      return { value: String(i), label: r.label, ...(count ? { count } : {}), ...(empty ? { disabled: empty } : {}) };
    })} value={pill} onChange={(next, source) => {
      setPill(next);
      if (source !== "activate") return;
      const { label: _label, ...chosen } = VALUE_RANGES[Number(next)]!;
      onPick([{ filter: "purchaseValue", value: chosen }]);
    }} />
    <RangeFields from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); setError(null); }} />
    {error && <p className="qb-form-error" role="alert">{error}</p>}
    <div className="qb-pop-foot">
      {set ? <button type="button" className="qb-link" onClick={() => onPick([{ filter: "purchaseValue", value: undefined }])}>Scoate condiția</button> : <span />}
      <button type="button" className="qb-primary" onClick={use}>Folosește</button>
    </div>
  </>;
}

function FromWindow({ win, draft, onPick }: { win: BuilderWindowSpec; draft: QuestionSpec; onPick: (choices: Choice[]) => void }) {
  const tabs = fromTabs(win);
  const [tab, setTab] = useState(fromTab(win, draft));
  const names = { supplier: "O firmă", admin: "Administrator", employees: "Ce fel de firme" } as const;
  const set = tabs.some((t) => t === "supplier" ? draft.filters.supplierName || draft.filters.supplierId : t === "admin" ? draft.filters.adminName || draft.filters.adminPersonKey : draft.filters.minEmployees !== undefined || draft.filters.maxEmployees !== undefined);
  return <>
    <ChoiceList label="De la cine" options={[{ value: "any", label: "Orice firmă", choice: { filter: tabs[0]!, value: undefined } }]} value={set ? null : "any"} current={set ? currentRow("from", draft, tabs) : null}
      onPick={(option) => onPick(option.value === CURRENT_ROW ? [] : [option.choice])} />
    {tabs.length > 1 && <Segmented label="De la cine" mode="tabs" full value={tab} options={tabs.map((t) => ({ value: t, label: names[t] }))} onChange={(value) => setTab(value as typeof tab)} />}
    <div className="qb-tabpanel">
      {tab === "supplier" && <FocalSearch draft={draft} roles={["supplier"]} onPick={onPick} />}
      {tab === "admin" && <PersonSearch onPick={onPick} />}
      {tab === "employees" && <BandsWindow draft={draft} onPick={onPick} />}
    </div>
  </>;
}

function BandsWindow({ draft, onPick }: { draft: QuestionSpec; onPick: (choices: Choice[]) => void }) {
  const [values, setValues] = useState(bandValues(draft));
  const range = bandRange(EMPLOYEE_BANDS, values);
  // The firms of each band under it, and those without a filing in the rest row (kit §3 item 10, R5).
  const counts = useFacet(draft, "employees");
  const bands = EMPLOYEE_BANDS.map((band) => { const count = bandCount(counts, band.value); return count ? { ...band, count } : band; });
  return <>
    <Bands label="Angajați" bands={bands} value={values} onChange={setValues} rest={countedRest([{ label: "Fără bilanț" }], counts) ?? []} />
    <div className="qb-pop-foot">
      <button type="button" className="qb-link" onClick={() => onPick([{ filter: "employees", value: undefined }])}>Scoate condiția</button>
      <button type="button" className="qb-primary" onClick={() => onPick([bandsChoice(values)])}>{range ? bandsWords(range) : "Orice mărime"}</button>
    </div>
  </>;
}

/** The years of the free range, oldest first, up to the last year of data. */
const rangeYears = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => String(from + i));

function PeriodWindow({ draft, year, onPick }: { draft: QuestionSpec; year: number; onPick: (choices: Choice[]) => void }) {
  // The archive's span (/api/data-coverage, once per page): the window opens without it and fills in.
  const coverage = useCoverage();
  const span: CoverageSpan | null = coverage?.span ?? null;
  const trend = draft.block === "trend";
  // The year chart draws from 2018 (plan §4.3); „Lună de lună” its months, at most 36 (F3, final timeseries §3.7).
  const series = draft.block === "timeseries";
  const [pace, setPace] = useState<"year" | "month">(series && draft.timeseries?.grain === "month" ? "month" : "year");
  const monthly = series && pace === "month";
  // A comparison (F4, final compare §3.1): its own presets, "Perioada comună" from the pair's years.
  const pair = usePairFacts(draft, draft.block === "compare");
  const { presets: plain, value } = monthly ? seriesMonthPresets(draft, span, year)
    : draft.block === "compare" ? comparePeriodPresets(draft, span, year, coverage?.periods ?? null, pair) : periodPresets(draft, span, year, coverage?.periods ?? null);
  // Each preset's records (the years it holds, R5); a trend's two years are compared, not counted; the months' presets are not years.
  const counts = useFacet(draft, trend || monthly ? null : "years");
  const presets = presetCounts(plain, counts);
  const f = draft.filters;
  const [open, setOpen] = useState(value === null && Boolean(f.yearFrom || f.yearTo));
  const [range, setRange] = useState<PeriodRangeValue>({ ...EMPTY_RANGE, yearFrom: String(f.yearFrom ?? ""), yearTo: String(f.yearTo ?? ""), monthFrom: String(f.monthFrom ?? ""), monthTo: String(f.monthTo ?? "") });
  const [error, setError] = useState<string | null>(null);
  const last = span?.to ? Number(span.to.slice(0, 4)) : year;
  // The evolution's pace goes with its period: months by month write the grain after the period, years before it.
  const choose = (period: PeriodChoice | undefined, month: boolean): Choice[] => !series ? [{ filter: "period", value: period }]
    : month ? [{ filter: "period", value: period }, { filter: "timeseriesGrain", value: "month" }]
      : [{ filter: "timeseriesGrain", value: undefined }, { filter: "period", value: period }];
  const use = () => {
    const problem = periodRangeError(range, { twoYears: trend }) ?? (monthly ? seriesMonthsError(range) : null);
    if (problem) { setError(problem); return; }
    const months = !trend && (!series || monthly);
    const period: PeriodChoice = { ...(range.yearFrom ? { yearFrom: Number(range.yearFrom) } : {}), ...(range.yearTo ? { yearTo: Number(range.yearTo) } : {}), ...(months && range.monthFrom ? { monthFrom: Number(range.monthFrom) } : {}), ...(months && range.monthTo ? { monthTo: Number(range.monthTo) } : {}) };
    // One year by year is one bar: it is shown month by month (final timeseries §3.7, only in this window).
    onPick(choose(period, monthly || series && Boolean(range.yearFrom) && range.yearFrom === range.yearTo));
  };
  return <>
    {series && <Segmented label="Ritmul" full value={pace} options={[{ value: "year", label: "An de an" }, { value: "month", label: "Lună de lună" }]}
      onChange={(next) => { setPace(next as "year" | "month"); setOpen(false); setError(null); }} />}
    <PeriodPicker label="Perioada" presets={presets} value={value} onPreset={(next, source) => {
      if (source !== "activate") return;
      const preset = presets.find((p) => p.value === next);
      if (preset) onPick(choose(preset.period, monthly));
    }} custom={{
      open, onOpen: () => setOpen((current) => !current), label: trend ? "Alege cei doi ani…" : monthly ? "Alege lunile…" : series ? "Alege anii…" : "Alege anii sau lunile…",
      value: range, onChange: (next) => { setRange(next); setError(null); },
      // 2018 leaves the trend only (trend final §3.2): its direct acquisitions start in April.
      years: rangeYears(trend ? MIN_TREND_YEAR : series ? SERIES_FIRST_YEAR : span?.first ? Number(span.first.slice(0, 4)) : SERIES_FIRST_YEAR, last), months: !trend && (!series || monthly),
      ...(trend ? { labels: ["Primul an", "Al doilea an"] as const } : {}), error,
    }} />
    {series && !monthly && open && <p className="qb-pop-note">Un singur an: îl arăt lună de lună.</p>}
    {open && <div className="qb-pop-foot"><span /><button type="button" className="qb-primary" onClick={use}>Folosește</button></div>}
  </>;
}

/**
 * "Ce luni compari?" (trend final §3.3): the automatic months (disabled with
 * the reason where the data do not confirm them), whole years, or the months
 * a reader chooses for both years, from the ones the archive reaches.
 */
function MonthsWindow({ win, draft, ctx, onPick }: { win: BuilderWindowSpec; draft: QuestionSpec; ctx: ReturnType<typeof filterContext>; onPick: (choices: Choice[]) => void }) {
  const months = draft.trend?.months;
  const state = trendMonthsState(draft as FilterSpec, ctx);
  const options: ChoiceOption[] = (["auto", "whole"] as const).map((value) => {
    const choice: Choice = { filter: "trendMonths", value };
    const st = choiceState(win.slot, choice, draft as FilterSpec, ctx);
    return { value: optionValue(value), ...choiceWords(choice, draft), ...(st.state === "disabled" ? { disabled: st.reason } : {}), choice };
  });
  const prefill = Array.isArray(months) ? months : state?.kind === "unconfirmed" || state?.kind === "off" ? state.prefill
    : state?.kind === "auto" && state.window ? [state.window.from, state.window.to] as const : [1, 6] as const;
  const [range, setRange] = useState({ from: String(prefill[0]), to: String(prefill[1]) });
  const [error, setError] = useState<string | null>(null);
  const use = () => {
    const from = Number(range.from), to = Number(range.to);
    if (from > to) { setError("Luna de început trebuie să fie înaintea lunii de sfârșit."); return; }
    // January to December is whole years.
    onPick([{ filter: "trendMonths", value: from === 1 && to === 12 ? "whole" : [from, to] }]);
  };
  const field = (key: "from" | "to", text: string) => <label className="qb-field">
    <span>{text}</span>
    <select value={range[key]} onChange={(event) => { setRange((current) => ({ ...current, [key]: event.target.value })); setError(null); }}>
      {MONTHS.map((month, index) => <option key={month} value={String(index + 1)}>{month}</option>)}
    </select>
  </label>;
  return <>
    {/* The automatic months the data do not confirm are disabled, never drawn checked. */}
    <ChoiceList label={win.name} options={options} value={typeof months === "string" && !options.find((o) => o.value === optionValue(months))?.disabled ? optionValue(months) : null} onPick={(option) => onPick([option.choice])} />
    <p className="qb-opt-group">Sau alege lunile</p>
    <div className="qb-range"><div className="qb-inputs">{field("from", "Din luna")}{field("to", "Până în luna")}</div>
      {error && <p className="qb-form-error" role="alert">{error}</p>}</div>
    <div className="qb-pop-foot"><span /><button type="button" className="qb-primary" onClick={use}>Folosește</button></div>
  </>;
}

/**
 * "⋯ › Selecție avansată" (P9, plan §1.1 variant A): today's precise selection
 * with only the fields this question offers (BLOCK_FILTERS.advancedFields),
 * and the record threshold of the role it ranks, where it has one.
 */
function AdvancedWindow({ win, draft, onReplace, onClose }: { win: BuilderWindowSpec; draft: QuestionSpec; onReplace: (spec: QuestionSpec) => void; onClose: () => void }) {
  const ctx = filterContext(draft as FilterSpec);
  const entry = BLOCK_FILTERS[ctx.block];
  const slots = entry?.advanced(draft as FilterSpec, ctx) ?? [];
  const fields = entry?.advancedFields(draft as FilterSpec, ctx) ?? [];
  const threshold = slots.find((slot) => slot.id === "minimumRecords");
  const role = (threshold?.choices?.[0] as { role?: "authority" | "supplier" } | undefined)?.role ?? "supplier";
  const write = (change: (next: QuestionSpec) => void) => { const next = cloneQuestion(draft); change(next); onReplace(next); };
  return <>
    {fields.length > 0 && <PopulationEditor embedded fields={fields} value={draft.population} onChange={(population) => write((next) => { if (population) next.population = population; else delete next.population; })} />}
    {threshold && <fieldset className="qp-minimum qb-minimum"><legend>Înregistrări pe {role === "authority" ? "instituție" : "firmă"}</legend>
      {draft.minimumRecords ? <div className="qp-minimum-fields">
        <label>Cel puțin<input type="number" min={1} max={1_000_000} step={1} value={draft.minimumRecords.count} onChange={(event) => write((next) => { next.minimumRecords = { role, count: Number(event.target.value) }; })} /></label>
        <button type="button" onClick={() => write((next) => { delete next.minimumRecords; })}>Scoate pragul</button>
      </div> : <button type="button" onClick={() => write((next) => { next.minimumRecords = { role, count: 5 }; })}>+ Un prag de înregistrări</button>}
    </fieldset>}
    <div className="qb-pop-foot"><span>{win.slot.id === "population" ? "Câmpurile pe care propoziția nu le are." : ""}</span><button type="button" className="qb-primary" onClick={onClose}>Gata</button></div>
  </>;
}


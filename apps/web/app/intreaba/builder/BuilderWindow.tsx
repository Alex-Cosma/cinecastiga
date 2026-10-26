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
import type { EntityHit } from "@/lib/search";
import { MIN_TREND_YEAR, type CoveragePeriods } from "@/lib/ask/months-window";
import { choiceState } from "@/lib/ask/filters/pickers";
import { trendMonthsState } from "@/lib/ask/filters/trend-rules";
import PopulationEditor from "../PopulationEditor";
import Bands, { EMPLOYEE_BANDS, bandRange, bandsWords } from "./Bands";
import { useCoverage } from "./coverage";
import EntitySearch, { type SearchResult } from "./EntitySearch";
import PeriodPicker, { EMPTY_RANGE, MONTHS, PeriodRange, periodRangeError, type PeriodRangeValue } from "./PeriodPicker";
import Segmented from "./Segmented";
import OptionList from "./pickers/OptionList";
import Popover from "./pickers/Popover";
import type { ChangeSource, KitRestRow } from "./kit-types";
import type { BuilderWindowSpec } from "./view";
import {
  CURRENT_ROW, SERIES_FIRST_YEAR, UNKNOWN_SEAT, bandValues, bandsChoice, choiceWords, currentRow, fromTab, fromTabs, listOptions, optionValue, periodPresets, windowKind, windowTip, type ChoiceOption, type CoverageSpan,
} from "./window-model";

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
  onChoose: (choices: Choice[]) => void;
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
/** A result and the choices picking it writes. */
interface Found extends SearchResult { choices: Choice[]; cpvName?: string }

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
function countyResults(query: string, group?: string): Found[] {
  const q = foldQuestion(query.trim());
  return COUNTIES.filter((county) => !q || foldQuestion(county).includes(q)).map((county): Found => ({
    id: `county:${county}`, name: /^bucure/i.test(county) ? "București" : `Județul ${county}`, ...(group ? { group } : {}),
    choices: [{ filter: "county", value: county }],
  }));
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

export default function BuilderWindow(props: BuilderWindowProps) {
  const { win, anchor, onClose, draft } = props;
  const kind = win ? windowKind(win) : null;
  const wide = kind !== null && ["advanced", "buyer", "from", "peers", "focal", "compareWith", "cpv", "place", "locality", "admin"].includes(kind);
  const tip = win ? windowTip(win, draft) : undefined;
  return <Popover open={Boolean(win)} anchor={anchor} onClose={onClose} title={win?.title ?? ""} wide={wide} {...(tip ? { tip } : {})}>
    {win && <WindowBody key={win.key} {...props} win={win} />}
  </Popover>;
}

/** Windows whose first choice is a list above a search: they open on the chosen row, not the field (on a phone its keyboard would cover the list). */
const LIST_FIRST = new Set(["buyer", "place", "locality", "from", "peers"]);

function WindowBody({ win, draft, excluded = [], onChoose, onReplace, onRemoveExclusions, onCpvName, onClose, coverage }: BuilderWindowProps & { win: BuilderWindowSpec }) {
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
  const listOf = (only?: Choice["filter"]) => listOptions(win, draft, only, ctx);

  switch (kind) {
    case "list": case "subject": {
      const { options, value, rest } = listOf();
      return <ChoiceList label={win.name} options={options} value={value} {...(rest ? { rest } : {})} onPick={(option) => pick([option.choice])} />;
    }
    case "peers": return <>{marker}<PeersWindow win={win} draft={draft} onPick={pick} /></>;
    case "buyer": {
      const kinds = own.includes("authorityKind") ? listOf("authorityKind") : null;
      const named = Boolean(draft.filters.authorityName || draft.filters.authorityId || draft.filters.uatSiruta);
      const searches = own.includes("authority") || own.includes("locality") && ctx.locality.ok;
      // A named institution or town hall leads the kinds, checked (it is no kind).
      const current = named ? currentRow("buyer", draft) : null;
      return <>
        {marker}
        {kinds && <ChoiceList label="Tipul instituției" options={kinds.options} value={named ? null : kinds.value} current={current} {...(kinds.rest ? { rest: kinds.rest } : {})} onPick={(option) => pick(option.value === CURRENT_ROW ? [] : [option.choice])} />}
        {!kinds && current && <ChoiceList label={win.name} options={[]} value={null} current={current} onPick={() => pick([])} />}
        {searches && <InstitutionSearch draft={draft} authority={own.includes("authority")} locality={own.includes("locality") && ctx.locality.ok} onPick={pick} />}
        {own.includes("county") && <CountySelect draft={draft} onPick={pick} />}
      </>;
    }
    case "place": {
      const seat = win.title === "Unde au sediul firmele?";
      const kinds = own.includes("authorityKind") ? listOf("authorityKind") : null;
      const first: ChoiceOption = { value: "none", label: seat ? "Oriunde" : "Toată țara", choice: { filter: "county", value: undefined } };
      const set = Boolean(draft.filters.county || draft.filters.uatSiruta);
      return <>
        {marker}
        <ChoiceList label={win.name} options={[first]} value={set ? null : "none"} current={set ? currentRow("place", draft) : null}
          // The firms without a known seat are left out of a seat's answer (kit §4 Sediul firmei, R5); counted from F3.
          {...(seat ? { rest: [{ label: UNKNOWN_SEAT }] } : {})}
          onPick={(option) => pick(option.value === CURRENT_ROW ? [] : [...(draft.filters.uatSiruta ? [{ filter: "locality" as const, value: undefined }] : []), first.choice])} />
        {kinds && <><p className="qb-opt-group">Ce fel de instituții</p><ChoiceList label="Tipul instituției" options={kinds.options} value={kinds.value} {...(kinds.rest ? { rest: kinds.rest } : {})} onPick={(option) => pick([option.choice])} /></>}
        <PlaceSearch draft={draft} locality={own.includes("locality") && ctx.locality.ok} onPick={pick} />
      </>;
    }
    case "locality":
      return <>
        {marker}
        <ChoiceList label={win.name} options={[{ value: "none", label: "Toată țara", choice: { filter: "locality", value: undefined } }]} value={draft.filters.uatSiruta ? null : "none"} current={currentRow("locality", draft)}
          onPick={(option) => pick(option.value === CURRENT_ROW ? [] : [{ filter: "locality", value: undefined }])} />
        <PlaceSearch draft={draft} locality counties={false} onPick={pick} />
      </>;
    case "focal": return <FocalSearch draft={draft} roles={win.slot.picker === "focal" ? ["authority", "supplier"] : [win.slot.id as Role]} onPick={pick} />;
    case "compareWith": return <FocalSearch draft={draft} roles={[ctx.role]} compareWith onPick={pick} />;
    case "from": return <>{marker}<FromWindow win={win} draft={draft} onPick={pick} /></>;
    case "employees": return <BandsWindow draft={draft} onPick={pick} />;
    case "admin": return <>
      <PersonSearch onPick={pick} />
      {(draft.filters.adminName || draft.filters.adminPersonKey) && <div className="qb-pop-foot"><button type="button" className="qb-link" onClick={() => pick([{ filter: "admin", value: undefined }])}>Scoate condiția</button></div>}
    </>;
    case "cpv": return <CpvSearch draft={draft} onPick={pick} onCpvName={onCpvName} />;
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

function PlaceSearch({ draft, locality, counties = true, onPick }: { draft: QuestionSpec; locality: boolean; counties?: boolean; onPick: (choices: Choice[]) => void }) {
  // The counties are listed here; the localities are asked for, within the chosen county when the window keeps it.
  const s = useSuggestions(false, !counties && draft.filters.county ? String(draft.filters.county) : undefined, locality);
  const results = useMemo(() => [
    ...(counties ? countyResults(s.query, locality ? "Județe" : undefined) : []),
    ...(locality ? localityResults(s.data, "Primăria localității", counties) : []),
  ], [s.data, s.query, counties, locality]);
  return <EntitySearch label={locality ? counties ? "Județ sau localitate" : "Localitate" : "Județ"} placeholder={locality ? counties ? "Un județ, un oraș sau o comună" : "Un oraș sau o comună" : "Caută județul"}
    results={results} loading={s.loading} minChars={1}
    onSearch={(q) => s.search(q, false)} onPick={(r) => onPick((r as Found).choices)}
    emptyText={locality ? "Niciun județ sau localitate. Verifică numele." : "Niciun județ cu acest nume."} />;
}

/**
 * "Față de cine?" (plan §4.11, today's keys until F6a's peers): the group a
 * distribution places its entity in. Institutions: a kind, then a county;
 * firms: the county of their seat. Each part has its own first row (R4),
 * and the two combine.
 */
function PeersWindow({ win, draft, onPick }: { win: BuilderWindowSpec; draft: QuestionSpec; onPick: (choices: Choice[]) => void }) {
  const institutions = windowOf(win.slot).includes("authorityKind");
  const kinds = institutions ? listOptions(win, draft, "authorityKind") : null;
  const anywhere: ChoiceOption = { value: "none", label: institutions ? "Toată țara" : "Oriunde", choice: { filter: "county", value: undefined } };
  return <>
    {kinds && <><p className="qb-opt-group">Ce fel de instituții</p><ChoiceList label="Tipul instituției" options={kinds.options} value={kinds.value} {...(kinds.rest ? { rest: kinds.rest } : {})} onPick={(option) => onPick([option.choice])} /></>}
    <p className="qb-opt-group">{institutions ? "Unde" : "Unde au sediul firmele"}</p>
    <ChoiceList label={institutions ? "Unde" : "Sediul firmei"} options={[anywhere]} value={draft.filters.county ? null : "none"} current={currentRow("peers", draft)}
      {...(institutions ? {} : { rest: [{ label: UNKNOWN_SEAT }] })}
      onPick={(option) => onPick(option.value === CURRENT_ROW ? [] : [anywhere.choice])} />
    <PlaceSearch draft={draft} locality={false} onPick={onPick} />
  </>;
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

function FocalSearch({ draft, roles, compareWith = false, onPick }: { draft: QuestionSpec; roles: readonly Role[]; compareWith?: boolean; onPick: (choices: Choice[]) => void }) {
  const ctx = filterContext(draft as FilterSpec);
  const [role, setRole] = useState<Role>(roles.includes(ctx.role) ? ctx.role : roles[0]!);
  const s = useSuggestions(true);
  useEffect(() => { s.search(""); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- the starters, once
  const results = useMemo(() => entityResults(role, s.data, s.hits, s.query).map((r) => compareWith
    ? { ...r, choices: r.choices.map((c) => ({ filter: "compareWith" as const, value: c.value })) } : r), [s.data, s.hits, s.query, role, compareWith]);
  return <>
    {roles.length > 1 && <Segmented label="Instituție sau firmă" full value={role} options={[{ value: "authority", label: "Instituție" }, { value: "supplier", label: "Firmă" }]} onChange={(value) => setRole(value as Role)} />}
    <EntitySearch label={role === "authority" ? "Instituție" : "Firmă"} placeholder={role === "authority" ? "Numele instituției sau CUI" : "Numele firmei sau CUI"} results={results} loading={s.loading}
      onSearch={(q) => s.search(q)} onPick={(r) => onPick((r as Found).choices)} />
  </>;
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
    ...(s.query.length >= 2 ? [{ id: "cpv:typed", name: `Folosește „${s.query}”`, detail: "Corespondența cu codurile CPV apare lângă răspuns.", choices: [{ filter: "cpvTerm" as const, value: s.query }] }] : []),
  ], [s.data, s.query]);
  return <>
    {draft.filters.cpvTerm && <ChoiceList label="Ce s-a cumpărat" options={[{ value: "none", label: "Orice domeniu", choice: { filter: "cpvTerm", value: undefined } }]} value={null} current={currentRow("cpv", draft)}
      onPick={(option) => onPick(option.value === CURRENT_ROW ? [] : [option.choice])} />}
    <EntitySearch label="Domeniu, produs sau cod CPV" placeholder="medicamente, asfaltare, 45…" results={results} loading={s.loading}
      onSearch={(q) => s.search(q)} onPick={(r) => { const found = r as Found; if (found.cpvName) onCpvName(String(found.choices[0]!.value), found.cpvName); onPick(found.choices); }} />
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
  return <>
    <Bands label="Angajați" bands={EMPLOYEE_BANDS} value={values} onChange={setValues} rest={[{ label: "Fără bilanț" }]} />
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
  // The year chart draws from 2018 and its custom range is years ("Alege anii…", plan §4.3); months by month are F3's.
  const series = draft.block === "timeseries";
  const { presets, value } = periodPresets(draft, span, year, coverage?.periods ?? null);
  const f = draft.filters;
  const [open, setOpen] = useState(value === null && Boolean(f.yearFrom || f.yearTo));
  const [range, setRange] = useState<PeriodRangeValue>({ ...EMPTY_RANGE, yearFrom: String(f.yearFrom ?? ""), yearTo: String(f.yearTo ?? ""), monthFrom: String(f.monthFrom ?? ""), monthTo: String(f.monthTo ?? "") });
  const [error, setError] = useState<string | null>(null);
  const last = span?.to ? Number(span.to.slice(0, 4)) : year;
  const use = () => {
    const problem = periodRangeError(range, { twoYears: trend });
    if (problem) { setError(problem); return; }
    const num = (v: string) => v ? Number(v) : undefined;
    const months = !trend && !series;
    onPick([{ filter: "period", value: { ...(range.yearFrom ? { yearFrom: num(range.yearFrom) } : {}), ...(range.yearTo ? { yearTo: num(range.yearTo) } : {}), ...(months && range.monthFrom ? { monthFrom: num(range.monthFrom) } : {}), ...(months && range.monthTo ? { monthTo: num(range.monthTo) } : {}) } }]);
  };
  return <>
    <PeriodPicker label="Perioada" presets={presets} value={value} onPreset={(next, source) => {
      if (source !== "activate") return;
      const preset = presets.find((p) => p.value === next);
      if (preset) onPick([{ filter: "period", value: preset.period }]);
    }} custom={{
      open, onOpen: () => setOpen((current) => !current), label: trend ? "Alege cei doi ani…" : series ? "Alege anii…" : "Alege anii sau lunile…",
      value: range, onChange: (next) => { setRange(next); setError(null); },
      // 2018 leaves the trend only (trend final §3.2): its direct acquisitions start in April.
      years: rangeYears(trend ? MIN_TREND_YEAR : series ? SERIES_FIRST_YEAR : span?.first ? Number(span.first.slice(0, 4)) : SERIES_FIRST_YEAR, last), months: !trend && !series,
      ...(trend ? { labels: ["Primul an", "Al doilea an"] as const } : {}), error,
    }} />
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


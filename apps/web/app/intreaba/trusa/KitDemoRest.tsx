"use client";

import { useEffect, useRef, useState } from "react";
import Bands, { EMPLOYEE_BANDS, bandRange, bandsWords, type Band } from "../builder/Bands";
import Chip from "../builder/Chip";
import ConditionRow from "../builder/ConditionRow";
import EntitySearch, { type SearchResult } from "../builder/EntitySearch";
import HelpTip from "../builder/HelpTip";
import PeriodPicker, { EMPTY_RANGE, YearGrid, periodRangeError, type PeriodRangeValue, type YearCell } from "../builder/PeriodPicker";
import Pills, { type PillOption } from "../builder/Pills";
import Segmented, { SwatchLabel } from "../builder/Segmented";
import Sentence, { Presentation } from "../builder/Sentence";
import Toggle from "../builder/Toggle";
import OptionList from "../builder/pickers/OptionList";
import Popover, { StaticPopover } from "../builder/pickers/Popover";
import type { KitOption, KitTip } from "../builder/kit-types";
import AnswerRow, { AnswerList } from "../answer/AnswerRow";
import AnswerStrip, { Crumbs, StripEnd, StripLabelled, StripRow, Suggest } from "../answer/AnswerStrip";
import DetailCard from "../answer/DetailCard";
import EmptyState, { removeWords } from "../answer/EmptyState";
import { recordsWords } from "../answer/KitLink";
import ListFoot from "../answer/ListFoot";
import Locate, { placeWords } from "../answer/Locate";
import type { RowAction } from "../answer/RowMenu";
import TotalLine from "../answer/TotalLine";
import { countWords } from "../../../lib/ask/answer-text";
import { formatRon } from "../../../lib/format";
import { Cap, Cell, Live, OpenTip, Section, slot, text } from "./frame";

/*
 * The second half of the kit's demo (kit/components.html §7, §9–§14): bands,
 * period, entity search, the answer strip, the answer row with its menu, the
 * total line and the longer list, the card, "Unde e …?", the empty state and
 * the bottom buttons. Static frames first, then a live strip. The searches
 * filter a fixed sample list after a short wait, to show "Caut…": the kit
 * itself never fetches. The firms of the live list are made-up names.
 */

const EMPLOYEES_TIP: KitTip = { title: "Angajați", text: "Din ultimul bilanț depus, nu din anul atribuirii. Firmele fără bilanț nu intră în nicio bandă." };
const BAND_COUNTS: Record<string, string> = { "0": "6", "1-9": "123", "10-49": "69", "50-249": "29", "250+": "21" };
const bandsWithCounts = (classes: Record<string, string> = {}): Band[] => EMPLOYEE_BANDS.map(band => ({ ...band, count: BAND_COUNTS[band.value]!, ...(classes[band.value] ? { className: classes[band.value] } : {}) }));
/** The chip's short words for a run of bands (the registry writes them in F1b). */
const bandsChip = (values: readonly string[]) => { const range = bandRange(EMPLOYEE_BANDS, values); if (!range) return "Angajați"; const words = bandsWords(range).replace(/^Firme (cu (?=\d|cel ))?/, ""); return words.charAt(0).toUpperCase() + words.slice(1); };

export function BandsSection() {
  const [open, setOpen] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [applied, setApplied] = useState<string[]>([]);
  const range = bandRange(EMPLOYEE_BANDS, draft);
  const close = () => setOpen(null);
  return <Section n={7} title="Benzi alăturate (Angajați)" classes=".qb-bands · .qb-band (aria-pressed)" note="Clase de mărime; se pot alege doar benzi vecine, deci „1–49” e două benzi. Fără câmpuri libere. Firmele fără bilanț sunt un rând neselectabil. Butonul de jos spune ce se aplică.">
    <div className="kd-cells kd-cells-top">
      <Cell cap="două benzi alese · hover · focus">
        <StaticPopover wide title="Câți angajați au firmele?" tip={EMPLOYEES_TIP} foot={<><button type="button" className="qb-link">Scoate condiția</button><button type="button" className="qb-primary">{bandsWords({ min: 1, max: 49 })}</button></>}>
          <Bands label="Benzi de angajați" bands={bandsWithCounts({ "0": "is-hover", "50-249": "is-focus" })} value={["1-9", "10-49"]} rest={[{ label: "Fără bilanț", count: "4,1% · 34" }]} />
        </StaticPopover>
      </Cell>
    </div>
    <Live>
      <p className="kd-text">O bandă depărtată le alege și pe cele dintre ele, cu anunț; o bandă din mijlocul șirului îl scurtează spre capătul apropiat.</p>
      <ConditionRow label="Câștigătorii" kind="group">
        <Chip id="emp" label={bandsChip(applied)} name="Angajați" active={applied.length > 0} {...(applied.length ? { count: "192" } : {})} open={!!open} onOpen={(_, anchor) => { setDraft(applied); setOpen(current => current ? null : anchor); }} onRemove={() => setApplied([])} />
      </ConditionRow>
      <Popover open={!!open} anchor={open} onClose={close} wide title="Câți angajați au firmele?" tip={EMPLOYEES_TIP} foot={<>
        <button type="button" className="qb-link" onClick={() => { setApplied([]); close(); }}>Scoate condiția</button>
        <button type="button" className="qb-primary" disabled={!range} onClick={() => { setApplied(draft); close(); }}>{range ? bandsWords(range) : "Alege o bandă"}</button>
      </>}>
        <Bands label="Benzi de angajați" bands={bandsWithCounts()} value={draft} onChange={setDraft} rest={[{ label: "Fără bilanț", count: "4,1% · 34" }]} />
      </Popover>
    </Live>
  </Section>;
}

const PRESETS: KitOption[] = [
  { value: "2026", label: "2026", detail: "până la 25 sept." },
  { value: "2025", label: "2025" },
  { value: "3y", label: "Ultimii 3 ani compleți", detail: "2023–2025" },
  { value: "all", label: "Toți anii", detail: "apr. 2018 – 25 sept. 2026" },
];
const PRESET_WORDS: Record<string, string> = { "2026": "2026", "2025": "2025", "3y": "2023–2025", all: "toți anii" };
const YEARS = ["2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"];
const PAIR_COUNTS = [1, 11, 4, 6, 7, 6, 11, 7, 5];
const yearCells = (classes: Record<string, string> = {}): YearCell[] => [
  ...YEARS.map((year, index): YearCell => ({
    value: year, label: year, count: String(PAIR_COUNTS[index]),
    name: `${year}${year === "2018" ? ", de la 2 apr." : year === "2026" ? ", până la 25 sept." : ""}, ${recordsWords(PAIR_COUNTS[index]!)}`,
    ...(year === "2018" ? { partial: "de la 2 apr." } : year === "2026" ? { partial: "până la 25 sept." } : {}),
    ...(classes[year] ? { className: classes[year] } : {}),
  })),
  { value: "range", label: "…", count: "interval", name: "Interval", zero: true },
];
const rangeWords = (range: PeriodRangeValue) => !range.yearFrom && !range.yearTo ? "toți anii" : range.yearFrom === range.yearTo ? range.yearFrom : `${range.yearFrom || "2018"}–${range.yearTo || "2026"}`;

export function PeriodSection() {
  const [win, setWin] = useState<{ id: "period" | "when"; anchor: HTMLElement } | null>(null);
  const [preset, setPreset] = useState<string | null>("all");
  const [customOpen, setCustomOpen] = useState(false);
  const [range, setRange] = useState<PeriodRangeValue>(EMPTY_RANGE);
  const [tried, setTried] = useState(false);
  const [year, setYear] = useState<string | null>(null);
  const close = () => setWin(null);
  const error = tried ? periodRangeError(range) : null;
  const open = (id: string, anchor: HTMLElement) => { setTried(false); setWin(current => current?.id === id ? null : { id: id as "period" | "when", anchor }); };
  const periodWords = preset ? PRESET_WORDS[preset]! : rangeWords(range);
  return <Section n={9} title="Perioada" classes=".qb-opts (preseturi) · .qb-years · .qb-pills (un an) · .qb-range" note="Aceleași preseturi peste tot, cu anii spuși; anul în curs spune până când are date. Fereastra se cheamă „În ce perioadă?”; „Când?” doar unde fraza își are prepoziția (evoluție, verificare).">
    <div className="kd-cells kd-cells-top">
      <Cell cap="preseturi · ales">
        <StaticPopover title="În ce perioadă?">
          <PeriodPicker presets={PRESETS} value="all" custom={{ open: false, value: EMPTY_RANGE, years: YEARS }} />
        </StaticPopover>
      </Cell>
      <Cell cap="„Alege anii sau lunile…” deschis · eroare">
        <StaticPopover title="În ce perioadă?" foot={<><span /><button type="button" className="qb-primary">Folosește</button></>}>
          <PeriodPicker presets={PRESETS} value={null} custom={{ open: true, value: { yearFrom: "2025", yearTo: "2023", monthFrom: "", monthTo: "" }, years: YEARS, error: periodRangeError({ yearFrom: "2025", yearTo: "2023", monthFrom: "", monthTo: "" }) }} />
        </StaticPopover>
      </Cell>
      <Cell cap="un an · cu numărul perechii · an incomplet hașurat">
        <StaticPopover title="Când?">
          <YearGrid label="Anul" years={yearCells({ "2023": "is-hover" })} value="2024" />
          <div className="kd-gap" />
          <Cap>față de ce an? · 2026 dezactivat</Cap>
          <Pills label="Anul de referință" value="2025" options={["2021", "2022", "2023", "2024", "2025"].map(value => ({ value, label: value })).concat({ value: "2026", label: "2026", disabled: "2026 nu s-a încheiat." } as PillOption)} />
        </StaticPopover>
      </Cell>
    </div>
    <Live>
      <Sentence as="h3" openId={win?.id ?? null} onOpen={open} tokens={[text("Cât valorează achizițiile, în "), slot("period", "Perioada", periodWords), text("?")]} />
      <Sentence as="h3" openId={win?.id ?? null} onOpen={open} tokens={[text("A cumpărat instituția de la firmă "), slot("when", "Când", year ? `în ${year === "range" ? "interval" : year}` : "până acum"), text("?")]} />
      <Popover open={win?.id === "period"} anchor={win?.id === "period" ? win.anchor : null} onClose={close} title="În ce perioadă?" foot={customOpen ? <><button type="button" className="qb-link" onClick={() => { setCustomOpen(false); setPreset("all"); setRange(EMPTY_RANGE); close(); }}>Toți anii</button><button type="button" className="qb-primary" onClick={() => { setTried(true); if (!periodRangeError(range)) { setPreset(null); close(); } }}>Folosește</button></> : undefined}>
        <PeriodPicker presets={PRESETS} value={preset} onPreset={(value, source) => { setPreset(value); setCustomOpen(false); setRange(EMPTY_RANGE); if (source === "activate") close(); }} custom={{ open: customOpen, onOpen: () => setCustomOpen(value => !value), value: range, onChange: next => { setRange(next); setTried(false); }, years: YEARS, error }} />
      </Popover>
      <Popover open={win?.id === "when"} anchor={win?.id === "when" ? win.anchor : null} onClose={close} title="Când?" foot={<><button type="button" className="qb-link" onClick={() => { setYear(null); close(); }}>Până acum</button><span /></>}>
        <YearGrid label="Anul" years={yearCells()} value={year} onChange={(value, source) => { setYear(value); if (source === "activate") close(); }} />
      </Popover>
    </Live>
  </Section>;
}

const BUYER_TYPES = ["Primării de comună", "Primării de oraș și municipiu", "Consilii județene", "Spitale", "Școli"];
/** After "făcute de", the type is articled (kit §4 Tipurile). */
const BUYER_WORDS: Record<string, string> = { "Primării de comună": "primăriile de comună", "Primării de oraș și municipiu": "primăriile de oraș și municipiu", "Consilii județene": "consiliile județene", Spitale: "spitalele", Școli: "școlile" };
/** G9: one (?) text for the kind, the glossary's, wherever the kind is chosen or shown. */
const KIND_TIP: KitTip = { id: "tip-institutie" };
const VANATORI: SearchResult[] = [
  { id: "v-gl", name: "Primăria Vânători", detail: "primăria și consiliul local", side: "Galați", group: "Primăria localității" },
  { id: "v-is", name: "Primăria Vânători", detail: "primăria și consiliul local", side: "Iași", group: "Primăria localității" },
  { id: "v-nt", name: "Primăria Vânători-Neamț", detail: "primăria și consiliul local", side: "Neamț", group: "Primăria localității" },
];
const SAMPLE_BUYERS: SearchResult[] = [
  ...VANATORI,
  { id: "cj", name: "Primăria Cluj-Napoca", detail: "primăria și consiliul local", side: "Cluj", group: "Primăria localității" },
  { id: "bz", name: "Primăria Buzău", detail: "primăria și consiliul local", side: "Buzău", group: "Primăria localității" },
  { id: "cjcj", name: "Consiliul Județean Cluj", side: "Cluj", group: "Instituții" },
  { id: "cjbz", name: "Consiliul Județean Buzău", side: "Buzău", group: "Instituții" },
  { id: "scj", name: "Spitalul Clinic Județean de Urgență Cluj", side: "Cluj", group: "Instituții" },
];
const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** The demo's stand-in for a search endpoint: a fixed list, after a short wait. */
function useSampleSearch(list: readonly SearchResult[]) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const search = (query: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (!query) { setResults([]); setLoading(false); return; }
    setLoading(true);
    timer.current = setTimeout(() => { setResults(list.filter(item => fold(item.name).includes(fold(query)))); setLoading(false); }, 350);
  };
  return { results, loading, search };
}

export function EntitySection() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [buyer, setBuyer] = useState<{ value: string; words: string }>({ value: "all", words: "instituțiile publice" });
  const sample = useSampleSearch(SAMPLE_BUYERS);
  const close = () => { setAnchor(null); sample.search(""); }; // a window opens on an empty search
  const kind = (value: string) => ({ value, words: BUYER_WORDS[value] ?? value });
  return <Section n={10} title="Alegerea entității" classes=".qb-search · .qb-res (role=combobox / listbox / option) · .qb-pills (tipuri) · .qb-seg (file)" note="Primul rând e mereu valoarea implicită. Localitățile au județul la dreapta (Vânători e în mai multe județe). „De la cine?” are aceleași file peste tot; filele fără sens lipsesc.">
    <div className="kd-cells kd-cells-top">
      <Cell cap="cumpărătorul · căutare în focus · rezultat activ">
        <StaticPopover wide title="Cine a cumpărat?">
          <OptionList label="Cumpărătorul" value="all" options={[{ value: "all", label: "Toate instituțiile publice", detail: "inclusiv companii de stat și utilități" }]} />
          <p className="qb-opt-group qb-tipwrap">Un tip <HelpTip tip={KIND_TIP} /></p>
          <Pills label="Tipul instituției" value={null} options={BUYER_TYPES.map(label => ({ value: label, label }))} />
          <p className="qb-opt-group">Sau una anume</p>
          <EntitySearch label="Instituție sau localitate" className="is-focus" defaultQuery="vânători" results={VANATORI.map(item => item.id === "v-is" ? { ...item, className: "is-hover" } : item)} activeIndex={1} />
        </StaticPopover>
      </Cell>
      <Cell cap="„De la cine?” · fila „Ce fel de firme”">
        <StaticPopover title="De la cine?" foot={<><span>de la <b>firme fără angajați</b></span><button type="button" className="qb-primary">Folosește</button></>}>
          <Segmented label="De la cine" mode="tabs" full value="kind" options={[{ value: "firm", label: "O firmă" }, { value: "admin", label: "Administrator" }, { value: "kind", label: "Ce fel de firme" }]} />
          <div className="kd-gap" />
          <div className="qb-row" data-qb-row="">
            <Chip id="emp" label="Fără angajați" name="Angajați" active count="23" onRemove={() => undefined} />
            <Chip id="seat" label="Sediul firmei" />
            <Chip id="new" label="Firme noi" />
          </div>
        </StaticPopover>
      </Cell>
      <Cell cap="căutare fără rezultat · se caută">
        <div className="qb-pop" role="group" aria-label="Căutare: stări">
          <EntitySearch label="Instituție sau localitate (fără rezultat)" defaultQuery="xyzw" results={[]} />
          <EntitySearch label="Instituție sau localitate (se caută)" defaultQuery="buz" results={[]} loading />
        </div>
      </Cell>
    </div>
    <Live>
      <Sentence as="h3" openId={anchor ? "buyer" : null} onOpen={(_, trigger) => setAnchor(current => current ? null : trigger)} tokens={[text("Cât valorează achizițiile făcute de "), slot("buyer", "Cine a cumpărat", buyer.words), text(", în toți anii?")]} />
      <p className="kd-text">Caută „vân”, „cluj” sau „buz”: ↓/↑ mută rezultatul activ, Enter îl alege, Escape iese din listă, apoi golește câmpul, apoi închide fereastra.</p>
      <Popover open={!!anchor} anchor={anchor} onClose={close} wide title="Cine a cumpărat?">
        <OptionList label="Cumpărătorul" value={buyer.value === "all" ? "all" : null} options={[{ value: "all", label: "Toate instituțiile publice", detail: "inclusiv companii de stat și utilități" }]} onChange={(_, source) => { setBuyer({ value: "all", words: "instituțiile publice" }); if (source === "activate") close(); }} />
        <p className="qb-opt-group qb-tipwrap">Un tip <HelpTip tip={KIND_TIP} /></p>
        <Pills label="Tipul instituției" value={BUYER_TYPES.includes(buyer.value) ? buyer.value : null} options={BUYER_TYPES.map(label => ({ value: label, label }))} onChange={(value, source) => { setBuyer(kind(value)); if (source === "activate") close(); }} />
        <p className="qb-opt-group">Sau una anume</p>
        <EntitySearch label="Instituție sau localitate" placeholder="Instituție sau localitate" results={sample.results} loading={sample.loading} onSearch={sample.search} onPick={result => { setBuyer({ value: result.id, words: `${result.name.replace(/^Primăria /, "primăria ")}${result.side && result.name.startsWith("Primăria Vânători") ? ` (${result.side})` : ""}` }); close(); }} />
      </Popover>
    </Live>
  </Section>;
}

/** Made-up firms for the live list (not real companies), with values in lei. */
const SAMPLE_FIRMS = Array.from({ length: 25 }, (_, index) => ({ id: `f${index + 1}`, name: `Firma de probă ${String(index + 1).padStart(2, "0")}`, value: Math.round(98_000_000 / (index + 1.4)), records: [1, 58, 14, 124, 3, 21, 9, 40, 2, 17][index % 10]! }));
const MAX_EXCLUDED = 5;
const RANK_TIP: KitTip = { title: "Primele după", text: "Semnale: cele mai multe semnale; la egalitate, valoarea mai mare. În listă: cine are cel puțin 20 de achiziții directe." };

function StripsBlock() {
  const [channel, setChannel] = useState("all");
  const [shown, setShown] = useState("6");
  const [view, setView] = useState("visual");
  const [drill, setDrill] = useState<string | null>(null);
  const [rank, setRank] = useState("signals");
  const [signal, setSignal] = useState("all");
  const [split, setSplit] = useState("channels");
  const [months, setMonths] = useState(false);
  const display = (value: string, onChange: (value: string) => void) => <Segmented label="Afișare" size="sm" value={value} onChange={onChange} options={[{ value: "visual", label: "Vizual" }, { value: "table", label: "Tabel" }]} />;
  return <>
    <Cap>flux / ce se cumpără: achiziții cu ponderi · câți · fir · sugestie · afișarea la capăt</Cap>
    <AnswerStrip>
      <Segmented label="Ce fel de achiziții" value={channel} onChange={setChannel} options={[{ value: "all", label: "Toate" }, { value: "da", label: "Directe", count: "5%" }, { value: "proc", label: "Proceduri", count: "95%" }]} />
      <StripLabelled before="Arată" after="firme"><Segmented label="Câte firme" size="sm" value={shown} onChange={setShown} options={["6", "10", "15"].map(value => ({ value, label: value }))} /></StripLabelled>
      <Crumbs label="Domenii" items={drill ? [{ label: "toate", onClick: () => setDrill(null) }] : []} current={drill ?? "toate"} />
      {!drill && <Suggest text="99,9% e Construcții" onClick={() => setDrill("Construcții")} />}
      <StripEnd>{display(view, setView)}</StripEnd>
    </AnswerStrip>
    <div className="kd-gap" />
    <Cap>profil (scatter): rânduri etichetate · ordinea · semnalul</Cap>
    <AnswerStrip rows>
      <StripRow label="Primele după" tip={RANK_TIP}><Segmented label="Primele după" value={rank} onChange={setRank} options={[{ value: "signals", label: "Semnale" }, { value: "value", label: "Valoare" }]} /></StripRow>
      <StripRow label="Semnal"><Pills label="Semnal" value={signal} onChange={setSignal} options={[{ value: "all", label: "Tot grupul", count: "82" }, { value: "split", label: "Achiziții repetate, peste plafon cumulat", count: "46", signal: true }, { value: "december", label: "Vârf în decembrie", count: "15", signal: true }]} /></StripRow>
    </AnswerStrip>
    <div className="kd-gap" />
    <Cap>evoluție: împarte (eticheta doar pentru cititorul de ecran pe telefon) · aceleași luni</Cap>
    <AnswerStrip>
      <StripLabelled before="Împarte" smHide><Segmented label="Împarte" value={split} onChange={setSplit} options={[{ value: "total", label: "Total" }, { value: "channels", label: <><SwatchLabel swatch="da">Directe</SwatchLabel> / <SwatchLabel swatch="proc">proceduri</SwatchLabel></> }, { value: "cpv", label: "Domenii" }]} /></StripLabelled>
      <Toggle id="months" label="Aceleași luni: ian.–iun." glyph="half" pressed={months} onToggle={(_, pressed) => setMonths(pressed)} />
      <StripEnd>{display(view, setView)}</StripEnd>
    </AnswerStrip>
  </>;
}

const SYSTRA_ACTIONS: RowAction[] = [
  { id: "rec", label: "Vezi înregistrările", glyph: "→", onSelect: () => undefined },
  { id: "out", label: "Scoate din calcul", glyph: "−", onSelect: () => undefined, className: "is-hover" },
  { id: "page", label: "Fișa firmei", glyph: "↗", href: "#kd-sec-12" },
];

export function AnswerSections() {
  const [excluded, setExcluded] = useState<string[]>([]);
  const [shown, setShown] = useState(10);
  const [said, setSaid] = useState("");
  const [query, setQuery] = useState<{ id: string; name: string } | null>(null);
  const [card, setCard] = useState(false);
  const [empty, setEmpty] = useState(true);
  const list = useRef<HTMLDivElement>(null);
  const firms = SAMPLE_FIRMS.filter(firm => !excluded.includes(firm.id));
  const total = firms.reduce((sum, firm) => sum + firm.value, 0);
  const names = (ids: readonly string[]) => ids.map(id => SAMPLE_FIRMS.find(firm => firm.id === id)?.name ?? id);
  const exclusion = excluded.length >= 3 ? `fără ${countWords(excluded.length, "firmă", "firme")}` : excluded.length ? `fără ${names(excluded).join(", ")}` : null;
  const finder = useSampleSearch(SAMPLE_FIRMS.map(firm => ({ id: firm.id, name: firm.name })));
  const foundRank = query ? firms.findIndex(firm => firm.id === query.id) : -1;
  return <>
    <Section n={11} title="Banda de lângă răspuns" classes=".qb-strip (role=group) · .qb-strip--rows · .qb-suggest · .qb-crumbs" note="Ce se aplică pe loc și are numere din răspuns, sau schimbă doar afișarea. Aceeași cheie ca în propoziție; cât timp constructorul e deschis, dublura din bandă se ascunde. „Vizual | Tabel” e mereu ultimul.">
      <StripsBlock />
    </Section>

    <Section n={12} title="Rândul din răspuns, meniul „⋯”, linia de total, lista mai lungă" classes=".qb-arow · .qb-tag · .qb-more / .qb-menu (menu button) · .qb-total · .qb-listfoot" note="Faptele nu sunt filtre: cel mult trei pe rând. Neutru = fapt; chihlimbar = citește cu grijă; portocaliu = doar semnal oficial. „Scoate din calcul” scoate entitatea din selecție: totalul se schimbă, iar linia de total spune „fără X”.">
      <Cap>rând cu semnal și chihlimbar · „⋯” în focus · rând cu meniul deschis</Cap>
      <AnswerList label="Firmele (cadru static)">
        <AnswerRow name="URBAN SCOPE" place="București" value="51.111.529 lei" share="14%" records={{ label: recordsWords(58) }} facts={[{ text: "achiziții repetate", tone: "signal" }, { text: "1 contract: 58%", tone: "caveat" }, { text: "bilanț 2021", tone: "caveat" }]} actions={SYSTRA_ACTIONS} menuClassName="is-focus" />
        <AnswerRow name="SYSTRA" place="din străinătate" value="100.011.056 lei" share="6,5%" records={{ label: recordsWords(1) }} facts={[{ text: "prima dată aici: 02.10.2024" }, { text: "în asociere" }, { text: "client principal", tone: "accent" }]} actions={SYSTRA_ACTIONS} menuOpen />
      </AnswerList>
      <div className="kd-menu-room" />
      <TotalLine conditions={["fără SYSTRA", "doar firmele cu sediul în alt județ"]}>Din <span className="qb-num">1.550.554.366 lei</span>, câștigați de 412 firme</TotalLine>
      <ListFoot shown={20} total={412} noun={["firmă", "firme", "f"]} records={{ label: `Vezi cele ${recordsWords(124)}` }} />
      <Live>
        <p className="kd-text">„⋯ › Scoate din calcul” scoate firma: totalul se schimbă și se anunță; de la 5 excluderi, acțiunea rămâne vizibilă, dezactivată. „Arată încă 10” duce focusul pe primul rând nou.</p>
        <AnswerList label="Firmele" listRef={list}>
          {firms.slice(0, shown).map(firm => <AnswerRow key={firm.id} name={firm.name} value={formatRon(firm.value)} share={`${((firm.value / total) * 100).toLocaleString("ro-RO", { maximumFractionDigits: 1 })}%`} records={{ label: recordsWords(firm.records), onClick: () => setSaid(`Înregistrările firmei ${firm.name} s-ar deschide în sertarul de surse.`) }} facts={firm.id === "f2" ? [{ text: "în asociere" }] : firm.id === "f4" ? [{ text: "1 contract: 66%", tone: "caveat" }] : []} actions={[
              { id: "rec", label: "Vezi înregistrările", glyph: "→", onSelect: () => setSaid(`Înregistrările firmei ${firm.name} s-ar deschide în sertarul de surse.`) },
              { id: "out", label: "Scoate din calcul", glyph: "−", ...(excluded.length >= MAX_EXCLUDED ? { disabled: "Cel mult 5 excluderi." } : {}), onSelect: () => setExcluded(ids => [...ids, firm.id]) },
              { id: "page", label: "Fișa firmei", glyph: "↗", href: "#kd-sec-12" },
            ]} />)}
        </AnswerList>
        <TotalLine conditions={exclusion ? [exclusion] : []}>Din <span className="qb-num">{formatRon(total)}</span>, câștigați de {countWords(firms.length, "firmă", "firme")}</TotalLine>
        <ListFoot shown={Math.min(shown, firms.length)} total={firms.length} noun={["firmă", "firme", "f"]} list={list} onMore={() => setShown(value => value + 10)} records={{ label: `Vezi cele ${recordsWords(firms.slice(0, shown).reduce((sum, firm) => sum + firm.records, 0))}`, onClick: () => setSaid("Sursele listei s-ar deschide în sertar.") }} />
        <p className="kd-text" role="status">{said}</p>
        {excluded.length > 0 && <button type="button" className="qb-secondary" onClick={() => { setExcluded([]); setShown(10); }}>Pune firmele la loc</button>}
      </Live>
    </Section>

    <Section n={13} title="Fișa și „Unde e …?”" classes=".qb-card (region) · .qb-find (combobox + status)" note="Fișa arată ce ai ales în răspuns (un punct, un județ, o bară), cu faptele și legăturile lui. „Unde e …?” găsește o entitate în răspuns fără să filtreze: „locul 20 din 46”.">
      <Cap>căutare în răspuns: în focus · rezultat</Cap>
      <Locate label="Unde e o instituție?" className="is-focus" defaultQuery="sageata" results={[{ id: "sg", name: "Comuna Sageata" }]} found={{ name: "Comuna Sageata", place: placeWords(20, 82, "semnale") }} />
      <div className="kd-gap" />
      <Cap>fișa punctului</Cap>
      <DetailCard autoFocus={false} title="Comuna Sageata" meta={`Primărie de comună · ${placeWords(20, 82, "semnale")}`} facts={[{ label: "Achiziții directe", value: "21,0 mil. lei" }, { label: "Risc", value: "73 din 100 · puternic" }]} lines={[
        { tag: { text: "achiziții repetate", tone: "signal" }, text: "2018–2019", records: { label: recordsWords(9) } },
        { tag: { text: "vârf în decembrie", tone: "signal" }, text: "2022", records: { label: recordsWords(48) } },
      ]} actions={[{ label: "Vezi cele 9 cu semnalul", glyph: "→" }, { label: "Unde se situează?", glyph: "›" }, { label: "Fișa instituției", glyph: "↗", href: "#kd-sec-13" }]} onClose={() => undefined} />
      <Live>
        <p className="kd-text">Caută o firmă din lista de la §12 („probă 07”): locul ei nu filtrează lista. „Arată fișa” mută focusul pe titlul fișei; Escape sau × o închide și întoarce focusul.</p>
        <Locate label="Unde e o firmă?" results={finder.results} loading={finder.loading} onSearch={finder.search} onPick={result => { setQuery({ id: result.id, name: result.name }); setCard(false); }} found={query ? { name: query.name, place: foundRank >= 0 ? placeWords(foundRank + 1, firms.length, "valoare") : "nu intră în listă: e scoasă din calcul" } : null} />
        {query && foundRank >= 0 && <button type="button" className="qb-secondary" aria-expanded={card} onClick={() => setCard(value => !value)}>Arată fișa</button>}
        {query && card && <DetailCard title={query.name} meta={placeWords(foundRank + 1, firms.length, "valoare")} facts={[{ label: "Valoare înregistrată", value: formatRon(firms[foundRank]?.value ?? 0) }]} actions={[{ label: "Tot clasamentul", glyph: "›" }]} onClose={() => setCard(false)} />}
      </Live>
    </Section>

    <Section n={14} title="Stare goală, (?) și butoanele de jos" classes=".qb-empty · .qb-relax · .qb-q (Term) · .qb-primary / .qb-secondary" note="Un răspuns gol spune ce lipsește și oferă cel mult trei relaxări, numite ca primul rând al ferestrei lor. „Fără …” e rezervat excluderilor.">
      <EmptyState message="Niciun furnizor nou din 2025 cu sediul în străinătate." relax={[{ id: "y", label: "Toți anii" }, { id: "seat", label: "Oriunde" }, { id: "new", label: removeWords("Furnizori noi") }]} />
      <div className="kd-gap" />
      <Cap>(?) închis · deschis</Cap>
      <p className="kd-text qb-tipwrap">Valoare înregistrată, nu plăți <HelpTip tip={{ id: "valoare-inregistrata" }} /></p>
      <p className="kd-text qb-tipwrap kd-tip-open">Valoare înregistrată, nu plăți <OpenTip tip={{ id: "valoare-inregistrata" }} /></p>
      <div className="kd-gap" />
      <div className="qb-bottom">
        <Presentation tokens={[text("Arată "), slot("top", "Câți parteneri", "primii 15"), text(" parteneri, după "), slot("by", "Ordinea", "valoarea înregistrată"), text(".")]} />
        <div className="qb-actions"><button type="button" className="qb-secondary">Salvează</button><button type="button" className="qb-primary is-focus">Vezi răspunsul →</button></div>
      </div>
      <div className="kd-gap" />
      <Cap>hover · dezactivat (caută)</Cap>
      <div className="qb-actions"><button type="button" className="qb-primary is-hover">Vezi răspunsul →</button><button type="button" className="qb-primary" disabled>Caut în date…</button></div>
      <Live>
        {empty
          ? <EmptyState message="Niciun furnizor nou din 2025 cu sediul în străinătate." titleId="kd-answer-title" relax={[{ id: "y", label: "Toți anii", onClick: () => setEmpty(false) }, { id: "seat", label: "Oriunde", onClick: () => setEmpty(false) }, { id: "new", label: removeWords("Furnizori noi"), onClick: () => setEmpty(false) }]} />
          : <><h3 id="kd-answer-title" className="kd-answer-title" tabIndex={-1}>Ce furnizori noi din 2025 câștigă, oriunde?</h3><button type="button" className="qb-secondary" onClick={() => setEmpty(true)}>Golește din nou</button></>}
      </Live>
    </Section>
  </>;
}

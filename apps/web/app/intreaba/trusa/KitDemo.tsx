"use client";

import { useState, type ReactNode } from "react";
import "../builder/filters-kit.css";
import "./trusa.css";
import Chip from "../builder/Chip";
import ConditionRow from "../builder/ConditionRow";
import CountGroups, { type CountGroup } from "../builder/CountGroups";
import Invitations, { Invite } from "../builder/Invitations";
import ParkedRow, { type ParkedItem } from "../builder/ParkedRow";
import Pills, { RangeFields, type PillOption } from "../builder/Pills";
import ScopeLine from "../builder/ScopeLine";
import Segmented, { SwatchLabel, type SegmentOption } from "../builder/Segmented";
import Sentence, { Presentation } from "../builder/Sentence";
import Toggle from "../builder/Toggle";
import UnderChips, { type UnderChipItem } from "../builder/UnderChips";
import OptionList from "../builder/pickers/OptionList";
import Popover, { StaticPopover } from "../builder/pickers/Popover";
import type { KitOption, SentenceToken } from "../builder/kit-types";
import { Cap, Cell, Live, Section, slot, text } from "./frame";
import { AnswerSections, BandsSection, EntitySection, PeriodSection } from "./KitDemoRest";

/*
 * The dev demo of the filter kit (kit/components.html, F1a): each of the 21
 * components in its states, then a live strip where it works. The static
 * frames draw hover and focus with the kit's .is-hover / .is-focus. The
 * numbers are sample values from the kit's mockups, not answers. Sections 7
 * and 9–14 (part 2) are in KitDemoRest.tsx.
 */

const SEAT: KitOption[] = [
  { value: "any", label: "Oriunde", count: "282" },
  { value: "same", label: "În județul Buzău", detail: "județul instituției", share: .32, count: "32,0% · 88" },
  { value: "other", label: "În alt județ", detail: "din care București 49,6%", share: .639, count: "63,9% · 172" },
  { value: "abroad", label: "În străinătate", share: .038, count: "3,8% · 3" },
];
const SEAT_WORDS: Record<string, string> = { any: "oriunde", same: "în județul Buzău", other: "în alt județ", abroad: "în străinătate" };
const SEAT_TIP = { title: "Sediul firmei", text: "Sediul social de azi (Registrul Comerțului; SEAP când lipsește), comparat cu județul instituției. Nu e locul lucrării." };
const PERIODS: KitOption[] = [
  { value: "2026", label: "2026", detail: "până la 25 sept." },
  { value: "2025", label: "2025" },
  { value: "3y", label: "Ultimii 3 ani compleți", detail: "2023–2025" },
  { value: "all", label: "Toți anii", detail: "apr. 2018 – 25 sept. 2026" },
];
const PERIOD_WORDS: Record<string, string> = { "2026": "2026", "2025": "2025", "3y": "2023–2025", all: "toți anii" };
const SUBJECTS: KitOption[] = [
  { value: "firme", label: "Firme", group: "Firme" },
  { value: "institutii", label: "Instituții publice", group: "Instituții" },
  { value: "comune", label: "Primării de comună", group: "Instituții" },
  { value: "spitale", label: "Spitale", group: "Instituții" },
];
const KIND: SegmentOption[] = [{ value: "orice", label: "Orice" }, { value: "produse", label: "Produse" }, { value: "servicii", label: "Servicii" }, { value: "lucrari", label: "Lucrări" }];
const KIND_WORDS: Record<string, string> = { orice: "orice", produse: "produse", servicii: "servicii", lucrari: "lucrări" };
const SIZES: PillOption[] = [
  { value: "lt10k", label: "Sub 10.000 lei" }, { value: "10k", label: "10.000–100.000" },
  { value: "100k", label: "100.000–1 mil." }, { value: "gt1m", label: "Peste 1 mil. lei" },
];
const TREND: CountGroup[] = [
  { value: "all", name: "Toate", count: "96.929 · după diferență", swatch: "all", all: true },
  { value: "up", name: "Creșteri", count: "28.670 · +45,3 mld", swatch: "up" },
  { value: "new", name: "Noi", count: "17.567 · +10,1 mld", swatch: "new" },
  { value: "down", name: "Scăderi", count: "31.668 · −60,1 mld", swatch: "down" },
  { value: "gone", name: "Nu mai apar", count: "18.242 · −11,9 mld", swatch: "gone" },
];
const SIGNALS: PillOption[] = [
  { value: "all", label: "Tot grupul", count: "82" },
  { value: "split", label: "Posibilă fracționare", count: "46", signal: true },
  { value: "december", label: "Vârf în decembrie", count: "15", signal: true },
  { value: "fast", label: "Finalizare rapidă", count: "15", signal: true },
];
const UNDER: UnderChipItem[] = [
  { kind: "legacy", id: "min", words: "doar firmele cu cel puțin 5 înregistrări", tip: { title: "Din link", text: "Condiție dintr-un link mai vechi; se aplică la fel. Scoate rândurile firmelor mici și schimbă totalurile. Nu se mai oferă aici." } },
  { kind: "only", id: "size", label: "Doar cele de peste 1 mil. lei", name: "Mărimea achiziției" },
  { kind: "origin", id: "rel", prefix: "Selecția relației", words: "2 firme", tip: { title: "Selecția relației", text: "Vine din pagina relației dintre aceste firme. Lista e aici; se aplică întocmai." } },
  { kind: "exclude", id: "systra", label: "Fără SYSTRA" },
  { kind: "auto", id: "months", label: "Aceleași luni: ian.–mai", name: "Aceleași luni" },
];
const PARKED: ParkedItem[] = [{ id: "year", label: "2025" }, { id: "cpv", label: "„medicamente”" }, { id: "kind", label: "făcute de spitale" }];
const PARKED_TIP = { title: "Nu se aplică indicelui", text: "Indicele nu are perioadă sau domeniu. Condițiile stau aici; atinge una ca să revii la „cel mai mult”." };

type Window = "subject" | "seat" | "what" | "period" | "size" | "new";
const TITLES: Record<Window, string> = { subject: "Ce clasăm?", seat: "Unde au sediul firmele?", what: "Ce s-a cumpărat?", period: "În ce perioadă?", size: "Cât de mare e fiecare achiziție?", new: "Firme noi" };

export default function KitDemo() {
  const [win, setWin] = useState<{ id: Window; anchor: HTMLElement } | null>(null);
  const [subject, setSubject] = useState("firme");
  const [seat, setSeat] = useState("other");
  const [kind, setKind] = useState("lucrari");
  const [period, setPeriod] = useState("3y");
  const [size, setSize] = useState<string | null>(null);
  const [range, setRange] = useState<[string, string]>(["", ""]);
  const [newSince, setNewSince] = useState<string | null>(null);
  const [mainClient, setMainClient] = useState(false);
  const [under, setUnder] = useState(UNDER);
  const [parked, setParked] = useState(PARKED);
  const [channel, setChannel] = useState("all");
  const [view, setView] = useState("visual");
  const [tab, setTab] = useState("firm");
  const [group, setGroup] = useState("up");
  const [signal, setSignal] = useState("split");
  const open = (id: string, anchor: HTMLElement) => setWin(current => current?.id === id ? null : { id: id as Window, anchor });
  const close = () => setWin(null);
  const choose = (apply: (value: string) => void) => (value: string, source: "move" | "activate") => { apply(value); if (source === "activate") close(); };
  const subjectLabel = SUBJECTS.find(option => option.value === subject)?.label.toLowerCase() ?? "firme";

  const sentence: SentenceToken[] = [text("Ce "), slot("subject", "Ce clasăm", subjectLabel), text(" cu sediul "), slot("seat", "Sediul firmei", SEAT_WORDS[seat] ?? seat), text(" câștigă achizițiile de "), slot("what", "Ce s-a cumpărat", KIND_WORDS[kind] ?? kind), text(", în "), slot("period", "Perioada", PERIOD_WORDS[period] ?? period), text("?")];
  const windowBody: Record<Window, { body: ReactNode; foot?: ReactNode; wide?: boolean; tip?: typeof SEAT_TIP }> = {
    subject: { body: <OptionList label="Ce clasăm" options={SUBJECTS} value={subject} onChange={choose(setSubject)} /> },
    seat: { tip: SEAT_TIP, body: <OptionList label="Sediul firmei" options={SEAT} value={seat} onChange={choose(setSeat)} rest={[{ label: "Sediu necunoscut", count: "0,3% · 19" }]} />, foot: <><span /><button type="button" className="qb-link" onClick={() => { setSeat("any"); close(); }}>Oriunde</button></> },
    what: { body: <Segmented label="Tipul achiziției" options={KIND} value={kind} onChange={choose(setKind)} full /> },
    period: { body: <OptionList label="Perioada" options={PERIODS} value={period} onChange={choose(setPeriod)} link={{ label: "Alege anii sau lunile…", onClick: close }} /> },
    size: { wide: true, body: <><Pills label="Plaje" options={SIZES} value={size} onChange={value => setSize(value)} /><RangeFields from={range[0]} to={range[1]} onChange={(from, to) => setRange([from, to])} /></>, foot: <><button type="button" className="qb-link" onClick={() => { setSize(null); setRange(["", ""]); close(); }}>Scoate condiția</button><button type="button" className="qb-primary" onClick={close}>Folosește</button></> },
    new: { body: <><OptionList label="Sensul" options={[{ value: "registered", label: "Înmatriculate", detail: "anul din Registrul Comerțului" }, { value: "first", label: "Prima dată", detail: "prima înregistrare în datele noastre" }]} value="first" /><p className="qb-opt-group">Din</p><Pills label="Din anul" options={["2022", "2023", "2024", "2025"].map(year => ({ value: year, label: year })).concat({ value: "2026", label: "2026", disabled: "După sfârșitul perioadei." } as PillOption)} value={newSince} onChange={choose(setNewSince)} /></> },
  };
  const current = win ? windowBody[win.id] : null;

  return <div className="kd qb">
    <header className="kd-head">
      <p className="kd-eyebrow">Doar în dezvoltare · Întreabă · F1a</p>
      <h1>Trusa de filtre</h1>
      <p>Cele 21 de componente comune ale filtrelor, în stările lor: propoziția, condițiile, alegerile, răspunsul și ajutorul. Tema urmează comutatorul site-ului. Numerele sunt de probă.</p>
    </header>

    <Section n={1} title="Propoziția, frazele, invitațiile și linia de profil" classes=".qb-sentence · .qb-phrase (--fixed) · .qb-invite · .qb-scopeline · .qb-present" note="Propoziția spune ce se numără. Fragmentele nesetate devin invitații numite, cel mult 4. Fără × în propoziție.">
      <Cap>fraze: implicit · hover · deschisă · focus</Cap>
      <Sentence as="h3" openId="y1" tokens={[text("Ce "), slot("s", "Ce clasăm", "firme"), text(" au cea mai mare "), slot("c", "Felul schimbării", "creștere", "is-hover"), text(" între "), slot("y1", "Primul an", "2024"), text(" și "), slot("y2", "Al doilea an", "2025", "is-focus"), text("?")]} />
      <Cap>invitații: implicit · hover · focus · dezactivată, cu (?)</Cap>
      <Invitations items={[
        { id: "what", label: "Ce s-a cumpărat" },
        { id: "who", label: "Cine a cumpărat", className: "is-hover" },
        { id: "kind", label: "Ce fel de achiziții", className: "is-focus" },
        { id: "from", label: "De la cine", availability: { state: "disabled", reason: "Cu o firmă în centru, firma e deja aleasă.", tip: { title: "De la cine", text: "Cu o firmă în centru, firma e deja aleasă." } } },
      ]} />
      <div className="kd-gap" />
      <Cap>profil istoric: frază fixă + linia de profil (nu se apasă) · rândul de prezentare</Cap>
      <Sentence as="h3" tokens={[text("Ce "), slot("k", "Ce clasăm", "consilii județene"), text(" "), { kind: "fixed", text: "din toată țara", tip: { title: "Din toată țara", text: "Un consiliu pe județ." } }, text(" ies din tipar după risc și valoarea achizițiilor directe?")]} />
      <ScopeLine />
      <div className="qb-bottom"><Presentation tokens={[text("Arată "), slot("top", "Câte rânduri", "primele 10"), text(", după "), slot("by", "Ordinea", "valoarea înregistrată"), text(".")]} /></div>
      <Live>
        <Sentence as="h3" tokens={sentence} openId={win?.id ?? null} onOpen={open} />
        <Invitations items={[{ id: "size", label: "Mărimea achiziției" }]} openId={win?.id ?? null} onOpen={open} />
      </Live>
    </Section>

    <Section n={2} title="Rândul de condiții: de grup și de selecție" classes=".qb-row · .qb-row--select · .qb-row-label · .qb-chip · .qb-toggle" note="Rândul de grup restrânge lista; totalul rămâne al propoziției. Rândul de selecție alege partenerii; totalul se schimbă. Cel mult 5 cipuri pe rând.">
      <Cap>rând de grup: activ cu număr · activ · comutator oprit · invitație în focus</Cap>
      <ConditionRow label="Câștigătorii" kind="group">
        <Chip id="new" label="Furnizori noi · din 2024" name="Furnizori noi" active count="177 · 38,6%" onRemove={() => undefined} />
        <Chip id="emp" label="1–49 de angajați" name="Angajați" active count="192" onRemove={() => undefined} />
        <Toggle id="main" label="Clientul lor principal" count="21 · 7,3%" pressed={false} />
        <Invite id="admin" label="Administrator" className="is-focus" />
      </ConditionRow>
      <ConditionRow label="Câștigătorii" kind="group">
        <Chip id="emp2" label="Angajați" availability={{ state: "disabled", reason: "Nu se poate cu „cu sediul în străinătate”: firmele străine nu au bilanț.", tip: { title: "Angajați", text: "Nu se poate cu „cu sediul în străinătate”: firmele străine nu au bilanț." } }} />
        <Chip id="new2" label="Firme noi" className="is-hover" />
      </ConditionRow>
      <div className="kd-gap" />
      <Cap>rând de selecție (schimbă totalul): activ · hover · comutator pornit · deschis</Cap>
      <ConditionRow label="Furnizorii" kind="selection">
        <Chip id="seat" label="Cu sediul în alt județ" name="Sediul firmei" active count="172" onRemove={() => undefined} />
        <Chip id="emp3" label="Angajați" className="is-hover" />
        <Toggle id="signals" label="Cu semnale" count="25" pressed />
        <Chip id="admin2" label="Administrator" open />
      </ConditionRow>
      <ConditionRow label="Clienții" kind="selection">
        <Chip id="county" label="Județul instituției" />
        <Chip id="type" label="Primării de oraș și municipiu" name="Tipul instituției" active count="44,1% · 12" onRemove={() => undefined} />
      </ConditionRow>
      <Live>
        <ConditionRow label="Câștigătorii" kind="group">
          <Chip id="new" label={newSince ? `Prima dată · din ${newSince}` : "Firme noi"} name="Firme noi" active={!!newSince} open={win?.id === "new"} onOpen={open} onRemove={() => setNewSince(null)} />
          <Toggle id="main" label="Clientul lor principal" count="21 · 7,3%" pressed={mainClient} onToggle={(_, pressed) => setMainClient(pressed)} />
          <Toggle id="zero" label="O firmă ia peste jumătate" count="0" pressed={false} availability={{ state: "disabled", reason: "Nicio firmă din listă nu ia peste jumătate." }} />
        </ConditionRow>
      </Live>
    </Section>

    <Section n={3} title="Cipuri sub propoziție: „Doar”, „Fără”, automat, din link, din altă pagină, puse deoparte" classes=".qb-chip--only · --exclude · --auto · --legacy · --origin · .qb-parked" note="Ordinea: restricții, excluderi, ajustări automate, apoi „Din link” și selecțiile din altă pagină. Chihlimbarul = pus de aplicație sau venit din afară. Cele puse deoparte nu intră în link.">
      <div className="kd-cells">
        <Cell cap="restricție"><UnderChips items={[UNDER[1]!]} onRemove={() => undefined} onOpen={() => undefined} /></Cell>
        <Cell cap="excludere (Scoate din calcul)"><UnderChips items={[UNDER[3]!]} onRemove={() => undefined} /></Cell>
        <Cell cap="excluderi strânse (de la 3)"><UnderChips items={[{ kind: "exclude", id: "three", label: "Fără 3 firme", name: "cele 3 excluderi", collapsed: true }]} onRemove={() => undefined} onOpen={() => undefined} /></Cell>
        <Cell cap="ajustare pusă automat"><UnderChips items={[UNDER[4]!]} onRemove={() => undefined} onOpen={() => undefined} /></Cell>
        <Cell cap="comutator oprit / pornit (evoluție)"><div className="qb-row"><Toggle id="m1" label="Aceleași luni: ian.–iun." glyph="half" pressed={false} /><Toggle id="m2" label="Aceleași luni: ian.–iun." glyph="half" pressed /></div></Cell>
        <Cell cap="din altă pagină a site-ului (aplicată, nu veche)"><UnderChips items={[UNDER[2]!]} onRemove={() => undefined} /></Cell>
        <Cell cap="din link" wide><UnderChips items={[UNDER[0]!]} onRemove={() => undefined} /></Cell>
        <Cell cap="puse deoparte (axa „indice”): implicit · hover · focus" wide><ParkedRow label="Nu se aplică indicelui" tip={PARKED_TIP} items={PARKED} itemClassName={id => id === "cpv" ? "is-hover" : id === "kind" ? "is-focus" : undefined} /></Cell>
      </div>
      <Live>
        <UnderChips items={under} openId={win?.id ?? null} onOpen={(id, anchor) => id === "size" && open("size", anchor)} onRemove={id => setUnder(items => items.filter(item => item.id !== id))} />
        <ParkedRow label="Nu se aplică indicelui" tip={PARKED_TIP} items={parked} onRestore={id => setParked(items => items.filter(item => item.id !== id))} />
        {(under.length < UNDER.length || parked.length < PARKED.length) && <button type="button" className="qb-secondary" onClick={() => { setUnder(UNDER); setParked(PARKED); }}>Pune-le la loc</button>}
      </Live>
    </Section>

    <Section n={4} title="Segmentatul" classes=".qb-seg · .qb-seg-opt (role=radiogroup / radio · tablist / tab)" note="O alegere din 2–4, aplicată pe loc. Numerele sunt ponderi din răspuns. Pe telefon ocupă toată lățimea. ←/→ mută și aleg; opțiunile dezactivate se sar.">
      <div className="kd-cells">
        <Cell cap="ales · cu ponderi"><Segmented label="Ce fel de achiziții" value="all" options={[{ value: "all", label: "Toate" }, { value: "da", label: "Directe", count: "5%" }, { value: "proc", label: "Proceduri", count: "95%" }]} /></Cell>
        <Cell cap="focus · dezactivat (0)"><Segmented label="Ce fel de achiziții" value="da" options={[{ value: "all", label: "Toate" }, { value: "da", label: "Directe", count: "100%", className: "is-focus" }, { value: "proc", label: "Proceduri", count: "—", disabled: "Nicio înregistrare din proceduri în selecție." }]} /></Cell>
        <Cell cap="Ce s-a cumpărat? · tip dedus din domeniu"><Segmented label="Tipul achiziției" value="orice" options={[{ value: "orice", label: "Orice" }, { value: "produse", label: "Produse", disabled: true }, { value: "servicii", label: "Servicii", disabled: true }, { value: "lucrari", label: "Lucrări", inferred: true }]} /></Cell>
        <Cell cap="mic · hover"><Segmented label="Afișare" size="sm" value="visual" options={[{ value: "visual", label: "Vizual" }, { value: "table", label: "Tabel", className: "is-hover" }]} /></Cell>
        <Cell cap="Împarte (evoluție) · culorile canalelor"><Segmented label="Împarte" value="channels" options={[{ value: "total", label: "Total" }, { value: "channels", label: <><SwatchLabel swatch="da">Directe</SwatchLabel> / <SwatchLabel swatch="proc">proceduri</SwatchLabel></> }, { value: "cpv", label: "Domenii" }]} /></Cell>
      </div>
      <Live>
        <div className="kd-cells">
          <Segmented label="Ce fel de achiziții" value={channel} onChange={value => setChannel(value)} options={[{ value: "all", label: "Toate" }, { value: "da", label: "Directe", count: "5%" }, { value: "proc", label: "Proceduri", count: "95%" }, { value: "none", label: "Altele", count: "—", disabled: "Nu există alt fel de achiziții." }]} />
          <Segmented label="Afișare" size="sm" value={view} onChange={value => setView(value)} options={[{ value: "visual", label: "Vizual" }, { value: "table", label: "Tabel" }]} />
          <Segmented label="De la cine" mode="tabs" value={tab} onChange={value => setTab(value)} options={[{ value: "firm", label: "O firmă" }, { value: "admin", label: "Administrator" }, { value: "kind", label: "Ce fel de firme" }]} />
        </div>
      </Live>
    </Section>

    <Section n={5} title="Grupuri cu numere" classes=".qb-groups · .qb-group (role=radiogroup / radio)" note="Cuvântul-lentilă al întrebării, în răspuns: fiecare grup cu număr și sumă. Un clic schimbă lista fără o căutare nouă. Un grup gol rămâne vizibil, dezactivat.">
      <CountGroups label="Felul schimbării" value="up" head={{ text: "Firme în 2024 sau 2025:", total: "96.929", tip: { title: "Grupuri", text: "782 au aceeași valoare în ambii ani; apar doar la „Toate”." } }} groups={TREND.map(item => item.value === "new" ? { ...item, className: "is-hover" } : item.value === "down" ? { ...item, className: "is-focus" } : item)} />
      <div className="kd-gap" />
      <Cap>ales · gol, dezactivat (pe județe)</Cap>
      <CountGroups label="Felul schimbării, pe județe" value="all" groups={[
        { value: "all", name: "Toate", count: "42", swatch: "all", all: true }, { value: "up", name: "Creșteri", count: "25", swatch: "up" },
        { value: "new", name: "Noi", count: "0", swatch: "new", disabled: "Niciun județ nou." }, { value: "down", name: "Scăderi", count: "17", swatch: "down" },
        { value: "gone", name: "Nu mai apar", count: "0", swatch: "gone", disabled: "Niciun județ plecat." },
      ]} />
      <Live><CountGroups label="Felul schimbării" value={group} onChange={value => setGroup(value)} groups={TREND} /></Live>
    </Section>

    <Section n={6} title="Fereastra scurtă și lista de opțiuni" classes=".qb-pop · .qb-opts · .qb-opt · .qb-opt--rest · .qb-opt--link" note="Lângă frază sau cip pe desktop, foaie de jos pe telefon. Opțiunile arată ponderea și numărul. Ce nu se poate clasa e un rând neselectabil, ca totalul să dea 100%.">
      <div className="kd-cells kd-cells-top">
        <Cell cap="radio · ales · hover · rest neselectabil">
          <StaticPopover title="Unde au sediul firmele?" tip={SEAT_TIP} foot={<><span /><button type="button" className="qb-link">Scoate condiția</button></>}>
            <OptionList label="Sediul firmei" value="same" options={SEAT.map(option => option.value === "abroad" ? { ...option, className: "is-hover" } : option)} rest={[{ label: "Sediu necunoscut", count: "0,3% · 19" }]} />
          </StaticPopover>
        </Cell>
        <Cell cap="căutare + rânduri · rând-legătură">
          <StaticPopover title="Unde?">
            <label className="qb-search"><span className="qb-sr">Caută un județ</span><input placeholder="Caută un județ" /></label>
            <OptionList label="Locul instituției" value="all" options={[{ value: "all", label: "Toată țara", count: "15.729" }, { value: "bz", label: "Județul Buzău", count: "337" }, { value: "cj", label: "Județul Cluj", count: "412", className: "is-hover" }]} rest={[{ label: "Județ necunoscut", count: "889" }]} link={{ label: "Firme cu sediul în…", onClick: () => undefined }} />
          </StaticPopover>
        </Cell>
        <Cell cap="bife · „→ N” · înlocuire · dezactivat">
          <StaticPopover title="Față de cine?" foot={<><span>Grup: <b>29</b> de primării</span><button type="button" className="qb-link">Șterge</button></>}>
            <OptionList label="Grupul de comparație" multiple values={["pop"]} options={[
              { value: "pop", label: "Primării cu 52–207 mii de locuitori", detail: "populație apropiată" },
              { value: "county", label: "Județul Buzău", detail: "același județ", swap: "în locul populației apropiate", count: "→ 336" },
              { value: "kind", label: "Același tip", disabled: "tipul nu se poate stabili", count: "doar 1" },
            ]} />
          </StaticPopover>
        </Cell>
      </div>
      <Live>
        <p className="kd-text">Frazele din propoziția de la §1 și cipul „Firme noi” de la §2 deschid ferestrele de aici: lângă ele pe desktop, ca foaie de jos sub 600 px. Escape le închide și întoarce focusul.</p>
      </Live>
    </Section>

    <BandsSection />

    <Section n={8} title="Pastile: plaje, ani, semnale" classes=".qb-pills · .qb-pill (+ .qb-n, .qb-dot--signal) · .qb-field" note="Alegere scurtă dintr-un set mic. Plajele nu sunt praguri legale. Pastilele cu numere (Semnal) sunt o alegere unică, pe loc; punctul portocaliu leagă cipul de punctele din grafic.">
      <div className="kd-cells kd-cells-top">
        <Cell cap="plaje + interval: aleasă · hover">
          <StaticPopover wide title="Cât de mare e fiecare achiziție?" tip={{ title: "Mărimea achiziției", text: "Valoarea întregului contract sau a achiziției directe, nu cota fiecărui câștigător. Plajele nu sunt praguri legale." }} foot={<><button type="button" className="qb-link">Scoate condiția</button><button type="button" className="qb-primary">Folosește</button></>}>
            <Pills label="Plaje" value="gt1m" options={SIZES.map(option => option.value === "10k" ? { ...option, className: "is-hover" } : option)} />
            <RangeFields from="250.000" to="" />
          </StaticPopover>
        </Cell>
        <Cell cap="ani (Firme noi · Din): ales · dezactivat după perioadă">
          <StaticPopover title="Firme noi">
            <OptionList label="Sensul" value="registered" options={[{ value: "registered", label: "Înmatriculate", detail: "anul din Registrul Comerțului" }, { value: "first", label: "Prima dată", detail: "prima înregistrare în datele noastre" }, { value: "buyer", label: "Furnizori noi", detail: "prima înregistrare cu această instituție", disabled: "doar cu o instituție numită" }]} />
            <p className="qb-opt-group">Din</p>
            <Pills label="Din anul" value="2025" options={[{ value: "2022", label: "2022" }, { value: "2023", label: "2023" }, { value: "2024", label: "2024" }, { value: "2025", label: "2025" }, { value: "2026", label: "2026", disabled: "După sfârșitul perioadei." }]} />
          </StaticPopover>
        </Cell>
      </div>
      <div className="kd-gap" />
      <Cap>semnal (în bandă): tot grupul · ales · hover · focus</Cap>
      <Pills label="Semnal" value="split" options={SIGNALS.map(option => option.value === "december" ? { ...option, className: "is-hover" } : option.value === "fast" ? { ...option, className: "is-focus" } : option)} />
      <Live><Pills label="Semnal" value={signal} onChange={value => setSignal(value)} options={SIGNALS} /></Live>
    </Section>

    <PeriodSection />
    <EntitySection />
    <AnswerSections />

    <Popover open={!!current} anchor={win?.anchor ?? null} onClose={close} title={win ? TITLES[win.id] : ""} wide={!!current?.wide} {...(current?.tip ? { tip: current.tip } : {})} foot={current?.foot}>
      {current?.body}
    </Popover>
  </div>;
}

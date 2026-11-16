"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SignalInstance, SignalPage, SignalRiskGroup } from "@/lib/signals";
import type { RiskGroupSort } from "@/lib/marts";
import { historicFact } from "@/lib/ask/historic";
import { inactiveIncludedWords, inactiveLeftOutWords, signalListHeads, underIncludedWords, underLeftOutWords } from "@/lib/signal-list-words";
import { parseSignalState, signalUrl, type SignalState } from "@/lib/signals-shared";
import { FLAG_META, flagLabel } from "@/lib/flags";
import { COUNTIES } from "@/lib/counties";
import { awardValueLabel, riskEvidenceLine, signalPeriodLabel } from "@/lib/risk-presentation";
import { RISK_BAND_CLASS, RISK_CRITERIA, riskBand, riskLabel, riskPoints, riskScoreText, type RiskCriterion } from "@/lib/risk-score";
import { cleanName, countyLabel, formatExactDecimal, formatInt, formatRon } from "@/lib/format";
import EntityName from "@/components/EntityName";
import Term from "@/components/Term";
import { G, Ghost, rankWidth } from "@/components/ghost/Ghost";
import { FloatStatus } from "@/components/ghost/client";
import DiscoverNav from "@/components/discover/DiscoverNav";
import DiscoverPager from "@/components/discover/DiscoverPager";
import SignalDialog from "./SignalDialog";
import { caseMeter } from "./CaseMeter";

const groups: [string, string[]][] = [
  ["Praguri și calendar", ["da_split", "da_round", "da_above_ceiling", "da_year_end"]],
  ["Concentrarea achizițiilor", ["da_concentration", "da_dependence", "award_concentration", "award_dependence"]],
  ["Proceduri și oferte", ["award_no_competition", "award_single_bid", "award_calloffs_over_ceiling"]],
  ["Firme și legături", ["da_capacity", "da_first_month", "da_first_month_buyer", "fin_tiny_staff", "fin_public_reliance", "net_shared_admin"]],
];
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const sorts: [RiskGroupSort, string][] = [["cri", "După risc"], ["flags", "După numărul de tipare"], ["das", "După achiziții directe"], ["total", "După valoare"], ["name", "După nume"]];
/** The phone's one select (UX audit Z6-20): each order in its usual direction, and the current one if it was turned. */
function sortOptions(sort: RiskGroupSort, dir: "asc" | "desc"): [string, string][] {
  const words = (s: RiskGroupSort, d: "asc" | "desc") => `${sorts.find(([v]) => v === s)![1]} ${s === "name" ? (d === "asc" ? "A–Z" : "Z–A") : d === "asc" ? "↑" : "↓"}`;
  const base = sorts.map(([s]) => [s, s === "name" ? "asc" : "desc"] as const);
  const all = base.some(([s, d]) => s === sort && d === dir) ? base : [...base, [sort, dir] as const];
  return all.map(([s, d]) => [`${s}:${d}`, words(s, d)]);
}
const scopeKey = (s: SignalState) => `${s.role}:${s.county ?? ""}:${s.entity ?? ""}`;
/** One entity's page for a pattern (the case page). */
const caseUrl = (code: string, role: SignalState["role"], entity: string) => signalUrl(parseSignalState({ tip: code, rol: role, ent: entity }));
function Entity({ id, name }: { id: string | null; name: string | null }) { return id ? <Link prefetch={false} href={`/entitati/${id}`}>{cleanName(name)}</Link> : <>{cleanName(name)}</>; }
function TypeChooser({ code, role, counts, choose, close }: { code: string; role: SignalState["role"]; counts: Record<string, number>; choose: (c: string) => void; close: () => void }) {
  const [search, setSearch] = useState("");
  let found = 0;
  return <SignalDialog title="Ce vrei să verifici?" subtitle="Numerele sunt apariții, nu entități unice." onClose={close}>
    <div className="sg-type-search"><label className="sr-only" htmlFor="sg-type-search">Caută un tip de semnal</label><input autoFocus id="sg-type-search" type="search" placeholder="Caută: prag, oferte, salariați…" value={search} onChange={e => setSearch(e.target.value)}/></div>
    <div className="sg-type-options">{groups.map(([label, codes]) => {
      const visible = codes.filter(c => fold(`${flagLabel(c)} ${FLAG_META[c]!.title} ${FLAG_META[c]!.short}`).includes(fold(search)));
      found += visible.length;
      return visible.length ? <section key={label}><h3>{label}</h3>{visible.map(c => {
        const m = FLAG_META[c]!, exclusive = m.subject === "authority" || m.subject === "supplier", compatible = !exclusive || m.subject === role;
        return <button key={c} className="sg-type-option" aria-pressed={code === c} onClick={() => choose(c)}><span><strong>{flagLabel(c)}</strong><small>{exclusive ? (m.subject === "supplier" ? "Firme" : "Autorități") : "Autorități și firme"} · {c === "da_capacity" || c.startsWith("fin_") ? "achiziții și bilanțuri" : c.startsWith("da_first_month") ? "achiziții directe și ONRC" : c.startsWith("da_") ? "achiziții directe" : c.startsWith("award_") ? "proceduri" : "achiziții și ONRC"}</small></span>{compatible && counts[c] !== undefined && <span className="sg-type-count">{formatInt(counts[c])}</span>}</button>;
      })}</section> : null;
    })}{found === 0 && <p className="sg-no-types">Niciun tip găsit. Încearcă „prag” sau „oferte”.</p>}</div>
  </SignalDialog>;
}
function County({ value, role, onChange, id }: { value: string | null; role: SignalState["role"]; onChange: (value: string | null) => void; id: string }) {
  return <label htmlFor={id}><span className="sg-label">{role === "authority" ? "Județul instituției" : "Județul firmei"}</span><select id={id} value={value ?? ""} onChange={e => onChange(e.target.value || null)}><option value="">Toate județele</option>{value && !COUNTIES.includes(value) && <option>{value}</option>}{COUNTIES.map(c => <option key={c}>{c}</option>)}</select></label>;
}
export default function SignalsExplorer({ state, signals, risk, counts, distribution, freshness, error }: {
  state: SignalState; signals: SignalPage | null; risk: SignalRiskGroup | null;
  counts: Record<string, number>; distribution: { bin: number; n: number }[]; freshness: ReactNode; error?: string | undefined;
}) {
  const router = useRouter(), [pending, startTransition] = useTransition();
  const [requested, setRequested] = useState(state), [dialog, setDialog] = useState<"type" | null>(null);
  const [notice, setNotice] = useState("");
  // In motion (owner, 6 November 2026): at first view the pictures of the rows on screen grow from 0, top to bottom, and
  // the histogram's bars rise left to right. After a filter, a page or the sort (same tab) the new rows enter shorter and
  // together, the rows that stay keep their picture and the histogram's bars change height in place.
  const [update, setUpdate] = useState(false);
  const memory = useRef<Partial<Record<SignalState["view"], SignalState>>>({}), resultsRef = useRef<HTMLElement>(null), focusResults = useRef<false | "focus" | "scroll">(false);
  const active = pending ? requested : state, key = signalUrl(state), code = active.code, meta = FLAG_META[code]!;
  // A filter, a page or the sort keep the list in place, dimmed; only the other tab (another kind of row) is a ghost.
  const reshaping = pending && requested.view !== state.view;
  const total = signals?.total ?? risk?.total ?? 0, criteria = RISK_CRITERIA[active.role];
  // Another page of the list: back to its top only when that top was scrolled past at the click (the pager under the
  // list); from the pager above it the page stays still (owner, 13 November 2026: it scrolled down on every page).
  useEffect(() => {
    if (pending || !focusResults.current) return;
    if (focusResults.current === "scroll") resultsRef.current?.scrollIntoView({ block: "start" });
    resultsRef.current?.focus({ preventScroll: true });
    focusResults.current = false;
  }, [pending, key]);
  function navigate(patch: Partial<SignalState>, scroll = false) {
    const href = signalUrl(active, patch), next = parseSignalState(Object.fromEntries(new URL(href, "http://local").searchParams));
    setNotice(next.role !== active.role && !patch.role ? `Acest semnal se calculează pentru ${next.role === "supplier" ? "firme" : "autorități"}. Selecția a fost actualizată.` : next.code !== active.code && patch.role ? "Tipul semnalului a fost schimbat pentru rolul ales." : "");
    setRequested(next); setDialog(null); setUpdate(next.view === active.view);
    const header = document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0;
    focusResults.current = !scroll ? false : (resultsRef.current?.getBoundingClientRect().top ?? 0) < header ? "scroll" : "focus";
    startTransition(() => router.push(href, { scroll: false }));
  }
  function switchView(view: SignalState["view"]) {
    if (view === active.view) return;
    memory.current[active.view] = active;
    const previous = memory.current[view], same = previous && scopeKey(previous) === scopeKey(active);
    navigate({ view, page: same ? previous.page : 0, criteria: view === "cri" && same ? previous.criteria : null,
      band: view === "cri" && same ? previous.band : null, ...(view === "cri" && same ? { sort: previous.sort, dir: previous.dir, inactive: previous.inactive } : {}) });
  }
  // The count and the pages, above and under the rows: the pager of every „Descoperă” page (UX audit Z6-14).
  function toolbar(bottom = false) {
    return <DiscoverPager page={state.page} pageSize={10} total={total} unit={active.view === "cri" ? ["entitate", "entități"] : ["caz", "cazuri"]} onPage={page => navigate({ page }, true)} always bottom={bottom} className="sg-toolbar"
      extra={<>{!bottom && active.view === "signals" && meta.subject === "award" && <Term id="aparitie-anunt" tip />}</>} />;
  }
  /**
   * What the list leaves out by default, with the way back in, under its count (owner, 16 November 2026): in the ranking
   * the inactive profiles, as Întreabă's rankings by risk (lib/ask/historic.ts). A real link; the click stays in the page.
   */
  function leftOutLine() {
    const patch: Partial<SignalState> | null = active.view === "cri" && risk?.inactive ? { inactive: !active.inactive }
      : active.view === "signals" && code === "da_split" && signals?.under ? { under: !active.under } : null;
    if (!patch) return null;
    const included = "inactive" in patch ? active.inactive : active.under;
    const words = "inactive" in patch ? (included ? inactiveIncludedWords : inactiveLeftOutWords)(risk!.inactive) : (included ? underIncludedWords : underLeftOutWords)(signals!.under!);
    return <p className="sg-left-out">{words}{" "}
      <a href={signalUrl(active, patch)} onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); navigate(patch); }}>{included ? "Scoate-le" : "Include-le"}</a></p>;
  }
  // What every row of the page would repeat is said once (UX audit Z6-17): the whole period, under the description; the
  // value's kind and the partner's role in a head over the columns (a line on a phone); a note that is the same on every row.
  const listRows = signals?.rows ?? [];
  const allPeriod = listRows.length > 0 && listRows.every(r => r.period === "all");
  const noteOf = (fi: SignalInstance) => caseMeter(fi.flagCode, fi.evidence)?.note ?? riskEvidenceLine(fi.flagCode, fi.evidence) ?? "";
  const sameNote = listRows.length > 1 && listRows.every(r => noteOf(r) === noteOf(listRows[0]!));
  const heads = signalListHeads(code, active.role);
  /**
   * The ranking is ordered from its head, as the site's other tables (UX audit Z6-20): a column's first press orders by
   * it in its usual direction (the name A–Z, the others largest first), a second press turns it (▾/▴).
   */
  function rankHead() {
    const col = (sort: RiskGroupSort, label: string, right = false) => {
      const on = active.sort === sort, first = sort === "name" ? "asc" : "desc";
      const dir = on ? (active.dir === "asc" ? "desc" : "asc") : first;
      return <button type="button" className={`sg-sort${on ? " on" : ""}${right ? " r" : ""}`} aria-pressed={on}
        aria-label={`Ordonează după ${label.toLowerCase()}, ${sort === "name" ? (dir === "asc" ? "de la A la Z" : "de la Z la A") : dir === "asc" ? "crescător" : "descrescător"}`}
        onClick={() => navigate({ sort, dir })}>{label}<span aria-hidden="true">{on ? (active.dir === "asc" ? "▴" : "▾") : "↕"}</span></button>;
    };
    return <div className="sg-rank-head" role="group" aria-label="Ordonează lista">
      <span className="c">{col("name", active.role === "authority" ? "Instituția" : "Firma")}<span aria-hidden="true">·</span>{col("das", "Achiziții directe")}<span aria-hidden="true">·</span>{col("total", "Valoare")}</span>
      <span className="c">{col("flags", "Tipare")}</span>
      <span className="c r">{col("cri", "Scor", true)}</span><span />
    </div>;
  }
  /** A case of the list (owner, 6 November 2026): its picture and number; the whole row opens the case page. */
  function signalRow(fi: SignalInstance, i: number) {
    const meter = caseMeter(fi.flagCode, fi.evidence);
    const observation = riskEvidenceLine(fi.flagCode, fi.evidence) ?? "Detaliile observației nu sunt disponibile în această versiune.";
    const href = fi.entityId ? `${caseUrl(fi.flagCode, state.role, fi.entityId)}#caz-${fi.id}` : `/semnale/${fi.id}`;
    const partnerIsSupplier = state.role === "authority";
    return <article className="sg-result sg-case-row" key={fi.id} style={{ "--i": i } as CSSProperties}>
      <div className="sg-entity">
        <div className="sg-entity-name"><EntityName id={fi.entityId} role={state.role}>{cleanName(fi.entityName)}</EntityName></div>
        <p className="sg-meta">{[countyLabel(fi.entityCounty), allPeriod ? null : signalPeriodLabel(fi.period, fi.evidence).replace(/^Perioada calculului: /, "")].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="sg-partner-col">
        {fi.partnerName && <div className="sg-partner"><EntityName id={fi.partnerId} role={partnerIsSupplier ? "supplier" : "authority"}>{cleanName(fi.partnerName)}</EntityName></div>}
        {fi.subjectType === "award" && <div className="sg-partner">{fi.winners.length ? fi.winners.slice(0, 2).map(w => <div key={w.entityId}><EntityName id={w.entityId} role="supplier">{cleanName(w.name)}</EntityName></div>) : "Câștigător neidentificat în date."}{fi.winners.length > 2 && <small> și încă {fi.winners.length - 2}</small>}</div>}
        {!sameNote && <p className="sg-meta">{meter ? meter.note : observation}</p>}
      </div>
      {/* the picture is a way into the case too; its figures show on hover, or with the row's link focused */}
      <div className="sg-meter-col">{meter?.bar && <Link href={href} className="sg-meter-hit" tabIndex={-1} aria-hidden="true">{meter.bar}{meter.tip.length > 0 && <span className="sg-tip" id={`sg-tip-${fi.id}`}>{meter.tip.map((line, k) => <span key={k}>{line}</span>)}</span>}</Link>}</div>
      <div className="sg-amount"><strong>{fi.totalExact === null ? "Necunoscută" : `${formatExactDecimal(fi.totalExact)} lei`}</strong>{fi.subjectType === "award" && <small>{awardValueLabel(fi.evidence)}</small>}</div>
      <div className={`sg-x${(meter?.value.length ?? 0) > 8 ? " long" : ""}${meter?.under ? " under" : ""}`}>{meter?.value ?? ""}</div>
      <Link href={href} className="sg-open" aria-describedby={meter?.bar && meter.tip.length ? `sg-tip-${fi.id}` : undefined} aria-label={`Deschide cazul: ${cleanName(fi.entityName)}${fi.partnerName ? `, ${cleanName(fi.partnerName)}` : ""}`}><span aria-hidden="true">→</span></Link>
    </article>;
  }
  const distTotal = distribution.reduce((n, d) => n + d.n, 0), distNone = distribution.find(d => d.bin === 0)?.n ?? 0;
  // The risk score's tenths with patterns (1–9, 10–19 … 90–100; 0 is "fără niciun tipar"); a bar selects its band.
  const bins = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90].map(bin => ({ bin, n: distribution.find(d => d.bin === bin)?.n ?? 0 }));
  const distMax = Math.max(1, ...bins.map(b => b.n));
  const binTo = (bin: number) => bin === 90 ? 100 : bin === 1 ? 10 : bin + 10;
  const binLabel = (bin: number) => `${bin}–${bin === 90 ? 100 : binTo(bin) - 1}`;
  const binOn = (bin: number) => active.band !== null && Math.round(active.band.from * 100) === bin && Math.round(active.band.to * 100) === binTo(bin);
  return <div className="sg-explorer">
    <DiscoverNav current="semnale" />
    <header className="sg-heading"><div className="sg-title"><h1>Semnale</h1><Term id="semnal" tip /></div></header>
    <div className="sg-freshness">{freshness}</div>
    <nav className="sg-tabs" aria-label="Vizualizarea semnalelor"><button onClick={() => switchView("signals")} aria-current={active.view === "signals" ? "page" : undefined}>Cazuri, pe tipar</button><button onClick={() => switchView("cri")} aria-current={active.view === "cri" ? "page" : undefined}>Clasament după risc</button></nav>
    <section className={`sg-filters${active.view === "cri" ? " sg-cri-filters" : ""}`} aria-label="Filtre">
      {active.view === "signals" && <div className="sg-type-field"><span className="sg-label">Tip de semnal</span><button className="sg-type-button" onClick={() => setDialog("type")} aria-haspopup="dialog"><span>{flagLabel(code)}</span><span className="sg-chevron"/></button></div>}
      <div className="sg-desktop-filter"><span className="sg-label">Cine</span><div className="sg-segmented">{(["authority", "supplier"] as const).map(role => <button key={role} aria-pressed={active.role === role} onClick={() => navigate({ role })}>{role === "authority" ? "Instituții" : "Firme"}</button>)}</div></div>
      <div className="sg-desktop-filter"><County id="sg-county" role={active.role} value={active.county} onChange={county => navigate({ county })}/></div>
    </section>
    {notice && <p className="sg-notice" role="status">{notice}</p>}
    {/* The pattern's name is said once, by the field above, written as the section's title; its h2 stays for the outline (UX audit Z6-15). */}
    <div className="sg-context"><div><h2 className={active.view === "signals" ? "sr-only" : undefined}>{active.view === "signals" ? flagLabel(code) : active.role === "authority" ? "Instituțiile după risc" : "Firmele după risc"}</h2><p>{active.view === "cri" ? `Riscul adună ${criteria.length} tipare din achizițiile directe, de la 0 la 100. Nu este o probabilitate de corupție.` : `${meta.short}${allPeriod ? " Pe toată perioada disponibilă la calcul." : ""}`}</p></div><Link href={`/metodologie#${active.view === "cri" ? "indice" : code}`}>Criterii și limite →</Link></div>
    {/* While a change is on its way the status is the floating one (same view) or the ghost's (another view). */}
    <p className="sr-only" role="status" aria-live="polite">{pending ? "" : error ? "Rezultatele nu s-au încărcat." : `${formatInt(total)} ${active.view === "cri" ? "entități" : "cazuri"}. Pagina ${state.page + 1}.`}</p>
    <section ref={resultsRef} className={`sg-results${update ? " sg-upd" : ""}${pending && !reshaping ? " g-stale" : ""}`} tabIndex={-1} aria-label="Rezultate" aria-busy={pending || undefined} data-chart>
      {reshaping ? <ResultsGhost state={requested}/> : error ? <div className="sg-empty" role="alert"><h3>Rezultatele nu s-au încărcat</h3><p>{error}</p><button className="sg-primary" onClick={() => { setRequested(state); startTransition(() => router.refresh()); }}>Reîncearcă</button></div> : <>
        {active.view === "cri" && <><div className="sg-cri-overview"><div><h3>{formatInt(distTotal - distNone)} {active.role === "authority" ? "autorități" : "firme"} cu tipare</h3><p>din {formatInt(distTotal)} cu minimum 10 achiziții directe · {formatInt(distNone)} fără niciun tipar</p></div><div className="sg-histogram" aria-label="Profilurile pe intervale de risc">{bins.map(({ bin, n }, i) => <button key={bin} onClick={() => navigate({ criteria: null, band: binOn(bin) ? null : { from: bin / 100, to: binTo(bin) / 100 } })} aria-pressed={binOn(bin)} aria-label={`Risc ${binLabel(bin)} din 100, ${formatInt(n)} profiluri`}><span>{formatInt(n)}</span><span className={`sg-bar sg-bar-${riskBand(bin)} cm-y cm-tw`} style={{ height: `${Math.max(2, n / distMax * 70)}px`, "--i": i } as CSSProperties}/><span>{bin}<span className="sg-bin-to">–{bin === 90 ? 100 : binTo(bin) - 1}</span></span></button>)}</div></div><div className="sg-cri-controls"><span>{active.criteria !== null ? `${active.criteria} ${active.criteria === 1 ? "tipar" : "tipare"}` : active.band ? `Risc ${Math.round(active.band.from * 100)}–${Math.round(active.band.to * 100) >= 100 ? 100 : Math.round(active.band.to * 100) - 1}` : "Toate valorile riscului"}{(active.criteria !== null || active.band) && <button onClick={() => navigate({ criteria: null, band: null })}>Arată toate</button>}</span>{/* On a phone the cards have no head: one select, the direction in its words (UX audit Z6-20). */}
          <label className="sg-sort-phone">Ordonează <select value={`${active.sort}:${active.dir}`} onChange={e => { const [sort, dir] = e.target.value.split(":") as [RiskGroupSort, "asc" | "desc"]; navigate({ sort, dir }); }}>
            {sortOptions(active.sort, active.dir).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div></>}
        {toolbar()}
        {leftOutLine()}
        {active.view === "cri" && total > 0 && rankHead()}
        {total > 0 ? <>
          {signals && <>
            <div className="sg-case-head" aria-hidden="true"><span>{heads.entity}</span><span>{heads.partner}</span><span>{heads.meter}</span><span className="r">{heads.amount}</span><span /><span /></div>
            {/* On a phone, in place of the head: once, beside the figures (the period is in the description above). */}
            {!code.startsWith("award_") && <p className="sg-list-line">Valori înregistrate, nu plăți.</p>}
          </>}
          {signals?.rows.map(signalRow)}
          {risk?.rows.map((r, row) => {
            const points = riskPoints(r.parts ?? {}, r.score);
            const parts = (Object.keys(points) as RiskCriterion[]).filter(c => (points[c] ?? 0) > 0).sort((a, b) => (points[b] ?? 0) - (points[a] ?? 0));
            const href = parts[0] ? caseUrl(parts[0], active.role, r.entityId) : `/entitati/${r.entityId}`;
            return <article className="sg-result sg-rank-row" key={r.entityId} style={{ "--i": row } as CSSProperties}>
              <div className="sg-entity"><div className="sg-entity-name"><EntityName id={r.entityId} role={active.role}>{cleanName(r.name)}</EntityName>
                {/* Listed when asked for: an inactive profile says so, its last month, the rest on hover or a tap (historicFact). */}
                {r.historic !== undefined && (() => { const f = historicFact(r.historic); return <Term tip className="sg-inactive" title={f.tip.title} text={f.tip.text}>{f.text}</Term>; })()}</div><p className="sg-meta">{countyLabel(r.county) ?? "Județ neprecizat"} · {formatInt(r.nDas)} achiziții directe · {formatRon(r.totalRon)}</p></div>
              <div className="sg-comp-col">{parts.length ? <>
                {/* The composition is revealed as one bar, with a clip (never scaled: its numbers stay their size). */}
                <div className="sg-comp cm-x" role="img" aria-label={`Scorul ${formatInt(r.score)}: ${parts.map(c => `${flagLabel(c)} ${points[c]}`).join(", ")}`}>{parts.map((c, i) => <i key={c} className={`c${Math.min(i, 4)} cm-tw`} style={{ width: `${points[c]}%` }}><span>{formatInt(points[c] ?? 0)}</span></i>)}</div>
                <p className="sg-meta">{parts.map(flagLabel).join(" · ")}</p></> : <p className="sg-meta">{r.flags.length ? r.flags.map(flagLabel).join(" · ") : "fără tipare"}</p>}</div>
              <div className="sg-score"><strong className={`cri-pill ${RISK_BAND_CLASS[riskBand(r.score)]}`}>{riskScoreText(r.score)}</strong><small>{riskLabel(r.score)}</small></div>
              <Link href={href} className="sg-open" aria-label={`Deschide tiparele: ${cleanName(r.name)}`}><span aria-hidden="true">→</span></Link>
            </article>;
          })}
          {toolbar(true)}</> : <div className="sg-empty"><h3>Niciun rezultat pentru această selecție</h3><p>Nu există {active.view === "signals" ? "apariții calculate" : "entități eligibile"} pentru {active.role === "authority" ? "autorități" : "firme"}{active.county ? ` din ${active.county}` : " în selecția curentă"}.</p>{active.county ? <button className="sg-primary" onClick={() => navigate({ county: null })}>Caută în toate județele</button> : active.view === "cri" ? <button className="sg-primary" onClick={() => navigate({ criteria: null, band: null })}>Arată toate valorile riscului</button> : <button className="sg-primary" onClick={() => setDialog("type")}>Alege alt tip de semnal</button>}</div>}
      </>}
    </section>
    {pending && !reshaping && <FloatStatus>Se încarcă rezultatele…</FloatStatus>}
    <footer className="sg-foot"><p>Un semnal nu este o dovadă de ilegalitate. Valorile pot acoperi aceleași achiziții și nu se adună.</p></footer>
    {dialog === "type" && <TypeChooser code={code} role={active.role} counts={pending ? {} : counts} choose={code => navigate({ code })} close={() => setDialog(null)}/>}
  </div>;
}
/** The bar above and under the rows: the count and the pager (min-height keeps it as tall as the real one). */
function ToolbarGhost({ bottom = false }: { bottom?: boolean }) {
  return <div className={`dsc-pg sg-toolbar${bottom ? " dsc-pg-bottom" : ""}`} aria-hidden="true"><p className="dsc-pg-count"><G.Line inline w="16ch"/></p><span className="dsc-pg-pages dsc-pg-ghost"><G.Line inline w="11rem"/></span></div>;
}
/**
 * The results of a tab that is not on screen yet ("Cazuri, pe tipar" ↔ "Clasament după risc"): that view's real rows and
 * classes, a page of 10, its controls with the requested values. Shown only after 120 ms, so a quick answer never flashes it.
 */
function ResultsGhost({ state }: { state: SignalState }) {
  const cri = state.view === "cri";
  return <Ghost name="semnale-results" label="Se încarcă rezultatele…" wait="client">
    {cri && <><div className="sg-cri-overview" aria-hidden="true"><div><h3><G.Line w="62%"/></h3><p><G.Line w="88%"/><G.Line w="40%" only="phone"/></p></div>
      <div className="sg-histogram"><svg className="sg-hist-ghost" viewBox="0 0 100 118" preserveAspectRatio="none">{[30, 46, 58, 64, 52, 40, 28, 18, 10, 5].map((h, i) => <rect key={i} className="g-svg" x={i * 10 + 1.5} y={96 - h} width="7" height={h} rx="1"/>)}</svg></div></div>
      <div className="sg-cri-controls" aria-hidden="true" inert><span>{state.criteria !== null || state.band ? <G.Line inline w="12ch"/> : "Toate valorile riscului"}</span><label className="sg-sort-phone">Ordonează <select defaultValue={`${state.sort}:${state.dir}`}>{sortOptions(state.sort, state.dir).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div></>}
    <ToolbarGhost/>
    {cri
      ? <G.Rows n={10} as="article" className="sg-result sg-rank-row" cells={i => <>
        {/* On a phone the ranking's long names often take two lines: the ghost takes the average. */}
        <div className="sg-entity"><div className="sg-entity-name"><G.Line w={rankWidth(i, 78, 5, 40)}/><G.Line w="36%" only="phone"/></div><p className="sg-meta"><G.Line w="72%"/><G.Line w="38%" only="phone"/></p></div>
        <div className="sg-comp-col"><div className="sg-comp"/><p className="sg-meta"><G.Line w="58%"/></p></div>
        <div className="sg-score"><strong className="cri-pill risk-slab"><G.Line inline w="5ch"/></strong><small><G.Line inline w="7ch"/></small></div>
        <span className="sg-open"/></>}/>
      : <G.Rows n={10} as="article" className="sg-result sg-case-row" cells={i => <>
        <div className="sg-entity"><div className="sg-entity-name"><G.Line w={rankWidth(i, 78, 5, 40)}/></div><p className="sg-meta"><G.Line w="64%"/></p></div>
        <div className="sg-partner-col"><div className="sg-partner"><G.Line w="70%"/></div><p className="sg-meta"><G.Line w="88%"/></p></div>
        <div className="sg-meter-col"><span className="sg-meter"/></div>
        <div className="sg-amount"><strong><G.Line inline w="10ch"/></strong><small><G.Line inline w="12ch"/></small></div>
        <div className="sg-x"><G.Line inline w="2.4ch"/></div>
        <span className="sg-open"/></>}/>}
    <ToolbarGhost bottom/>
  </Ghost>;
}

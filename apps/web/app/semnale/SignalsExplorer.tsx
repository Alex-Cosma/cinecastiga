"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SignalInstance, SignalPage } from "@/lib/signals";
import type { RiskEntity, RiskGroupSort } from "@/lib/marts";
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
import SignalDialog from "./SignalDialog";
import { caseMeter } from "./CaseMeter";

const groups: [string, string[]][] = [
  ["Praguri și calendar", ["da_split", "da_round", "da_above_ceiling", "da_year_end"]],
  ["Concentrarea achizițiilor", ["da_concentration", "da_dependence", "award_concentration", "award_dependence"]],
  ["Proceduri și oferte", ["award_no_competition", "award_single_bid", "award_calloffs_over_ceiling"]],
  ["Firme și legături", ["da_capacity", "fin_tiny_staff", "fin_public_reliance", "net_shared_admin"]],
];
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const sorts: [RiskGroupSort, string][] = [["cri", "După risc"], ["flags", "După numărul de tipare"], ["das", "După achiziții directe"], ["total", "După valoare"], ["name", "După nume"]];
const scopeKey = (s: SignalState) => `${s.role}:${s.county ?? ""}:${s.entity ?? ""}`;
/** One entity's page for a pattern (the case page). */
const caseUrl = (code: string, role: SignalState["role"], entity: string) => signalUrl(parseSignalState({ tip: code, rol: role, ent: entity }));
function Arrow({ back = false }: { back?: boolean }) { return <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><path d={back ? "m14 5-7 7 7 7" : "m10 5 7 7-7 7"} fill="none" stroke="currentColor" strokeWidth="1.7"/></svg>; }
function Entity({ id, name }: { id: string | null; name: string | null }) { return id ? <Link prefetch={false} href={`/entitati/${id}`}>{cleanName(name)}</Link> : <>{cleanName(name)}</>; }
function Pager({ page, total, navigate }: { page: number; total: number; navigate: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / 10));
  const kept = [...new Set([0, Math.max(0, page - 1), page, Math.min(pages - 1, page + 1), pages - 1])].sort((a, b) => a - b);
  return <nav className="sg-pager" aria-label="Pagini de rezultate">
    <button disabled={page === 0} aria-label="Pagina anterioară" onClick={() => navigate(page - 1)}><Arrow back/></button>
    {kept.map((p, i) => <span className="sg-page-slot" key={p}>{i > 0 && p - kept[i - 1]! > 1 && <span className="sg-gap">…</span>}<button aria-label={`Pagina ${p + 1}`} aria-current={p === page ? "page" : undefined} className={p === page ? "selected" : ""} onClick={() => navigate(p)}>{formatInt(p + 1)}</button></span>)}
    <button disabled={page + 1 === pages} aria-label="Pagina următoare" onClick={() => navigate(page + 1)}><Arrow/></button>
  </nav>;
}
function TypeChooser({ code, role, counts, choose, close }: { code: string; role: SignalState["role"]; counts: Record<string, number>; choose: (c: string) => void; close: () => void }) {
  const [search, setSearch] = useState("");
  let found = 0;
  return <SignalDialog title="Ce vrei să verifici?" onClose={close}>
    <div className="sg-type-search"><label className="sr-only" htmlFor="sg-type-search">Caută un tip de semnal</label><input autoFocus id="sg-type-search" type="search" placeholder="Caută: prag, oferte, salariați…" value={search} onChange={e => setSearch(e.target.value)}/></div>
    <div className="sg-type-options">{groups.map(([label, codes]) => {
      const visible = codes.filter(c => fold(`${flagLabel(c)} ${FLAG_META[c]!.title} ${FLAG_META[c]!.short}`).includes(fold(search)));
      found += visible.length;
      return visible.length ? <section key={label}><h3>{label}</h3>{visible.map(c => {
        const m = FLAG_META[c]!, exclusive = m.subject === "authority" || m.subject === "supplier", compatible = !exclusive || m.subject === role;
        return <button key={c} className="sg-type-option" aria-pressed={code === c} onClick={() => choose(c)}><span><strong>{flagLabel(c)}</strong><small>{exclusive ? (m.subject === "supplier" ? "Firme" : "Autorități") : "Autorități și firme"} · {c === "da_capacity" || c.startsWith("fin_") ? "achiziții și bilanțuri" : c.startsWith("da_") ? "achiziții directe" : c.startsWith("award_") ? "proceduri" : "achiziții și ONRC"}</small></span>{compatible && counts[c] !== undefined && <span className="sg-type-count">{formatInt(counts[c])}</span>}</button>;
      })}</section> : null;
    })}{found === 0 && <p className="sg-no-types">Niciun tip găsit. Încearcă „prag” sau „oferte”.</p>}</div>
    <p className="sg-dialog-note">Apariții, nu entități unice.</p>
  </SignalDialog>;
}
function County({ value, role, onChange, id }: { value: string | null; role: SignalState["role"]; onChange: (value: string | null) => void; id: string }) {
  return <label htmlFor={id}><span className="sg-label">{role === "authority" ? "Județul instituției" : "Județul firmei"}</span><select id={id} value={value ?? ""} onChange={e => onChange(e.target.value || null)}><option value="">Toate județele</option>{value && !COUNTIES.includes(value) && <option>{value}</option>}{COUNTIES.map(c => <option key={c}>{c}</option>)}</select></label>;
}
function MobileFilters({ state, apply, close }: { state: SignalState; apply: (patch: Partial<SignalState>) => void; close: () => void }) {
  const [role, setRole] = useState(state.role), [county, setCounty] = useState(state.county);
  return <SignalDialog title="Restrânge rezultatele" onClose={close}><form className="sg-mobile-form" onSubmit={e => { e.preventDefault(); apply({ ...(role !== state.role ? { role } : {}), county }); }}><label><span className="sg-label">Cine</span><select value={role} onChange={e => setRole(e.target.value as SignalState["role"])}><option value="authority">Instituții</option><option value="supplier">Firme</option></select></label><County id="sg-mobile-county" value={county} role={role} onChange={setCounty}/><button className="sg-primary" type="submit">Arată rezultatele</button></form></SignalDialog>;
}
export default function SignalsExplorer({ state, signals, risk, counts, distribution, freshness, error }: {
  state: SignalState; signals: SignalPage | null; risk: { rows: RiskEntity[]; page: number; total: number; pageSize: number } | null;
  counts: Record<string, number>; distribution: { bin: number; n: number }[]; freshness: ReactNode; error?: string | undefined;
}) {
  const router = useRouter(), [pending, startTransition] = useTransition();
  const [requested, setRequested] = useState(state), [dialog, setDialog] = useState<"type" | "filters" | null>(null);
  const [notice, setNotice] = useState("");
  // In motion (owner, 6 November 2026): at first view the pictures of the rows on screen grow from 0, top to bottom, and
  // the histogram's bars rise left to right. After a filter, a page or the sort (same tab) the new rows enter shorter and
  // together, the rows that stay keep their picture and the histogram's bars change height in place.
  const [update, setUpdate] = useState(false);
  const memory = useRef<Partial<Record<SignalState["view"], SignalState>>>({}), resultsRef = useRef<HTMLElement>(null), focusResults = useRef(false);
  const active = pending ? requested : state, key = signalUrl(state), code = active.code, meta = FLAG_META[code]!;
  // A filter, a page or the sort keep the list in place, dimmed; only the other tab (another kind of row) is a ghost.
  const reshaping = pending && requested.view !== state.view;
  const total = signals?.total ?? risk?.total ?? 0, criteria = RISK_CRITERIA[active.role];
  useEffect(() => { if (!pending && focusResults.current) { resultsRef.current?.scrollIntoView({ block: "start" }); resultsRef.current?.focus({ preventScroll: true }); focusResults.current = false; } }, [pending, key]);
  function navigate(patch: Partial<SignalState>, scroll = false) {
    const href = signalUrl(active, patch), next = parseSignalState(Object.fromEntries(new URL(href, "http://local").searchParams));
    setNotice(next.role !== active.role && !patch.role ? `Acest semnal se calculează pentru ${next.role === "supplier" ? "firme" : "autorități"}. Selecția a fost actualizată.` : next.code !== active.code && patch.role ? "Tipul semnalului a fost schimbat pentru rolul ales." : "");
    setRequested(next); setDialog(null); setUpdate(next.view === active.view); focusResults.current = scroll;
    startTransition(() => router.push(href, { scroll: false }));
  }
  function switchView(view: SignalState["view"]) {
    if (view === active.view) return;
    memory.current[active.view] = active;
    const previous = memory.current[view], same = previous && scopeKey(previous) === scopeKey(active);
    navigate({ view, page: same ? previous.page : 0, criteria: view === "cri" && same ? previous.criteria : null,
      band: view === "cri" && same ? previous.band : null, ...(view === "cri" && same ? { sort: previous.sort, dir: previous.dir } : {}) });
  }
  function toolbar(bottom = false) { return <div className={`sg-toolbar${bottom ? " sg-bottom-toolbar" : ""}`}><p className="sg-result-total"><strong>{formatInt(total ? state.page * 10 + 1 : 0)}–{formatInt(Math.min(total, (state.page + 1) * 10))}</strong> din {formatInt(total)} {active.view === "cri" ? "entități" : "cazuri"}{!bottom && active.view === "signals" && meta.subject === "award" && <Term id="aparitie-anunt" tip />}{active.view === "signals" && <span className="sg-result-sort">După valoare</span>}</p><Pager page={state.page} total={total} navigate={page => navigate({ page }, true)}/></div>; }
  /** A case of the list (owner, 6 November 2026): its picture and number; the whole row opens the case page. */
  function signalRow(fi: SignalInstance, i: number) {
    const meter = caseMeter(fi.flagCode, fi.evidence);
    const observation = riskEvidenceLine(fi.flagCode, fi.evidence) ?? "Detaliile observației nu sunt disponibile în această versiune.";
    const href = fi.entityId ? `${caseUrl(fi.flagCode, state.role, fi.entityId)}#caz-${fi.id}` : `/semnale/${fi.id}`;
    const partnerIsSupplier = state.role === "authority";
    return <article className="sg-result sg-case-row" key={fi.id} style={{ "--i": i } as CSSProperties}>
      <div className="sg-entity">
        <div className="sg-entity-name"><EntityName id={fi.entityId} role={state.role}>{cleanName(fi.entityName)}</EntityName></div>
        <p className="sg-meta">{[fi.subjectType === "award" ? "autoritate" : null, countyLabel(fi.entityCounty), signalPeriodLabel(fi.period, fi.evidence).replace(/^Perioada calculului: /, "")].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="sg-partner-col">
        {fi.partnerName && <div className="sg-partner"><EntityName id={fi.partnerId} role={partnerIsSupplier ? "supplier" : "authority"}>{cleanName(fi.partnerName)}</EntityName></div>}
        {fi.subjectType === "award" && <div className="sg-partner">{fi.winners.length ? fi.winners.slice(0, 2).map(w => <div key={w.entityId}><EntityName id={w.entityId} role="supplier">{cleanName(w.name)}</EntityName></div>) : "Câștigător neidentificat în date."}{fi.winners.length > 2 && <small> și încă {fi.winners.length - 2}</small>}</div>}
        <p className="sg-meta">{meter ? meter.note : observation}</p>
      </div>
      <div className="sg-meter-col">{meter?.bar}</div>
      <div className="sg-amount"><strong>{fi.totalExact === null ? "Necunoscută" : `${formatExactDecimal(fi.totalExact)} lei`}</strong><small>{fi.subjectType !== "award" ? "valoare înregistrată" : awardValueLabel(fi.evidence)}</small></div>
      <div className="sg-x">{meter?.value ?? ""}</div>
      <Link href={href} className="sg-open" aria-label={`Deschide cazul: ${cleanName(fi.entityName)}${fi.partnerName ? `, ${cleanName(fi.partnerName)}` : ""}`}><span aria-hidden="true">→</span></Link>
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
    <header className="sg-heading"><div className="sg-title"><h1>Semnale</h1><Term id="semnal" tip /></div><Link href="/metodologie" className="sg-method-link">Cum se calculează →</Link></header>
    <div className="sg-freshness">{freshness}</div>
    <nav className="sg-tabs" aria-label="Vizualizarea semnalelor"><button onClick={() => switchView("signals")} aria-current={active.view === "signals" ? "page" : undefined}>Cazuri, pe tipar</button><button onClick={() => switchView("cri")} aria-current={active.view === "cri" ? "page" : undefined}>Clasament după risc</button></nav>
    <section className={`sg-filters${active.view === "cri" ? " sg-cri-filters" : ""}`} aria-label="Filtre">
      {active.view === "signals" && <div className="sg-type-field"><span className="sg-label">Tip de semnal</span><button className="sg-type-button" onClick={() => setDialog("type")} aria-haspopup="dialog"><span>{flagLabel(code)}</span><span className="sg-chevron"/></button></div>}
      <div className="sg-desktop-filter"><span className="sg-label">Cine</span><div className="sg-segmented">{(["authority", "supplier"] as const).map(role => <button key={role} aria-pressed={active.role === role} onClick={() => navigate({ role })}>{role === "authority" ? "Instituții" : "Firme"}</button>)}</div></div>
      <div className="sg-desktop-filter"><County id="sg-county" role={active.role} value={active.county} onChange={county => navigate({ county })}/></div>
      <button className="sg-mobile-filter sg-secondary" onClick={() => setDialog("filters")}>Filtre{active.county ? " · 1" : ""}</button>
      <p className="sg-mobile-scope">{active.role === "authority" ? "Instituții" : "Firme"} · {active.county ?? "Toate județele"}</p>
    </section>
    {notice && <p className="sg-notice" role="status">{notice}</p>}
    <div className="sg-context"><div><h2>{active.view === "signals" ? flagLabel(code) : active.role === "authority" ? "Instituțiile după risc" : "Firmele după risc"}</h2><p>{active.view === "cri" ? `Riscul adună ${criteria.length} tipare din achizițiile directe, de la 0 la 100. Nu este o probabilitate de corupție.` : meta.short}</p></div><Link href={`/metodologie#${active.view === "cri" ? "indice" : code}`}>Criterii și limite →</Link></div>
    {/* While a change is on its way the status is the floating one (same view) or the ghost's (another view). */}
    <p className="sr-only" role="status" aria-live="polite">{pending ? "" : error ? "Rezultatele nu s-au încărcat." : `${formatInt(total)} ${active.view === "cri" ? "entități" : "cazuri"}. Pagina ${state.page + 1}.`}</p>
    <section ref={resultsRef} className={`sg-results${update ? " sg-upd" : ""}${pending && !reshaping ? " g-stale" : ""}`} tabIndex={-1} aria-label="Rezultate" aria-busy={pending || undefined} data-chart>
      {reshaping ? <ResultsGhost state={requested}/> : error ? <div className="sg-empty" role="alert"><h3>Rezultatele nu s-au încărcat</h3><p>{error}</p><button className="sg-primary" onClick={() => { setRequested(state); startTransition(() => router.refresh()); }}>Reîncearcă</button></div> : <>
        {active.view === "cri" && <><div className="sg-cri-overview"><div><h3>{formatInt(distTotal - distNone)} {active.role === "authority" ? "autorități" : "firme"} cu tipare</h3><p>din {formatInt(distTotal)} cu minimum 10 achiziții directe · {formatInt(distNone)} fără niciun tipar</p></div><div className="sg-histogram" aria-label="Profilurile pe intervale de risc">{bins.map(({ bin, n }, i) => <button key={bin} onClick={() => navigate({ criteria: null, band: binOn(bin) ? null : { from: bin / 100, to: binTo(bin) / 100 } })} aria-pressed={binOn(bin)} aria-label={`Risc ${binLabel(bin)} din 100, ${formatInt(n)} profiluri`}><span>{formatInt(n)}</span><span className={`sg-bar sg-bar-${riskBand(bin)} cm-y cm-tw`} style={{ height: `${Math.max(2, n / distMax * 70)}px`, "--i": i } as CSSProperties}/><span>{bin}<span className="sg-bin-to">–{bin === 90 ? 100 : binTo(bin) - 1}</span></span></button>)}</div></div><div className="sg-cri-controls"><span>{active.criteria !== null ? `${active.criteria} ${active.criteria === 1 ? "tipar" : "tipare"}` : active.band ? `Risc ${Math.round(active.band.from * 100)}–${Math.round(active.band.to * 100) >= 100 ? 100 : Math.round(active.band.to * 100) - 1}` : "Toate valorile riscului"}{(active.criteria !== null || active.band) && <button onClick={() => navigate({ criteria: null, band: null })}>Arată toate</button>}</span><div><label>Ordonează <select value={active.sort} onChange={e => navigate({ sort: e.target.value as RiskGroupSort, dir: e.target.value === "name" ? "asc" : "desc" })}>{sorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="sg-secondary" onClick={() => navigate({ dir: active.dir === "asc" ? "desc" : "asc" })}>{active.dir === "asc" ? "Crescător" : "Descrescător"}</button></div></div></>}
        {toolbar()}
        {total > 0 ? <>
          {signals?.rows.map(signalRow)}
          {risk?.rows.map((r, row) => {
            const points = riskPoints(r.parts ?? {}, r.score);
            const parts = (Object.keys(points) as RiskCriterion[]).filter(c => (points[c] ?? 0) > 0).sort((a, b) => (points[b] ?? 0) - (points[a] ?? 0));
            const href = parts[0] ? caseUrl(parts[0], active.role, r.entityId) : `/entitati/${r.entityId}`;
            return <article className="sg-result sg-rank-row" key={r.entityId} style={{ "--i": row } as CSSProperties}>
              <div className="sg-entity"><div className="sg-entity-name"><EntityName id={r.entityId} role={active.role}>{cleanName(r.name)}</EntityName></div><p className="sg-meta">{countyLabel(r.county) ?? "Județ neprecizat"} · {formatInt(r.nDas)} achiziții directe · {formatRon(r.totalRon)}</p></div>
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
    {dialog === "filters" && <MobileFilters state={active} apply={navigate} close={() => setDialog(null)}/>}
  </div>;
}
/** The bar above and under the rows: the count and the pager (min-height keeps it as tall as the real one). */
function ToolbarGhost({ bottom = false }: { bottom?: boolean }) {
  return <div className={`sg-toolbar${bottom ? " sg-bottom-toolbar" : ""}`} aria-hidden="true"><p className="sg-result-total"><G.Line inline w="16ch"/></p><G.Line inline w="11rem"/></div>;
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
      <div className="sg-cri-controls" aria-hidden="true" inert><span>{state.criteria !== null || state.band ? <G.Line inline w="12ch"/> : "Toate valorile riscului"}</span><div><label>Ordonează <select defaultValue={state.sort}>{sorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="sg-secondary">{state.dir === "asc" ? "Crescător" : "Descrescător"}</button></div></div></>}
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

"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SignalInstance, SignalPage } from "@/lib/signals";
import type { RiskEntity, RiskGroupSort } from "@/lib/marts";
import { parseSignalState, signalUrl, type SignalState } from "@/lib/signals-shared";
import { FLAG_META } from "@/lib/flags";
import { COUNTIES } from "@/lib/counties";
import { CRI_CRITERIA, riskEvidenceLine, signalPeriodLabel } from "@/lib/risk-presentation";
import { cleanName, formatExactDecimal, formatInt, formatRon } from "@/lib/format";
import ClipButton from "@/components/ClipButton";
import SignalDialog from "./SignalDialog";
import SignalSources from "./SignalSources";

const groups: [string, string[]][] = [
  ["Praguri și calendar", ["da_split", "da_round", "da_rapid", "da_year_end"]],
  ["Concentrarea achizițiilor", ["da_concentration", "da_dependence", "award_concentration", "award_dependence"]],
  ["Proceduri și oferte", ["award_no_competition", "award_single_bid"]],
  ["Firme și legături", ["fin_tiny_staff", "fin_public_reliance", "net_shared_admin"]],
];
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const sorts: [RiskGroupSort, string][] = [["cri", "După CRI"], ["flags", "După numărul de criterii"], ["das", "După achiziții directe"], ["total", "După valoare"], ["name", "După nume"]];
const scopeKey = (s: SignalState) => `${s.role}:${s.county ?? ""}`;
function Arrow({ back = false }: { back?: boolean }) { return <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><path d={back ? "m14 5-7 7 7 7" : "m10 5 7 7-7 7"} fill="none" stroke="currentColor" strokeWidth="1.7"/></svg>; }
function Entity({ id, name }: { id: string | null; name: string | null }) { return id ? <Link href={`/entitati/${id}`}>{cleanName(name)}</Link> : <>{cleanName(name)}</>; }
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
  return <SignalDialog title="Ce vrei să verifici?" description="13 tipuri de semnale, grupate după observație." onClose={close}>
    <div className="sg-type-search"><label className="sr-only" htmlFor="sg-type-search">Caută un tip de semnal</label><input autoFocus id="sg-type-search" type="search" placeholder="Caută: prag, oferte, salariați…" value={search} onChange={e => setSearch(e.target.value)}/></div>
    <div className="sg-type-options">{groups.map(([label, codes]) => {
      const visible = codes.filter(c => fold(`${FLAG_META[c]!.title} ${FLAG_META[c]!.short}`).includes(fold(search)));
      found += visible.length;
      return visible.length ? <section key={label}><h3>{label}</h3>{visible.map(c => {
        const m = FLAG_META[c]!, exclusive = m.subject === "authority" || m.subject === "supplier", compatible = !exclusive || m.subject === role;
        return <button key={c} className="sg-type-option" aria-pressed={code === c} onClick={() => choose(c)}><span><strong>{m.title}</strong><small>{exclusive ? (m.subject === "supplier" ? "Firme" : "Autorități") : "Autorități și firme"} · {c.startsWith("da_") ? "achiziții directe" : c.startsWith("award_") ? "proceduri" : c.startsWith("fin_") ? "achiziții și bilanțuri" : "achiziții și ONRC"}</small></span>{compatible && counts[c] !== undefined && <span className="sg-type-count">{formatInt(counts[c])}</span>}</button>;
      })}</section> : null;
    })}{found === 0 && <p className="sg-no-types">Niciun tip găsit. Încearcă „prag” sau „oferte”.</p>}</div>
    <p className="sg-dialog-note">Numerele arată apariții pentru rolul și județul selectat, nu entități unice. Alegerea unui tip exclusiv firmelor sau autorităților actualizează și rolul.</p>
  </SignalDialog>;
}
function County({ value, role, onChange, id }: { value: string | null; role: SignalState["role"]; onChange: (value: string | null) => void; id: string }) {
  return <label htmlFor={id}><span className="sg-label">{role === "authority" ? "Județul autorității" : "Județul firmei"}</span><select id={id} value={value ?? ""} onChange={e => onChange(e.target.value || null)}><option value="">Toate județele</option>{value && !COUNTIES.includes(value) && <option>{value}</option>}{COUNTIES.map(c => <option key={c}>{c}</option>)}</select></label>;
}
function MobileFilters({ state, apply, close }: { state: SignalState; apply: (patch: Partial<SignalState>) => void; close: () => void }) {
  const [role, setRole] = useState(state.role), [county, setCounty] = useState(state.county);
  return <SignalDialog title="Restrânge rezultatele" onClose={close}><form className="sg-mobile-form" onSubmit={e => { e.preventDefault(); apply({ ...(role !== state.role ? { role } : {}), county }); }}><label><span className="sg-label">Cine</span><select value={role} onChange={e => setRole(e.target.value as SignalState["role"])}><option value="authority">Autorități</option><option value="supplier">Firme</option></select></label><County id="sg-mobile-county" value={county} role={role} onChange={setCounty}/><button className="sg-primary" type="submit">Arată rezultatele</button></form></SignalDialog>;
}
export default function SignalsExplorer({ state, signals, risk, counts, distribution, freshness, error }: {
  state: SignalState; signals: SignalPage | null; risk: { rows: RiskEntity[]; page: number; total: number; pageSize: number } | null;
  counts: Record<string, number>; distribution: { criteria: number; n: number }[]; freshness: ReactNode; error?: string | undefined;
}) {
  const router = useRouter(), [pending, startTransition] = useTransition();
  const [requested, setRequested] = useState(state), [dialog, setDialog] = useState<"type" | "filters" | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null), [open, setOpen] = useState<{ key: string; id: string } | null>(null), [notice, setNotice] = useState("");
  const memory = useRef<Partial<Record<SignalState["view"], SignalState>>>({}), resultsRef = useRef<HTMLElement>(null), focusResults = useRef(false);
  const active = pending ? requested : state, key = signalUrl(state), code = active.code, meta = FLAG_META[code]!;
  const total = signals?.total ?? risk?.total ?? 0, criteria = CRI_CRITERIA[active.role];
  const expanded = open?.key === key ? open.id : null;
  useEffect(() => { if (!pending && focusResults.current) { resultsRef.current?.scrollIntoView({ block: "start" }); resultsRef.current?.focus({ preventScroll: true }); focusResults.current = false; } }, [pending, key]);
  function navigate(patch: Partial<SignalState>, scroll = false) {
    const href = signalUrl(active, patch), next = parseSignalState(Object.fromEntries(new URL(href, "http://local").searchParams));
    setNotice(next.role !== active.role && !patch.role ? `Acest semnal se calculează pentru ${next.role === "supplier" ? "firme" : "autorități"}. Selecția a fost actualizată.` : next.code !== active.code && patch.role ? "Tipul semnalului a fost schimbat pentru rolul ales." : "");
    setRequested(next); setOpen(null); setDialog(null); focusResults.current = scroll;
    startTransition(() => router.push(href, { scroll: false }));
  }
  function switchView(view: SignalState["view"]) {
    if (view === active.view) return;
    memory.current[active.view] = active;
    const previous = memory.current[view], same = previous && scopeKey(previous) === scopeKey(active);
    navigate({ view, page: same ? previous.page : 0, criteria: view === "cri" && same ? previous.criteria : null,
      band: view === "cri" && same ? previous.band : null, ...(view === "cri" && same ? { sort: previous.sort, dir: previous.dir } : {}) });
  }
  const toggle = (id: string) => setOpen(expanded === id ? null : { key, id });
  const sources = (id: string, primary = false) => <button className={primary ? "sg-primary" : "sg-source-link"} onClick={() => setSourceId(id)}>{primary ? "Vezi înregistrările sursă" : "Înregistrările sursă"}</button>;
  function toolbar(bottom = false) { return <div className={`sg-toolbar${bottom ? " sg-bottom-toolbar" : ""}`}><p className="sg-result-total"><strong>{formatInt(total ? state.page * 10 + 1 : 0)}–{formatInt(Math.min(total, (state.page + 1) * 10))}</strong> din {formatInt(total)} {active.view === "cri" ? "entități" : "apariții"}<span>{active.view === "signals" ? "După valoare" : "Minimum 10 achiziții directe"}</span></p><Pager page={state.page} total={total} navigate={page => navigate({ page }, true)}/></div>; }
  function signalRow(fi: SignalInstance) {
    const observation = riskEvidenceLine(fi.flagCode, fi.evidence) ?? "Detaliile observației nu sunt disponibile în această versiune.", m = FLAG_META[fi.flagCode]!;
    return <article className="sg-result" key={fi.id}><div className="sg-row">
      <div className="sg-entity"><div className="sg-entity-name"><Entity id={fi.entityId} name={fi.entityName}/></div>
        {fi.partnerName && <div className="sg-partner">{state.role === "authority" ? "Furnizor" : "Autoritate"}: <Entity id={fi.partnerId} name={fi.partnerName}/></div>}
        {fi.subjectType === "award" && <div className="sg-partner">{fi.winners.length ? <>{fi.winners.slice(0, 2).map(w => <div key={w.entityId}><Entity id={w.entityId} name={w.name}/>{w.county && <span> · {w.county}</span>}</div>)}{fi.winners.length > 2 && <details><summary>Încă {fi.winners.length - 2} câștigători</summary>{fi.winners.slice(2).map(w => <div key={w.entityId}><Entity id={w.entityId} name={w.name}/>{w.county && <span> · {w.county}</span>}</div>)}</details>}</> : "Câștigător neidentificat în date."}</div>}
        <p className="sg-meta">{fi.entityCounty && `${fi.subjectType === "award" ? "Autoritate: " : ""}${fi.entityCounty} · `}{signalPeriodLabel(fi.period)}</p>
      </div><p className="sg-observation">{observation}</p><div className="sg-amount"><strong>{fi.totalExact === null ? "Necunoscută" : `${formatExactDecimal(fi.totalExact)} lei`}</strong><small>{fi.subjectType === "award" ? "valoarea anunțului" : "valoare înregistrată"}</small></div>
      <div className="sg-row-actions"><button className="sg-verify" onClick={() => toggle(fi.id)} aria-expanded={expanded === fi.id} aria-controls={expanded === fi.id ? `sg-detail-${fi.id}` : undefined}>{expanded === fi.id ? "Închide" : "Verifică"}<span className="sg-chevron"/></button>{sources(fi.id)}</div>
    </div>{expanded === fi.id && <div id={`sg-detail-${fi.id}`} className="sg-expanded"><div className="sg-detail-grid"><div><h3>Ce a declanșat semnalul</h3><p>{observation}</p><p>{m.description}</p></div><div><h3>Ce merită verificat</h3><p>{fi.flagCode === "da_split" ? "Verifică dacă achizițiile răspund aceleiași nevoi, cum a fost estimată valoarea și dacă documentele justifică achizițiile separate." : m.rationale}</p><p>{fi.flagCode === "da_split" ? "O clasă CPV comună nu dovedește o nevoie unică; achizițiile recurente pot fi legitime." : m.caveat.split(". ")[0] + (m.caveat.split(". ")[0]?.endsWith(".") ? "" : ".")}</p><details className="sg-limits"><summary>Limitele acestui semnal</summary><p>{m.caveat}</p><Link href={`/metodologie#${fi.flagCode}`} target="_blank" rel="noopener">Metodologie ↗</Link></details></div></div><div className="sg-detail-footer"><div><small>{signalPeriodLabel(fi.period)} · metodologie {fi.methodology}</small><Link href={`/semnale/${fi.id}`} target="_blank" rel="noopener">Pagina surselor ↗</Link></div><div className="sg-detail-actions"><ClipButton kind="signal" refId={fi.id} label={m.title}/>{sources(fi.id, true)}</div></div></div>}</article>;
  }
  const distTotal = distribution.reduce((n, d) => n + d.n, 0), distMax = Math.max(1, ...distribution.map(d => d.n));
  return <div className="sg-explorer">
    <header className="sg-heading"><div><h1>Semnale</h1><p>Observații din date. Puncte de pornire pentru verificare.</p></div><Link href="/metodologie" className="sg-method-link">Cum se calculează ↗</Link></header>
    <div className="sg-freshness">{freshness}</div>
    <nav className="sg-tabs" aria-label="Vizualizarea semnalelor"><button onClick={() => switchView("signals")} aria-current={active.view === "signals" ? "page" : undefined}>Semnale</button><button onClick={() => switchView("cri")} aria-current={active.view === "cri" ? "page" : undefined}>Entități după CRI</button></nav>
    <section className={`sg-filters${active.view === "cri" ? " sg-cri-filters" : ""}`} aria-label="Filtre">
      {active.view === "signals" && <div className="sg-type-field"><span className="sg-label">Tip de semnal</span><button className="sg-type-button" onClick={() => setDialog("type")} aria-haspopup="dialog"><span>{meta.title}</span><span className="sg-chevron"/></button></div>}
      <div className="sg-desktop-filter"><span className="sg-label">Cine</span><div className="sg-segmented">{(["authority", "supplier"] as const).map(role => <button key={role} aria-pressed={active.role === role} onClick={() => navigate({ role })}>{role === "authority" ? "Autorități" : "Firme"}</button>)}</div></div>
      <div className="sg-desktop-filter"><County id="sg-county" role={active.role} value={active.county} onChange={county => navigate({ county })}/></div>
      <button className="sg-mobile-filter sg-secondary" onClick={() => setDialog("filters")}>Filtre{active.county ? " · 1" : ""}</button>
      <p className="sg-mobile-scope">{active.role === "authority" ? "Autorități" : "Firme"} · {active.county ?? "Toate județele"}</p>
    </section>
    {notice && <p className="sg-notice" role="status">{notice}</p>}
    <div className="sg-context"><div><h2>{active.view === "signals" ? meta.title : "Câte criterii apar împreună?"}</h2><p>{active.view === "cri" ? `CRI sintetizează ${criteria.length} criterii din achizițiile directe. Nu este o probabilitate de corupție.` : code === "da_split" ? "Cel puțin 3 achiziții între aceeași autoritate și același furnizor, în același an, aceeași clasă CPV și același tip. Fiecare sub plafonul propriu; împreună depășesc cel mai mare plafon aplicabil." : meta.short}</p></div><Link href={`/metodologie#${active.view === "cri" ? "indice" : code}`} target="_blank" rel="noopener">Criterii și limite ↗</Link></div>
    <p className="sr-only" role="status" aria-live="polite">{pending ? "Se încarcă rezultatele…" : error ? "Rezultatele nu s-au încărcat." : `${formatInt(total)} ${active.view === "cri" ? "entități" : "apariții"}. Pagina ${state.page + 1}.`}</p>
    <section ref={resultsRef} className="sg-results" tabIndex={-1} aria-label="Rezultate" aria-busy={pending}>
      {pending ? <SignalsLoading/> : error ? <div className="sg-empty" role="alert"><h3>Rezultatele nu s-au încărcat</h3><p>{error}</p><button className="sg-primary" onClick={() => { setRequested(state); startTransition(() => router.refresh()); }}>Reîncearcă</button></div> : <>
        {active.view === "cri" && <><div className="sg-cri-overview"><div><h3>{formatInt(distTotal)} {active.role === "authority" ? "autorități" : "firme"}</h3><p>Minimum 10 achiziții directe. Întreaga perioadă disponibilă la calcul. Selectează o bară pentru a restrânge lista.</p></div><div className="sg-histogram" aria-label="Distribuția numărului de criterii CRI">{Array.from({ length: criteria.length + 1 }, (_, i) => { const n = distribution.find(d => d.criteria === i)?.n ?? 0; return <button key={i} onClick={() => navigate({ criteria: active.criteria === i ? null : i, band: null })} aria-pressed={active.criteria === i} aria-label={`${i} din ${criteria.length} criterii, ${formatInt(n)} entități`}><span>{formatInt(n)}</span><span className="sg-bar" style={{ height: `${Math.max(2, n / distMax * 70)}px` }}/><span>{i}/{criteria.length}</span></button>; })}</div></div><div className="sg-cri-controls"><span>{active.criteria !== null ? `${active.criteria} din ${criteria.length} criterii` : active.band ? `Interval CRI ${active.band.from.toLocaleString("ro-RO")}–${active.band.to.toLocaleString("ro-RO")}` : "Toate valorile CRI"}{(active.criteria !== null || active.band) && <button onClick={() => navigate({ criteria: null, band: null })}>Arată toate</button>}</span><div><label>Ordonează <select value={active.sort} onChange={e => navigate({ sort: e.target.value as RiskGroupSort, dir: e.target.value === "name" ? "asc" : "desc" })}>{sorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="sg-secondary" onClick={() => navigate({ dir: active.dir === "asc" ? "desc" : "asc" })}>{active.dir === "asc" ? "Crescător" : "Descrescător"}</button></div></div></>}
        {toolbar()}
        {total > 0 ? <><div className="sg-list-head" aria-hidden="true"><span>{active.view === "signals" && meta.subject === "award" ? "AUTORITATE ȘI CÂȘTIGĂTORI" : active.role === "authority" ? "AUTORITATE" : "FIRMĂ"}</span><span>{active.view === "signals" ? "OBSERVAȚIA DIN DATE" : "INDICE ȘI CRITERII"}</span><span>{active.view === "signals" ? "VALOARE · LEI" : "ACHIZIȚII DIRECTE"}</span><span/></div>
          {signals?.rows.map(signalRow)}
          {risk?.rows.map(r => <article className="sg-result" key={r.entityId}><div className="sg-row sg-cri-row"><div className="sg-entity"><div className="sg-entity-name"><Entity id={r.entityId} name={r.name}/></div><p className="sg-meta">{r.county ?? "Județ neprecizat"} · Întreaga perioadă disponibilă</p></div><div className="sg-observation"><strong className="sg-cri-value">{r.cri.toFixed(2).replace(".", ",")}</strong> CRI<small>{r.nFlags} din {criteria.length} criterii îndeplinite</small></div><div className="sg-amount"><strong>{formatInt(r.nDas)}</strong><small>{formatRon(r.totalRon)} înregistrate</small></div><button className="sg-verify" onClick={() => toggle(r.entityId)} aria-expanded={expanded === r.entityId}>{expanded === r.entityId ? "Închide" : "Criterii"}<span className="sg-chevron"/></button></div>{expanded === r.entityId && <div className="sg-expanded"><h3>Criteriile din calculul CRI</h3><ul className="sg-criteria-list">{criteria.map(c => <li key={c}><span>{FLAG_META[c]?.title}</span><strong>{r.flags.includes(c) ? "Îndeplinit" : "Neîndeplinit"}</strong></li>)}</ul><p className="sg-meta">Numărul de criterii se referă la întregul istoric de achiziții directe disponibil la calcul. Alte tipuri de semnale nu intră în CRI.</p><div className="sg-detail-footer"><Link href={`/metodologie#indice`} target="_blank" rel="noopener">Cum se calculează ↗</Link><Link href={`/entitati/${r.entityId}`} target="_blank" rel="noopener">Vezi profilul și achizițiile ↗</Link></div></div>}</article>)}
          {toolbar(true)}</> : <div className="sg-empty"><h3>Niciun rezultat pentru această selecție</h3><p>Nu există {active.view === "signals" ? "apariții calculate" : "entități eligibile"} pentru {active.role === "authority" ? "autorități" : "firme"}{active.county ? ` din ${active.county}` : " în selecția curentă"}.</p>{active.county ? <button className="sg-primary" onClick={() => navigate({ county: null })}>Caută în toate județele</button> : active.view === "cri" ? <button className="sg-primary" onClick={() => navigate({ criteria: null, band: null })}>Arată toate valorile CRI</button> : <button className="sg-primary" onClick={() => setDialog("type")}>Alege alt tip de semnal</button>}</div>}
      </>}
    </section>
    <footer className="sg-foot"><p>Un semnal nu este o dovadă de ilegalitate. Valorile pot acoperi aceleași achiziții și nu se adună.</p>{active.view === "signals" && meta.subject === "award" && <p>Un semnal se numără o singură dată pe anunț. Filtrarea firmelor după județ păstrează anunțurile cu cel puțin un câștigător din județul ales; sunt afișați toți câștigătorii. Valoarea aparține anunțului, nu unui lot sau fiecărei firme.</p>}</footer>
    {dialog === "type" && <TypeChooser code={code} role={active.role} counts={pending ? {} : counts} choose={code => navigate({ code })} close={() => setDialog(null)}/>}
    {dialog === "filters" && <MobileFilters state={active} apply={navigate} close={() => setDialog(null)}/>}
    {sourceId && <SignalSources key={sourceId} id={sourceId} onClose={() => setSourceId(null)}/>}
  </div>;
}
export function SignalsLoading() { return <div className="sg-loading"><p role="status"><span className="sg-spinner" aria-hidden="true"/>Se încarcă rezultatele…</p>{Array.from({ length: 10 }, (_, i) => <div className="sg-skeleton" key={i} aria-hidden="true"><span/><span/><span/></div>)}</div>; }

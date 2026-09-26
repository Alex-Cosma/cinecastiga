"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import EvidenceDrawer from "@/app/intreaba/EvidenceDrawer";
import ClipButton from "@/components/ClipButton";
import { cleanName } from "@/lib/format";
import { formatEvidenceAmount } from "@/lib/ask/evidence";
import type { ConnectionRole } from "@/lib/connections-shared";
import PeerGroupEditor, { Population } from "./PeerGroupEditor";
import { peerPeriodLabel, peerDomainLabel } from "@/lib/peers-shared";
import type { PeerMember, PeersResponse, PeerMethod, PeerSelectionMember } from "@/lib/peers-shared";
import { peerEvidenceSpec, type PeerEvidenceSelection } from "@/lib/peers-evidence-shared";

type Criteria = { dataset: string; year: string; cpv: string; county: string };
type Request = Criteria & { page: number; identity?: string | undefined; checkpointId?: string | undefined; method?: PeerMethod | undefined; populationVersion?: string | undefined; members?: PeerSelectionMember[] | undefined };
type Source = { receipt: PeerEvidenceSelection; title: string };
const count = (value: number) => value.toLocaleString("ro-RO");
const query = (values: Record<string, string | number | PeerSelectionMember[] | undefined>) => new URLSearchParams(Object.entries(values).filter(([, value]) => value !== undefined && value !== "").map(([key, value]) => [key, Array.isArray(value) ? JSON.stringify(value) : String(value)])).toString();
function initialMembers(value?: string): PeerSelectionMember[] | undefined {
  if (!value) return undefined;
  try { return JSON.parse(value) as PeerSelectionMember[]; } catch { return undefined; }
}
const kinds: Record<string, string> = { comuna: "comune", oras_municipiu: "orașe / municipii", consiliu_judetean: "consilii județene", spital: "spitale", scoala: "școli", universitate: "universități", minister: "ministere" };
function Identity({ member }: { member: PeerMember }) {
  return <span className="px-meta">{member.entity.cui ? `CUI ${member.entity.cui}` : "CUI nepublicat / nevalidat"}{member.entity.county ? ` · ${member.entity.county}` : ""}</span>;
}
function SourceBreakdown({ member }: { member: PeerMember }) {
  return <span className="px-meta">{count(member.recordCount)} {member.recordCount === 1 ? "înregistrare" : "înregistrări"}{member.contractRows > 0 ? ` · ${count(member.distinctContracts)} ${member.distinctContracts === 1 ? "contract distinct" : "contracte distincte"}` : ""}</span>;
}

export default function PeersExplorer({ entityId, entityName, role, initial }: {
  entityId: string; entityName: string; role: ConnectionRole; initial: Record<string, string>;
}) {
  const first: Criteria = { dataset: initial.dataset ?? "all", year: initial.year ?? "", cpv: initial.cpv ?? "", county: initial.county ?? "" };
  const [draft, setDraft] = useState(first);
  const [request, setRequest] = useState<Request>({ ...first, page: Number(initial.page ?? 1), ...(initial.identity ? { identity: initial.identity } : {}), ...(initial.checkpointId ? { checkpointId: initial.checkpointId } : {}), ...(initial.method ? { method: initial.method as PeerMethod } : {}), ...(initial.populationVersion ? { populationVersion: initial.populationVersion } : {}), ...(initial.members ? { members: initialMembers(initial.members) } : {}) });
  const [state, setState] = useState<{ key: string; data: PeersResponse | null; error: string; status: number }>({ key: "", data: null, error: "", status: 0 });
  const [pending, setPending] = useState(true), [retry, setRetry] = useState(0);
  const [metric, setMetric] = useState<"total" | "mean">("total");
  const [sources, setSources] = useState<Source | null>(null);
  const [copied, setCopied] = useState("");
  const pinned = useRef({ identity: initial.identity, checkpointId: initial.checkpointId });
  const groupHeading = useRef<HTMLHeadingElement>(null);
  const key = query({ entityId, role, ...request });
  const data = state.data;
  const busy = pending || state.key !== key;
  const error = state.key === key ? state.error : "";
  const rol = role === "authority" ? "autoritate" : "furnizor";
  const currentName = data ? cleanName(data.entity.name) : entityName;
  const stored = useRef<PeersResponse | null>(null);
  if (data) stored.current = data;
  const options = data?.options ?? stored.current?.options;

  useEffect(() => {
    const controller = new AbortController();
    setPending(true); setCopied("");
    void (async () => {
      try {
        const response = await fetch(`/api/peers?${key}`, { signal: controller.signal });
        const body = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) { setState({ key, data: null, error: body.error ?? "Comparația nu poate fi încărcată.", status: response.status }); return; }
        const next = body as PeersResponse;
        pinned.current = { identity: next.entity.identity, checkpointId: next.checkpoint.id };
        setState({ key, data: next, error: "", status: response.status });
        if (next.suggested.year || next.suggested.cpv) setDraft(current => ({ ...current, year: next.suggested.year && current.year === "" ? String(next.filters.year ?? "") : current.year, cpv: next.suggested.cpv && current.cpv === "" ? next.filters.cpv ?? "" : current.cpv }));
        window.history.replaceState(null, "", `${window.location.pathname}?${query({ rol, ...next.filters, year: next.filters.year ?? undefined, cpv: next.filters.cpv ?? undefined, ...pinned.current })}`);
      } catch { if (!controller.signal.aborted) setState({ key, data: null, error: "Conexiunea a fost întreruptă. Reîncearcă încărcarea.", status: 0 }); }
      finally { if (!controller.signal.aborted) setPending(false); }
    })();
    return () => controller.abort();
  }, [key, retry, rol]);

  function apply(event: FormEvent) {
    event.preventDefault(); setSources(null);
    setRequest({ ...draft, county: data?.filters.method === "manual" ? "" : draft.county, page: 1, ...pinned.current, method: data?.filters.method, populationVersion: data?.filters.populationVersion, members: data?.filters.members });
  }
  function turnPage(page: number) {
    if (!data) return;
    setRequest({ dataset: data.filters.dataset, year: String(data.filters.year ?? ""), cpv: data.filters.cpv ?? "", county: data.filters.county ?? "", page, ...pinned.current, method: data.filters.method, populationVersion: data.filters.populationVersion, members: data.filters.members });
    requestAnimationFrame(() => groupHeading.current?.focus());
  }
  function changeGroup(members: PeerSelectionMember[], populationVersion?: string) {
    if (!data || busy) return;
    setSources(null); setDraft(current => ({ ...current, county: "" }));
    setRequest({ dataset: data.filters.dataset, year: String(data.filters.year ?? ""), cpv: data.filters.cpv ?? "", county: "", page: 1, ...pinned.current, method: "manual", members, populationVersion: populationVersion ?? data.filters.populationVersion });
  }
  function resetGroup() {
    if (!data || busy) return;
    setSources(null);
    setRequest({ dataset: data.filters.dataset, year: String(data.filters.year ?? ""), cpv: data.filters.cpv ?? "", county: "", page: 1, ...pinned.current, method: data.methodology.defaultMethod ?? (data.focal?.population ? "population" : "activity") });
  }
  function receipt(member?: PeerMember): PeerEvidenceSelection {
    if (!data || data.filters.year === null || data.filters.cpv === null) throw new Error("Comparația nu este pregătită.");
    return { version: "peer-evidence-2", method: data.filters.method ?? "activity", ...(data.filters.populationVersion ? { populationVersion: data.filters.populationVersion } : {}), ...(data.filters.members ? { members: data.filters.members } : {}), checkpointId: data.checkpoint.id, entityId, identity: data.entity.identity, role,
      dataset: data.filters.dataset, year: data.filters.year, cpv: data.filters.cpv, ...(data.filters.county ? { county: data.filters.county } : {}),
      selection: member ? { kind: "member", entityId: member.entity.id, identity: member.entity.identity } : { kind: "comparison" } };
  }
  function showSources(member?: PeerMember) {
    if (busy) return;
    setSources({ receipt: receipt(member), title: member ? `${cleanName(member.entity.name)} · ${peerPeriodLabel(data!.filters.year)} · ${peerDomainLabel(data!.filters.cpv)}` : `Comparație în context · ${currentName} · ${peerPeriodLabel(data!.filters.year)} · ${peerDomainLabel(data!.filters.cpv)}` });
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied("Link copiat. Păstrează criteriile și versiunea datelor."); }
    catch { setCopied("Copiază adresa din bara browserului; ea conține criteriile comparației."); }
  }
  const focal = data?.focal;
  const comparisonAvailable = !!focal && data?.cohort.status !== "unknown_authority_type" && data!.cohort.count > 0;
  const canCapture = comparisonAvailable && data!.cohort.count <= 499;
  const comparison = canCapture ? receipt() : null;
  const observedCount = data?.cohort.observedMemberCount ?? data?.cohort.count ?? 0;
  const method = data?.filters.method ?? request.method ?? "activity";
  const amount = focal && focal.recordCount > 0 ? metric === "total" ? focal.totalExact : focal.meanRounded : null;
  const median = data?.cohort.enoughPeers ? metric === "total" ? data.cohort.medianTotalExact : data.cohort.medianMeanRounded : null;
  const scale = Math.max(Number(amount), Number(median), 1);
  const fraction = (value: string | null) => Math.max(0, Math.min(1, Number(value) / scale));
  const division = data?.options.divisions.find(item => item.code === data.filters.cpv);
  const dirty = !!data && (draft.dataset !== data.filters.dataset || draft.year !== String(data.filters.year ?? "") || draft.cpv !== (data.filters.cpv ?? "") || draft.county !== (data.filters.county ?? ""));

  return <div className="px-shell">
    <Link href={`/entitati/${entityId}?rol=${rol}`} className="px-back">Înapoi la {currentName}</Link>
    <header className="px-header"><h1>Compară în context.</h1><p>Cum se compară achizițiile <strong>{currentName}</strong> cu ale {method === "population" ? "administrațiilor cu populație apropiată" : method === "manual" ? "entităților alese de tine" : role === "authority" ? "altor instituții" : "altor firme"}?</p></header>
    <form onSubmit={apply} className={method === "manual" ? "px-filters px-filters-manual" : "px-filters"} aria-label="Criteriile comparației"><fieldset disabled={busy}>
      <label>Anul<select value={draft.year} onChange={event => setDraft({ ...draft, year: event.target.value })}>
        {!draft.year && <option value="">Sugerat din date</option>}<option value="all">Toți anii</option>{draft.year && draft.year !== "all" && !options?.years.includes(Number(draft.year)) && <option value={draft.year}>{draft.year}</option>}{options?.years.map(year => <option key={year} value={year}>{year}</option>)}
      </select></label>
      <label className="px-cpv">Domeniul CPV<select value={draft.cpv} onChange={event => setDraft({ ...draft, cpv: event.target.value })}>
        {!draft.cpv && <option value="">Sugerat din date</option>}<option value="all">Toate domeniile</option>{draft.cpv && draft.cpv !== "all" && !options?.divisions.some(item => item.code === draft.cpv) && <option value={draft.cpv}>CPV {draft.cpv}</option>}{options?.divisions.map(item => <option key={item.code} value={item.code}>{item.code} · {item.label}</option>)}
      </select></label>
      <label>Achiziții<select value={draft.dataset} onChange={event => setDraft({ ...draft, dataset: event.target.value })}><option value="all">Toate achizițiile</option><option value="da">Achiziții directe</option><option value="contracts">Prin proceduri</option></select></label>
      {method !== "manual" && <label>Județul sugestiilor<select value={draft.county} onChange={event => setDraft({ ...draft, county: event.target.value })}><option value="">Toată țara</option>{draft.county && !options?.counties.includes(draft.county) && <option value={draft.county}>{draft.county}</option>}{options?.counties.map(county => <option key={county} value={county}>{county}</option>)}</select></label>}
      <button className="px-primary" type="submit">Aplică</button>
    </fieldset></form>
    {draft.cpv && draft.cpv !== "all" && <p className="px-meta">Un domeniu CPV ales include toate subdomeniile sale.</p>}
    {method === "manual" && <p className="px-meta">Grupul ales de tine poate include entități din orice județ.</p>}
    {dirty && !busy && <p className="px-form-note" role="status">Ai criterii neaplicate. Apasă „Aplică” pentru a actualiza achizițiile comparate. Editarea grupului folosește criteriile deja aplicate.</p>}
    {busy && !data ? <div className="px-loading" role="status"><p>Se construiește grupul și se verifică sursele…</p>{[0, 1, 2].map(item => <div key={item} aria-hidden="true" />)}</div> : error ? <div className="px-error" role="alert"><h2>Comparația nu este disponibilă.</h2><p>{error}</p>{(state.status === 400 || state.status === 409) ? <a className="px-button" href={`/entitati/${entityId}/comparatii?rol=${rol}`}>Reia comparația pe datele actuale</a> : <button onClick={() => setRetry(value => value + 1)}>Reîncearcă</button>}</div> : data && <>
      {busy && <p className="px-updating" role="status">Se actualizează comparația…</p>}
      {(data.suggested.year || data.suggested.cpv) && <p className="px-form-note">Punct de pornire sugerat: {data.suggested.year ? typeof data.filters.year === "number" && data.filters.year < new Date().getFullYear() ? "ultimul an încheiat disponibil" : "anul disponibil în date" : data.filters.year === "all" ? "toți anii disponibili" : "anul ales"} și {data.suggested.cpv ? "domeniul cu cea mai mare valoare înregistrată" : data.filters.cpv === "all" ? "toate domeniile" : "domeniul ales"}. Poți schimba criteriile mai sus.</p>}
      {typeof data.filters.year === "number" && data.filters.year >= new Date().getFullYear() && <p className="px-notice">Anul selectat este în curs sau viitor. Valorile nu reprezintă un an complet.</p>}
      {(data.filters.year === "all" || data.filters.cpv === "all") && <p className="px-form-note">{data.filters.year === "all" && "Valorile cumulează toți anii disponibili. "}Sunt incluse și înregistrările {data.filters.year === "all" && data.filters.cpv === "all" ? "fără dată sau fără cod CPV" : data.filters.year === "all" ? "fără dată" : "fără cod CPV"} care respectă celelalte filtre.</p>}
      {!focal && <PeerGroupEditor data={data} role={role} busy={busy} onChange={changeGroup} onReset={resetGroup} />}
      {!focal ? <section className="px-empty"><h2>Nu avem înregistrări eligibile în această selecție.</h2><p>Schimbă anul, domeniul sau canalul de achiziție. {data.filters.year !== "all" && " Înregistrările fără an utilizabil sunt excluse."}{data.filters.cpv !== "all" && " Înregistrările fără cod CPV utilizabil sunt excluse."}</p></section> : <>
        <section className="px-receipt" aria-labelledby="group-definition"><h2 id="group-definition">{method === "population" ? "Comparație după populație." : method === "manual" ? "Grupul tău de comparație." : "Un grup pe care îl poți verifica."}</h2>
          {method === "population" ? <>
            {focal.population ? <><p><strong>{count(data.cohort.count)} administrații cu populația cea mai apropiată</strong>, dintre cele cu populație identificată în aplicație{data.filters.county ? `, din județul ${data.filters.county}` : ""}. {focal.population.level === "county" ? "Consiliile județene se compară după populația județului." : "Comunele, orașele și municipiile pot fi în același grup; populația primează."}</p><p className="px-population-source"><strong>{currentName}: {count(focal.population.value)} locuitori.</strong> Recensământ, {new Date(`${focal.population.referenceDate}T12:00:00`).toLocaleDateString("ro-RO")}. <a href={focal.population.sourceUrl} target="_blank" rel="noreferrer">Sursa INS</a></p><p className="px-meta">Grupul este ales după populație, independent de achizițiile găsite în anul și domeniul selectate.</p></> : <p>Nu am putut identifica sigur populația acestei administrații. Poți construi mai jos un grup propriu.</p>}
          </> : method === "manual" ? <><p><strong>{count(data.cohort.count)} {role === "authority" ? "instituții" : "firme"} alese de tine.</strong> Ai control asupra listei; populația și diferențele sunt afișate acolo unde le putem identifica.</p>{focal.population && <p className="px-population-source">Referință: <strong>{count(focal.population.value)} locuitori</strong> · recensământ {focal.population.referenceDate.slice(0, 4)}. <a href={focal.population.sourceUrl} target="_blank" rel="noreferrer">Sursa INS</a></p>}</> : data.cohort.status === "unknown_authority_type" ? <p>Nu putem stabili suficient de clar tipul acestei instituții din denumire. Poți alege mai jos un grup propriu.</p> : <>
            <p><strong>{count(data.cohort.count)} {role === "authority" ? "alte instituții" : "alte firme"}</strong> în {data.filters.year === "all" ? "toți anii disponibili" : data.filters.year}, pentru <strong>{division?.label ?? peerDomainLabel(data.filters.cpv)}</strong>, cu <strong>{count(data.cohort.minimumRecords)}–{count(data.cohort.maximumRecords)} de înregistrări</strong> fiecare. {currentName} are {count(focal.recordCount)}.</p>
            <p className="px-meta">{role === "authority" ? `Tip estimat din denumire: ${kinds[data.cohort.authorityKind ?? ""] ?? data.cohort.authorityKind}. ` : "Firmele nu sunt presupuse egale ca mărime sau număr de angajați. "}Volumul înregistrărilor nu presupune bugete sau populații egale.</p>
          </>}
        </section>
        <PeerGroupEditor data={data} role={role} busy={busy} onChange={changeGroup} onReset={resetGroup} />
        <section className="px-comparison" aria-labelledby="comparison-heading"><div className="px-comparison-head"><div><h2 id="comparison-heading">{metric === "total" ? "Valoarea înregistrată" : "Media pe înregistrare"}</h2><p className="px-meta px-applied">Achiziții comparate: <strong>{peerPeriodLabel(data.filters.year)}</strong> · {peerDomainLabel(data.filters.cpv)} · {data.filters.dataset === "da" ? "directe" : data.filters.dataset === "contracts" ? "prin proceduri" : "toate achizițiile"}</p></div><div className="px-metric" role="group" aria-label="Măsura afișată"><button aria-pressed={metric === "total"} onClick={() => setMetric("total")}>Total</button><button aria-pressed={metric === "mean"} onClick={() => setMetric("mean")}>Pe înregistrare</button></div></div>
          <div className="px-pair"><div><span>{currentName}</span><strong title={amount === null ? undefined : formatEvidenceAmount(amount, true)}>{amount === null ? "Fără înregistrări" : formatEvidenceAmount(amount)}</strong><SourceBreakdown member={focal} /></div><div className="px-track" aria-hidden="true"><span style={{ transform: `scaleX(${fraction(amount)})` }} /></div><button disabled={busy} onClick={() => showSources(focal)}>Vezi sursele</button></div>
          <div className="px-pair px-median"><div><span>Mediana celorlalte entități</span><strong>{median === null ? "Grup insuficient" : formatEvidenceAmount(median)}</strong><span className="px-meta">{median === null ? "Sunt necesare cel puțin 5 alte entități cu înregistrări pentru interpretare." : `Calculată din ${count(observedCount)} entități cu înregistrări: valoarea din mijloc după ordonare sau media celor două valori centrale.`}</span></div><div className="px-track" aria-hidden="true"><span style={{ transform: `scaleX(${fraction(median)})` }} /></div>{data.cohort.count > 0 && <a href="#peer-members">Vezi grupul</a>}</div>
          {metric === "mean" && <p className="px-meta">Valoarea totală împărțită la numărul de înregistrări. Nu este un preț unitar; CPV grupează achiziții care pot avea specificații diferite.</p>}
        </section>
        {observedCount < data.cohort.count && <p className="px-meta">{count(data.cohort.count - observedCount)} {data.cohort.count - observedCount === 1 ? "membru fără înregistrări în selecție rămâne" : "membri fără înregistrări în selecție rămân"} în grup și nu intră în mediană. Absența înregistrărilor nu înseamnă cheltuieli zero.</p>}
        <div className="px-actions">{canCapture && <button disabled={busy} onClick={() => showSources()}>Verifică toate sursele</button>}{comparison && !busy && <ClipButton kind="query" spec={peerEvidenceSpec(comparison)} label={`Comparație în context · ${currentName}`} snapshot={{ peer: comparison, sourceUrl: typeof window === "undefined" ? "" : window.location.pathname + window.location.search }} />}<button disabled={busy} onClick={() => void copyLink()}>Copiază linkul</button></div>
        <p className="px-meta">{canCapture ? "Salvarea în Anchete păstrează criteriile, grupul ales, populațiile, mediana și toate sursele în forma consultată." : comparisonAvailable ? `Grupul depășește 499 de alte entități. Restrânge județul pentru a salva întregul grup; fiecare membru are sursele disponibile individual.` : "Poți păstra sursele instituției din lista deschisă prin „Vezi sursele”."}</p>
        {copied && <p className="px-meta" role="status">{copied}</p>}
        <p className="px-caveat">Valorile contractelor nu sunt plăți efectuate. O diferență față de mediană este un punct de pornire, nu dovada unei nereguli.</p>
      </>}
      {focal && <section id="peer-members" className="px-members"><div className="px-list-head"><h2 ref={groupHeading} tabIndex={-1}>Cine intră în comparație?</h2><span className="px-meta">{count(data.cohort.count)} entități · {method === "population" ? "după apropierea populației" : method === "manual" ? "în ordinea aleasă" : "după valoare, descrescător"}</span></div>
        {observedCount < 5 && <p className="px-notice">{data.cohort.count === 0 ? method === "manual" ? "Grupul tău este gol. Adaugă entități prin „Personalizează grupul”." : "Nicio altă entitate nu îndeplinește aceste criterii." : "Mai puțin de 5 membri au înregistrări în această selecție. Poți verifica sursele disponibile."} {data.filters.county ? "Încearcă toate județele." : "Încearcă alt an sau domeniu."}</p>}
        {data.members.map(member => <div className="px-member" key={member.entity.id}><div><Link className="px-member-name" href={`/entitati/${member.entity.id}?rol=${rol}`}>{cleanName(member.entity.name)}</Link><Identity member={member} />{method !== "activity" && <Population population={member.population} />}</div><div className="px-member-amount"><span title={member.recordCount ? formatEvidenceAmount(member.totalExact, true) : undefined}>{member.recordCount ? formatEvidenceAmount(member.totalExact) : "Fără înregistrări"}</span><SourceBreakdown member={member} /></div><button disabled={busy} aria-label={`Vezi sursele: ${cleanName(member.entity.name)}`} onClick={() => showSources(member)}>Vezi sursele</button></div>)}
        {data.pagination.totalPages > 1 && <nav className="px-pager" aria-label="Pagini de entități"><button disabled={busy || data.pagination.page <= 1} onClick={() => turnPage(data.pagination.page - 1)}>Înapoi</button><span>{count(data.pagination.page)} / {count(data.pagination.totalPages)}</span><button disabled={busy || !data.pagination.hasNext} onClick={() => turnPage(data.pagination.page + 1)}>Înainte</button></nav>}
      </section>}
      <details className="px-method"><summary>Cum este construit grupul și ce limite are?</summary>{data.methodology.descriptions.map(text => <p key={text}>{text}</p>)}
        <p>În sursele entității: {count(data.coverage.focalUndatedRows)} înregistrări fără an utilizabil; {count(data.coverage.focalYearMissingCpvRows)} fără CPV utilizabil în perioada aleasă. {count(data.coverage.unresolvedEntityRows)} înregistrări din populația selectată nu au identități rezolvate.</p>
        {(data.cohort.excludedUnknownType > 0 || data.cohort.excludedUnknownCounty > 0) && <p>Excluderi din grup: {count(data.cohort.excludedUnknownType)} entități cu tip necunoscut sau ambiguu; {count(data.cohort.excludedUnknownCounty)} fără județ cunoscut atunci când restrângi geografia.</p>}
        <p>Versiunea datelor: {data.checkpoint.version}. Validarea acestei versiuni nu reprezintă data colectării surselor. Un an încheiat nu garantează colectare completă.</p>
      </details>
    </>}
    {sources && <EvidenceDrawer spec={peerEvidenceSpec(sources.receipt)} peer={sources.receipt} title={sources.title} onClose={() => setSources(null)} />}
  </div>;
}

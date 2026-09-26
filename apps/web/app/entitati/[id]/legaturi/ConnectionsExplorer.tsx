"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import EvidenceDrawer from "@/app/intreaba/EvidenceDrawer";
import ClipButton from "@/components/ClipButton";
import { cleanName } from "@/lib/format";
import { formatEvidenceAmount, sumDecimalStrings } from "@/lib/ask/evidence";
import type { Dataset } from "@/lib/ask/spec";
import type { ConnectionEntity, ConnectionPartner, ConnectionRole, ConnectionsResponse } from "@/lib/connections-shared";
import { connectionEvidenceSpec, type ConnectionEvidenceSelection, type ConnectionEvidencePair } from "@/lib/connection-evidence-shared";

type Scope = { dataset: Dataset; yearFrom?: number; yearTo?: number };
type Picked = { root: ConnectionEntity; partner: ConnectionPartner; checkpointId: string };
type Sources = { selection: ConnectionEvidenceSelection; title: string };
const number = (value: number) => value.toLocaleString("ro-RO");
const name = (entity: ConnectionEntity) => cleanName(entity.name);
const records = (item: ConnectionPartner) => item.daRows + item.contractRows;
const recordLabel = (n: number) => `${number(n)} ${n === 1 ? "înregistrare" : "înregistrări"}`;
const sourceLabel = (n: number) => n === 1 ? "Vezi sursa" : `Vezi cele ${number(n)} surse`;
const date = (value: string | null) => value ? value.slice(0, 10).split("-").reverse().join(".") : "dată necunoscută";
const datasetName = { all: "Toate achizițiile", da: "Achiziții directe", contracts: "Contracte prin proceduri" };
const profileUrl = (entity: Pick<ConnectionEntity, "id" | "role">) => `/entitati/${entity.id}?rol=${entity.role === "authority" ? "autoritate" : "furnizor"}`;
function pair(a: ConnectionEntity, b: ConnectionEntity): ConnectionEvidencePair {
  const authority = a.role === "authority" ? a : b, supplier = a.role === "supplier" ? a : b;
  return { authority: { id: authority.id, identity: authority.identity }, supplier: { id: supplier.id, identity: supplier.identity } };
}
function query(values: Record<string, string | number | undefined>) {
  return new URLSearchParams(Object.entries(values).filter(([, value]) => value !== undefined && value !== "").map(([key, value]) => [key, String(value)])).toString();
}
function useDebounced(value: string) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setDebounced(value), 250); return () => clearTimeout(timer); }, [value]);
  return debounced;
}
function useConnections(parameters: string | null) {
  const [state, setState] = useState<{ key: string; data: ConnectionsResponse | null; error: string; status: number }>({ key: "", data: null, error: "", status: 0 });
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!parameters) return;
    const controller = new AbortController();
    setPending(true);
    void (async () => {
      try {
        const response = await fetch(`/api/connections?${parameters}`, { signal: controller.signal });
        const body = await response.json();
        if (!controller.signal.aborted) setState({ key: parameters, data: response.ok ? body as ConnectionsResponse : null,
          error: response.ok ? "" : body.error ?? "Legăturile nu au putut fi încărcate.", status: response.status });
      } catch {
        if (!controller.signal.aborted) setState({ key: parameters, data: null, error: "Conexiunea a fost întreruptă. Reîncearcă încărcarea.", status: 0 });
      } finally { if (!controller.signal.aborted) setPending(false); }
    })();
    return () => controller.abort();
  }, [parameters, retry]);
  const busy = !!parameters && (pending || state.key !== parameters);
  return { data: parameters && state.key === parameters ? state.data : null, busy,
    error: parameters && state.key === parameters ? state.error : "", status: state.status, retry: () => setRetry(value => value + 1) };
}

function Pager({ data, busy, onPage }: { data: ConnectionsResponse; busy: boolean; onPage: (page: number) => void }) {
  if (data.pagination.totalPages < 2 && data.pagination.page === 1) return null;
  return <nav className="cx-pager" aria-label="Paginile partenerilor">
    <button disabled={busy || data.pagination.page <= 1} onClick={() => onPage(data.pagination.page - 1)}>Înapoi</button>
    <span>{number(data.pagination.page)} / {number(Math.max(1, data.pagination.totalPages))}</span>
    <button disabled={busy || !data.pagination.hasNext} onClick={() => onPage(data.pagination.page + 1)}>Înainte</button>
  </nav>;
}
function LoadingRows() {
  return <div className="cx-loading" role="status"><p>Se încarcă legăturile…</p>{[0, 1, 2, 3].map(i => <div className="cx-skeleton" key={i} aria-hidden="true"><span /><span /></div>)}</div>;
}
function Identity({ entity }: { entity: ConnectionEntity }) {
  return <span className="cx-identity">{entity.cui ? `CUI ${entity.cui}` : "CUI nepublicat / nevalidat"}{entity.county ? ` · ${entity.county}` : ""}{entity.countryCode && entity.countryCode !== "RO" ? ` · ${entity.countryCode}` : ""}</span>;
}
function PairFacts({ item }: { item: ConnectionPartner }) {
  return <><p className="cx-value">{formatEvidenceAmount(item.totalExact)}</p>
    <p className="cx-meta">{item.daRows > 0 && `${number(item.daRows)} ${item.daRows === 1 ? "achiziție directă" : "achiziții directe"}`}{item.daRows > 0 && item.contractRows > 0 && " · "}{item.contractRows > 0 && `${number(item.contractRows)} ${item.contractRows === 1 ? "cotă de furnizor" : "cote de furnizor"} în ${number(item.distinctContracts)} ${item.distinctContracts === 1 ? "contract" : "contracte"}`}</p>
    <p className="cx-meta">{item.firstDate ? `${date(item.firstDate)} – ${date(item.lastDate)}` : "Fără date de finalizare disponibile"}{item.undatedRows > 0 ? ` · ${number(item.undatedRows)} fără dată` : ""}</p></>;
}

export default function ConnectionsExplorer({ entityId, entityName, role, initial }: {
  entityId: string; entityName: string; role: ConnectionRole; initial: Record<string, string>;
}) {
  const startingScope: Scope = { dataset: (initial.dataset ?? "all") as Dataset,
    ...(initial.yearFrom ? { yearFrom: Number(initial.yearFrom) } : {}), ...(initial.yearTo ? { yearTo: Number(initial.yearTo) } : {}) };
  const [scope, setScope] = useState<Scope>(startingScope);
  const [dataset, setDataset] = useState<Dataset>(startingScope.dataset);
  const [yearFrom, setYearFrom] = useState(initial.yearFrom ?? "");
  const [yearTo, setYearTo] = useState(initial.yearTo ?? "");
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [peer, setPeer] = useState<ConnectionPartner | null>(null);
  const [peerSearch, setPeerSearch] = useState("");
  const [peerPage, setPeerPage] = useState(1);
  const [sources, setSources] = useState<Sources | null>(null);
  const [linkError, setLinkError] = useState("");
  const restored = useRef(false);
  const restoreController = useRef<AbortController | null>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const rootSearch = useDebounced(search), secondSearch = useDebounced(peerSearch);
  const pinned = useRef({ identity: initial.identity, checkpointId: initial.checkpointId });
  const baseQuery = useMemo(() => query({ entityId, role, ...scope, page, search: rootSearch, ...pinned.current }), [entityId, role, scope, page, rootSearch]);
  const base = useConnections(baseQuery);
  if (base.data) pinned.current = { identity: pinned.current.identity ?? base.data.entity.identity, checkpointId: pinned.current.checkpointId ?? base.data.checkpoint.id };
  const second = useConnections(picked ? query({ entityId: picked.partner.entity.id, role: picked.partner.entity.role, ...scope,
    page: peerPage, search: secondSearch, identity: picked.partner.entity.identity, checkpointId: picked.checkpointId, excludeEntityId: entityId }) : null);
  const isAuthority = role === "authority";
  const entity = base.data?.entity ?? picked?.root;
  const currentName = entity ? name(entity) : entityName;
  const scopeText = `${datasetName[scope.dataset]} · ${scope.yearFrom && scope.yearTo ? `${scope.yearFrom}–${scope.yearTo}` : scope.yearFrom ? `din ${scope.yearFrom}` : scope.yearTo ? `până în ${scope.yearTo}` : "toți anii disponibili"}`;

  function remember(selection: Picked | null, last: ConnectionPartner | null, applied = scope) {
    const params = query({ rol: isAuthority ? "autoritate" : "furnizor", ...applied,
      identity: pinned.current.identity, checkpointId: pinned.current.checkpointId,
      partner: selection?.partner.entity.id, partnerIdentity: selection?.partner.entity.identity,
      peer: last?.entity.id, peerIdentity: last?.entity.identity });
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }
  function choose(item: ConnectionPartner) {
    if (!base.data) return;
    restoreController.current?.abort();
    const next = { root: base.data.entity, partner: item, checkpointId: base.data.checkpoint.id };
    setPicked(next); setPeer(null); setPeerSearch(""); setPeerPage(1); setLinkError(""); remember(next, null);
    requestAnimationFrame(() => { detailHeading.current?.focus(); if (window.matchMedia("(max-width: 760px)").matches) detailHeading.current?.scrollIntoView({ block: "start", behavior: "instant" }); });
  }
  function choosePeer(item: ConnectionPartner) { setPeer(item); remember(picked, item); requestAnimationFrame(() => detailHeading.current?.focus()); }
  function resetSelection() {
    restoreController.current?.abort(); setPicked(null); setPeer(null); remember(null, null);
    requestAnimationFrame(() => document.getElementById("partners-title")?.focus());
  }
  function apply(event: FormEvent) {
    event.preventDefault();
    restoreController.current?.abort();
    if ([yearFrom, yearTo].some(value => value && !/^20\d{2}$/.test(value)) || yearFrom && yearTo && Number(yearFrom) > Number(yearTo)) {
      setFormError("Alege ani între 2000 și 2099, cu începutul înaintea sfârșitului."); return;
    }
    const next: Scope = { dataset, ...(yearFrom ? { yearFrom: Number(yearFrom) } : {}), ...(yearTo ? { yearTo: Number(yearTo) } : {}) };
    setScope(next); setFormError(""); setPicked(null); setPeer(null); setPage(1); setSearch(""); setSources(null); remember(null, null, next);
  }
  const restart = <a className="cx-button" href={`/entitati/${entityId}/legaturi?rol=${isAuthority ? "autoritate" : "furnizor"}`}>Reia explorarea pe datele disponibile</a>;

  // A copied URL restores exact partners even when they are beyond the first page.
  useEffect(() => {
    if (restored.current || !base.data || base.busy) return;
    restored.current = true;
    if (!initial.partner) return;
    const controller = new AbortController(), root = base.data.entity, checkpointId = base.data.checkpoint.id;
    restoreController.current = controller;
    void (async () => {
      try {
        if (!initial.partnerIdentity || initial.peer && !initial.peerIdentity) throw new Error("Linkul nu conține identitățile complete. Alege din nou partenerul.");
        async function findPair(id: string, identity: string, target: ConnectionEntity) {
          const response = await fetch(`/api/connections?${query({ entityId: id, role: target.role === "authority" ? "supplier" : "authority", identity, checkpointId, ...scope, partnerId: target.id, page: 1 })}`, { signal: controller.signal });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error ?? "Legătura nu mai este disponibilă.");
          const data = result as ConnectionsResponse;
          const match = data.items.find(item => item.entity.id === target.id && item.entity.identity === target.identity);
          if (!match) throw new Error("Legătura nu a fost găsită în această selecție. Alege din nou partenerul.");
          return { ...match, entity: data.entity };
        }
        const partner = await findPair(initial.partner!, initial.partnerIdentity!, root);
        const selection = { root, partner, checkpointId };
        const last = initial.peer ? await findPair(initial.peer, initial.peerIdentity!, partner.entity) : null;
        if (!controller.signal.aborted) { setPicked(selection); setPeer(last); }
      } catch (error) { if (!controller.signal.aborted) setLinkError(error instanceof Error ? error.message : "Linkul nu poate fi redeschis."); }
    })();
    return () => controller.abort();
  }, [base.data, base.busy]);

  function selectionFor(items: ConnectionEvidencePair[]): ConnectionEvidenceSelection {
    return { version: "connection-evidence-1", checkpointId: picked!.checkpointId, ...scope, pairs: items };
  }
  const pairs = picked ? [pair(picked.root, picked.partner.entity), ...(peer ? [pair(picked.partner.entity, peer.entity)] : [])] : [];
  const selection = picked ? selectionFor(pairs) : null;
  const title = picked ? [name(picked.root), name(picked.partner.entity), ...(peer ? [name(peer.entity)] : [])].join(" — ") : "";
  const firstTitle = picked ? `${name(picked.root)} — ${name(picked.partner.entity)}` : "";
  const listPending = base.busy || search !== rootSearch;
  const secondPending = second.busy || peerSearch !== secondSearch;

  return <div className="cx-shell">
    <Link className="cx-back" href={profileUrl({ id: entityId, role })}>Înapoi la profilul {isAuthority ? "instituției" : "firmei"}</Link>
    <header className="cx-header"><h1>Cum sunt legate?</h1><p>Pornește de la <strong>{currentName}</strong>. {isAuthority ? "Urmărește furnizorii și vezi la ce alte instituții apar." : "Urmărește instituțiile și vezi cu ce alte firme lucrează."}</p><p className="cx-meta">Fiecare legătură se deschide în achizițiile care o susțin.</p></header>
    <form className="cx-filters" onSubmit={apply}>
      <label>Tipul achizițiilor<select value={dataset} onChange={event => setDataset(event.target.value as Dataset)}><option value="all">Toate achizițiile</option><option value="da">Achiziții directe</option><option value="contracts">Contracte prin proceduri</option></select></label>
      <label>Din anul<input type="number" min="2000" max="2099" placeholder="Oricare" value={yearFrom} onChange={event => setYearFrom(event.target.value)} /></label>
      <label>Până în anul<input type="number" min="2000" max="2099" placeholder="Oricare" value={yearTo} onChange={event => setYearTo(event.target.value)} /></label>
      <button className="cx-primary" type="submit">Aplică filtrele</button>
    </form>
    {formError && <p className="cx-error" role="alert">{formError}</p>}
    <p className="cx-scope">{scopeText}</p>
    {linkError && <div className="cx-error" role="alert"><p>{linkError}</p><button onClick={() => { setLinkError(""); resetSelection(); }}>Alege din listă</button> {restart}</div>}
    {base.error ? <div className="cx-error" role="alert"><p>{base.error}</p><button onClick={base.retry}>Reîncearcă</button> {restart}</div> : <div className={`cx-workspace${picked ? " cx-has-selection" : ""}`}>
      <section className="cx-partners" aria-labelledby="partners-title">
        <div className="cx-list-heading"><h2 id="partners-title" tabIndex={-1}>{isAuthority ? "Cu cine lucrează?" : "Cine cumpără de aici?"}</h2><p className="cx-meta">{base.data ? `${number(base.data.pagination.totalPartners)} ${isAuthority ? "furnizori" : "instituții"}${rootSearch ? " găsiți" : ""} · ordonați după valoare` : "Partenerii din selecția aplicată"}</p></div>
        <label className="cx-search">{isAuthority ? "Caută un furnizor" : "Caută o instituție"}<input type="search" maxLength={150} placeholder="Nume sau CUI" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
        <div className="cx-list" aria-busy={listPending} tabIndex={0} role="region" aria-label={isAuthority ? "Lista furnizorilor" : "Lista instituțiilor"}>
          {listPending ? <LoadingRows /> : base.data?.items.map(item => <button className="cx-partner" key={item.entity.id} aria-pressed={picked?.partner.entity.id === item.entity.id} onClick={() => choose(item)}>
            <strong>{name(item.entity)}</strong><Identity entity={item.entity} /><span className="cx-partner-value">{formatEvidenceAmount(item.totalExact)}</span><span className="cx-meta">{recordLabel(records(item))}</span><span className="cx-open">Explorează legătura <Chevron /></span>
          </button>)}
          {!listPending && !base.data?.items.length && <div className="cx-empty"><h3>{rootSearch ? "Nicio potrivire în listă" : "Nicio legătură în această selecție"}</h3><p>{rootSearch ? "Încearcă o parte din nume sau codul fiscal." : "Poți extinde perioada sau include ambele tipuri de achiziții. Lipsa înregistrărilor nu dovedește lipsa unei relații."}</p>{search && <button onClick={() => { setSearch(""); setPage(1); }}>Șterge căutarea</button>}</div>}
        </div>
        {base.data && <Pager data={base.data} busy={listPending} onPage={setPage} />}
      </section>
      <section className="cx-detail" aria-labelledby="connection-title">
        {!picked ? <div className="cx-start"><h2 id="connection-title">O legătură, apoi următoarea.</h2><p>Alege {isAuthority ? "un furnizor" : "o instituție"} din listă pentru a vedea ce achiziții îl leagă de <strong>{currentName}</strong>.</p><p>De aici poți continua către {isAuthority ? "alte instituții care au cumpărat de la aceeași firmă" : "alte firme care au lucrat cu aceeași instituție"}, fără să pierzi punctul de plecare.</p><p className="cx-meta">Sursele și salvarea în anchetă rămân lângă fiecare legătură.</p></div> : <>
          <button className="cx-mobile-back" onClick={resetSelection}>Înapoi la {isAuthority ? "furnizori" : "instituții"}</button>
          <h2 id="connection-title" tabIndex={-1} ref={detailHeading}>{peer ? isAuthority ? "Două instituții, un furnizor comun" : "Două firme, o instituție comună" : "Achizițiile care le leagă"}</h2>
          <ol className="cx-path" aria-label="Traseul legăturilor documentate">
            {[picked.root, picked.partner.entity, ...(peer ? [peer.entity] : [])].map((node, index) => <li key={`${node.id}:${node.role}`}>
              {index > 0 && <span className="cx-edge-label">{index === 1 ? isAuthority ? "a cumpărat de la" : "a furnizat către" : isAuthority ? "a furnizat către" : "a cumpărat de la"}</span>}
              <Link href={profileUrl(node)}>{name(node)}</Link><span className="cx-meta">{node.role === "authority" ? "Autoritate contractantă" : "Furnizor"}</span><Identity entity={node} />
            </li>)}
          </ol>
          {peer ? <>
            <p className="cx-meaning">{isAuthority ? "Aceste instituții apar în achiziții cu același furnizor." : "Aceste firme apar în achiziții ale aceleiași instituții."} Traseul nu stabilește proprietate comună, transferuri între capete sau existența unei nereguli.</p>
            <div className="cx-legs">{[picked.partner, peer].map((item, index) => <div className="cx-leg" key={index}><h3>{index === 0 ? firstTitle : `${name(picked.partner.entity)} — ${name(peer.entity)}`}</h3><PairFacts item={item} /><button onClick={() => setSources({ selection: selectionFor([pairs[index]!]), title: index === 0 ? firstTitle : `${name(picked.partner.entity)} — ${name(peer.entity)}` })}>{sourceLabel(records(item))}</button></div>)}</div>
            <p className="cx-meta">Împreună: {recordLabel(records(picked.partner) + records(peer))} · {formatEvidenceAmount(sumDecimalStrings([picked.partner.totalExact, peer.totalExact]))}. Un contract cu mai mulți furnizori poate apărea prin cote diferite.</p>
          </> : <PairFacts item={picked.partner} />}
          <div className="cx-evidence-actions"><button className="cx-primary" onClick={() => setSources({ selection: selection!, title })}>{peer ? "Vezi sursele ambelor legături" : sourceLabel(records(picked.partner))}</button>
            <ClipButton key={JSON.stringify(selection)} kind="query" spec={connectionEvidenceSpec(selection!)} label={title} snapshot={{ connection: selection }} />
          </div><p className="cx-meta">{peer ? "Salvarea păstrează ambele relații și sursele lor în aceeași probă." : "Salvarea păstrează această relație și toate sursele ei."} Valorile înregistrate nu reprezintă automat plăți.</p>
          {peer ? <button className="cx-return" onClick={() => { setPeer(null); remember(picked, null); }}>Vezi alte legături ale {name(picked.partner.entity)}</button> : <section className="cx-second" aria-labelledby="second-title">
            <h3 id="second-title">{isAuthority ? "Unde mai apare acest furnizor?" : "Cu ce alte firme lucrează?"}</h3><p className="cx-meta">{isAuthority ? "Alte instituții care au cumpărat de la aceeași firmă." : "Alți furnizori ai aceleiași instituții."} Aceleași filtre de perioadă și achiziții.</p>
            <label className="cx-search">{isAuthority ? "Caută între celelalte instituții" : "Caută între ceilalți furnizori"}<input type="search" maxLength={150} placeholder="Nume sau CUI" value={peerSearch} onChange={event => { setPeerSearch(event.target.value); setPeerPage(1); }} /></label>
            {second.error ? <div className="cx-error" role="alert"><p>{second.error}</p><button onClick={second.retry}>Reîncearcă</button> {restart}</div> : <div className="cx-peer-list" aria-busy={secondPending} tabIndex={0} role="region" aria-label="Lista celorlalți parteneri">
              {secondPending ? <LoadingRows /> : second.data?.items.map(item => <div className="cx-peer" key={item.entity.id}><div><strong>{name(item.entity)}</strong><Identity entity={item.entity} /><span className="cx-meta">{formatEvidenceAmount(item.totalExact)} · {recordLabel(records(item))}</span></div><button onClick={() => choosePeer(item)}>Vezi legătura <Chevron /></button></div>)}
              {!secondPending && !second.data?.items.length && <p className="cx-empty">{peerSearch ? "Nicio potrivire. Încearcă alt nume sau șterge căutarea." : "Nu apar alți parteneri identificați în selecția aplicată. Poți extinde perioada sau schimba tipul achizițiilor."}</p>}
            </div>}
            {second.data && <><p className="cx-meta">{number(second.data.pagination.totalPartners)} {isAuthority ? "alte instituții" : "alte firme"}{peerSearch ? " găsite" : ""}</p><Pager data={second.data} busy={secondPending} onPage={setPeerPage} /></>}
          </section>}
        </>}
      </section>
    </div>}
    <details className="cx-method"><summary>Ce arată aceste legături și ce date includem?</summary><p>Legăturile descriu achiziții înregistrate între o autoritate și un furnizor. Un partener comun este un punct de pornire pentru documentare; nu dovedește o relație de proprietate sau o neregulă.</p><p>Includem achiziții directe cu valoare pozitivă de cel mult 2.000.000 lei și cote de contract cu valoare pozitivă, conform selecției standard a aplicației. Pragul de 2.000.000 lei este o regulă de filtrare a valorilor suspecte, nu un prag legal. Înregistrările fără valoare eligibilă nu intră în acest ecran.</p><p>Contractele se numără separat de cotele atribuite furnizorilor. Când valorile pe membri lipsesc, aplicația împarte valoarea contractului între câștigători. TED completează sursele, fără a adăuga din nou valoarea contractului.</p><p>Perioada se aplică datei de finalizare. Fără limite de an includem și înregistrările fără dată; cu limite, acestea nu pot fi încadrate și sunt excluse.</p>
      {!!base.data?.excluded.rowCount && <p>{number(base.data.excluded.rowCount)} înregistrări eligibile, în valoare de {formatEvidenceAmount(base.data.excluded.totalExact)}, au un partener neidentificat sau aceeași identitate la ambele capete și nu apar în listă.</p>}
      {!!second.data?.excluded.rowCount && <p>Pentru partenerul selectat, încă {number(second.data.excluded.rowCount)} înregistrări eligibile au un partener neidentificat sau aceeași identitate la ambele capete.</p>}
      <p>{base.data?.checkpoint.validatedAt ? `Versiunea consultată a fost verificată tehnic la ${new Date(base.data.checkpoint.validatedAt).toLocaleDateString("ro-RO")}. Aceasta nu este data colectării achizițiilor.` : "Legăturile se încarcă doar dintr-o versiune verificată a datelor."} <Link href="/metodologie#acoperire">Surse, acoperire și limite</Link></p>
    </details>
    {sources && <EvidenceDrawer spec={connectionEvidenceSpec(sources.selection)} connection={sources.selection} title={sources.title} onClose={() => setSources(null)} />}
  </div>;
}

function Chevron() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>; }

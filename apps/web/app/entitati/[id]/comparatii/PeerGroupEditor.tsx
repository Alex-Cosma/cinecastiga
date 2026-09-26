"use client";

import { useEffect, useRef, useState } from "react";
import { cleanName } from "@/lib/format";
import type { ConnectionRole } from "@/lib/connections-shared";
import type { PeerCandidate, PeerCandidatesResult, PeerPopulation, PeerSelectionMember, PeersResponse } from "@/lib/peers-shared";

export function Population({ population, difference = true }: { population?: PeerPopulation | undefined; difference?: boolean }) {
  if (!population) return <span className="px-meta">Populație neidentificată</span>;
  const delta = population.differencePercent;
  return <span className="px-population"><a href={population.sourceUrl} target="_blank" rel="noreferrer" title={`${population.unitName} · recensământ ${population.referenceDate} · rândul ${population.sourceRow}`} aria-label={`${population.value.toLocaleString("ro-RO")} locuitori. Sursa INS, recensământ ${population.referenceDate}, rândul ${population.sourceRow}`}>{population.value.toLocaleString("ro-RO")} locuitori</a>{difference && delta !== null && <span className="px-difference">{delta > 0 ? "+" : ""}{delta.toLocaleString("ro-RO", { maximumFractionDigits: 2 })}% față de {population.level === "county" ? "județul" : "populația"} de referință</span>}</span>;
}

export default function PeerGroupEditor({ data, role, busy, onChange, onReset }: {
  data: PeersResponse; role: ConnectionRole; busy: boolean;
  onChange: (members: PeerSelectionMember[], populationVersion?: string) => void; onReset: () => void;
}) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState("");
  const [result, setResult] = useState<PeerCandidatesResult | null>(null), [error, setError] = useState("");
  const [pending, setPending] = useState(false), [retry, setRetry] = useState(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const manual = data.filters.method === "manual";
  const complete = data.members.length === data.cohort.count;
  const members = data.filters.members ?? data.members.map(member => ({ id: member.entity.id, identity: member.entity.identity }));
  const canEdit = manual || complete;
  const searchKey = new URLSearchParams({ entityId: data.entity.id, role, search: search.trim(), checkpointId: data.checkpoint.id, identity: data.entity.identity, ...(data.filters.populationVersion ? { populationVersion: data.filters.populationVersion } : {}) }).toString();
  useEffect(() => {
    if (!open || !canEdit || search.trim().length < 2) { setResult(null); setPending(false); setError(""); return; }
    const controller = new AbortController(); setPending(true); setResult(null); setError("");
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/peers/candidates?${searchKey}`, { signal: controller.signal });
          const body = await response.json();
          if (controller.signal.aborted) return;
          if (!response.ok) { setError(body.error ?? "Căutarea nu este disponibilă."); return; }
          setResult(body as PeerCandidatesResult);
        } catch { if (!controller.signal.aborted) setError("Căutarea a fost întreruptă. Reîncearcă."); }
        finally { if (!controller.signal.aborted) setPending(false); }
      })();
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, canEdit, search, searchKey, retry]);
  function add(candidate: PeerCandidate) {
    onChange([...members, { id: candidate.entity.id, identity: candidate.entity.identity }], result?.populationVersion);
    searchInput.current?.focus();
  }
  return <section className="px-editor" aria-label="Alege grupul de comparație">
    <div className="px-editor-heading"><div><strong>{manual ? "Grup ales de tine" : "Tu alegi cu cine compari"}</strong><p className="px-meta">{manual ? `${members.length} din maximum 50 de entități. Selecția se păstrează când schimbi anul sau domeniul.` : "Poți adăuga alte entități sau le poți scoate pe cele sugerate."}</p></div><div className="px-editor-actions"><button type="button" aria-expanded={open} aria-controls="peer-group-editor" onClick={() => { setOpen(!open); if (!open) requestAnimationFrame(() => searchInput.current?.focus()); }}>{open ? "Închide editarea" : "Personalizează grupul"}</button>{manual && <button type="button" disabled={busy} onClick={onReset}>Revino la sugestii</button>}</div></div>
    {open && <div id="peer-group-editor" className="px-editor-body">
      {!canEdit ? <><p>Grupul automat are {data.cohort.count.toLocaleString("ro-RO")} de entități. Pentru o selecție proprie, începe cu un grup gol și adaugă până la 50 de entități.</p><button disabled={busy} onClick={() => onChange([])}>Începe un grup propriu</button></> : <>
        <label htmlFor="peer-candidate-search">Adaugă {role === "authority" ? "o instituție" : "o firmă"}</label>
        <input ref={searchInput} id="peer-candidate-search" type="search" autoComplete="off" placeholder="Caută după denumire sau CUI" value={search} onChange={event => setSearch(event.target.value)} aria-describedby="peer-search-help" />
        <p id="peer-search-help" className="px-meta">Poți alege și entități cu altă populație sau de alt tip. Sursa și diferența de populație rămân vizibile.</p>
        <div className="px-candidates" aria-busy={pending}>
          {search.trim().length < 2 ? <p className="px-meta">Scrie cel puțin două caractere pentru a căuta.</p> : pending ? <p role="status" className="px-meta">Se caută entități…</p> : error ? <div role="alert"><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>Reîncearcă</button></div> : result && <>
            {result.items.length === 0 && <p role="status" className="px-meta">Nicio entitate găsită. Încearcă altă denumire sau CUI-ul.</p>}
            {result.items.map(candidate => { const selected = members.some(member => member.id === candidate.entity.id); return <div key={candidate.entity.id} className="px-candidate"><div><strong>{cleanName(candidate.entity.name)}</strong><span className="px-meta">{candidate.entity.county ?? "Județ neidentificat"}{candidate.entity.cui ? ` · CUI ${candidate.entity.cui}` : ""}</span><Population population={candidate.population} /></div><button disabled={busy || selected || members.length >= 50} aria-label={`${selected ? "Deja în grup" : "Adaugă"}: ${cleanName(candidate.entity.name)}`} onClick={() => add(candidate)}>{selected ? "În grup" : "Adaugă"}</button></div>; })}
            {result.hasMore && <p className="px-meta">Primele 20 de rezultate. Precizează denumirea pentru a restrânge căutarea.</p>}
          </>}
        </div>
        {members.length >= 50 && <p role="status" className="px-notice">Ai ajuns la 50 de entități. Scoate una pentru a putea adăuga alta.</p>}
        <div className="px-selected"><p className="px-meta">În grup · {members.length}{members.length === 0 ? ". Caută mai sus prima entitate pe care vrei să o compari." : " — scoate orice entitate din selecție:"}</p><div className="px-selected-list">{data.members.map(member => <button type="button" disabled={busy} key={member.entity.id} aria-label={`Scoate din grup: ${cleanName(member.entity.name)}`} onClick={() => { onChange(members.filter(item => item.id !== member.entity.id)); searchInput.current?.focus(); }}><span>{cleanName(member.entity.name)}</span><span className="px-remove-label">Scoate</span></button>)}</div></div>
      </>}
    </div>}
  </section>;
}

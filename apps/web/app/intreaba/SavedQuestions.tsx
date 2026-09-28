"use client";

import { useEffect, useRef, useState } from "react";
import type { RecipeSummary, RecipeVersion } from "@/lib/recipes";
import { describeQuestion, type QuestionSpec } from "@/lib/ask/question-ui";
import { describePopulation } from "@/lib/ask/population";
import { validateSpec } from "@/lib/ask/spec";
import { encodeSpec } from "@/lib/ask/permalink";

export type SavedQuestion = { id:string; title:string; version:number; spec:QuestionSpec };

function summary(raw: unknown) {
  const spec = validateSpec(raw);
  if ("error" in spec) return "Deschide pentru a verifica această întrebare.";
  return [describeQuestion(spec), spec.dataset === "contracts" ? "Contracte din proceduri" : spec.dataset === "da" ? "Achiziții directe" : null,
    spec.filters.authorityName || (spec.filters.authorityId ? `Instituția #${spec.filters.authorityId}` : null),
    spec.filters.supplierName || (spec.filters.supplierId ? `Firma #${spec.filters.supplierId}` : null),
    spec.filters.cpvTerm ? `CPV: ${spec.filters.cpvTerm}` : null,
    spec.population ? describePopulation(spec.population) : null,
    spec.minimumRecords ? `Minimum ${spec.minimumRecords.count} înregistrări` : null].filter(Boolean).join(" · ");
}

export default function SavedQuestions({ search, current, hasUnsavedChanges, onLoad }: {
  search:string; current:QuestionSpec; hasUnsavedChanges:boolean; onLoad:(question:SavedQuestion)=>void;
}) {
  const [items, setItems] = useState<RecipeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [login, setLogin] = useState(false);
  const [retry, setRetry] = useState(0);
  const [candidate, setCandidate] = useState<SavedQuestion | null>(null);
  const request = useRef<AbortController | null>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  const selectedRow = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    request.current?.abort();
    const ctrl = new AbortController(); request.current = ctrl;
    setLoading(true); setError(""); setLogin(false); setItems([]); setCandidate(null); setOpening(null);
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/recipes?q=${encodeURIComponent(search.trim())}`, { signal:ctrl.signal, cache:"no-store" });
        if (r.status === 401) { setLogin(true); return; }
        if (!r.ok) throw new Error("Nu am putut încărca întrebările. Încearcă din nou.");
        const data = await r.json();
        if (!ctrl.signal.aborted) setItems(data.recipes);
      } catch (e) { if (!ctrl.signal.aborted) setError((e as Error).message); }
      finally { if (!ctrl.signal.aborted) setLoading(false); }
    }, 180);
    return () => { clearTimeout(timer); ctrl.abort(); request.current?.abort(); };
  }, [search, retry]);
  useEffect(() => { if (candidate) confirmation.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [candidate]);

  async function open(item:RecipeSummary, element:HTMLButtonElement) {
    if (opening) return;
    selectedRow.current = element;
    request.current?.abort();
    const ctrl = new AbortController(); request.current = ctrl;
    setOpening(item.id); setError("");
    try {
      const r = await fetch(`/api/recipes/${item.id}`, { signal:ctrl.signal, cache:"no-store" });
      if (r.status === 401) { setItems([]); setLogin(true); return; }
      if (!r.ok) throw new Error("Întrebarea nu mai este disponibilă. Reîncarcă lista.");
      const data = await r.json() as { recipe:RecipeVersion };
      const spec = validateSpec(data.recipe.spec);
      if ("error" in spec) throw new Error(`Întrebarea nu poate fi încărcată: ${spec.error}`);
      if (ctrl.signal.aborted) return;
      const next = { id:data.recipe.id, title:data.recipe.title, version:data.recipe.version, spec:spec as QuestionSpec };
      if (hasUnsavedChanges) setCandidate(next); else onLoad(next);
    } catch (e) { if (!ctrl.signal.aborted) setError((e as Error).message); }
    finally { if (!ctrl.signal.aborted) setOpening(null); }
  }

  const next = `/intreaba?spec=${encodeURIComponent(encodeSpec(current))}&mode=builder`;
  return <div className="cq-saved-list" aria-busy={loading || !!opening}>
    {loading ? <p role="status">Se încarcă întrebările salvate…</p> : login ? <p>Întrebările salvate sunt private. <a href={`/login?next=${encodeURIComponent(next)}`}>Autentifică-te pentru a le vedea</a>.</p> : <>
      {candidate && <div className="cq-replace-question" ref={confirmation} role="group" aria-label="Confirmă înlocuirea întrebării">
        <h3>Înlocuiești întrebarea curentă?</h3><p>Ai modificări nesalvate. Dacă încarci „{candidate.title}”, acestea se pierd.</p>
        <div><button type="button" onClick={() => { setCandidate(null); requestAnimationFrame(() => selectedRow.current?.focus()); }}>Păstrează întrebarea curentă</button><button type="button" onClick={() => onLoad(candidate)}>Înlocuiește și încarcă</button></div>
      </div>}
      {items.map(item => <button type="button" hidden={!!candidate} className="cq-saved-row" key={item.id} disabled={!!opening} onClick={event => void open(item,event.currentTarget)}>
        <span><strong>{item.title}</strong><span className="cq-saved-summary">{summary(item.spec)}</span><small>{opening === item.id ? "Se încarcă…" : `Salvată ${new Date(item.updatedAt).toLocaleDateString("ro-RO")}`}</small></span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>
      </button>)}
      {!items.length && !error && <p>{search.trim() ? "Nicio întrebare cu acest nume. Încearcă alt termen." : "Nu ai întrebări salvate încă. Construiește una și apasă „Salvează întrebarea”, lângă „Vezi răspunsul”."}</p>}
      {items.length === 200 && <p>Primele 200 de întrebări, în ordinea ultimei salvări. Caută după nume pentru a le găsi și pe cele mai vechi.</p>}
    </>}
    {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(v=>v+1)}>Reîncarcă lista</button></div>}
  </div>;
}

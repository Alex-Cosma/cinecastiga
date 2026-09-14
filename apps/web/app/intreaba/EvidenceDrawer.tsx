"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AskSpec } from "@/lib/ask/spec";
import type { DrillResult, DrillSort } from "@/lib/ask/compile";
import { EVIDENCE_CSV_LIMIT, evidenceLinks, formatEvidenceAmount, PROFILE_BLOCKS, type EvidenceScope } from "@/lib/ask/evidence";
import { FLAG_META } from "@/lib/flags";
import ClipButton from "@/components/ClipButton";
import { encodeSpec } from "@/lib/ask/permalink";
import "./evidence-drawer.css";

export interface EvidenceDrawerProps {
  spec: AskSpec;
  title: string;
  scope?: EvidenceScope | undefined;
  onClose: () => void;
  onSave?: (() => void) | undefined;
}

type Response = ({ ok: true } & DrillResult) | { ok: false; error: string };
const count = (n: number) => n.toLocaleString("ro-RO");
const date = (value: string | null) => value ? value.split("-").reverse().join(".") : "Dată neprecizată";

export default function EvidenceDrawer({ spec, title, scope, onClose, onSave }: EvidenceDrawerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [responseData, setResult] = useState<DrillResult | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [stream, setStream] = useState("");
  const [sort, setSort] = useState<DrillSort>(() => !PROFILE_BLOCKS.includes(spec.block) && !spec.filters.authorityId && !spec.filters.authorityName && !spec.filters.supplierId && !spec.filters.supplierName ? "source" : "value");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [exporting, setExporting] = useState<"all" | "filtered" | null>(null);
  const [exportMessage, setExportMessage] = useState("");
  const exportController = useRef<AbortController | null>(null);
  const queryKey = JSON.stringify({ spec, scope });
  const result = loadedKey === queryKey ? responseData : null;
  const activeQuery = useRef(queryKey);
  activeQuery.current = queryKey;
  const filtered = !!(search.trim() || state || stream);

  useEffect(() => {
    const node = dialog.current;
    const focused = document.activeElement;
    const previous = (focused instanceof HTMLElement || focused instanceof SVGElement) && "focus" in focused
      ? focused as HTMLElement | SVGElement & { focus: () => void } : null;
    const oldOverflow = document.body.style.overflow;
    node?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      exportController.current?.abort();
      node?.close();
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    setResult(null); setSearch(""); setState(""); setStream(""); setPage(0); setExportMessage("");
    exportController.current?.abort(); setExporting(null);
  }, [queryKey]);

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError("");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/ask/rows", {
          method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal,
          body: JSON.stringify({ ...JSON.parse(queryKey), page, sort, dir, search, state, stream }),
        });
        const data = await response.json() as Response;
        if (controller.signal.aborted || activeQuery.current !== queryKey) return;
        if (!data.ok) throw new Error(data.error);
        setResult(data); setLoadedKey(queryKey);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Sursele nu au putut fi încărcate.");
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, search ? 300 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [queryKey, search, state, stream, sort, dir, page, retry]);

  function reset() { setSearch(""); setState(""); setStream(""); setPage(0); }

  async function exportCsv(which: "all" | "filtered") {
    exportController.current?.abort();
    const controller = new AbortController();
    exportController.current = controller;
    const requestedQuery = queryKey;
    setExporting(which); setExportMessage("");
    try {
      const response = await fetch("/api/ask/rows/csv", {
        method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ ...JSON.parse(queryKey), sort, dir, ...(which === "filtered" ? { search, state, stream } : {}) }),
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("text/csv")) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? "Exportul nu a putut fi generat.");
      }
      const blob = await response.blob();
      if (controller.signal.aborted || activeQuery.current !== requestedQuery) return;
      const total = Number(response.headers.get("x-total-rows"));
      const exported = Number(response.headers.get("x-exported-rows"));
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "surse-seap.csv";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(href), 1_000);
      setExportMessage(exported < total
        ? `Export parțial: primele ${count(exported)} din ${count(total)} înregistrări. Limita unui fișier este de 100.000 de rânduri; restrânge întrebarea pentru un export integral.`
        : `${count(exported)} înregistrări exportate, cu valorile exacte și linkurile către surse.`);
    } catch (e) {
      if (!controller.signal.aborted) setExportMessage(e instanceof Error ? e.message : "Export nereușit.");
    } finally {
      if (!controller.signal.aborted) setExporting(null);
    }
  }

  return <dialog ref={dialog} className="evidence-drawer" aria-labelledby="evidence-title"
    onCancel={(event) => { event.preventDefault(); closeRef.current(); }}
    onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeRef.current();
    }}>
    <header className="ev-header">
      <div><p className="ev-eyebrow">Datele din spatele răspunsului</p><h2 id="evidence-title">Poți verifica fiecare leu.</h2></div>
      <button type="button" className="ev-close" onClick={onClose} aria-label="Închide lista surselor" autoFocus>×</button>
    </header>
    <div className="ev-content">
      <p className="ev-question">{title}</p>
      <div className="ev-source-summary" aria-live="polite">
        <div><span>Înregistrări în această selecție</span><strong>{result ? count(result.sourceTotal) : "—"}</strong></div>
        <div><span>{result?.profile ? "Valoare înregistrată în profil" : "Valoare înregistrată"}</span><strong className="ev-money">{result ? formatEvidenceAmount(result.sourceValue) : "—"}</strong></div>
        <p>{result?.dateFrom ? `${date(result.dateFrom)} — ${date(result.dateTo)}` : result ? "Nicio dată de finalizare disponibilă în selecție." : "Acoperirea înregistrărilor se afișează după încărcare."}</p>
      </div>
      {result?.profile && <div className="ev-profile-note">
        <strong>Profilul include și oferte neacceptate.</strong>
        <p>Doar ofertele acceptate: <b>{count(result.accepted.count)}</b> înregistrări, <b>{formatEvidenceAmount(result.accepted.value)}</b>. Poți selecta starea mai jos.</p>
        {result.profileReconciled === true && <p className="ev-reconciled">✓ Numărul și suma surselor coincid cu agregatele celor {count(result.profileCount)} profiluri selectate.</p>}
        {result.profileReconciled === false && <p className="ev-mismatch">Agregatul profilului și sursele actuale diferă. Lista arată datele disponibile acum; verifică explicația de mai jos.</p>}
      </div>}
      {result && <details className="ev-calculation">
        <summary>Cum ajungem la acest rezultat <span aria-hidden="true">+</span></summary>
        <p>Numărul reprezintă rândurile incluse. Totalul însumează valorile înregistrate ale acelor rânduri, înainte de rotunjirea pentru afișare. Căutarea, starea și pagina din această listă nu schimbă întrebarea aplicată.</p>
        <p className="ev-exact-total">Suma în precizia stocată: <strong>{formatEvidenceAmount(result.sourceValue, true)}</strong>. Afișarea principală este rotunjită la bani; CSV păstrează toate zecimalele, inclusiv cotele din consorții.</p>
        {filtered && <p className="ev-exact-total">Suma exactă a listei filtrate: <strong>{formatEvidenceAmount(result.value, true)}</strong>.</p>}
        {result.scopeNotes.map((note, i) => <p key={i}>{note}</p>)}
        {result.profile && <>
          <p>Indicele de risc (CRI) = numărul semnalelor active ÷ numărul indicatorilor aplicabili: 5 pentru autorități, 4 pentru furnizori. <Link href="/metodologie" target="_blank" rel="noopener noreferrer">Vezi metodologia ↗</Link></p>
          {result.profiles.map((p) => <div className="ev-formula-profile" key={`${p.role}:${p.entityId}`}>
            <Link href={`/entitati/${p.entityId}`} target="_blank" rel="noopener noreferrer">{p.name} ↗</Link>
            <span>{p.flags.length} ÷ {p.applicable} = {p.cri === null ? "indice indisponibil" : p.cri.toLocaleString("ro-RO", { maximumFractionDigits: 4 })}</span>
            <small>{p.flags.length ? p.flags.map((flag) => FLAG_META[flag]?.title ?? flag).join(" · ") : "Niciun indicator activ"}</small>
          </div>)}
          {result.profileCount > result.profiles.length && <p>Sunt prezentate primele {result.profiles.length} profiluri din {count(result.profileCount)}. Pentru formula unei entități, deschide profilul din diagramă. Lista de surse include întreaga selecție.</p>}
        </>}
      </details>}
      <div className="ev-filters">
        <label className="ev-search"><span>Caută în această listă</span><input type="search" value={search} maxLength={200} placeholder="Firmă, instituție, cod sau obiect…" onChange={(e) => { setSearch(e.target.value); setPage(0); }} /></label>
        <label><span>Starea ofertei</span><select value={state} onChange={(e) => { setState(e.target.value); setPage(0); }}>
          <option value="">Toate stările</option>
          {result?.statuses.map((s) => <option key={s.state ?? "__unknown"} value={s.state ?? "__unknown"}>{s.state ?? "Stare nepublicată / contract"} · {count(s.count)}</option>)}
        </select></label>
        {!result?.profile && (spec.dataset ?? "all") === "all" && <label><span>Canal</span><select value={stream} onChange={(e) => { setStream(e.target.value); setPage(0); }}><option value="">Toate sursele</option><option value="da">Achiziții directe</option><option value="contracts">Contracte</option></select></label>}
      </div>
      <div className="ev-list-toolbar">
        <div className="ev-filtered-summary" aria-live="polite">{busy ? "Se încarcă sursele…" : result ? <><strong>{count(result.total)} {filtered ? "potriviri" : "înregistrări"}</strong> · {formatEvidenceAmount(result.value)}</> : ""}{filtered && <button type="button" onClick={reset}>Șterge filtrele listei</button>}</div>
        <label className="ev-sort"><span className="ev-sr-only">Ordonează sursele</span><select value={`${sort}:${dir}`} onChange={(e) => { const [key, direction] = e.target.value.split(":"); setSort(key as DrillSort); setDir(direction as "asc" | "desc"); setPage(0); }}>
          <option value="source:desc">Ordinea sursei</option><option value="value:desc">Valoare ↓</option><option value="value:asc">Valoare ↑</option><option value="date:desc">Cele mai recente</option><option value="date:asc">Cele mai vechi</option><option value="supplier:asc">Furnizor A–Z</option><option value="authority:asc">Instituție A–Z</option>
        </select></label>
      </div>
      {error && <div className="ev-error" role="alert"><p>{error}</p><button type="button" onClick={() => setRetry((v) => v + 1)}>Încearcă din nou</button></div>}
      <div className={`ev-records${busy ? " ev-loading" : ""}`} aria-busy={busy}>
        {!error && result && result.rows.length === 0 && <div className="ev-empty"><strong>Nicio înregistrare{filtered ? " pentru aceste filtre" : " în selecție"}.</strong><p>{filtered ? "Totalul selecției rămâne vizibil mai sus. Șterge filtrele pentru a reveni la toate sursele." : "Absența unui rezultat se referă la datele și condițiile acestei întrebări."}</p></div>}
        {result && result.rows.length > 0 && <table className="ev-table"><caption className="ev-sr-only">Înregistrările sursă pentru {title}</caption>
          <thead><tr><th>Înregistrare</th><th>Instituție → furnizor</th><th>Valoare (lei)</th><th>Stare și sursă</th></tr></thead>
          <tbody>{result.rows.map((r) => {
            const links = evidenceLinks(r);
            return <tr key={`${r.src}:${r.refId}:${r.supplierId}`}>
              <td data-label="Înregistrare"><strong>{r.daCode ?? `#${r.refId ?? "?"}`}</strong><span className="ev-muted">{date(r.date)} · {r.src === "da" ? "Achiziție directă" : "Contract"}</span><span>{r.cpvName ?? "Categorie CPV neprecizată"}</span><small className="ev-muted">{r.cpvCode ? `CPV ${r.cpvCode}` : ""}</small></td>
              <td data-label="Instituție și furnizor"><div className="ev-party">{r.authorityId ? <Link href={`/entitati/${r.authorityId}`} target="_blank" rel="noopener noreferrer">{r.authority ?? `Instituție #${r.authorityId}`}</Link> : r.authority ?? "Instituție neprecizată"}</div><span className="ev-party-arrow" aria-hidden="true">↓</span><div className="ev-party">{r.supplierId ? <Link href={`/entitati/${r.supplierId}`} target="_blank" rel="noopener noreferrer">{r.supplier ?? `Furnizor #${r.supplierId}`}</Link> : r.supplier ?? "Furnizor neprecizat"}</div><small className="ev-muted">{r.county ?? "Județ neprecizat"}</small></td>
              <td data-label="Valoare"><strong className="ev-row-value">{formatEvidenceAmount(r.valueExact)}</strong>{r.valueSuspect && <span className="ev-warning">Valoare posibil introdusă eronat</span>}{r.nWinners && r.nWinners > 1 ? <span className="ev-muted">Cotă 1/{r.nWinners} din contract</span> : null}
                <details className="ev-record-details"><summary>Detalii importate</summary><dl><dt>ID SEAP</dt><dd>{r.src === "da" ? r.refId : r.caNoticeId ?? "Lipsește"}</dd><dt>ID rând</dt><dd>{r.refId}</dd><dt>Valoare exactă</dt><dd>{r.valueExact} RON</dd>{r.contractValueFull !== null && <><dt>Contract integral</dt><dd>{formatEvidenceAmount(r.contractValueFull)}</dd><dt>Câștigători</dt><dd>{r.nWinners}</dd></>}{r.estimatedValueRon !== null && <><dt>Valoare estimată</dt><dd>{r.estimatedValueRon.toLocaleString("ro-RO")} lei</dd></>}</dl></details>
              </td>
              <td data-label="Stare și sursă"><span className={`ev-state${r.state === "Oferta acceptata" ? " ev-state-accepted" : ""}`}>{r.state ?? (r.src === "contracts" ? "Contract atribuit" : "Stare neprecizată")}</span>{links.seap ? <a className="ev-seap" href={links.seap} target="_blank" rel="noopener noreferrer" aria-label={`Deschide ${r.daCode ?? r.refId} în SEAP`}>Vezi în SEAP ↗</a> : <span className="ev-source-missing">Identificatorul SEAP lipsește din import.</span>}{links.ted && <a className="ev-ted" href={links.ted} target="_blank" rel="noopener noreferrer">Același anunț în TED ↗</a>}</td>
            </tr>;
          })}</tbody>
        </table>}
      </div>
      {result && result.total > result.pageSize && <nav className="ev-pagination" aria-label="Pagini de înregistrări"><button type="button" disabled={busy || result.page === 0} onClick={() => setPage(result.page - 1)}>← Înapoi</button><span>Pagina {count(result.page + 1)} din {count(Math.ceil(result.total / result.pageSize))}</span><button type="button" disabled={busy || (result.page + 1) * result.pageSize >= result.total} onClick={() => setPage(result.page + 1)}>Înainte →</button></nav>}
      {result && result.sourceTotal > EVIDENCE_CSV_LIMIT && <p className="ev-export-limit">Un export este limitat la 100.000 de rânduri. Dacă selecția depășește limita, fișierul și confirmarea indică explicit că exportul este parțial.</p>}
      {exportMessage && <p className="ev-export-message" role="status">{exportMessage}</p>}
    </div>
    <footer className="ev-footer"><div><button type="button" className="ev-export-main" disabled={!result || busy || !!exporting} onClick={() => void exportCsv("all")}>{exporting === "all" ? "Se exportă…" : result && result.sourceTotal > EVIDENCE_CSV_LIMIT ? "Exportă primele 100.000 · CSV" : "Exportă toate · CSV"}</button><button type="button" disabled={!result || busy || !!exporting || !filtered} onClick={() => void exportCsv("filtered")}>{exporting === "filtered" ? "Se exportă…" : result && result.total > EVIDENCE_CSV_LIMIT ? "Lista filtrată · primele 100.000" : "Exportă lista filtrată"}</button></div>{onSave ? <button type="button" className="ev-save" onClick={onSave}>+ Salvează în Anchete</button> : result && <ClipButton key={queryKey} kind="query" spec={spec} label={title} snapshot={{
      title, headline: `${count(result.sourceTotal)} înregistrări · ${formatEvidenceAmount(result.sourceValue)}`,
      pills: [], evidenceScope: scope ?? null, sourceTotal: result.sourceTotal, sourceValue: result.sourceValue,
      dateFrom: result.dateFrom, dateTo: result.dateTo, profile: result.profile, scopeNotes: result.scopeNotes,
      capturedAt: new Date().toISOString(), snapshotKind: "query-scope-and-totals",
      sourceUrl: `/intreaba?spec=${encodeURIComponent(encodeSpec(spec))}&drill=1${scope ? `&evidence=${encodeURIComponent(JSON.stringify(scope))}` : ""}`,
    }} />}</footer>
  </dialog>;
}

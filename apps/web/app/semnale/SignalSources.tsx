"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { SourceEvidence } from "@/lib/source-evidence";
import { evidenceLinks, formatEvidenceAmount } from "@/lib/ask/evidence";
import { formatInt, formatExactDecimal } from "@/lib/format";
import ClipButton from "@/components/ClipButton";
import SignalDialog from "./SignalDialog";

type Response = Omit<SourceEvidence, "records"> & { page: number; records: (SourceEvidence["records"][number] & { title?: string | null })[] };
export default function SignalSources({ id, onClose }: { id: string; onClose: () => void }) {
  const [page, setPage] = useState(0), [retry, setRetry] = useState(0), [error, setError] = useState("");
  const [loaded, setLoaded] = useState<{ key: string; data: Response } | null>(null), [busy, setBusy] = useState(true), [slow, setSlow] = useState(false);
  // The existing endpoint returns chunks of 50; show ten at a time without refetching the same chunk.
  const chunk = Math.floor(page / 5), key = `${id}:${chunk}:${retry}`, result = loaded?.key === key ? loaded.data : null;
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setBusy(true); setError(""); setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), 7000);
    const timeout = setTimeout(() => { controller.abort(); if (active) { setError("Sursele nu au răspuns la timp. Poți reîncerca."); setBusy(false); } }, 45000);
    fetch(`/api/evidence/sources?kind=signal&id=${id}&format=json&page=${chunk}`, { signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Sursele nu au putut fi încărcate."); if (active) {
        setLoaded({ key, data }); if (data.page !== chunk) setPage(data.page * 5);
      } })
      .catch(e => { if (active && !controller.signal.aborted) setError(e instanceof Error ? e.message : "Sursele nu au putut fi încărcate."); })
      .finally(() => { clearTimeout(timeout); clearTimeout(slowTimer); if (active) setBusy(false); });
    return () => { active = false; controller.abort(); clearTimeout(timeout); clearTimeout(slowTimer); };
  }, [key, id, chunk]);
  const records = result?.records.slice(page % 5 * 10, page % 5 * 10 + 10) ?? [];
  const financials = result && Array.isArray(result.context.financials) ? result.context.financials as { year: number; employees: number | null; turnover: string | null }[] : [];
  const urls = result && Array.isArray(result.context.sourceUrls) ? result.context.sourceUrls.filter((v): v is string => typeof v === "string" && /^https:\/\/(?:www\.)?(?:e-licitatie\.ro|ted\.europa\.eu)\//.test(v)) : [];
  const go = (p: number) => { setPage(p); document.querySelector(".sg-dialog-wide")?.scrollTo({ top: 0 }); };
  return <SignalDialog title="Înregistrările sursă" wide onClose={onClose}>
    <div className="sg-source-body" aria-busy={busy || (!result && !error)}>
      <Link href={`/semnale/${id}`} target="_blank" rel="noopener" className="sg-page-link">Deschide pagina surselor într-un tab nou ↗</Link>
      {(busy || (!result && !error)) && <div className="sg-source-loading" role="status"><span className="sg-spinner" aria-hidden="true"/><strong>Se încarcă înregistrările sursă…</strong><p>{slow ? "Selecția conține multe date. Încă verificăm sursele disponibile." : "Pregătim lista, valorile exacte și limitele verificării."}</p>{Array.from({ length: 5 }, (_, i) => <div key={i} className="sg-skeleton" aria-hidden="true"><span/><span/></div>)}</div>}
      {error && <div className="sg-empty" role="alert"><h3>Sursele nu s-au încărcat</h3><p>{error}</p><button className="sg-primary" onClick={() => { setBusy(true); setError(""); setRetry(n => n + 1); }}>Reîncearcă</button></div>}
      {result && !busy && !error && <>
        <div className="sg-source-summary"><h3>{result.title}</h3><p>{formatInt(result.sourceCount)} înregistrări disponibile · <strong>{formatEvidenceAmount(result.totalExact, true)}</strong></p><p>Metodologie: {result.methodology}. Valorile înregistrate nu sunt plăți.</p></div>
        {result.warnings.length > 0 && <details className="sg-source-warnings" open><summary>Ce trebuie verificat înainte de a cita</summary><ul>{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
        <div className="sg-source-actions"><a href={`/api/evidence/sources?kind=signal&id=${id}`} download>Descarcă înregistrările · CSV</a><ClipButton kind="signal" refId={id} label={result.title}/></div>
        {financials.length > 0 && <details className="sg-limits"><summary>Bilanțurile folosite în verificare · {formatInt(financials.length)}</summary>{financials.map((f, i) => <p key={i}>{f.year} · {f.employees ?? "număr necunoscut de"} salariați · cifră de afaceri {f.turnover === null ? "necunoscută" : `${formatExactDecimal(f.turnover)} lei`}</p>)}</details>}
        {records.map((r, i) => { const links = evidenceLinks(r); return <article className="sg-source-record" key={`${r.src}:${r.refId}:${r.supplierId}:${i}`}>
          <p className="sg-meta">{r.daCode ?? r.refId} · {r.date ?? "Dată neprecizată"} · CPV {r.cpvCode ?? "neprecizat"}</p>
          <h3><Link href={`/${r.src === "contracts" ? "contracte" : "achizitii"}/${r.refId}`} target="_blank" rel="noopener">{r.title ?? r.cpvName ?? (r.src === "contracts" ? "Contract" : "Achiziție directă")}</Link></h3>
          <p>{r.authority} · {r.supplier}</p><div className="sg-source-actions"><strong>{r.originalValueExact === null ? "Valoare necunoscută" : formatEvidenceAmount(r.valueExact, true)}</strong>{links.seap && <a href={links.seap} target="_blank" rel="noreferrer">Verifică în SEAP ↗</a>}{links.ted && <a href={links.ted} target="_blank" rel="noreferrer">TED ↗</a>}</div>
          {(r.nWinners ?? 1) > 1 && <p className="sg-meta">Cotă alocată · {r.nWinners} membri în asociere</p>}
        </article>; })}
        {result.sourceCount === 0 && <p className="sg-empty">Nu există înregistrări verificabile în selecția curentă. Contextul și limitele rămân disponibile; lipsa surselor nu înseamnă că semnalul a fost verificat.</p>}
        {result.sourceCount > 10 && <nav className="sg-pager sg-source-pager" aria-label="Paginarea surselor"><button disabled={page === 0} onClick={() => go(page - 1)}>Anterior</button><span>{page + 1} / {Math.ceil(result.sourceCount / 10)}</span><button disabled={(page + 1) * 10 >= result.sourceCount} onClick={() => go(page + 1)}>Următor</button></nav>}
        {urls.length > 0 && <details className="sg-limits"><summary>Referințe originale păstrate în calcul</summary><ul>{urls.slice(0, 10).map(url => <li key={url}><a href={url} target="_blank" rel="noreferrer">{url.includes('ted.europa') ? 'TED' : 'SEAP'} · {url.split('/').at(-1)} ↗</a></li>)}</ul>{urls.length > 10 && <p>{formatInt(urls.length)} referințe în total. <Link href={`/semnale/${id}`} target="_blank" rel="noopener">Vezi pagina completă ↗</Link></p>}</details>}
      </>}
    </div>
  </SignalDialog>;
}

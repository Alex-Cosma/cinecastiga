"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SourceEvidence } from "@/lib/source-evidence";
import type { MatrixRow, PatternRow } from "@/lib/radiografie";
import { evidenceLinks, formatEvidenceAmount } from "@/lib/ask/evidence";
import ClipButton from "@/components/ClipButton";
import { rxDate } from "@/lib/radiografie-view";
export function SourceDialog({ title, children, onClose }: {
    title: string;
    children: React.ReactNode;
    onClose: () => void;
}) {
    const ref = useRef<HTMLDialogElement>(null), close = useRef(onClose);
    close.current = onClose;
    useEffect(() => { const previous = document.activeElement as HTMLElement | null, old = document.body.style.overflow, node = ref.current; node?.showModal(); document.body.style.overflow = "hidden"; return () => { node?.close(); document.body.style.overflow = old; previous?.focus?.(); }; }, []);
    return <dialog ref={ref} className="rv-drawer" aria-labelledby="rv-source-title" onCancel={e => { e.preventDefault(); close.current(); }}><header><h2 id="rv-source-title">{title}</h2><button aria-label="Închide sursele" onClick={onClose}><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="m4 4 10 10M14 4 4 14" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg></button></header><div className="rv-drawer-body">{children}</div></dialog>;
}
export default function RadiografieSources({ authorityId, supplierId, pattern, onClose }: {
    authorityId: string;
    supplierId?: string;
    pattern?: PatternRow;
    onClose: () => void;
}) {
    const [result, setResult] = useState<(Omit<SourceEvidence, "records"> & {
        page: number;
        records: (SourceEvidence["records"][number] & {
            title?: string | null;
        })[];
    }) | null>(null), [error, setError] = useState(""), [page, setPage] = useState(0), [retry, setRetry] = useState(0), [busy, setBusy] = useState(true);
    const selection = pattern ? { type: "pattern", patternId: String(pattern.id), expectedFingerprint: pattern.fingerprint } : { type: "slicing", supplierId: supplierId! };
    const query = new URLSearchParams({ kind: "radiografie", id: authorityId, ...selection } as Record<string, string>), key = query.toString();
    useEffect(() => { const controller = new AbortController(); setBusy(true); setError(""); setResult(null); fetch(`/api/evidence/sources?${key}&format=json&page=${page}`, { signal: controller.signal }).then(async (r) => { const data = await r.json(); if (!r.ok)
        throw new Error(data.error || "Sursele nu au putut fi încărcate."); if (!controller.signal.aborted)
        setResult(data); }).catch(e => { if (!controller.signal.aborted)
        setError(e.message); }).finally(() => { if (!controller.signal.aborted)
        setBusy(false); }); return () => controller.abort(); }, [key, page, retry]);
    return <SourceDialog title={pattern ? "Contractele tiparului" : "Achizițiile din spatele grupului"} onClose={onClose}>
 {busy && <p role="status">Se încarcă sursele exacte…</p>}{error && <div role="alert"><p>{error}</p><button onClick={() => setRetry(n => n + 1)}>Încearcă din nou</button></div>}
 {result && <><p>{result.title}</p><p className="rv-source-total">{result.sourceCount} înregistrări · <strong>{formatEvidenceAmount(result.totalExact, true)}</strong></p><ul className="rv-source-warnings">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul><div className="rv-source-actions"><a href={`/api/evidence/sources?${key}`} download>Descarcă CSV</a><ClipButton kind="radiografie" refId={authorityId} spec={selection} label={result.title}/></div>
 {result.records.map((r, i) => { const links = evidenceLinks(r); return <article className="rv-source-record" key={`${r.refId}:${r.supplierId}:${i}`}><p className="rv-small">{r.daCode ?? r.refId} · {r.date ? rxDate(r.date) : "Dată necunoscută"} · CPV {r.cpvCode ?? "necunoscut"}</p><h3><Link href={`/${r.src === "contracts" ? "contracte" : "achizitii"}/${r.refId}`} target="_blank" rel="noopener">{r.title ?? r.cpvName ?? (r.src === "contracts" ? "Contract" : "Achiziție directă")}</Link></h3><p>{r.supplier}</p><div className="rv-source-actions"><strong>{r.originalValueExact === null ? "Valoare necunoscută" : formatEvidenceAmount(r.valueExact, true)}</strong>{links.seap && <a href={links.seap} target="_blank" rel="noreferrer">Verifică în SEAP</a>}{links.ted && <a href={links.ted} target="_blank" rel="noreferrer">TED</a>}</div>{(r.nWinners ?? 1) > 1 && <p className="rv-small">Cotă alocată · {r.nWinners} membri în asociere</p>}</article>; })}
 {result.sourceCount === 0 && <p>Nu există surse verificabile în selecția actuală.</p>}{result.sourceCount > 50 && <nav className="rv-pager" aria-label="Paginarea surselor"><button disabled={result.page === 0} onClick={() => setPage(result.page - 1)}>Anterior</button><span>Pagina {result.page + 1} din {Math.ceil(result.sourceCount / 50)}</span><button disabled={(result.page + 1) * 50 >= result.sourceCount} onClick={() => setPage(result.page + 1)}>Următor</button></nav>}</>}
 </SourceDialog>;
}
export function LotSources({ rows, onClose }: {
    rows: MatrixRow[];
    onClose: () => void;
}) {
    const [page, setPage] = useState(0), unique = [...new Map(rows.map(r => [r.contractId, r])).values()];
    return <SourceDialog title={`${unique.length} contracte selectate`} onClose={onClose}><p>Contracte integrale, o singură dată pentru asociere. Valorile nu sunt plăți.</p>{unique.slice(page * 10, page * 10 + 10).map(r => <article className="rv-source-record" key={r.contractId}><p className="rv-small">{r.notice} · {rxDate(r.d)}</p><h3>{r.externalId ? <Link href={`/contracte/${r.externalId}`} target="_blank" rel="noopener">{r.title || `Contract ${r.externalId}`}</Link> : "Detaliile contractului nu sunt disponibile"}</h3><div className="rv-source-actions"><strong>{r.valueExact ? formatEvidenceAmount(r.valueExact, true) : "Valoare exactă indisponibilă"}</strong>{r.noticeId && <a href={`https://e-licitatie.ro/pub/notices/ca-notices/view-c/${r.noticeId}`} target="_blank" rel="noreferrer">Anunțul SEAP</a>}</div><p className="rv-small">{r.tr == null ? "Număr de oferte necunoscut" : `${r.tr} oferte raportate`}{r.framework ? " · acord-cadru" : ""}</p></article>)}{unique.length > 10 && <nav className="rv-pager" aria-label="Paginarea contractelor"><button disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button><span>{page + 1} / {Math.ceil(unique.length / 10)}</span><button disabled={(page + 1) * 10 >= unique.length} onClick={() => setPage(page + 1)}>Următor</button></nav>}</SourceDialog>;
}

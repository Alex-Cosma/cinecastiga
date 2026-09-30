"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FEEDBACK_CATEGORIES, type FeedbackPage } from "@/lib/feedback-shared";

export default function FeedbackInbox() {
  const [data,setData] = useState<FeedbackPage | null>(null), [busy,setBusy] = useState(true), [error,setError] = useState(""), [notice,setNotice] = useState("");
  const [confirm,setConfirm] = useState<string | null>(null), [deleting,setDeleting] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null), deletion = useRef<AbortController | null>(null), pendingDelete = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const load = useCallback(async (page=1) => {
    request.current?.abort(); const controller = new AbortController(); request.current=controller;
    setBusy(true); setError(""); setConfirm(null);
    try { const response=await fetch(`/api/admin/feedback?page=${page}`,{ signal:controller.signal,cache:"no-store" }); const result=await response.json(); if(!response.ok) throw new Error(result.error || "Mesajele nu pot fi citite acum."); if(!controller.signal.aborted) setData(result); }
    catch(e) { if(!controller.signal.aborted) setError(e instanceof Error ? e.message : "Mesajele nu pot fi citite acum."); }
    finally { if(!controller.signal.aborted) setBusy(false); }
  },[]);
  useEffect(() => { void load(); return () => { request.current?.abort(); deletion.current?.abort(); }; },[load]);
  async function remove(id:string) {
    if(pendingDelete.current) return; pendingDelete.current=true; setDeleting(id); setError(""); setNotice("");
    const controller=new AbortController(); deletion.current=controller;
    try {
      const response=await fetch(`/api/admin/feedback?id=${encodeURIComponent(id)}`,{ method:"DELETE",signal:controller.signal });
      const result=await response.json(); if(!response.ok) throw new Error(result.error || "Mesajul nu a putut fi șters.");
      if(controller.signal.aborted) return;
      setConfirm(null); setNotice("Mesajul a fost șters."); await load(data?.page ?? 1); heading.current?.focus();
    } catch(e) { if(!controller.signal.aborted) setError(e instanceof Error ? e.message : "Ștergerea nu a putut fi confirmată."); }
    finally { pendingDelete.current=false; if(!controller.signal.aborted) setDeleting(null); }
  }
  const pagination = data && data.pages>1 ? <nav className="feedback-pagination" aria-label="Paginarea mesajelor"><span>{(data.page-1)*10+1}–{Math.min(data.page*10,data.total)} din {data.total} mesaje · Pagina {data.page} / {data.pages}</span><div><button type="button" disabled={busy || !!deleting || data.page<=1} onClick={() => void load(data.page-1)}>Anterioara</button><button type="button" disabled={busy || !!deleting || data.page>=data.pages} onClick={() => void load(data.page+1)}>Următoarea</button></div></nav> : null;
  return <section className="feedback-inbox">
    <header className="feedback-inbox-head"><div><h2 ref={heading} tabIndex={-1}>Feedback{data ? <span>{data.total.toLocaleString("ro-RO")}</span> : null}</h2><p>Probleme și sugestii trimise anonim. Mesajele sunt vizibile doar administratorilor.</p></div><button type="button" disabled={busy || !!deleting} onClick={() => { setNotice(""); void load(data?.page ?? 1); }}>Reîncarcă</button></header>
    {notice && <p role="status">{notice}</p>}
    {error && <div className="feedback-inbox-error" role="alert"><p>{error}</p><button type="button" disabled={busy || !!deleting} onClick={() => void load(data?.page ?? 1)}>Reîncearcă</button></div>}
    {busy && <p role="status">Se încarcă mesajele…</p>}
    {pagination}
    <div className="feedback-entries" aria-busy={busy} inert={busy}>
      {data?.items.map(item => <article className="feedback-entry" key={item.id}>
        <div className="feedback-entry-head"><strong>{FEEDBACK_CATEGORIES[item.category]}</strong><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("ro-RO",{ dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Bucharest" })}</time></div>
        <details><summary><span className="feedback-preview">{item.message.slice(0,180)}{item.message.length>180 ? "…" : ""}</span><span className="feedback-read">Citește mesajul</span><span className="feedback-close-message">Închide mesajul</span></summary><p className="feedback-message">{item.message}</p></details>
        <div className="feedback-entry-actions">{item.sourcePath ? <Link href={item.sourcePath} target="_blank" rel="noopener noreferrer">Deschide pagina <span>{item.sourcePath}</span></Link> : <span>Fără pagină atașată</span>}<button type="button" className="feedback-delete" disabled={!!deleting} aria-expanded={confirm===item.id} onClick={() => setConfirm(confirm===item.id ? null : item.id)}>Șterge</button></div>
        {confirm===item.id && <div className="feedback-delete-confirm" role="group" aria-label="Confirmă ștergerea"><p>Ștergi definitiv acest mesaj? Acțiunea nu poate fi anulată.</p><div><button type="button" disabled={!!deleting} onClick={() => setConfirm(null)}>Păstrează mesajul</button><button type="button" className="feedback-delete" disabled={!!deleting} onClick={() => void remove(item.id)}>{deleting===item.id ? "Se șterge…" : "Șterge definitiv"}</button></div></div>}
      </article>)}
      {!busy && data?.total===0 && <div className="feedback-empty"><h3>Niciun mesaj deocamdată.</h3><p>Problemele semnalate de vizitatori vor apărea aici, începând cu cele mai recente.</p></div>}
    </div>
    {pagination}
  </section>;
}

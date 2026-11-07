"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FEEDBACK_CATEGORIES, type FeedbackPage } from "@/lib/feedback-shared";
import { FloatStatus } from "@/components/ghost/client";
import { Ghost, G } from "@/components/ghost/Ghost";
import { Flash } from "./controls";
import { counted } from "./messages";

/** How a read shows: the first one as a ghost, a page or „Reîncarcă” over the dimmed list, a return to the window quietly. */
type Read = "first" | "shown" | "quiet";

/** The last page read, in memory only: an account command's redirect mounts the page anew, and the list then stays in
 *  place (refreshed quietly) instead of a ghost that would move the accounts under it. */
let lastRead: FeedbackPage | null = null;

/** Mesaje, the first half of Oameni (owner, 7 November 2026): the visitors' messages, newest first, ten a page. */
export default function FeedbackInbox() {
  const [data,setData] = useState<FeedbackPage | null>(lastRead), [reading,setReading] = useState<Read | null>(lastRead ? "quiet" : "first"), [error,setError] = useState("");
  const [notice,setNotice] = useState<{ text:string; n:number } | null>(null);
  const [confirm,setConfirm] = useState<string | null>(null), [deleting,setDeleting] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null), deletion = useRef<AbortController | null>(null), pendingDelete = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null), page = useRef(lastRead?.page ?? 1), asking = useRef(false);
  asking.current = confirm !== null || deleting !== null;
  const load = useCallback(async (to=1, how:Read="shown") => {
    request.current?.abort(); const controller = new AbortController(); request.current=controller;
    setReading(how); if(how!=="quiet") { setError(""); setConfirm(null); }
    try {
      const response=await fetch(`/api/admin/feedback?page=${to}`,{ signal:controller.signal,cache:"no-store" });
      const result=await response.json(); if(!response.ok) throw new Error(result.error || "Mesajele nu pot fi citite acum.");
      if(controller.signal.aborted) return;
      setData(result); setError(""); page.current=result.page; lastRead=result;
    }
    catch(e) { if(!controller.signal.aborted) setError(e instanceof Error && e.message ? e.message : "Mesajele nu pot fi citite acum."); }
    finally { if(!controller.signal.aborted) setReading(null); }
  },[]);
  useEffect(() => {
    void load(page.current,lastRead ? "quiet" : "first");
    // Back in the window: the newest messages, without dimming the list (never while a deletion is being asked).
    const back = () => { if(!asking.current && !document.hidden) void load(page.current,"quiet"); };
    window.addEventListener("focus",back);
    return () => { window.removeEventListener("focus",back); request.current?.abort(); deletion.current?.abort(); };
  },[load]);
  async function remove(id:string) {
    if(pendingDelete.current) return; pendingDelete.current=true; setDeleting(id); setError("");
    const controller=new AbortController(); deletion.current=controller;
    try {
      const response=await fetch(`/api/admin/feedback?id=${encodeURIComponent(id)}`,{ method:"DELETE",signal:controller.signal });
      const result=await response.json(); if(!response.ok) throw new Error(result.error || "Mesajul nu a putut fi șters.");
      if(controller.signal.aborted) return;
      setConfirm(null); setNotice(n => ({ text:"Mesajul a fost șters.", n:(n?.n ?? 0)+1 })); await load(data?.page ?? 1); heading.current?.focus();
    } catch(e) { if(!controller.signal.aborted) setError(e instanceof Error && e.message ? e.message : "Ștergerea nu a putut fi confirmată."); }
    finally { pendingDelete.current=false; if(!controller.signal.aborted) setDeleting(null); }
  }
  const busy = reading==="first" || reading==="shown";
  return <section className="people-section feedback-inbox" aria-labelledby="mesaje-titlu">
    <div className="people-heading">
      <h2 id="mesaje-titlu" ref={heading} tabIndex={-1}>Mesaje</h2>
      {data && <span className="subtle">{counted(data.total,"mesaj","mesaje","niciun mesaj")}</span>}
      <button type="button" className="text-button people-reload" disabled={busy || !!deleting} onClick={() => void load(data?.page ?? 1)}>Reîncarcă</button>
    </div>
    <p className="section-description">Trimise anonim; le văd doar administratorii.</p>
    <Flash text={notice?.text ?? null} rev={notice?.n ?? 0} />
    {error && <div className="people-alert feedback-inbox-error" role="alert"><p>{error}</p><button type="button" className="text-button" disabled={busy || !!deleting} onClick={() => void load(data?.page ?? 1)}>Reîncearcă</button></div>}
    {!data && reading==="first" ? <Ghost name="feedback" label="Se încarcă mesajele…" wait="client" className="feedback-entries">
      <G.Rows n={2} as="article" className="feedback-entry" cells={() => <>
        <div className="feedback-entry-head"><G.Line w="24%" /></div>
        <p className="feedback-preview"><G.Line w="92%" /><G.Line w="64%" /></p>
      </>} />
    </Ghost> : <div className={`feedback-entries${reading==="shown" ? " g-stale" : ""}`} aria-busy={reading==="shown" || undefined} inert={reading==="shown"}>
      {data?.items.map(item => <article className="feedback-entry" key={item.id}>
        <div className="feedback-entry-head"><strong>{FEEDBACK_CATEGORIES[item.category]}</strong><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("ro-RO",{ dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Bucharest" })}</time></div>
        <details><summary><span className="feedback-preview">{item.message.slice(0,180)}{item.message.length>180 ? "…" : ""}</span><span className="feedback-read">Citește mesajul</span><span className="feedback-close-message">Închide mesajul</span></summary><p className="feedback-message">{item.message}</p></details>
        <div className="feedback-entry-actions">{item.sourcePath ? <Link href={item.sourcePath} target="_blank" rel="noopener noreferrer">Deschide pagina <span>{item.sourcePath}</span></Link> : <span>Fără pagină atașată</span>}<button type="button" className="button feedback-delete" disabled={!!deleting} aria-expanded={confirm===item.id} onClick={() => setConfirm(confirm===item.id ? null : item.id)}>Șterge</button></div>
        {confirm===item.id && <div className="feedback-delete-confirm" role="group" aria-label="Confirmă ștergerea"><p>Ștergi definitiv acest mesaj? Acțiunea nu poate fi anulată.</p><div><button type="button" className="button" disabled={!!deleting} onClick={() => setConfirm(null)}>Păstrează mesajul</button><button type="button" className="button people-danger" disabled={!!deleting} onClick={() => void remove(item.id)}>{deleting===item.id ? "Se șterge…" : "Șterge definitiv"}</button></div></div>}
      </article>)}
      {data?.total===0 && <p className="feedback-empty">Niciun mesaj încă. Problemele semnalate de vizitatori apar aici, cele noi primele.</p>}
    </div>}
    {reading==="shown" && <FloatStatus>Se încarcă mesajele…</FloatStatus>}
    {data && data.pages>1 && <nav className="queue-pagination" aria-label="Paginile mesajelor">
      <span>{(data.page-1)*10+1}–{Math.min(data.page*10,data.total)} din {data.total}</span>
      <button type="button" className="button" disabled={busy || !!deleting || data.page<=1} onClick={() => void load(data.page-1)}>Înapoi</button>
      <button type="button" className="button" disabled={busy || !!deleting || data.page>=data.pages} onClick={() => void load(data.page+1)}>Următoarele</button>
    </nav>}
  </section>;
}

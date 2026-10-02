"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { FEEDBACK_CATEGORIES, feedbackSourcePath, type FeedbackCategory } from "@/lib/feedback-shared";
import "./feedback.css";

export default function ReportProblem() {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null), request = useRef<AbortController | null>(null), pending = useRef(false);
  const heading = useId(), description = useId();
  const [category,setCategory] = useState<FeedbackCategory>("data"), [message,setMessage] = useState(""), [website,setWebsite] = useState("");
  const [sourcePath,setSourcePath] = useState<string | null>(null), [id,setId] = useState(""), [busy,setBusy] = useState(false), [sent,setSent] = useState(false), [error,setError] = useState("");
  useEffect(() => () => request.current?.abort(), []);
  const close = () => { if (pending.current) return; dialog.current?.close(); trigger.current?.focus(); };
  function open() {
    if (!id || sent) { setId(crypto.randomUUID()); setMessage(""); setCategory("data"); setWebsite(""); }
    // One layout instance survives client-side navigation: always attach the page open now, keep any draft.
    setSourcePath(feedbackSourcePath(pathname));
    setSent(false); setError(""); dialog.current?.showModal();
  }
  async function submit(event:React.SyntheticEvent) {
    event.preventDefault(); if (pending.current) return;
    if (message.trim().length<20) { setError("Descrie problema în cel puțin 20 de caractere, ca să o putem verifica."); return; }
    pending.current = true; setBusy(true); setError("");
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(),15000);
    try {
      const response = await fetch("/api/feedback",{ method:"POST",headers:{ "Content-Type":"application/json" },body:JSON.stringify({ id,category,message,sourcePath,website }),signal:controller.signal });
      const data = await response.json();
      if (response.status === 409) { setId(crypto.randomUUID()); throw new Error("Mesajul inițial a fost deja trimis. Apasă „Trimite anonim” pentru a trimite modificările ca mesaj nou."); }
      if (!response.ok || !data.ok) throw new Error(data.error || "Mesajul nu a fost trimis. Încearcă din nou.");
      setSent(true);
      requestAnimationFrame(() => dialog.current?.querySelector<HTMLButtonElement>("[data-close]")?.focus());
    } catch (e) { setError(controller.signal.aborted ? "Trimiterea durează prea mult. Încearcă din nou; mesajul este păstrat și nu va fi duplicat." : e instanceof Error ? e.message : "Mesajul nu a fost trimis. Încearcă din nou."); }
    finally { clearTimeout(timeout); pending.current=false; setBusy(false); }
  }
  // Admin is internal; the public entry point is not shown there.
  if (pathname === "/admin" || pathname?.startsWith("/admin/")) return null;
  return <>
    <aside aria-label="Feedback">
      <button ref={trigger} type="button" className="feedback-fab" aria-haspopup="dialog" aria-label="Feedback: semnalează o problemă sau trimite o sugestie" onClick={open}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4"/><path d="M6 4h11l-2.2 4L17 12H6"/></svg>
        <span>Feedback</span>
      </button>
    </aside>
    <dialog ref={dialog} className="feedback-dialog" aria-labelledby={heading} aria-describedby={description} onCancel={event => { event.preventDefault(); close(); }}>
      <div className="feedback-dialog-head"><h2 id={heading}>{sent ? "Mesaj primit" : "Ce ai observat?"}</h2><button type="button" className="feedback-close" aria-label="Închide formularul" disabled={busy} onClick={close}><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
      {sent ? <><p id={description} role="status">Mulțumim. Mesajul tău a ajuns la administratorii aplicației.</p><p>Fiind anonim, nu îți putem trimite un răspuns.</p><div className="feedback-form-actions"><button data-close type="button" className="feedback-primary" onClick={close}>Înapoi la explorare</button></div></> : <form noValidate onSubmit={event => void submit(event)} aria-busy={busy}>
        <p id={description}>Fără cont, nume sau e-mail. Mesajul este vizibil doar administratorilor aplicației.</p>
        <label>Despre ce este vorba?<select value={category} disabled={busy} onChange={event => setCategory(event.target.value as FeedbackCategory)}>{Object.entries(FEEDBACK_CATEGORIES).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label htmlFor={`${description}-message`}>Descrie problema</label><textarea id={`${description}-message`} required minLength={20} maxLength={3000} rows={5} value={message} disabled={busy} onChange={event => setMessage(event.target.value)} placeholder="Ce ai observat și ce ar trebui să apară? Pentru o problemă cu datele, indică instituția, contractul sau cifra." aria-describedby={`${description}-hint`} />
        <div className="feedback-field-note" id={`${description}-hint`}><span>Cel puțin 20 de caractere. Nu include date personale în mesaj.</span><span>{message.length.toLocaleString("ro-RO")} / 3.000</span></div>
        {sourcePath && <p className="feedback-source">Pagina atașată: <code>{sourcePath}</code></p>}
        <label className="feedback-trap" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></label>
        {error && <p className="feedback-error" role="alert">{error}</p>}
        <div className="feedback-form-actions"><button type="button" disabled={busy} onClick={close}>Renunță</button><button type="submit" className="feedback-primary" disabled={busy}>{busy ? "Se trimite…" : "Trimite anonim"}</button></div>
      </form>}
    </dialog>
  </>;
}

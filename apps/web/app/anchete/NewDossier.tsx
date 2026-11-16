"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createAncheta } from "./actions";

/**
 * The list's head (audit Z8-11): "Anchetele mele" with its count beside it and one "Dosar nou", which opens the form
 * under the head. With no dossier yet the form is the empty state, open. Without JavaScript the button is a link to
 * `?nou=1`, where the page draws the form open.
 */
export default function NewDossier({ count, startOpen, empty }: { count: string; startOpen: boolean; empty: boolean }) {
  const [open, setOpen] = useState(startOpen || empty);
  const panel = useId();
  const title = useRef<HTMLInputElement>(null), opened = useRef(false);
  useEffect(() => { if (open && opened.current) title.current?.focus(); }, [open]);
  return <>
    <header className="iw-header iw-list-header">
      <div className="iw-list-title"><h1>Anchetele mele</h1><span className="iw-list-count">{count}</span></div>
      {!empty && <a className="iw-primary" href="?nou=1" role="button" data-no-pending aria-expanded={open} aria-controls={panel}
        onClick={event => { event.preventDefault(); opened.current = true; setOpen(value => !value); }}>Dosar nou</a>}
    </header>
    {open && <section id={panel} className="iw-new-panel" aria-labelledby={`${panel}-t`}>
      <h2 id={`${panel}-t`}>{empty ? "Deschide primul dosar" : "Dosar nou"}</h2>
      <p className="iw-muted">Privat. Poți invita colaboratori.</p>
      <form action={createAncheta}>
        <label>Ce urmărești?<input ref={title} name="title" required maxLength={200} placeholder="Un titlu scurt pentru dosar" /></label>
        <label><span>De unde pornești? <span className="iw-muted">Opțional</span></span><textarea name="description" rows={3} maxLength={4000} placeholder="Întrebarea de pornire, instituția sau achiziția care ți-a atras atenția." /></label>
        <div className="iw-form-actions"><button className="iw-primary" type="submit">Creează dosarul privat</button>{!empty && <button type="button" onClick={() => setOpen(false)}>Renunță</button>}</div>
      </form>
      {empty && <p className="iw-muted">Sau folosește „Salvează în anchetă” pe pagina unei instituții, a unei firme sau a unui contract: dosarul se creează acolo.</p>}
    </section>}
  </>;
}

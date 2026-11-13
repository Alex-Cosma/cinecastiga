"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import DiscoveryIcon from "./DiscoveryIcon";
import type { TownHallHit } from "@/lib/town-halls";

/*
 * „Ce a cumpărat primăria ta?” (owner, 13 November 2026; mockup D, in place of „Cine repară drumurile?”): the first
 * question card opens a dialog where a town hall is chosen by its locality's name, then its entity page opens.
 * The dialog is the global search's (GlobalSearch.tsx): a native <dialog>, Escape and a click outside close it.
 */

const TRY = ["Cisnădie", "Râmnicu Sărat", "Sectorul 3"];

export default function TownHallTile({ art, number }: { art: ReactNode; number: string }) {
  const router = useRouter();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null), previous = useRef<HTMLElement | null>(null), overflow = useRef("");
  const [term, setTerm] = useState(""), [items, setItems] = useState<TownHallHit[]>([]), [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false), [error, setError] = useState(""), [searched, setSearched] = useState("");

  const close = useCallback(() => {
    if (!dialog.current?.open) return;
    dialog.current.close(); document.body.style.overflow = overflow.current; previous.current?.focus({ preventScroll: true });
  }, []);
  const show = () => {
    if (!dialog.current || dialog.current.open) return;
    previous.current = document.activeElement as HTMLElement | null; overflow.current = document.body.style.overflow;
    dialog.current.showModal(); document.body.style.overflow = "hidden"; input.current?.focus();
  };

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) { setItems([]); setError(""); setSearched(""); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      void fetch(`/api/primarii?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then(async (r) => { const d = await r.json() as { items?: TownHallHit[]; error?: string }; if (!r.ok) throw new Error(d.error ?? ""); return d.items ?? []; })
        .then((found) => { setItems(found); setActive(0); setError(""); setSearched(q); setLoading(false); })
        .catch((e: unknown) => { if ((e as Error).name !== "AbortError") { setError("Nu am putut căuta localitatea acum. Încearcă din nou."); setLoading(false); } });
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [term]);

  const open = (hit: TownHallHit | undefined) => { if (!hit) return; close(); router.push(hit.href); };
  const listId = `${id}-list`;
  const status = error || (loading ? "Se caută…" : term.trim().length >= 2 && searched === term.trim() && !items.length ? "Nicio localitate găsită. Încearcă alt nume." : "");

  return <>
    <button type="button" className="d-question-card d-question-button" aria-haspopup="dialog" onClick={show}>
      <div className="d-question-top"><span>PRIMĂRIA TA</span><span>{number}</span></div>
      {art}
      <h3>Ce a cumpărat primăria ta?</h3>
      <p>Alegi localitatea și ajungi la pagina primăriei: ce a cumpărat, de la cine, cu ce semnale.</p>
      <div className="d-question-bottom"><span>Alege primăria</span><span><DiscoveryIcon name="arrow" /></span></div>
    </button>
    <dialog ref={dialog} className="d-search-dialog d-townhall-dialog" aria-labelledby={`${id}-title`} onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => {
      if (event.target !== dialog.current) return;
      const rect = dialog.current.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    }}>
      <div className="d-dialog-head"><div><p className="eyebrow">PRIMĂRIA TA</p><h2 id={`${id}-title`}>Ce a cumpărat primăria ta?</h2></div><button type="button" onClick={close} aria-label="Închide"><DiscoveryIcon name="close" /></button></div>
      <p className="d-townhall-lead">Scrie orașul sau comuna. Te ducem la pagina primăriei.</p>
      <div className="d-townhall-field">
        <DiscoveryIcon name="pin" />
        <label className="d-sr-only" htmlFor={`${id}-q`}>Orașul sau comuna</label>
        <input ref={input} id={`${id}-q`} value={term} placeholder="De exemplu: Cisnădie" autoComplete="off" spellCheck={false}
          role="combobox" aria-autocomplete="list" aria-expanded={items.length > 0} aria-controls={listId} aria-activedescendant={items.length ? `${id}-${active}` : undefined}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && items.length) { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
            else if (e.key === "ArrowUp" && items.length) { e.preventDefault(); setActive((a) => (a - 1 + items.length) % items.length); }
            else if (e.key === "Enter") { e.preventDefault(); open(items[active]); }
          }} />
      </div>
      <ul id={listId} role="listbox" aria-label="Primării" className="d-townhall-list">
        {items.map((hit, i) => <li key={hit.id} id={`${id}-${i}`} role="option" aria-selected={i === active}>
          <button type="button" tabIndex={-1} onMouseEnter={() => setActive(i)} onClick={() => open(hit)}><span><strong>{hit.name}</strong><small>{hit.detail}</small></span><DiscoveryIcon name="arrow" /></button>
        </li>)}
      </ul>
      <p className="d-townhall-status" role="status" aria-live="polite">{status}</p>
      {!term.trim() && <div className="d-townhall-try"><span>Încearcă:</span>{TRY.map((name) => <button type="button" key={name} onClick={() => { setTerm(name); input.current?.focus(); }}>{name}</button>)}</div>}
      <p className="d-dialog-hint">↑ ↓ alegi · Enter deschizi · Esc închizi</p>
    </dialog>
  </>;
}

"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import DiscoverySearch from "./DiscoverySearch";
import DiscoveryIcon from "./DiscoveryIcon";

export default function GlobalSearch() {
  const dialog = useRef<HTMLDialogElement>(null), previous = useRef<HTMLElement | null>(null), overflow = useRef("");
  const pathname = usePathname();
  const close = useCallback(() => {
    if (!dialog.current?.open) return;
    dialog.current.close(); document.body.style.overflow = overflow.current; previous.current?.focus({ preventScroll: true });
  }, []);
  const show = useCallback(() => {
    const hero = document.querySelector<HTMLInputElement>("[data-discovery-search]");
    if (hero) { hero.scrollIntoView({ block: "center", behavior: "auto" }); hero.focus({ preventScroll: true }); return; }
    if (!dialog.current || dialog.current.open) return;
    previous.current = document.activeElement as HTMLElement | null; overflow.current = document.body.style.overflow;
    dialog.current.showModal(); document.body.style.overflow = "hidden"; dialog.current.querySelector("input")?.focus();
  }, []);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.altKey || event.metaKey || document.querySelector("dialog[open]")) return;
      if ((event.target as HTMLElement).closest("input,textarea,select,[contenteditable='true']")) return;
      event.preventDefault(); show();
    };
    document.addEventListener("keydown", keyboard); return () => document.removeEventListener("keydown", keyboard);
  }, [show]);
  useEffect(() => { close(); }, [pathname, close]);
  return <>
    <button type="button" className="d-global-search" onClick={show} aria-label="Caută o instituție sau o firmă" aria-haspopup="dialog"><DiscoveryIcon name="search" /><span>Caută</span><kbd>/</kbd></button>
    <dialog ref={dialog} className="d-search-dialog" aria-labelledby="d-search-title" onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => {
      if (event.target !== dialog.current) return;
      const rect = dialog.current.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    }}>
      <div className="d-dialog-head"><div><p className="eyebrow">UN NUME. UN PUNCT DE PORNIRE.</p><h2 id="d-search-title">Ce ai vrea să afli?</h2></div><button type="button" onClick={close} aria-label="Închide căutarea"><DiscoveryIcon name="close" /></button></div>
      <p>Caută instituția sau firma care te interesează. Urmărește apoi achizițiile, partenerii și sursele.</p>
      <DiscoverySearch modal onNavigate={close} />
      <p className="d-dialog-hint">Mai multe condiții? <a href="/intreaba" onClick={close}>Construiește o întrebare <span aria-hidden>→</span></a></p>
    </dialog>
  </>;
}

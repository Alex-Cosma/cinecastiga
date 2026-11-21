"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import DiscoverySearch from "./DiscoverySearch";
import DiscoveryIcon from "./DiscoveryIcon";

export default function GlobalSearch() {
  const dialog = useRef<HTMLDialogElement>(null), previous = useRef<HTMLElement | null>(null), overflow = useRef("");
  const pathname = usePathname();
  const [shown, setShown] = useState(false);
  const close = useCallback(() => {
    if (!dialog.current?.open) return;
    dialog.current.close(); setShown(false); document.body.style.overflow = overflow.current; previous.current?.focus({ preventScroll: true });
  }, []);
  const show = useCallback(() => {
    const hero = document.querySelector<HTMLInputElement>("[data-discovery-search]");
    if (hero) { hero.scrollIntoView({ block: "center", behavior: "auto" }); hero.focus({ preventScroll: true }); return; }
    if (!dialog.current || dialog.current.open) return;
    previous.current = document.activeElement as HTMLElement | null; overflow.current = document.body.style.overflow;
    dialog.current.showModal(); setShown(true); document.body.style.overflow = "hidden"; dialog.current.querySelector("input")?.focus();
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
    <button type="button" className="d-global-search" onClick={show} aria-label="Caută achiziții, documente, instituții sau firme" aria-haspopup="dialog"><DiscoveryIcon name="search" /><span>Caută</span><kbd>/</kbd></button>
    <dialog ref={dialog} className="d-search-dialog" aria-labelledby="d-search-title" onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => {
      if (event.target !== dialog.current) return;
      const rect = dialog.current.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    }}>
      {/* Named as the button that opens it (UX audit Z1-09); „Ce vrei să afli…” is Întreabă's. On phones the dialog is the
          whole screen with „Anulează” beside the field, and the title is for screen readers only (Z1-18). */}
      <div className="d-dialog-head"><div><h2 id="d-search-title">Caută un nume, un loc sau un subiect</h2></div><button type="button" onClick={close} aria-label="Închide căutarea"><DiscoveryIcon name="close" /></button></div>
      <DiscoverySearch modal shown={shown} onNavigate={close} onClose={close} />
      <button type="button" className="d-search-cancel" onClick={close}>Anulează</button>
      <p className="d-dialog-hint">Mai multe condiții? <a href="/intreaba" onClick={close}>Construiește o întrebare <span aria-hidden>→</span></a></p>
    </dialog>
  </>;
}

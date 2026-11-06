"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";

/**
 * The signals outside the score, as one button at the end of the score's tabs (owner, 6 November 2026, variant 3):
 * closed, their number; open, their list; on one of them, the button is the open tab and names it under its label.
 */
export interface OutsideItem { code: string; label: string; sub: string; href: string }

export default function OutsideMenu({ items, current }: { items: readonly OutsideItem[]; current: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLLIElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const at = items.findIndex((i) => i.code === current);
  const on = at >= 0 ? items[at]! : null;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); button.current?.focus(); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); };
  }, [open]);

  return (
    <li className="sgc-more" ref={box}>
      {/* As wide open on one of them as closed, so it never leaves the row: the pattern's name under the label, cut if long. */}
      <button ref={button} type="button" className={`sgc-morebtn${on ? " cur" : ""}${open ? " open" : ""}`} aria-expanded={open} aria-controls={id}
        title={on ? `${on.label} · în afara scorului` : undefined} onClick={() => setOpen((v) => !v)}>
        <span className="t">
          <b>În afara scorului</b>
          <small>{on ? on.label : "nu adună puncte"}</small>
        </span>
        {!on && <span className="n">{items.length}</span>}
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d={open ? "M3 7.5 6 4.5 9 7.5" : "M3 4.5 6 7.5 9 4.5"} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="sgc-menu" id={id}>
          <p className="h">Găsite, dar nu intră în scor</p>
          <ul>
            {items.map((i) => (
              <li key={i.code}>
                <Link href={i.href} aria-current={i.code === current ? "page" : undefined} onClick={() => setOpen(false)}>
                  <span>{i.label}</span><small>{i.sub}</small>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

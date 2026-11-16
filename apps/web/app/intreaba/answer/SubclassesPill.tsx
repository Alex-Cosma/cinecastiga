"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { Subclass } from "./subclasses";

/**
 * „−3 subclase ›” (UX audit Z2-25): the subclasses the domain leaves out, named with their codes in a small box under
 * the pill, and „Include-le”, which asks about the domain's whole catalogue code. A press elsewhere or Escape closes it.
 */
export default function SubclassesPill({ words, subclasses, onInclude }: { words: string; subclasses: readonly Subclass[]; onInclude: (() => void) | null }) {
  const [open, setOpen] = useState(false);
  const [end, setEnd] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null), button = useRef<HTMLButtonElement>(null), box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!(event.target instanceof Node) || !root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !box.current) { setEnd(false); return; }
    setEnd(box.current.getBoundingClientRect().right > document.documentElement.clientWidth - 8);
  }, [open]);
  return (
    <span className="cq-subclasses" ref={root}
      onKeyDown={(event) => { if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus(); } }}>
      <button ref={button} type="button" className="cq-pill" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
        <span>{words}<span aria-hidden="true"> ›</span></span>
      </button>
      <div id={id} ref={box} className={`cq-understood-pop cq-subclasses-pop${end ? " cq-understood-pop--end" : ""}`} hidden={!open}>
        <p className="cq-subclasses-h">Nu sunt numărate:</p>
        <ul>{subclasses.map((s) => <li key={`${s.name}|${s.code}`}>{s.name}{s.code && <span className="cq-subclasses-code"> · {s.code}</span>}</li>)}</ul>
        {onInclude && <button type="button" className="cq-subclasses-include" onClick={() => { setOpen(false); onInclude(); }}>Include-le</button>}
      </div>
    </span>
  );
}

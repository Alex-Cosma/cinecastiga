"use client";
import { useEffect, useId, useRef, type PointerEvent, type ReactNode } from "react";
import { closeThenLeave } from "../../components/motion/leave";

/**
 * /semnale's dialog. On a phone (≤700 px) it is a sheet from the bottom, 92% of the screen, its list scrolling inside
 * (UX audit Z6-36, as the tables' funnels and „Salvează în anchetă”); its handle can be pulled down to close it.
 * `subtitle` says under the title what the numbers inside are.
 */
export default function SignalDialog({ title, subtitle, children, onClose, wide = false }: {
  title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId(), close = useRef(onClose), drag = useRef<{ y: number; dy: number } | null>(null);
  close.current = onClose;
  // M-06: closed at once (the page is usable, the focus is back), its exit plays (a sheet on a phone), then the owner is told.
  const restore = useRef<() => void>(() => {}), cancelLeave = useRef<() => void>(() => {});
  const leave = () => { restore.current(); cancelLeave.current = closeThenLeave(ref.current, () => close.current(), window.matchMedia("(max-width: 700px)").matches); };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow, node = ref.current;
    node?.showModal(); document.body.style.overflow = "hidden";
    restore.current = () => { document.body.style.overflow = overflow; previous?.focus?.(); };
    return () => { cancelLeave.current(); node?.close(); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);
  // Pulling the handle down moves the sheet with the finger; past 80 px it closes, short of it the sheet goes back.
  const down = (e: PointerEvent<HTMLDivElement>) => { drag.current = { y: e.clientY, dy: 0 }; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !ref.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    ref.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const up = () => {
    if (!drag.current || !ref.current) return;
    const far = drag.current.dy > 80;
    drag.current = null; ref.current.style.transform = "";
    if (far) leave();
  };
  return <dialog ref={ref} className={`sg-dialog sg-sheet${wide ? " sg-dialog-wide" : ""}`} aria-labelledby={titleId}
    onCancel={e => { e.preventDefault(); leave(); }}>
    <div className="sg-sheet-handle" aria-hidden="true" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}><span /></div>
    <header><div><h2 id={titleId}>{title}</h2>{subtitle && <p className="sg-dialog-sub">{subtitle}</p>}</div>
      <button className="sg-icon" onClick={leave} aria-label="Închide dialogul"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg></button></header>
    {children}
  </dialog>;
}

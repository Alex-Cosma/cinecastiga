"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";

export default function SignalDialog({ title, description, children, onClose, wide = false }: {
  title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId(), close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow, node = ref.current;
    node?.showModal(); document.body.style.overflow = "hidden";
    return () => { node?.close(); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);
  return <dialog ref={ref} className={`sg-dialog${wide ? " sg-dialog-wide" : ""}`} aria-labelledby={titleId}
    onCancel={e => { e.preventDefault(); close.current(); }}>
    <header><div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div>
      <button className="sg-icon" onClick={onClose} aria-label="Închide dialogul"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg></button></header>
    {children}
  </dialog>;
}

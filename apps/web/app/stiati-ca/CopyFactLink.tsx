"use client";
import { useEffect, useRef, useState } from "react";
import { DoneCheck } from "@/components/motion/Done";

/** How long „Link copiat” stays above the button (stiati-ca.css runs the same time). */
const SAID_MS = 1300;

/**
 * The fact's own address, to send on (owner, 27 November 2026: a button, and „Link copiat” for a moment right above
 * it, in place of the words „Copiază linkul”). The button is an icon, so it has no label to change: the word comes
 * up over it and a live region says it. Where the clipboard is refused the address is shown, to select by hand.
 */
export default function CopyFactLink({ id }: { id: string }) {
  const [said, setSaid] = useState(0);
  const [shown, setShown] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const address = () => `${window.location.origin}/stiati-ca/${id}`;
  if (shown) return <span className="fact-address">{typeof window === "undefined" ? "" : address()}</span>;
  const copy = () => {
    if (!navigator.clipboard) { setShown(true); return; }
    navigator.clipboard.writeText(address()).then(() => {
      // A press while it is still up says it again from the start.
      setSaid((n) => Math.abs(n) + 1);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setSaid((n) => -Math.abs(n)), SAID_MS);
    }, () => setShown(true));
  };
  return <span className="fact-copy">
    <button type="button" onClick={copy} aria-label="Copiază linkul" title="Copiază linkul">
      <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.6 11.4a3.4 3.4 0 0 0 4.8 0l2.6-2.6a3.4 3.4 0 0 0-4.8-4.8l-1 1" /><path d="M11.4 8.6a3.4 3.4 0 0 0-4.8 0L4 11.2A3.4 3.4 0 0 0 8.8 16l1-1" />
      </svg>
    </button>
    {said > 0 && <span key={said} className="fact-copied" aria-hidden="true"><DoneCheck />Link copiat</span>}
    <span className="sr-only" role="status">{said > 0 ? "Linkul este în clipboard." : ""}</span>
  </span>;
}

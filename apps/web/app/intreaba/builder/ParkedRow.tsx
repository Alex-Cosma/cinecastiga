"use client";

import { useState } from "react";
import { removeAndRefocus } from "./Chip";
import HelpTip from "./HelpTip";
import type { KitTip } from "./kit-types";

/*
 * Component 6, the parked conditions (kit §5.43): conditions a change of lens
 * made inapplicable ("Nu se aplică indicelui: ↺ 2025 · ↺ „medicamente”"),
 * kept on the draft instead of an error. They never enter the link. Each is a
 * button that brings its condition back; the return is announced. The live
 * region stays mounted after the last one leaves, so that announcement is heard.
 */

export interface ParkedItem { id: string; label: string }

export function RedoGlyph() {
  return <svg className="fk-redo" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M3.2 9.2A5 5 0 1 0 4.6 4.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M4.2 1.8v3h3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

/** What the live region says after a condition comes back. */
export const restoredMessage = (label: string) => `«${label}» se aplică din nou.`;

export default function ParkedRow({ label, tip, items, onRestore, itemClassName }: { label: string; tip?: KitTip; items: readonly ParkedItem[]; onRestore?: (id: string) => void; itemClassName?: (id: string) => string | undefined }) {
  const [message, setMessage] = useState("");
  return <>
    {items.length > 0 && <div className="fk-parked fk-tipwrap" role="group" aria-label={label} data-fk-row="">
      <span className="fk-parked-label">{label}{tip && <HelpTip tip={tip} />}</span>
      {items.map(item => {
        const extra = itemClassName?.(item.id);
        return <button
          key={item.id}
          type="button"
          className={`fk-chip--parked${extra ? ` ${extra}` : ""}`}
          aria-label={`Readu «${item.label}»`}
          onClick={event => removeAndRefocus(event, () => { setMessage(restoredMessage(item.label)); onRestore?.(item.id); }, ".fk-chip--parked")}
        ><RedoGlyph />{item.label}</button>;
      })}
    </div>}
    <span className="fk-sr" role="status" aria-live="polite">{message}</span>
  </>;
}

"use client";

import Term from "./Term";
import { VALUE_HELD_TITLE, VALUE_HELD_LIST_TEXT } from "../lib/contract-value-words";

/**
 * The mark of a contract whose value is held out of the totals (owner, 26 November 2026): in a list, a plain warning
 * icon beside the struck-through value; its explanation opens on hover, focus or a tap, like any (?). The words
 * „Eroare probabilă” are written out only on the contract's own page.
 *
 * As with a Term, never inside a link or another button.
 */
export default function ValueHeldMark({ className }: { className?: string }) {
  return <Term tip title={VALUE_HELD_TITLE} text={VALUE_HELD_LIST_TEXT} className={`value-held-mark${className ? ` ${className}` : ""}`}>
    <ValueHeldIcon />
    <span className="d-sr-only">{VALUE_HELD_TITLE}: ce înseamnă</span>
  </Term>;
}

/** The warning triangle alone, for a label that already says the words. */
export function ValueHeldIcon() {
  // The triangle's box is centred on the 24 px square: apex at 3.5, base at 20.5 once the round joins are counted.
  return <svg className="value-held-i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path className="value-held-f" d="M12 4.4 20.9 19.6H3.1Z" /><path d="M12 10v4.4" /><path d="M12 17.1h.01" strokeWidth="2.4" /></svg>;
}

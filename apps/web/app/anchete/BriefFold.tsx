"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * "Pe scurt" on a phone (audit Z8-07): one summary row with the same facts, which opens into the whole band; on a
 * wide screen the band is always open and the row is not drawn (CSS, ≤700px), so nothing moves when the page loads.
 */
export default function BriefFold({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const body = useId();
  return <>
    <button type="button" className="iw-brief-toggle" aria-expanded={open} aria-controls={body} onClick={() => setOpen(value => !value)}>
      <span>{summary}</span><span className="iw-brief-chevron" aria-hidden="true" />
    </button>
    <div id={body} className="iw-brief-body" data-open={open}>{children}</div>
  </>;
}

"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * A record's title, cut at three lines with „Tot titlul” (UX audit Z7-02, owner 16 November 2026): SEAP titles of
 * 300–450 characters filled a whole screen before the record began. The cut is CSS (`.record-h1`), so the title never
 * moves on load; the button appears only when the title is longer than its three lines. The whole title stays in the
 * page for screen readers, search and print.
 */
export default function RecordTitle({ children }: { children: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const h1 = ref.current;
    if (!h1 || open) return;
    const measure = () => setOver(h1.scrollHeight > h1.clientHeight + 2);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(h1);
    return () => watch.disconnect();
  }, [open]);
  return <>
    <h1 ref={ref} className={open ? "record-h1" : "record-h1 is-cut"}>{children}</h1>
    {(over || open) && <button type="button" className="record-title-more" aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? "Mai puțin" : "Tot titlul"} <span aria-hidden="true">{open ? "▴" : "▾"}</span>
    </button>}
  </>;
}

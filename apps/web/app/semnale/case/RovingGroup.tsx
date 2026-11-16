"use client";

import type { HTMLAttributes, KeyboardEvent } from "react";

/**
 * A chart of the case page as one Tab stop (UX audit Z6-25; „Luate pe rând” had 80 bars, each a stop, before the
 * list): its marks (`[data-rove]`, the first with tabIndex 0, the others -1) are reached with the arrows, Home and End,
 * each showing its card as it takes the focus; Escape leaves the chart. As the dots of /preturi/[produs].
 */
export default function RovingGroup({ label, children, ...rest }: HTMLAttributes<HTMLDivElement> & { label: string; "data-chart"?: boolean }) {
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-rove]")];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    if (e.key === "Escape") { e.preventDefault(); items[at]!.blur(); return; }
    const next = e.key === "ArrowRight" || e.key === "ArrowDown" ? Math.min(items.length - 1, at + 1)
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? Math.max(0, at - 1) : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    items.forEach((el, i) => { el.tabIndex = i === next ? 0 : -1; });
    items[next]!.focus();
  };
  return <div role="group" aria-label={label} {...rest} onKeyDown={keys}>{children}</div>;
}

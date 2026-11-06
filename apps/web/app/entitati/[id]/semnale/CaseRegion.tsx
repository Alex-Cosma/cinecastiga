"use client";

import { useRouter } from "next/navigation";
import { useTransition, type MouseEvent, type ReactNode } from "react";

/**
 * The case page's own switches (its pattern tabs, the score bar's segments, the patterns outside the score and its
 * pager) are links to this same page with other parameters. Such a click keeps the shown case in place, dimmed and
 * busy, until the next one is ready (owner, 6 November 2026: the old answer stays, nothing moves); the site's floating
 * status (NavPending) says it is opening. Links to other pages, and Ctrl/Cmd/Shift clicks, go as usual.
 */
export default function CaseRegion({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.("a[href]");
    if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    const to = new URL(a.href, location.href);
    if (to.origin !== location.origin || to.pathname !== location.pathname || to.search === location.search) return;
    // next/link skips its own navigation when the click is already handled (its onClick, e.g. closing a menu, still runs).
    e.preventDefault();
    start(() => router.push(`${to.pathname}${to.search}${to.hash}`));
  };
  return (
    <div className={pending ? "g-stale" : undefined} aria-busy={pending || undefined} onClickCapture={onClickCapture}>
      {children}
    </div>
  );
}

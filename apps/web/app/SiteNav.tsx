"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { navItems } from "@/lib/site-nav";

/**
 * `sessionHint` is only "a session cookie was sent" (no identity, no token),
 * so signed-in readers see "Anchete" without a flash. Once the client knows
 * the session, it decides: an expired cookie hides the item again.
 */
export default function SiteNav({ sessionHint = false }: { sessionHint?: boolean }) {
  const pathname = usePathname() ?? "/";
  const { data, isPending } = authClient.useSession();
  const [hydrated, setHydrated] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => setHydrated(true), []);
  // Sticky elements below the header (entity section tabs, side rails) read
  // --site-header-h, so they sit under the header at every width instead of
  // sliding beneath it. CSS keeps per-breakpoint fallbacks for the first paint.
  useEffect(() => {
    const header = ref.current?.closest<HTMLElement>(".site-header");
    if (!header) return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty("--site-header-h", `${Math.round(header.getBoundingClientRect().height)}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const known = hydrated && !isPending;
  const signedIn = known ? Boolean(data) : sessionHint;
  const items = navItems({ pathname, signedIn });
  // The page already open with a question in its address (Întreabă with ?spec=…): a Link to the same route keeps the
  // answer on screen, so the item loads the bare page instead (owner, 1 November 2026). A new tab keeps the browser's way.
  const toBarePage = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (window.location.pathname !== href || !window.location.search) return;
    event.preventDefault();
    window.location.assign(href);
  };
  return <nav ref={ref} className="main-nav d-main-nav" aria-label="Navigare principală">
    {items.map((item) => <Link key={item.href} href={item.href} onClick={toBarePage(item.href)} className={item.active ? "on" : undefined} aria-current={item.active ? (pathname === item.href ? "page" : "true") : undefined}>{item.label}{item.dot ? <span className="d-nav-dot" aria-hidden="true" /> : null}</Link>)}
  </nav>;
}

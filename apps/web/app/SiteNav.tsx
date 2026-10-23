"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { navItems } from "@/lib/site-nav";

/**
 * `sessionHint` is only "a session cookie was sent" (no identity, no token),
 * so signed-in readers see "Anchete" without a flash. Once the client knows
 * the session, it decides: an expired cookie hides the item again.
 */
export default function SiteNav({ storiesPublished, sessionHint = false }: { storiesPublished: boolean; sessionHint?: boolean }) {
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
  const admin = known && (data?.user as { role?: string } | undefined)?.role === "admin";
  const signedIn = known ? Boolean(data) : sessionHint;
  const items = navItems({ pathname, storiesPublished, admin, signedIn });
  return <nav ref={ref} className="main-nav d-main-nav" aria-label="Navigare principală">
    {items.map((item) => <Link key={item.href} href={item.href} className={item.active ? "on" : undefined} aria-current={item.active ? (pathname === item.href ? "page" : "true") : undefined}>{item.label}{item.dot ? <span className="d-nav-dot" aria-hidden="true" /> : null}</Link>)}
  </nav>;
}

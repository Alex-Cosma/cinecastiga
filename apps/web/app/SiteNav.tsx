"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  useEffect(() => setHydrated(true), []);
  const known = hydrated && !isPending;
  const admin = known && (data?.user as { role?: string } | undefined)?.role === "admin";
  const signedIn = known ? Boolean(data) : sessionHint;
  const items = navItems({ pathname, storiesPublished, admin, signedIn });
  return <nav className="main-nav d-main-nav" aria-label="Navigare principală">
    {items.map((item) => <Link key={item.href} href={item.href} className={[item.className, item.active ? "on" : ""].filter(Boolean).join(" ") || undefined} aria-current={item.active ? "page" : undefined}>{item.label}{item.dot ? <span className="d-nav-dot" aria-hidden="true" /> : null}</Link>)}
  </nav>;
}

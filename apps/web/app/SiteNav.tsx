"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const ITEMS = [
  { href: "/", label: "Descoperă", match: (path: string) => path === "/" },
  { href: "/intreaba", label: "Explorează", match: (path: string) => ["/intreaba", "/cauta", "/entitati", "/achizitii", "/contracte", "/anunturi", "/semnale", "/harta", "/domenii", "/supra-prag"].some((prefix) => path.startsWith(prefix)) },
  { href: "/ce-bate-la-ochi", label: "Ce bate la ochi", match: (path: string) => path === "/ce-bate-la-ochi" || path.startsWith("/ce-bate-la-ochi/") },
  { href: "/anchete", label: "Anchete", match: (path: string) => (path.startsWith("/anchete") || path.startsWith("/urmariri")) },
];

/** Until a story is published, "Ce bate la ochi" is listed only for admins.
 * The pages enforce the same rule on the server; this only hides the link. */
export default function SiteNav({ storiesPublished }: { storiesPublished: boolean }) {
  const pathname = usePathname() ?? "/";
  const { data } = authClient.useSession();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const admin = hydrated && (data?.user as { role?: string } | undefined)?.role === "admin";
  const items = ITEMS.filter((item) => item.href !== "/ce-bate-la-ochi" || storiesPublished || admin);
  return <nav className="main-nav d-main-nav" aria-label="Navigare principală">
    {items.map((item) => <Link key={item.href} href={item.href} className={item.match(pathname) ? "on" : undefined} aria-current={item.match(pathname) ? "page" : undefined}>{item.label}{item.href === "/anchete" ? <span className="d-nav-dot" aria-hidden="true" /> : null}</Link>)}
  </nav>;
}

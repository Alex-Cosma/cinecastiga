"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Descoperă", match: (path: string) => path === "/" },
  { href: "/intreaba", label: "Explorează", match: (path: string) => ["/intreaba", "/cauta", "/entitati", "/contracte", "/anunturi", "/semnale", "/harta", "/domenii", "/supra-prag"].some((prefix) => path.startsWith(prefix)) },
  { href: "/anchete", label: "Anchete", match: (path: string) => path.startsWith("/anchete") },
];

export default function SiteNav() {
  const pathname = usePathname() ?? "/";
  return <nav className="main-nav d-main-nav" aria-label="Navigare principală">
    {ITEMS.map((item) => <Link key={item.href} href={item.href} className={item.match(pathname) ? "on" : undefined} aria-current={item.match(pathname) ? "page" : undefined}>{item.label}{item.href === "/anchete" ? <span className="d-nav-dot" aria-hidden="true" /> : null}</Link>)}
  </nav>;
}

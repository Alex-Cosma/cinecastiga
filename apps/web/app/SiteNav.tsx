"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const ITEMS: { href: string; label: string; match: (p: string) => boolean; sub?: { href: string; label: string; hint: string }[] }[] = [
  { href: "/", label: "Caută", match: (p) => p === "/" || p.startsWith("/cauta") || p.startsWith("/entitati") || p.startsWith("/contracte") || p.startsWith("/anunturi") },
  { href: "/semnale", label: "Semnale", match: (p) => p.startsWith("/semnale") },
  {
    href: "/harta",
    label: "Explorează",
    match: (p) => p.startsWith("/harta") || p.startsWith("/domenii") || p.startsWith("/supra-prag"),
    sub: [
      { href: "/harta", label: "Hartă pe județe", hint: "cheltuială pe autorități sau furnizori" },
      { href: "/domenii", label: "Domenii CPV", hint: "unde se duc banii, pe categorii" },
      { href: "/supra-prag", label: "Supra-prag (TED)", hint: "atribuiri mari, firme străine, ofertant unic" },
    ],
  },
  { href: "/intreaba", label: "Întreabă", match: (p) => p.startsWith("/intreaba") },
  { href: "/metodologie", label: "Metodologie", match: (p) => p.startsWith("/metodologie") },
];

/**
 * Primary navigation. Active item from the pathname; a single indicator pill
 * slides between items (measured, not per-item backgrounds) so moving
 * between sections reads as one continuous motion.
 */
export default function SiteNav() {
  const path = usePathname() ?? "/";
  const ref = useRef<HTMLElement>(null);
  const [ind, setInd] = useState<{ left: number; width: number } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const place = () => {
      const on = nav.querySelector<HTMLElement>("a[data-on='1']");
      if (!on) return setInd(null);
      setInd({ left: on.offsetLeft, width: on.offsetWidth });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(nav);
    if (document.fonts?.ready) document.fonts.ready.then(place);
    return () => ro.disconnect();
  }, [path]);

  return (
    <>
      <button className="nav-burger" aria-label="meniu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span />
      </button>
      <nav ref={ref} className={"main-nav" + (open ? " open" : "")} aria-label="principal">
        {ind && <span className="nav-ind" style={{ left: ind.left, width: ind.width }} aria-hidden />}
        {ITEMS.map((it) => {
          const on = it.match(path);
          return it.sub ? (
            <span key={it.href} className="nav-dd">
              <Link href={it.href} data-on={on ? "1" : undefined} className={on ? "on" : undefined} onClick={() => setOpen(false)}>
                {it.label}
              </Link>
              <span className="nav-menu" role="menu">
                {it.sub.map((s) => (
                  <Link key={s.href} href={s.href} role="menuitem" onClick={() => setOpen(false)}>
                    <b>{s.label}</b>
                    <small>{s.hint}</small>
                  </Link>
                ))}
              </span>
            </span>
          ) : (
            <Link key={it.href} href={it.href} data-on={on ? "1" : undefined} className={on ? "on" : undefined} onClick={() => setOpen(false)}>
              {it.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

"use client";

import Link from "next/link";
import { usePendingRegion } from "@/components/ghost/client";
import { formatInt } from "@/lib/format";
import "./pager.css";

/**
 * A list's pager inside a PendingRegion (UX audit Z7-20, Z7-23): „← Anterior · Pagina N din M · Următor →”. A click
 * brings the list's top under the header from code, so the address keeps no #anchor: Back from a record then returns
 * to the row the reader left, not to the list's top. Without JavaScript the links still work (from the page's top).
 */
export default function ListPager({ page, pages, prev, next, target, label }: {
  page: number; pages: number; prev: string | null; next: string | null; target: string; label: string;
}) {
  const region = usePendingRegion();
  const go = (href: string) => (e: { preventDefault: () => void }) => {
    if (!region) return;
    e.preventDefault();
    document.getElementById(target)?.scrollIntoView({ block: "start" });
    region.go(href, { scroll: false });
  };
  return <nav className="record-pager" aria-label={label}>
    {prev && <Link href={prev} prefetch={false} onNavigate={go(prev)}>← Anterior</Link>}
    <span>Pagina {formatInt(page)} din {formatInt(pages)}</span>
    {next && <Link href={next} prefetch={false} onNavigate={go(next)}>Următor →</Link>}
  </nav>;
}

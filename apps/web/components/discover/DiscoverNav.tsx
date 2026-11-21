"use client";

import Link from "next/link";
import "./discover-nav.css";

/**
 * The local row that links the „Descoperă” pages to each other (owner, 16 November 2026, UX audit Z6-08): above each
 * page's title, the current page in ink and the others as links. The site's menu is unchanged (6 November 2026).
 * „Prețuri” left this row on 20 November 2026 (owner): it is a section of its own in the site's menu.
 * „Atribuiri TED” (/supra-prag) belongs to Complet: Esențial hides its link, with the dot before it (owner, 18 November
 * 2026); the page itself, opened from a link, shows whole.
 * „Caută” joined the row on 21 November 2026 (owner): /cauta had its own „Descoperă / Caută” crumbs.
 */
export type DiscoverPage = "semnale" | "domenii" | "cauta" | "supra-prag";

/** Pages that belong to Complet (lib/view-mode.ts): their links are hidden in Esențial. */
const COMPLET_ONLY = new Set<DiscoverPage>(["supra-prag"]);
const only = (key: DiscoverPage, current: DiscoverPage) => COMPLET_ONLY.has(key) && key !== current ? "complet" : undefined;

const PAGES: [DiscoverPage, string, string][] = [
  ["semnale", "/semnale", "Semnale"],
  ["domenii", "/domenii", "Domenii"],
  ["cauta", "/cauta", "Caută"],
  ["supra-prag", "/supra-prag", "Atribuiri TED"],
];

export default function DiscoverNav({ current }: { current: DiscoverPage }) {
  const pages = PAGES;
  return (
    <nav className="dsc-nav" aria-label="Descoperă">
      <span className="dsc-label" aria-hidden="true">Descoperă</span>
      {pages.map(([key, href, label], i) => <span key={key} className="dsc-item" data-only={only(key, current)}>
        {i > 0 && <span className="dsc-dot" aria-hidden="true">·</span>}
        {key === current ? <span className="dsc-on" aria-current="page">{label}</span> : <Link href={href} prefetch={false}>{label}</Link>}
      </span>)}
    </nav>
  );
}

/** The same row in a ghost (a route's loading.tsx): its real words, nothing to focus. */
export function DiscoverNavGhost({ current }: { current: DiscoverPage }) {
  return (
    <div className="dsc-nav" aria-hidden="true">
      <span className="dsc-label">Descoperă</span>
      {PAGES.map(([key, , label], i) => <span key={key} className="dsc-item" data-only={only(key, current)}>
        {i > 0 && <span className="dsc-dot">·</span>}
        <span className={key === current ? "dsc-on" : "dsc-link"}>{label}</span>
      </span>)}
    </div>
  );
}

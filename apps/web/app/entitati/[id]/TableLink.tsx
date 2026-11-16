"use client";

import type { ReactNode } from "react";
import type { FilterState } from "@/lib/table-filters/types";
import { showInTable } from "./entity-top";

/**
 * A link to the records of this page (UX audit Z5-12, 16 November 2026): it filters the table below and scrolls to it,
 * as a year of the chart does, instead of leaving the profile for Întreabă. Its address (`?tip=directe#achizitii`)
 * opens the same selection when copied or opened apart.
 */
export default function TableLink({ href, filter, className, title, children }: {
  href: string; filter: FilterState; className?: string; title?: string; children: ReactNode;
}) {
  return (
    // data-no-pending: it stays on this page, so the site's „Se deschide…” is not shown for it.
    <a href={href} className={className} title={title} data-no-pending=""
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (!document.getElementById("achizitii")) return;
        e.preventDefault();
        showInTable(filter);
      }}>
      {children}
    </a>
  );
}

"use client";

import { useEffect } from "react";

/**
 * A link to one case (`#caz-<id>`, from the national list or an old sources link) opens that case's details and
 * brings it under the sticky header; the other cases keep their state.
 */
export default function OpenFromHash() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id.startsWith("caz-")) return;
      const el = document.getElementById(id);
      if (!el) {
        // A case on another page of a paged list (the shared representatives, UX audit Z6-23): its page, from the index.
        const box = document.querySelector<HTMLElement>("[data-case-index]");
        const page = (() => { try { return (JSON.parse(box?.dataset.caseIndex ?? "{}") as Record<string, number>)[id.slice(4)]; } catch { return undefined; } })();
        const url = new URL(window.location.href);
        if (page !== undefined && String(page || "") !== (url.searchParams.get("p") ?? "")) {
          if (page > 0) url.searchParams.set("p", String(page)); else url.searchParams.delete("p");
          window.location.replace(url.toString());
        }
        return;
      }
      if (el instanceof HTMLDetailsElement) el.open = true;
      // Whole under the sticky header (case.css scroll-margin-top), and marked for a moment (UX audit Z6-26).
      el.scrollIntoView({ block: "start" });
      el.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
      const mark = el.closest<HTMLElement>(".sgc-case, .sgc-row, tr") ?? el;
      mark.classList.remove("sgc-hit");
      void mark.offsetWidth;
      mark.classList.add("sgc-hit");
      window.setTimeout(() => mark.classList.remove("sgc-hit"), 1400);
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}

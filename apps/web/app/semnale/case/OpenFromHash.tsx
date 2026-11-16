"use client";

import { useEffect } from "react";
import { arrive } from "@/components/motion/outline";

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
      // Whole under the sticky header (case.css scroll-margin-top), and its outline drawn once where it stopped (UX audit
      // Z6-26; M-09: the arrival outline replaces the background flash).
      el.scrollIntoView({ block: "start" });
      el.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
      arrive(el.closest<HTMLElement>(".sgc-case, .sgc-row, tr") ?? el);
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}

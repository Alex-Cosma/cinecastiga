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
      if (!el) return;
      if (el instanceof HTMLDetailsElement) el.open = true;
      el.scrollIntoView({ block: "start" });
      el.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}

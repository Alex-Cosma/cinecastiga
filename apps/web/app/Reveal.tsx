"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Entrance motion, applied globally and cheaply: elements marked
 * `data-reveal` (or the default set below) get `.rv` and, when they enter
 * the viewport, `.in`. Stagger with `data-reveal="2"` etc. Pure CSS after
 * that; honours prefers-reduced-motion in CSS.
 */
const AUTO = ".page-title, .page-sub, .stat-grid, .section, .home-hero > *, .home-stats, .profile-head, .ehead, .rx-heads > *, .rx-panel, .clip-card, .method-card, .auth-card";

export default function Reveal() {
  const path = usePathname();
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>(AUTO + ", [data-reveal]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.03 },
    );
    for (const el of els) {
      if (el.classList.contains("rv")) continue;
      el.classList.add("rv");
      const d = el.dataset.reveal;
      if (d && /^\d$/.test(d)) el.classList.add("d" + d);
      const r = el.getBoundingClientRect();
      // already on screen at mount: reveal on next frame (staggers via CSS delay)
      if (r.top < innerHeight && r.bottom > 0) requestAnimationFrame(() => el.classList.add("in"));
      else io.observe(el);
    }
    return () => io.disconnect();
  }, [path]);
  return null;
}

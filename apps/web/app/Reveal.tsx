"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Entrance motion, applied globally and cheaply: elements marked
 * `data-reveal` (or the default set below) get `.rv` and, when they enter
 * the viewport, `.in`. Stagger with `data-reveal="2"` etc. Pure CSS after
 * that; honours prefers-reduced-motion in CSS.
 *
 * It also arms the chart gate (components/motion/chart-motion.css): a `[data-chart]` that starts below the fold, at
 * first paint or when it is mounted later (Ask answers, panels), waits hidden until it is scrolled into view, so its
 * entrance plays where the reader sees it. After back/forward (`popstate`) the page is "settled": charts and sections
 * are drawn finished, since the reader is re-finding a place; the next click or key press ends it.
 */
const AUTO = ".page-title, .page-sub, .stat-grid, .section, .home-hero > *, .home-stats, .profile-head, .ehead, .rx-heads > *, .rx-panel, .clip-card, .method-card, .auth-card";

/** Whether React has hydrated this element. Streamed content (a route ghost's page, a Suspense section) can be in the
 *  document before React adopts it; changing its classes then would not match the server's HTML. */
const hydrated = (el: Element) => Object.keys(el).some((k) => k.startsWith("__reactFiber$"));

export default function Reveal() {
  const path = usePathname();
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const html = document.documentElement;
    const settle = () => { html.dataset.motion = "settled"; };
    const unsettle = () => { delete html.dataset.motion; };
    addEventListener("popstate", settle);
    document.addEventListener("pointerdown", unsettle, true);
    document.addEventListener("keydown", unsettle, true);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.remove("cm-wait");
        io.unobserve(e.target);
      }
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.03 });
    const seen = new WeakSet<Element>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const gate = (el: Element, tries = 0) => {
      if (seen.has(el)) return;
      if (!hydrated(el) && tries < 60) {
        const t = setTimeout(() => { timers.delete(t); if (el.isConnected) gate(el, tries + 1); }, 50);
        timers.add(t);
        return;
      }
      seen.add(el);
      if (html.dataset.motion === "settled") return;
      const r = el.getBoundingClientRect();
      // On screen: its entrance is playing now. Not laid out (a closed tab): it plays when it is shown.
      if ((r.top < innerHeight && r.bottom > 0) || (r.width === 0 && r.height === 0)) return;
      el.classList.add("cm-wait");
      io.observe(el);
    };
    const scan = (root: Element | Document) => {
      if (root instanceof Element && root.matches("[data-chart]")) gate(root);
      root.querySelectorAll("[data-chart]").forEach((el) => gate(el));
    };
    scan(document);
    const mo = new MutationObserver((records) => {
      for (const rec of records) rec.addedNodes.forEach((n) => { if (n instanceof Element) scan(n); });
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect(); mo.disconnect(); timers.forEach(clearTimeout);
      removeEventListener("popstate", settle);
      document.removeEventListener("pointerdown", unsettle, true);
      document.removeEventListener("keydown", unsettle, true);
    };
  }, []);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const settled = document.documentElement.dataset.motion === "settled";
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
      // Shown already: nothing to watch. Marked but not shown (a previous run's observer was disconnected, as React's
      // development double effect does, or the route changed under it): watched again, or it would stay invisible.
      if (el.classList.contains("in")) continue;
      // A ghost has its own appearance, and content that replaced a ghost (.g-content) its own entrance.
      if (el.closest("[data-ghost], .g-content")) continue;
      // Streamed content not yet hydrated keeps the server's classes; it simply appears.
      if (!hydrated(el)) continue;
      // Back/forward: shown at once (both classes in one frame: no transition).
      if (settled) { el.classList.add("rv", "in"); continue; }
      if (!el.classList.contains("rv")) {
        el.classList.add("rv");
        const d = el.dataset.reveal;
        if (d && /^\d$/.test(d)) el.classList.add("d" + d);
      }
      const r = el.getBoundingClientRect();
      // already on screen at mount: reveal on next frame (staggers via CSS delay)
      if (r.top < innerHeight && r.bottom > 0) requestAnimationFrame(() => el.classList.add("in"));
      else io.observe(el);
    }
    return () => io.disconnect();
  }, [path]);
  return null;
}

"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

type Mode = "light" | "dark" | "system";

/**
 * Theme: the system's until the first click, then light or dark (UX audit Z1-26, 16 November 2026: on a light system
 * the old cycle light → system → dark changed only the glyph at its first click). A click always switches between
 * light and dark, from the theme on screen. The chosen value is stamped on <html data-theme> before paint by the inline
 * script in layout.tsx; this control switches it.
 *
 * The swap is one dissolve (UX audit M-11, owner, 16 November 2026): the page as it was stays underneath and the page in
 * the new theme fades in over it in 220 ms (a view transition of this document; page-transition.css), instead of every
 * element recolouring itself over 420 ms. Reduced motion, or a browser without view transitions: at once.
 */
export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    try {
      const v = localStorage.getItem("theme");
      if (v === "light" || v === "dark") {
        setMode(v);
        // A page React had to render in the browser (a 404 a page threw) drew <html> again without the stamp, and the
        // inline script does not run a second time: the saved theme is stamped again here.
        document.documentElement.setAttribute("data-theme", v);
      }
    } catch {}
  }, []);

  const apply = (m: Mode) => {
    const root = document.documentElement;
    const swap = () => {
      if (m === "system") root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", m);
      try {
        if (m === "system") localStorage.removeItem("theme");
        else localStorage.setItem("theme", m);
      } catch {}
      window.dispatchEvent(new Event("themechange"));
      // Inside the transition the glyph is drawn in the new picture too.
      flushSync(() => setMode(m));
    };
    const start = (document as Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } }).startViewTransition;
    if (!start || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { swap(); return; }
    root.dataset.vt = "theme";
    start.call(document, swap).finished.finally(() => { delete root.dataset.vt; });
  };

  // What the screen shows now: the chosen theme, or the system's.
  const shown = (): "light" | "dark" => (mode !== "system" ? mode : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const label = mode === "dark" ? "temă: întunecată" : mode === "light" ? "temă: luminoasă" : "temă: ca sistemul";
  const glyph = mode === "dark" ? "☾" : mode === "light" ? "☀" : "◐";
  return (
    <button type="button" className="theme-btn" onClick={() => apply(shown() === "dark" ? "light" : "dark")} title={label} aria-label={label}>
      <span aria-hidden>{glyph}</span>
    </button>
  );
}

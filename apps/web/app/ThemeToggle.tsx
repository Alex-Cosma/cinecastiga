"use client";

import { useEffect, useState } from "react";

type Mode = "light" | "dark" | "system";

/**
 * Theme: the system's until the first click, then light or dark (UX audit Z1-26, 16 November 2026: on a light system
 * the old cycle light → system → dark changed only the glyph at its first click). A click always switches between
 * light and dark, from the theme on screen. The chosen value is stamped on <html data-theme> before paint by the inline
 * script in layout.tsx; this control switches it and animates the swap.
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
    root.classList.add("theming");
    if (m === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", m);
    try {
      if (m === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", m);
    } catch {}
    window.setTimeout(() => root.classList.remove("theming"), 500);
    window.dispatchEvent(new Event("themechange"));
    setMode(m);
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

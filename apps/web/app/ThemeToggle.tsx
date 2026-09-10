"use client";

import { useEffect, useState } from "react";

type Mode = "light" | "dark" | "system";

/**
 * Three-state theme: system (no stamp), light, dark. The chosen value is
 * stamped on <html data-theme> before paint by the inline script in
 * layout.tsx; this control just cycles it and animates the swap.
 */
export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    try {
      const v = localStorage.getItem("theme");
      if (v === "light" || v === "dark") setMode(v);
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

  const next: Record<Mode, Mode> = { system: "dark", dark: "light", light: "system" };
  const label = mode === "dark" ? "temă: întunecată" : mode === "light" ? "temă: luminoasă" : "temă: ca sistemul";
  const glyph = mode === "dark" ? "☾" : mode === "light" ? "☀" : "◐";
  return (
    <button type="button" className="theme-btn" onClick={() => apply(next[mode])} title={label} aria-label={label}>
      <span aria-hidden>{glyph}</span>
    </button>
  );
}

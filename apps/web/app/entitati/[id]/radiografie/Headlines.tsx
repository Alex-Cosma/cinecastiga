"use client";

import type { Headline } from "@/lib/radiografie";

/** The three strongest findings; click scrolls to the panel and highlights it. */
export default function Headlines({ items }: { items: Headline[] }) {
  if (items.length === 0) return null;
  const go = (h: Headline) => {
    const p = document.getElementById(`rx-${h.go}`);
    if (!p) return;
    p.scrollIntoView({ behavior: "smooth", block: "start" });
    p.classList.add("rx-hl");
    setTimeout(() => p.classList.remove("rx-hl"), 1800);
    window.dispatchEvent(new CustomEvent("rx-focus", { detail: h }));
  };
  return (
    <div className="rx-heads">
      {items.map((h, i) => (
        <a
          key={i}
          href={`#rx-${h.go}`}
          className="rx-head"
          onClick={(e) => {
            e.preventDefault();
            go(h);
          }}
        >
          <span className="k">{h.k}</span>
          <span className="t">{h.t}</span>
          <span className="w num">{h.w}</span>
        </a>
      ))}
    </div>
  );
}

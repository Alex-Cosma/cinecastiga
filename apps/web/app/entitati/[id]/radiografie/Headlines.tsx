"use client";

import type { Headline } from "@/lib/radiografie";
import { scrollToArrive } from "../../../../components/motion/outline";

/** The three strongest findings; a click scrolls to the panel, which draws its arrival outline once it stops (M-09). */
export default function Headlines({ items }: { items: Headline[] }) {
  if (items.length === 0) return null;
  const go = (h: Headline) => {
    const p = document.getElementById(`rx-${h.go}`);
    if (!p) return;
    scrollToArrive(p);
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

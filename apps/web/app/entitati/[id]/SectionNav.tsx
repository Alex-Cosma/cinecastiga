"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

export interface SectionItem {
  id?: string; // in-page anchor
  href?: string; // or a real link
  label: string;
  count?: string;
}

/** Which edges of the tab row hide more tabs (drives the edge fade). */
type Fade = "none" | "left" | "right" | "both";

/**
 * Sticky section navigation under the site header. Scroll-spy picks the
 * active anchor; one measured underline slides between items. On narrow
 * screens the row scrolls sideways and fades at the edge that hides tabs.
 */
export default function SectionNav({ items }: { items: SectionItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string>(items.find((i) => i.id)?.id ?? "");
  const [ind, setInd] = useState<{ left: number; width: number } | null>(null);
  const [fade, setFade] = useState<Fade>("none");

  /** Height covered by the sticky site header plus this bar. */
  const coveredTop = useCallback(() => {
    const header = document.querySelector<HTMLElement>(".site-header")?.getBoundingClientRect().height ?? 0;
    const bar = ref.current?.parentElement?.getBoundingClientRect().height ?? 0;
    return header + bar;
  }, []);

  useEffect(() => {
    const ids = items.filter((i) => i.id).map((i) => i.id!);
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const onScroll = () => {
      const y = window.scrollY + coveredTop() + 24;
      // The tabs are not in page order (e.g. "Conducere" is listed last but sits
      // above the signals), so the active one is the lowest section already reached.
      let cur = ids[0]!;
      let top = -Infinity;
      for (const el of els) if (el.offsetTop <= y && el.offsetTop > top) { cur = el.id; top = el.offsetTop; }
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [items, coveredTop]);

  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const update = () => {
      const left = nav.scrollLeft > 2;
      const right = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2;
      setFade(left && right ? "both" : left ? "left" : right ? "right" : "none");
    };
    update();
    nav.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    return () => { nav.removeEventListener("scroll", update); observer.disconnect(); };
  }, []);

  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const on = nav.querySelector<HTMLElement>("a[data-on='1']");
    if (!on) return setInd(null);
    setInd({ left: on.offsetLeft, width: on.offsetWidth });
    // Keep the active tab visible in a row that scrolls sideways (phones).
    const start = on.offsetLeft - nav.scrollLeft;
    if (start < 0 || start + on.offsetWidth > nav.clientWidth) nav.scrollTo({ left: Math.max(0, on.offsetLeft - 32), behavior: "smooth" });
  }, [active]);

  return (
    <div className="subnav">
      <div className="subnav-in" ref={ref} data-fade={fade === "none" ? undefined : fade}>
        {ind && <span className="subnav-ind" style={{ left: ind.left, width: ind.width }} aria-hidden />}
        {items.map((it) =>
          it.id ? (
            <a
              key={it.id}
              href={`#${it.id}`}
              data-on={active === it.id ? "1" : undefined}
              className={active === it.id ? "on" : undefined}
              onClick={(e) => {
                e.preventDefault();
                const target = document.getElementById(it.id!);
                if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - coveredTop() - 12, behavior: "smooth" });
                history.replaceState(null, "", `#${it.id}`);
              }}
            >
              {it.label}
              {it.count ? <span className="c">{it.count}</span> : null}
            </a>
          ) : (
            <Link key={it.href} href={it.href!} className="ext">
              {it.label} →
            </Link>
          ),
        )}
      </div>
    </div>
  );
}

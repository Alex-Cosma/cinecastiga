"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export interface SectionItem {
  id?: string; // in-page anchor
  href?: string; // or a real link
  label: string;
  count?: string;
}

/**
 * Sticky section navigation under the site header. Scroll-spy picks the
 * active anchor; one measured underline slides between items.
 */
export default function SectionNav({ items }: { items: SectionItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string>(items.find((i) => i.id)?.id ?? "");
  const [ind, setInd] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const ids = items.filter((i) => i.id).map((i) => i.id!);
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const onScroll = () => {
      const y = window.scrollY + 140;
      let cur = ids[0]!;
      for (const el of els) if (el.offsetTop <= y) cur = el.id;
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [items]);

  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const on = nav.querySelector<HTMLElement>("a[data-on='1']");
    if (!on) return setInd(null);
    setInd({ left: on.offsetLeft, width: on.offsetWidth });
  }, [active]);

  return (
    <div className="subnav">
      <div className="subnav-in" ref={ref}>
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
                document.getElementById(it.id!)?.scrollIntoView({ behavior: "smooth", block: "start" });
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

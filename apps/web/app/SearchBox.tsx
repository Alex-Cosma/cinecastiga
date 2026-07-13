"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EntityHit } from "@/lib/search";

/**
 * Header typeahead. Debounced fetch to /api/search, dropdown of entity hits with
 * keyboard nav. Wrapped in a real GET form so Enter (and no-JS) still lands on
 * /cauta; picking a hit jumps straight to its profile.
 */
export default function SearchBox() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<EntityHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Debounced fetch; abort in-flight requests so late responses can't overwrite.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setHits([]);
      setOpen(false);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: ctrl.signal,
        });
        const data = (await res.json()) as { hits: EntityHit[] };
        setHits(data.hits);
        setActive(-1);
        setOpen(true);
      } catch {
        /* aborted or failed — ignore */
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const go = (id: number) => {
    setOpen(false);
    router.push(`/entitati/${id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      go(hits[active]!.id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="header-search" ref={boxRef}>
      <form action="/cauta" method="get" autoComplete="off">
        <input
          type="search"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Caută entitate sau CUI…"
          aria-label="Caută"
          role="combobox"
          aria-expanded={open}
          aria-controls="search-listbox"
        />
      </form>
      {open && hits.length > 0 ? (
        <ul className="search-dropdown" id="search-listbox" role="listbox">
          {hits.map((h, i) => (
            <li
              key={h.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                go(h.id);
              }}
            >
              <span className="sd-name">{h.name}</span>
              <span className="sd-meta">
                {h.cui ? `CUI ${h.cui}` : ""}
                {h.county ? ` · ${h.county}` : ""}
              </span>
            </li>
          ))}
          <li
            className="search-all"
            role="option"
            aria-selected={false}
            onMouseDown={(e) => {
              e.preventDefault();
              setOpen(false);
              router.push(`/cauta?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            Vezi toate rezultatele →
          </li>
        </ul>
      ) : null}
    </div>
  );
}

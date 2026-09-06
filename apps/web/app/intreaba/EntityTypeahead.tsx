"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EntityHit } from "@/lib/search";
import { formatRon } from "@/lib/format";

const ROLE_RO: Record<string, string> = { authority: "autoritate", supplier: "furnizor" };

/**
 * Home "Caută" box: a typeahead over the Meilisearch entities index. Picking a
 * hit (click / Enter) jumps straight to the entity profile; the results page
 * stays reachable through the last "Vezi toate" row for the rare case the top
 * hits miss. Owns only the dropdown; the query text lives in AskPanel so it
 * survives switching to the other modes.
 */
export default function EntityTypeahead({
  q,
  setQ,
  placeholder,
}: {
  q: string;
  setQ: (v: string) => void;
  placeholder: string;
}) {
  const [hits, setHits] = useState<EntityHit[]>([]);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Debounced fetch; abort in-flight so a slow early response can't win.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setHits([]);
      setTotal(0);
      setOpen(false);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: ctrl.signal,
        });
        const data = (await res.json()) as { hits: EntityHit[]; total: number };
        setHits(data.hits);
        setTotal(data.total);
        setActive(-1);
        setOpen(true);
      } catch {
        /* aborted or failed — keep whatever is shown */
      }
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

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
  const goAll = () => {
    setOpen(false);
    router.push(`/cauta?q=${encodeURIComponent(q.trim())}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    }
  };

  return (
    <div className="ask-search" ref={boxRef}>
      <form
        className="ask-box"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          if (!q.trim()) return;
          // Enter takes the highlighted hit, else the best match; the full
          // results page only when nothing matched at all.
          const pick = active >= 0 ? hits[active] : hits[0];
          if (pick) go(pick.id);
          else goAll();
        }}
      >
        <span className="ask-ic" aria-hidden>
          🔍
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Caută o entitate"
          role="combobox"
          aria-expanded={open}
          aria-controls="home-search-listbox"
          aria-autocomplete="list"
        />
        <button type="submit">Caută</button>
      </form>
      {open && (
        <ul className="search-dropdown ask-dropdown" id="home-search-listbox" role="listbox">
          {hits.length === 0 && (
            <li className="search-empty" role="presentation">
              Nimic pentru „{q.trim()}”.
            </li>
          )}
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
                {h.roles.map((r) => ROLE_RO[r] ?? r).join(" · ")}
                {h.county ? ` · ${h.county}` : ""}
                {h.cui ? ` · CUI ${h.cui}` : ""}
                {h.total > 0 ? ` · ${formatRon(h.total)}` : ""}
              </span>
            </li>
          ))}
          {hits.length > 0 && total > hits.length && (
            <li
              className="search-all"
              role="option"
              aria-selected={false}
              onMouseDown={(e) => {
                e.preventDefault();
                goAll();
              }}
            >
              Vezi toate cele {total} rezultate →
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

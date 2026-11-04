"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { isActive } from "@/lib/table-filters/codec";
import type { ColumnDef, Facet, FilterValue } from "@/lib/table-filters/types";
import { DatesBody, ListBody, RangeBody } from "./FilterBodies";
import { useFacet } from "./useFacet";
import "./table-filters.css";

/** The window's width by the kind of filter: a name list needs more room than a type list. */
const WIDTH: Record<ColumnDef["kind"], number> = { pick: 360, dates: 320, range: 300, options: 280 };

/**
 * A column's funnel (owner decision of 4 November 2026): a button in the header and, open, a window with the column's
 * values in the rows the other filters leave. A choice applies at once; „Gata” only closes. The window is drawn over
 * the page, not inside the table (whose box clips), under its funnel; on a phone it is a sheet at the bottom.
 */
export default function ColumnFilter({
  column,
  value,
  onChange,
  facetUrl,
  localFacet,
  onFacet,
  align = "start",
}: {
  column: ColumnDef;
  value: FilterValue | undefined;
  onChange: (value: FilterValue | null) => void;
  /** This column's options under the other filters, from the server; the term searches them (pick columns). */
  facetUrl?: (term: string) => string;
  /** The same, counted in the browser over rows it already holds (lib/table-filters/memory.ts). */
  localFacet?: (term: string) => Facet;
  /** Each answer, so the band can name the chosen values. */
  onFacet?: (facet: Facet) => void;
  /** Which edge of the funnel the window lines up with: the last columns open leftwards. */
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [searched, setSearched] = useState("");
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const active = isActive(value);
  const remote = useFacet(open && !localFacet && facetUrl ? facetUrl(searched) : null);
  const facet = open && localFacet ? localFacet(searched) : remote.facet;
  const { loading, error } = localFacet ? { loading: false, error: false } : remote;

  // A server's answer is reported once, so the band can name its values; a local facet's names are the caller's own.
  useEffect(() => { if (remote.facet) onFacet?.(remote.facet); }, [remote.facet]); // eslint-disable-line react-hooks/exhaustive-deps -- reported once per answer
  // A search is asked 200 ms after the last key.
  useEffect(() => {
    const timer = setTimeout(() => setSearched(term.trim()), 200);
    return () => clearTimeout(timer);
  }, [term]);

  const close = (focus = true) => {
    setOpen(false);
    setTerm("");
    setSearched("");
    if (focus) button.current?.focus();
  };

  // Under the funnel, kept in the window; a phone's sheet needs no place.
  useLayoutEffect(() => {
    if (!open) return;
    const placeIt = () => {
      const b = button.current?.getBoundingClientRect();
      if (!b || window.matchMedia("(max-width: 560px)").matches) { setPlace(null); return; }
      const width = WIDTH[column.kind];
      const left = align === "end" ? b.right - width : b.left;
      setPlace({ top: b.bottom + 6, left: Math.max(12, Math.min(left, window.innerWidth - width - 12)), width });
    };
    placeIt();
    window.addEventListener("resize", placeIt);
    window.addEventListener("scroll", placeIt, true);
    return () => { window.removeEventListener("resize", placeIt); window.removeEventListener("scroll", placeIt, true); };
  }, [open, align, column.kind]);

  // Closed by a tap or click outside it and by Escape, which gives the focus back to the funnel.
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) close(false);
    };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    panel.current?.querySelector<HTMLElement>("input, button")?.focus();
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- `close` only reads refs and setters

  const body = !facet
    ? <p className="tf-wait">{error ? "Opțiunile nu au putut fi încărcate." : "Se încarcă opțiunile…"}</p>
    : facet.kind === "dates" ? <DatesBody facet={facet} value={value} onChange={onChange} />
      : facet.kind === "range" ? <RangeBody column={column} facet={facet} value={value} onChange={onChange} />
        : <ListBody column={column} facet={facet} value={value} onChange={onChange} stale={loading} />;

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`tf-fun${active ? " on" : ""}${open ? " open" : ""}`}
        aria-label={`Filtrează după ${column.label.toLowerCase()}${active ? " (filtrat)" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 3h12l-4.5 5.5V13L6.5 14V8.5z" />
        </svg>
      </button>
      {open && createPortal(
        <>
          <div className="tf-backdrop" aria-hidden="true" />
          <div ref={panel} id={id} className={`tf-pop${place ? "" : " tf-sheet"}`} style={place ?? undefined} role="dialog" aria-label={`Filtru: ${column.label}`}>
            <p className="tf-title">{column.label}</p>
            {column.kind === "pick" && (
              <label className="tf-search">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>
                <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Caută" aria-label={`Caută ${column.label.toLowerCase()}`} />
              </label>
            )}
            {body}
            <div className="tf-foot">
              <button type="button" className="tf-clear" disabled={!active} onClick={() => onChange(null)}>Șterge filtrul</button>
              <button type="button" className="tf-done" onClick={() => close()}>Gata</button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

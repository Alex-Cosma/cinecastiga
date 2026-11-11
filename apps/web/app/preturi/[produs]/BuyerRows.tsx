"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import EntityName from "@/components/EntityName";
import { formatLei, formatQuantity, formatRatio, formatUnitPrice, perWord, ratioWords } from "@/lib/unit-prices-shared";

export interface BuyerRowLine { daId: string; date: string | null; name: string | null; unit: string | null; quantity: string; unitPrice: string; perUnit: string; note: string }
export interface BuyerRowData {
  id: string; year: number; name: string; county: string | null; price: number; median: number; ratio: number; quantity: number; excess: number;
  /** The mart's lead flag (never the multiple alone: a row at twice the median that is not a lead is an ordinary row). */
  lead: boolean;
  awards: number; lines: number; suppliers: { id: string; name: string }[]; moreSuppliers: number; pinned: boolean; shown: BuyerRowLine[];
}

/**
 * The buyers' rows: each opens its lines under it (owner, 11 November 2026); a dot or a lead opens its row first.
 * „Liniile” is a link to the same page with the row opened (`deschis`), so it works without JavaScript; with it the
 * link is a toggle in place. The rows keep their table roles when the table is drawn as cards on narrow windows.
 */
export default function BuyerRows({ rows, per, showYear = false, hrefBase }: {
  rows: BuyerRowData[]; per: string; showYear?: boolean;
  /** This page's address without `deschis`: a row's link adds its own. */
  hrefBase: string;
}) {
  const keyOf = (r: BuyerRowData) => `${r.id}-${r.year}`;
  const pinned = rows.filter((r) => r.pinned).map(keyOf);
  const pinnedKey = pinned.join(",");
  const [open, setOpen] = useState<Set<string>>(() => new Set(pinned));
  const body = useRef<HTMLTableSectionElement>(null);
  // A dot or a lead brought the reader here: its row is open and the keyboard continues from its „Liniile”.
  useEffect(() => {
    if (!pinnedKey) return;
    const first = pinnedKey.split(",")[0]!;
    setOpen((s) => new Set([...s, ...pinnedKey.split(",")]));
    body.current?.querySelector<HTMLElement>(`[data-lines="${first}"]`)?.focus({ preventScroll: true });
  }, [pinnedKey]);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const hrefOf = (k: string) => `${hrefBase}${hrefBase.includes("?") ? "&" : "?"}deschis=${k}#institutie-${k}`;
  return <tbody role="rowgroup" ref={body}>
    {rows.map((b) => {
      const k = keyOf(b), isOpen = open.has(k);
      return <Fragment key={k}>
        <tr role="row" id={`institutie-${k}`} className={`pr-brow${b.lead ? " is-lead" : ""}${isOpen ? " is-open" : ""}`}>
          <td role="cell" className="c-who" data-label="Instituția"><EntityName id={b.id} role="authority">{b.name}</EntityName>{b.county && <small>{b.county}</small>}</td>
          {showYear && <td role="cell" className="pr-num c-year" data-label="Anul">{b.year}</td>}
          <td role="cell" className="pr-num c-price" data-label="Preț"><b>{formatUnitPrice(b.price)}</b> {per}</td>
          <td role="cell" className="pr-num c-x" data-label="Multiplu" title={`${ratioWords(b.ratio)} (${formatUnitPrice(b.median)} în ${b.year})`}>{formatRatio(b.ratio)}</td>
          <td role="cell" className="pr-num c-qty" data-label="Cantitate">{formatQuantity(b.quantity, per)}<small>{b.awards === 1 ? "o achiziție" : `${b.awards} achiziții`}</small></td>
          <td role="cell" className="pr-num c-lei" data-label="Peste mediană">{b.excess > 0 ? formatLei(b.excess) : <small>sub mediană</small>}</td>
          <td role="cell" className="c-sup" data-label="Furnizori">{b.suppliers.length ? <>{b.suppliers.map((s, i) => <Fragment key={s.id}>{i > 0 && ", "}<EntityName id={s.id} role="supplier">{s.name}</EntityName></Fragment>)}{b.moreSuppliers > 0 && ` și încă ${b.moreSuppliers}`}</> : "—"}</td>
          <td role="cell" className="c-open"><a href={hrefOf(k)} role="button" className="pr-lines-btn" data-lines={k} data-no-pending="" aria-expanded={isOpen} aria-controls={isOpen ? `linii-${k}` : undefined}
            aria-label={`Liniile: ${b.name}${showYear ? `, ${b.year}` : ""}`}
            onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); toggle(k); }}
            onKeyDown={(e) => { if (e.key === " ") { e.preventDefault(); toggle(k); } }}>
            Liniile<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" /></svg></a></td>
        </tr>
        {isOpen && <tr role="row" className="pr-lines-row" id={`linii-${k}`}>
          <td role="cell" colSpan={showYear ? 8 : 7}>
            <div className="pr-lines-wrap">
              <table className="pr-lines" role="table" aria-label={`Liniile cumpărate de ${b.name} în ${b.year}`}>
                <thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">Data</th><th role="columnheader" scope="col">Denumirea din SEAP</th><th role="columnheader" scope="col" className="pr-num">Cantitate</th><th role="columnheader" scope="col">Unitatea</th>
                  <th role="columnheader" scope="col" className="pr-num">Preț unitar</th><th role="columnheader" scope="col" className="pr-num">{perWord(per)}</th><th role="columnheader" scope="col"><span className="sr-only">Achiziția</span></th></tr></thead>
                <tbody role="rowgroup">{b.shown.map((l, i) => <tr role="row" key={`${l.daId}-${i}`}>
                  <td role="cell" data-label="Data">{l.date ?? "—"}</td>
                  <td role="cell" className="c-name" data-label="Denumire">{l.name ?? "Denumire neprecizată"}</td>
                  <td role="cell" className="pr-num" data-label="Cantitate">{l.quantity}</td>
                  <td role="cell" className="c-unit" data-label="Unitate">{l.unit ?? "—"}</td>
                  <td role="cell" className="pr-num" data-label="Preț unitar">{l.unitPrice}</td>
                  <td role="cell" className="pr-num" data-label={perWord(per)}>{l.perUnit}{l.note && <small>{l.note}</small>}</td>
                  <td role="cell" className="c-da"><Link href={`/achizitii/${l.daId}`} prefetch={false} aria-label={`Achiziția din ${l.date ?? "dată neprecizată"}: ${l.name ?? "denumire neprecizată"}`}>Achiziția</Link></td>
                </tr>)}</tbody>
              </table>
              {b.lines > b.shown.length && <p className="pr-lines-more">Cele mai scumpe {b.shown.length} din {b.lines} linii; toate sunt în achizițiile instituției.</p>}
            </div>
          </td>
        </tr>}
      </Fragment>;
    })}
  </tbody>;
}

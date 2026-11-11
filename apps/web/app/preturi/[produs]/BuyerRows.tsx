"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import EntityName from "@/components/EntityName";
import { formatLei, formatQuantity, formatRatio, formatUnitPrice, perWord, ratioWords } from "@/lib/unit-prices-shared";

export interface BuyerRowLine { daId: string; date: string | null; name: string | null; unit: string | null; quantity: string; unitPrice: string; perUnit: string; note: string }
export interface BuyerRowData {
  id: string; year: number; name: string; county: string | null; price: number; median: number; ratio: number; quantity: number; excess: number;
  awards: number; lines: number; suppliers: { id: string; name: string }[]; moreSuppliers: number; pinned: boolean; shown: BuyerRowLine[];
}

/** The buyers' rows: each opens its lines under it (owner, 11 November 2026); a dot or a lead opens its row first. */
export default function BuyerRows({ rows, per, showYear = false }: { rows: BuyerRowData[]; per: string; showYear?: boolean }) {
  const keyOf = (r: BuyerRowData) => `${r.id}-${r.year}`;
  const [open, setOpen] = useState<Set<string>>(() => new Set(rows.filter((r) => r.pinned).map(keyOf)));
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return <tbody>
    {rows.map((b) => {
      const k = keyOf(b), isOpen = open.has(k);
      return <Fragment key={k}>
        <tr id={`institutie-${k}`} className={`pr-brow${b.ratio >= 2 ? " is-lead" : ""}${isOpen ? " is-open" : ""}`}>
          <td className="c-who" data-label="Instituția"><EntityName id={b.id} role="authority">{b.name}</EntityName>{b.county && <small>{b.county}</small>}</td>
          {showYear && <td className="pr-num c-year" data-label="Anul">{b.year}</td>}
          <td className="pr-num c-price" data-label="Preț"><b>{formatUnitPrice(b.price)}</b> {per}</td>
          <td className="pr-num c-x" data-label="Multiplul" title={`${ratioWords(b.ratio)} (${formatUnitPrice(b.median)} în ${b.year})`}>{formatRatio(b.ratio)}</td>
          <td className="pr-num c-qty" data-label="Cantitate">{formatQuantity(b.quantity, per)}<small>{b.awards === 1 ? "o achiziție" : `${b.awards} achiziții`}</small></td>
          <td className="pr-num c-lei" data-label="Peste mediană">{b.excess > 0 ? formatLei(b.excess) : <small>sub mediană</small>}</td>
          <td className="c-sup" data-label="Furnizori">{b.suppliers.length ? <>{b.suppliers.map((s, i) => <Fragment key={s.id}>{i > 0 && ", "}<EntityName id={s.id} role="supplier">{s.name}</EntityName></Fragment>)}{b.moreSuppliers > 0 && ` și încă ${b.moreSuppliers}`}</> : "—"}</td>
          <td className="c-open"><button type="button" className="pr-lines-btn" aria-expanded={isOpen} aria-controls={`linii-${k}`} onClick={() => toggle(k)}>
            Liniile<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" /></svg></button></td>
        </tr>
        {isOpen && <tr className="pr-lines-row" id={`linii-${k}`}>
          <td colSpan={showYear ? 8 : 7}>
            <div className="pr-lines-wrap" tabIndex={0} role="region" aria-label={`Liniile cumpărate de ${b.name} în ${b.year}`}>
              <table className="pr-lines">
                <thead><tr><th scope="col">Data</th><th scope="col">Denumirea din SEAP</th><th scope="col" className="pr-num">Cantitate</th><th scope="col">Unitatea</th>
                  <th scope="col" className="pr-num">Preț unitar</th><th scope="col" className="pr-num">{perWord(per)}</th><th scope="col"><span className="sr-only">Achiziția</span></th></tr></thead>
                <tbody>{b.shown.map((l, i) => <tr key={`${l.daId}-${i}`}>
                  <td data-label="Data">{l.date ?? "—"}</td>
                  <td data-label="Denumire">{l.name ?? "Denumire neprecizată"}</td>
                  <td className="pr-num" data-label="Cantitate">{l.quantity}</td>
                  <td data-label="Unitate">{l.unit ?? "—"}</td>
                  <td className="pr-num" data-label="Preț unitar">{l.unitPrice}</td>
                  <td className="pr-num" data-label={perWord(per)}>{l.perUnit}{l.note && <small>{l.note}</small>}</td>
                  <td><Link href={`/achizitii/${l.daId}`} prefetch={false}>Achiziția</Link></td>
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

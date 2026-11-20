"use client";

import { arrive } from "../../../components/motion/outline";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import ClipButton from "@/components/ClipButton";
import EntityName from "@/components/EntityName";
import Lei from "@/components/Lei";
import { leiRounded } from "@/lib/lei";
import DiscoverPager from "@/components/discover/DiscoverPager";
import AlsoTag from "./AlsoTag";
import ColumnFilter from "@/components/table-filters/ColumnFilter";
import FilterBand from "@/components/table-filters/FilterBand";
import { useMemoryFilters } from "@/components/table-filters/useMemoryFilters";
import { cleanName, formatCalendarDate, formatExactDecimal, formatInt } from "@/lib/format";
import { isActive } from "@/lib/table-filters/codec";
import type { Readers } from "@/lib/table-filters/memory";
import type { TableColumns } from "@/lib/table-filters/types";

/**
 * The cases of a one-acquisition pattern (above the ceiling, just under it) as one table (owner, 6 November 2026): a
 * funnel on the partner, the date and the value, 10 rows a page (owner); above the ceiling, each row's excess drawn as a bar
 * with its number above it and the sentence on hover; just under it, the sum left under the ceiling. All of the entity's cases are in the page (410 at most); the browser
 * filters and pages them.
 */
export interface CaseRow {
  id: string;
  partnerId: string | null;
  partnerName: string | null;
  /** The acquisition's published title, or its CPV name. */
  title: string | null;
  date: string | null;
  /** The sum the rule read: the final one, or the estimate when that crossed the ceiling. */
  value: number;
  ceiling: number;
  /** Above the ceiling: the excess; under it: what was left. */
  diff: number;
  estimate: boolean;
  /** The acquisition's sicap id and its SEAP page. */
  refId: string | null;
  seap: string | null;
  /** The other patterns the same acquisition is in, named. */
  also: string[];
}

export const CASE_TABLE_PAGE = 10;

/** A gap to the ceiling keeps its bani: „−0,40 lei” under it is the point of the row (Decision A rounds amounts, not gaps). */
const lei = (v: number) => `${formatExactDecimal(String(Math.round(v * 100) / 100))} lei`;
/** An acquisition's value or a ceiling: to the leu, the exact amount on hover or tap (Decision A, owner, 20 November 2026). */
const bani = (v: number) => Math.round(v * 100) / 100;
const amount = (v: number) => leiRounded(bani(v)) ?? "—";

export default function CaseTable({ rows, kind, order, partnerRole, clipPrefix }: {
  rows: readonly CaseRow[];
  kind: "above" | "under";
  /** How the rows come, in words: „cele mai mari sume întâi”. */
  order: string;
  /** The side each row names: an institution's cases name firms. */
  partnerRole: "authority" | "supplier";
  clipPrefix: string;
}) {
  const partner = partnerRole === "supplier" ? "Firmă" : "Instituție";
  const columns = useMemo<TableColumns>(() => [
    { key: "partener", kind: "pick", label: partner, chip: partner === "Firmă" ? "firma" : "instituția", param: "partener" },
    { key: "data", kind: "dates", label: "Data", chip: "", param: "data", order: "newest" },
    { key: "valoare", kind: "range", label: "Valoare", chip: "valoarea", param: "valoare", unit: "lei" },
  ], [partner]);
  const readers = useMemo<Readers<CaseRow>>(() => ({
    partener: (r) => r.partnerId ?? (r.partnerName ? `n:${r.partnerName}` : null),
    data: (r) => r.date,
    valoare: (r) => r.value,
  }), []);
  const names = useMemo(() => new Map(rows.map((r) => [r.partnerId ?? `n:${r.partnerName}`, cleanName(r.partnerName) || "—"])), [rows]);
  const filters = useMemoryFilters(columns, rows, readers, (key, value) => (key === "partener" ? names.get(value) : undefined));
  const [page, setPage] = useState(1);
  // In motion (owner, 6 November 2026): at first view the bars on screen grow from 0, top to bottom; after a page or a
  // filter the new rows enter shorter and together, and a row that stays keeps its bar.
  const [update, setUpdate] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const table = useRef<HTMLTableElement>(null);
  const kept = filters.rows;
  const pages = Math.max(1, Math.ceil(kept.length / CASE_TABLE_PAGE));
  const at = Math.min(page, pages);
  const shown = kept.slice((at - 1) * CASE_TABLE_PAGE, at * CASE_TABLE_PAGE);
  const filtered = Object.values(filters.state).some(isActive);

  // A link to one case (#caz-<id>: the national list, an old sources link) opens the page that holds it.
  useEffect(() => {
    const go = () => {
      const id = decodeURIComponent(window.location.hash.slice(1)).replace(/^caz-/, "");
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) return;
      filters.replace({});
      setPage(Math.floor(i / CASE_TABLE_PAGE) + 1);
      setFocus(id);
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps -- the filters' setters are stable in use
  useEffect(() => {
    if (!focus) return;
    const row = document.getElementById(`caz-${focus}`);
    row?.scrollIntoView({ block: "center" });
    // The row a link chose draws its outline once where it stopped (M-09); its mark stays.
    arrive(row);
  }, [focus, at]);

  const turn = (next: number) => { setUpdate(true); setPage(next); table.current?.scrollIntoView({ block: "nearest" }); };
  const funnel = (key: string, align: "start" | "end" = "start") => (
    <ColumnFilter column={columns.find((c) => c.key === key)!} value={filters.state[key]}
      onChange={(value) => { setUpdate(true); filters.set(key, value); setPage(1); }}
      localFacet={(term) => filters.facet(key, term)} align={align} />
  );
  const max = Math.max(1, ...rows.map((r) => r.value / Math.max(1, r.ceiling)));

  return (
    <div className={`sgc-table-wrap${update ? " is-upd" : ""}`}>
      <FilterBand columns={columns} state={filters.state} labels={filters.labels} onChange={(s) => { setUpdate(true); filters.replace(s); setPage(1); }} />
      <p className="sgc-table-status" role="status">
        {/* The count is the heading's above and the pager's under the table: said only with a filter on (owner, 17 November 2026). */}
        {kept.length
          ? filtered
            ? `${formatInt((at - 1) * CASE_TABLE_PAGE + 1)}–${formatInt(Math.min(at * CASE_TABLE_PAGE, kept.length))} din ${formatInt(kept.length)} (din ${formatInt(rows.length)}) · ${order}`
            : <><span className="sr-only">{`${formatInt((at - 1) * CASE_TABLE_PAGE + 1)}–${formatInt(Math.min(at * CASE_TABLE_PAGE, kept.length))} din ${formatInt(kept.length)} · `}</span>{order.charAt(0).toUpperCase() + order.slice(1)}</>
          : "Niciun caz cu filtrele alese."}
        {!kept.length && filtered && <> <button type="button" className="sgc-link" onClick={() => { setUpdate(true); filters.replace({}); setPage(1); }}>Scoate filtrele</button></>}
      </p>
      <table className="sgc-table" ref={table} data-chart suppressHydrationWarning>
        <thead><tr>
          <th scope="col"><span className="th-filter">{partner}{funnel("partener")}</span></th>
          <th scope="col"><span className="th-filter">Data{funnel("data")}</span></th>
          <th scope="col" className="c-bar">{kind === "above" ? "Peste plafon" : "Sub plafon"}</th>
          <th scope="col" className="num"><span className="th-filter">Valoare{funnel("valoare", "end")}</span></th>
          <th scope="col" className="c-act"><span className="sgc-sr">Surse și salvare</span></th>
        </tr></thead>
        <tbody>
          {shown.map((r, i) => {
            // Every bar on one scale, so the ceilings line up: the part up to the ceiling, then the excess.
            const whole = r.value / Math.max(1, r.ceiling) / max;
            return (
              <tr key={r.id} id={`caz-${r.id}`} className={focus === r.id ? "hit" : undefined}>
                <td className="c-who">
                  <b><EntityName id={r.partnerId} role={partnerRole}>{cleanName(r.partnerName) || "—"}</EntityName></b>
                  {r.refId
                    ? <Link prefetch={false} className="c-title" href={`/achizitii/${r.refId}`}>{r.title ?? "Achiziție directă"}</Link>
                    : <span className="c-title">{r.title ?? "Achiziție directă"}</span>}
                  {r.also.length > 0 && <span className="c-also">{r.also.map((c) => <AlsoTag key={c} label={c} />)}</span>}
                </td>
                <td className="c-date">{r.date ? formatCalendarDate(r.date) : "fără dată"}</td>
                {kind === "above" ? <td className="c-bar">
                  <span className="c-lab" aria-hidden="true"><span>plafon {formatInt(Math.round(r.ceiling))}</span><b>+{lei(r.diff)}</b></span>
                  <span className="c-meter" tabIndex={0} role="img" aria-label={`${amount(r.value)}${r.estimate ? " (valoarea estimată)" : ""}, cu ${lei(r.diff)} peste plafonul de ${amount(r.ceiling)}`}>
                    {/* The part up to the ceiling and the excess grow as one bar. */}
                    <span className="c-track cm-x cm-tw" style={{ width: `${whole * 100}%`, "--i": i } as CSSProperties}><i style={{ width: `${(r.ceiling / Math.max(1, r.value)) * 100}%` }} /><b /></span>
                    <span className="sgc-tip r" aria-hidden="true"><b>{amount(r.value)}{r.estimate ? ", valoarea estimată" : ""}</b><span>plafonul: {amount(r.ceiling)}, fără TVA</span><span>cu {lei(r.diff)} peste</span></span>
                  </span>
                </td>
                  // Just under: every bar would be full; the sum left under the ceiling says it.
                  : <td className="c-bar c-gap"><b>−{lei(r.diff)}</b><span>plafon {amount(r.ceiling)}</span></td>}
                <td className="num c-val"><Lei value={bani(r.value)} />{r.estimate && <small>estimată</small>}</td>
                <td className="c-act">
                  {r.seap && <a className="c-seap" href={r.seap} target="_blank" rel="noreferrer" aria-label="Deschide în SEAP">SEAP<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M4 2.5h5.5V8M9.5 2.5 3 9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg></a>}
                  <ClipButton kind="signal" refId={r.id} label={`${clipPrefix} · ${cleanName(r.partnerName)}`} compact />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* The pager of the „Descoperă” pages (UX audit Z6-14), its buttons turning the table's pages here. */}
      {pages > 1 && <DiscoverPager page={at - 1} pageSize={CASE_TABLE_PAGE} total={kept.length} unit={["caz", "cazuri"]} onPage={(p) => turn(p + 1)}
        label="Paginile cazurilor" bottom className="sgc-dsc-pager" />}
    </div>
  );
}

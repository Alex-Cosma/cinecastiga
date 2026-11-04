"use client";

import { useEffect, useState } from "react";
import { formatInt } from "@/lib/format";
import { monthLabel } from "@/lib/table-filters/describe";
import type { ColumnDef, Facet, FilterValue } from "@/lib/table-filters/types";

/*
 * The insides of a funnel's window, one per kind of filter. Each draws the options the server counted under the other
 * filters and reports a new value at once; an option without rows stays visible, greyed, unless it is chosen (so it
 * can be taken out). Numbers are the rows each option keeps.
 */

type Props<K extends Facet["kind"]> = {
  facet: Extract<Facet, { kind: K }>;
  value: FilterValue | undefined;
  onChange: (value: FilterValue | null) => void;
};

/** The years (any set) or an interval of months. */
export function DatesBody({ facet, value, onChange }: Props<"dates">) {
  const current = value?.kind === "dates" ? value : { kind: "dates" as const, years: [], from: null, to: null };
  const years = new Map<string, number>();
  for (const m of facet.months) years.set(m.month.slice(0, 4), (years.get(m.month.slice(0, 4)) ?? 0) + m.n);
  const yearList = [...new Set([...years.keys(), ...current.years])].sort().reverse();
  const months = facet.months.map((m) => m.month);
  const toggle = (year: string) => {
    const next = current.years.includes(year) ? current.years.filter((y) => y !== year) : [...current.years, year].sort();
    onChange({ kind: "dates", years: next, from: null, to: null });
  };
  const setEnd = (end: "from" | "to", month: string) => {
    const next = { kind: "dates" as const, years: [], from: current.from, to: current.to, [end]: month || null };
    if (next.from && next.to && next.from > next.to) next[end === "from" ? "to" : "from"] = month;
    onChange(next);
  };
  if (yearList.length === 0) return <p className="tf-empty">Niciun rând cu dată în selecția de acum.</p>;
  return (
    <>
      <p className="tf-sub">Anii</p>
      <div className="tf-years">
        {yearList.map((year) => {
          const n = years.get(year) ?? 0;
          const on = current.years.includes(year);
          return (
            <button key={year} type="button" className={on ? "on" : undefined} aria-pressed={on} disabled={n === 0 && !on} onClick={() => toggle(year)}>
              {year} <span className="n">{formatInt(n)}</span>
            </button>
          );
        })}
      </div>
      <p className="tf-sub">Sau un interval de luni</p>
      <div className="tf-pair">
        <label>De la
          <select value={current.from ?? ""} onChange={(e) => setEnd("from", e.target.value)}>
            <option value="">început</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </label>
        <label>Până la
          <select value={current.to ?? ""} onChange={(e) => setEnd("to", e.target.value)}>
            <option value="">azi</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </label>
      </div>
      {facet.undated > 0 && <p className="tf-hint">{formatInt(facet.undated)} fără dată nu intră într-un filtru de dată.</p>}
    </>
  );
}

/** A fixed list or a searchable multi-select: the chosen first, then by rows. */
export function ListBody({ column, facet, value, onChange, stale }: Props<"options" | "pick"> & { column: ColumnDef; stale: boolean }) {
  const chosen = value && (value.kind === "options" || value.kind === "pick") ? value.values : [];
  const toggle = (v: string) => {
    const next = chosen.includes(v) ? chosen.filter((x) => x !== v) : [...chosen, v].sort();
    onChange({ kind: column.kind as "options" | "pick", values: next });
  };
  if (facet.options.length === 0) return <p className="tf-empty">{column.kind === "pick" ? "Nimic nu se potrivește." : "Nicio opțiune în selecția de acum."}</p>;
  return (
    <>
      <div className={`tf-list${stale ? " tf-stale" : ""}`} role="group" aria-label={column.label}>
        {facet.options.map((o) => {
          const on = chosen.includes(o.value);
          return (
            <label key={o.value} className={o.n === 0 && !on ? "off" : undefined}>
              <input type="checkbox" checked={on} disabled={o.n === 0 && !on} onChange={() => toggle(o.value)} />
              <span className="tf-name">{o.label}</span>
              <span className="n">{formatInt(o.n)}</span>
            </label>
          );
        })}
      </div>
      {facet.more && <p className="tf-hint">Caută ca să ajungi la celelalte.</p>}
    </>
  );
}

/** Text typed as „10.000” or „10 000,50” to a number; null when empty or not a number. */
export function parseAmount(text: string): number | null {
  const clean = text.replace(/[\s.]/g, "").replace(",", ".");
  if (clean === "") return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** A numeric interval: two ends, applied when the field is left or Enter is pressed; the bars show the rows' spread. */
export function RangeBody({ column, facet, value, onChange }: Props<"range"> & { column: ColumnDef }) {
  const current = value?.kind === "range" ? value : { kind: "range" as const, min: null, max: null };
  const [lo, setLo] = useState(current.min !== null ? formatInt(current.min) : "");
  const [hi, setHi] = useState(current.max !== null ? formatInt(current.max) : "");
  useEffect(() => { setLo(current.min !== null ? formatInt(current.min) : ""); setHi(current.max !== null ? formatInt(current.max) : ""); }, [current.min, current.max]);
  const apply = () => {
    let min = parseAmount(lo);
    let max = parseAmount(hi);
    if (min !== null && max !== null && min > max) [min, max] = [max, min];
    if (min !== current.min || max !== current.max) onChange({ kind: "range", min, max });
  };
  const top = Math.max(1, ...facet.bins.map((b) => b.n));
  const inside = (from: number, to: number) => (current.min === null || to >= current.min) && (current.max === null || from <= current.max);
  const unit = column.unit ? ` ${column.unit}` : "";
  return (
    <>
      {/* One value, or one bin: nothing to show a spread of. */}
      {facet.bins.length > 1 && (
        <div className="tf-bars" aria-hidden="true">
          {facet.bins.map((b, i) => <i key={i} className={inside(b.from, b.to) ? "in" : undefined} style={{ height: `${Math.max(4, (b.n / top) * 100)}%` }} />)}
        </div>
      )}
      <div className="tf-pair">
        <label>De la
          <input type="text" inputMode="decimal" value={lo} placeholder={facet.min !== null ? formatInt(Math.floor(facet.min)) : ""}
            onChange={(e) => setLo(e.target.value)} onBlur={apply} onKeyDown={(e) => { if (e.key === "Enter") apply(); }} />
        </label>
        <label>Până la
          <input type="text" inputMode="decimal" value={hi} placeholder={facet.max !== null ? formatInt(Math.ceil(facet.max)) : ""}
            onChange={(e) => setHi(e.target.value)} onBlur={apply} onKeyDown={(e) => { if (e.key === "Enter") apply(); }} />
        </label>
      </div>
      <p className="tf-hint">
        {facet.min !== null && facet.max !== null
          ? `Între ${formatInt(Math.floor(facet.min))} și ${formatInt(Math.ceil(facet.max))}${unit} în rândurile de acum. Un capăt gol înseamnă fără limită.`
          : "Niciun rând cu valoare în selecția de acum."}
      </p>
    </>
  );
}

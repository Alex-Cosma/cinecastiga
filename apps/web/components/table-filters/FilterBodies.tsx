"use client";

import { useEffect, useState } from "react";
import { formatInt } from "@/lib/format";
import { monthLabel } from "@/lib/table-filters/describe";
import { datesChoice, monthsValue, parseAmount } from "@/lib/table-filters/values";
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

const MONTH_NAMES = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];

/**
 * The years, from a list that opens under its button (owner, 4 November 2026); with a single year chosen, an interval
 * of its months, „Până la” offering only the months from „De la” on.
 */
export function DatesBody({ facet, value, onChange }: Props<"dates">) {
  const [listOpen, setListOpen] = useState(false);
  const choice = datesChoice(value);
  const years = new Map<string, number>();
  const perMonth = new Map(facet.months.map((m) => [m.month, m.n]));
  for (const m of facet.months) years.set(m.month.slice(0, 4), (years.get(m.month.slice(0, 4)) ?? 0) + m.n);
  const yearList = [...new Set([...years.keys(), ...choice.years])].sort().reverse();
  const single = choice.years.length === 1 ? choice.years[0]! : null;
  const toggle = (year: string) => {
    const next = choice.years.includes(year) ? choice.years.filter((y) => y !== year) : [...choice.years, year].sort();
    onChange({ kind: "dates", years: next, from: null, to: null });
  };
  const summary = choice.years.length === 0 ? "toți anii" : choice.years.join(", ");
  if (yearList.length === 0) return <p className="tf-empty">Niciun rând cu dată în selecția de acum.</p>;
  const months = single ? MONTH_NAMES.map((name, i) => ({ month: `${single}-${String(i + 1).padStart(2, "0")}`, name })) : [];
  const from = single ? choice.from ?? `${single}-01` : null;
  const to = single ? choice.to ?? `${single}-12` : null;
  return (
    <>
      <div className="tf-dd">
        <button type="button" className="tf-dd-btn" aria-expanded={listOpen} onClick={() => setListOpen(!listOpen)}>
          <span className="tf-dd-lab">Anii</span> <b>{summary}</b> <span aria-hidden="true">▾</span>
        </button>
        {listOpen && (
          <div className="tf-list tf-dd-list" role="group" aria-label="Anii">
            {yearList.map((year) => {
              const n = years.get(year) ?? 0;
              const on = choice.years.includes(year);
              return (
                <label key={year} className={n === 0 && !on ? "off" : undefined}>
                  <input type="checkbox" checked={on} disabled={n === 0 && !on} onChange={() => toggle(year)} />
                  <span className="tf-name">{year}</span>
                  <span className="n">{formatInt(n)}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
      {single && (
        <div className="tf-pair">
          <label>De la
            <select value={from!} onChange={(e) => onChange(monthsValue(single, e.target.value, to! < e.target.value ? `${single}-12` : to))}>
              {months.map((m) => <option key={m.month} value={m.month}>{m.name} · {formatInt(perMonth.get(m.month) ?? 0)}</option>)}
            </select>
          </label>
          <label>Până la
            <select value={to!} onChange={(e) => onChange(monthsValue(single, from, e.target.value))}>
              {months.filter((m) => m.month >= from!).map((m) => <option key={m.month} value={m.month}>{m.name} · {formatInt(perMonth.get(m.month) ?? 0)}</option>)}
            </select>
          </label>
        </div>
      )}
      {!single && choice.from && <p className="tf-hint">Din {monthLabel(choice.from)} {choice.to ? `până în ${monthLabel(choice.to)}` : "până azi"}. Alege anii ca să schimbi intervalul.</p>}
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
        {(column.order === "newest" ? [...facet.options].sort((a, b) => b.value.localeCompare(a.value)) : facet.options).map((o) => {
          const on = chosen.includes(o.value);
          return (
            <label key={o.value} className={o.n === 0 && !on ? "off" : undefined}>
              <input type="checkbox" checked={on} disabled={o.n === 0 && !on} onChange={() => toggle(o.value)} />
              <span className="tf-name">{o.label}</span>
              {column.counts !== false && <span className="n">{formatInt(o.n)}</span>}
            </label>
          );
        })}
      </div>
      {facet.more && <p className="tf-hint">Caută ca să ajungi la celelalte.</p>}
    </>
  );
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

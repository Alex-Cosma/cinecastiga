"use client";

import { useId } from "react";
import { spokenCount } from "./Bands";
import { DisabledReason } from "./HelpTip";
import { rovingGridKeyDown, rovingStop } from "./keyboard";
import OptionList from "./pickers/OptionList";
import type { ChangeSource, KitOption } from "./kit-types";

/*
 * Component 12, the period. The same presets everywhere, each saying its
 * years, and the current year saying how far its data go ("2026 · până la
 * 25 sept.", kit §4 Perioada); "Alege anii sau lunile…" opens the free range
 * in the window (today's form: from/to year and month). The year grid
 * (fact_check's "Când?": one year, with the pair's count under each) is a
 * radiogroup walked in two dimensions; an incomplete year is hatched and says
 * so in its name, an empty year stays choosable, grey. The window's title is
 * the caller's (R10: "În ce perioadă?", "Când?" where the phrase carries its
 * preposition).
 */

/** The columns of .qb-years in filters-kit.css: ↑/↓ move by this many cells. */
export const YEAR_COLUMNS = 5;

export interface YearCell {
  value: string;
  /** "2024", or "…" for the cell that opens a range. */
  label: string;
  /** The number under the year, formatted upstream ("11"). */
  count?: string;
  /** Spoken in full ("2026, până la 25 sept., 5 înregistrări"); built from label, partial and count otherwise. */
  name?: string;
  /** An incomplete year ("până la 25 sept."): hatched, and said. */
  partial?: string;
  /** No records: grey, still choosable. */
  zero?: boolean;
  /** Not choosable; a string is the reason. */
  disabled?: boolean | string;
  className?: string;
}

/** `noun`: what the counts count, for the names built here ("2024, 11 înregistrări"). */
export function YearGrid({ label, years, value, onChange, noun = ["înregistrare", "înregistrări"] }: { label: string; years: readonly YearCell[]; value: string | null; onChange?: (value: string, source: ChangeSource) => void; noun?: readonly [string, string] }) {
  const base = useId();
  const checked = years.findIndex(year => year.value === value);
  const stop = rovingStop(checked, years.map(year => !!year.disabled));
  return <div
    className="qb-years"
    role="radiogroup"
    aria-label={label}
    data-roving=""
    onKeyDown={event => rovingGridKeyDown(event, '[role="radio"]', YEAR_COLUMNS, index => { const next = years[index]; if (next) onChange?.(next.value, "move"); })}
  >
    {years.map((year, index) => {
      const on = index === checked, reason = typeof year.disabled === "string" ? year.disabled : null;
      return <button
        key={year.value}
        type="button"
        className={`qb-year${year.partial ? " is-partial" : ""}${year.zero ? " is-zero" : ""}${year.className ? ` ${year.className}` : ""}`}
        role="radio"
        aria-checked={on}
        aria-disabled={year.disabled ? true : undefined}
        aria-describedby={reason ? `${base}-r${index}` : undefined}
        aria-label={year.name ?? [year.label, year.partial, year.count && spokenCount(year.count, noun)].filter(Boolean).join(", ")}
        tabIndex={index === stop ? 0 : -1}
        onClick={() => { if (!year.disabled) onChange?.(year.value, "activate"); }}
      >{year.label}{year.count && <small>{year.count}</small>}</button>;
    })}
    {years.map((year, index) => typeof year.disabled === "string" && <DisabledReason key={`r${index}`} id={`${base}-r${index}`} reason={year.disabled} />)}
  </div>;
}

/** The free range as the keys store it (yearFrom/yearTo/monthFrom/monthTo): text, empty = open. */
export interface PeriodRangeValue { yearFrom: string; yearTo: string; monthFrom: string; monthTo: string }

export const EMPTY_RANGE: PeriodRangeValue = { yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" };

export const MONTHS = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"] as const;

/**
 * Why a free range cannot be used, in today's words (QuestionBuilder's
 * period form), or null. `twoYears`: trend compares two different years.
 */
export function periodRangeError(range: PeriodRangeValue, { twoYears = false } = {}): string | null {
  const { yearFrom, yearTo, monthFrom, monthTo } = range;
  if (monthFrom && !yearFrom || monthTo && !yearTo) return "Alege și anul pentru fiecare lună selectată.";
  if (yearFrom && yearTo && Number(yearFrom) > Number(yearTo)) return "Perioada trebuie să înceapă înainte să se încheie.";
  if (yearFrom && yearFrom === yearTo && monthFrom && monthTo && Number(monthFrom) > Number(monthTo)) return "Luna de început trebuie să fie înaintea lunii de sfârșit.";
  if (twoYears && (!yearFrom || !yearTo || yearFrom === yearTo)) return "Alege doi ani diferiți pentru comparație.";
  return null;
}

export interface PeriodRangeProps {
  value: PeriodRangeValue;
  onChange?: (value: PeriodRangeValue) => void;
  /** The years that can be chosen, oldest first ("2018" … "2026"). */
  years: readonly string[];
  /** The month fields (not on trend, which compares whole years or its own window). */
  months?: boolean;
  /** The year fields' labels: "Din anul / Până în anul", or trend's "Primul an / Al doilea an". */
  labels?: readonly [string, string];
  error?: string | null;
  id?: string;
}

/** The free range: two year fields and, optionally, two month fields (native selects). */
export function PeriodRange({ value, onChange, years, months = true, labels = ["Din anul", "Până în anul"], error, id }: PeriodRangeProps) {
  const errorId = useId();
  const set = (key: keyof PeriodRangeValue) => (event: { target: { value: string } }) => onChange?.({ ...value, [key]: event.target.value });
  const described = error ? errorId : undefined;
  const yearField = (key: "yearFrom" | "yearTo", text: string, open: string) => <label className="qb-field">
    <span>{text}</span>
    <select value={value[key]} onChange={set(key)} aria-describedby={described}>
      <option value="">{open}</option>
      {years.map(year => <option key={year} value={year}>{year}</option>)}
    </select>
  </label>;
  const monthField = (key: "monthFrom" | "monthTo", text: string) => <label className="qb-field">
    <span>{text}</span>
    <select value={value[key]} onChange={set(key)} aria-describedby={described}>
      <option value="">oricare</option>
      {MONTHS.map((month, index) => <option key={month} value={String(index + 1)}>{month}</option>)}
    </select>
  </label>;
  return <div className="qb-range" id={id}>
    <div className="qb-inputs">
      {yearField("yearFrom", labels[0], "de la început")}
      {yearField("yearTo", labels[1], "până acum")}
    </div>
    {months && <div className="qb-inputs">
      {monthField("monthFrom", "Din luna")}
      {monthField("monthTo", "Până în luna")}
    </div>}
    {error && <p className="qb-form-error" id={errorId} role="alert">{error}</p>}
  </div>;
}

export interface PeriodPickerProps {
  label?: string;
  /** The presets as the window lists them (kit §4): value, label, the years in `detail`. */
  presets: readonly KitOption[];
  /** The chosen preset; null while the free range is in use. */
  value: string | null;
  onPreset?: (value: string, source: ChangeSource) => void;
  /** The free range under the presets. */
  custom?: Omit<PeriodRangeProps, "id"> & { open: boolean; onOpen?: () => void; label?: string };
}

export default function PeriodPicker({ label = "Perioada", presets, value, onPreset, custom }: PeriodPickerProps) {
  const rangeId = useId();
  return <>
    <OptionList label={label} options={presets} value={custom?.open ? null : value} {...(onPreset ? { onChange: onPreset } : {})} />
    {custom && <>
      <button type="button" className="qb-link qb-range-open" aria-expanded={custom.open} aria-controls={custom.open ? rangeId : undefined} onClick={custom.onOpen}>{custom.label ?? "Alege anii sau lunile…"}</button>
      {custom.open && <PeriodRange id={rangeId} value={custom.value} years={custom.years} {...(custom.onChange ? { onChange: custom.onChange } : {})} {...(custom.months !== undefined ? { months: custom.months } : {})} {...(custom.labels ? { labels: custom.labels } : {})} error={custom.error ?? null} />}
    </>}
  </>;
}

"use client";

import { useState } from "react";
import { countWords } from "../../../lib/ask/answer-text";
import { toggleBand } from "./keyboard";
import type { KitRestRow } from "./kit-types";

/*
 * Component 10, the adjoining bands ("Angajați": 0 · 1–9 · 10–49 · 50–249 ·
 * 250+). Size classes, no free fields (kit §5.5): only neighbouring bands can
 * be chosen together, so "1–49" is two bands, and a band away from the run
 * chooses the ones between, said aloud ("Am ales și 10–49."). Each band is a
 * toggle button (aria-pressed). Firms without a balance sheet are a rest row,
 * not a band. The window's bottom button says what applies (bandsWords).
 */

export interface Band {
  value: string;
  /** What the band shows: "0", "1–9", "250+". */
  label: string;
  /** Inclusive bounds; null max = open ("250+"). */
  min: number;
  max: number | null;
  /** The firms in the band on the draft, without this window's own key (R5), formatted upstream. */
  count?: string;
  /**
   * The accessible name before the count ("1–9 angajați"); the label
   * otherwise. It starts with the label, so a speech user can say what is
   * shown (WCAG 2.5.3).
   */
  name?: string;
  className?: string;
}

/** The kit's bands of employees, the same on every question (kit §4 Angajați). */
export const EMPLOYEE_BANDS: readonly Band[] = [
  { value: "0", label: "0", min: 0, max: 0, name: "0 angajați" },
  { value: "1-9", label: "1–9", min: 1, max: 9, name: "1–9 angajați" },
  { value: "10-49", label: "10–49", min: 10, max: 49, name: "10–49 de angajați" },
  { value: "50-249", label: "50–249", min: 50, max: 249, name: "50–249 de angajați" },
  { value: "250+", label: "250+", min: 250, max: null, name: "250+ angajați" },
];

/**
 * A count as it is said: a whole number shown as "1.234" gets its noun
 * ("1.234 de firme", countWords); anything else is read as shown.
 */
export function spokenCount(count: string, noun: readonly [string, string]): string {
  return /^\d{1,3}(\.\d{3})*$/.test(count) ? countWords(Number(count.replace(/\./g, "")), noun[0], noun[1]) : count;
}

/** The run the chosen bands cover, as the keys store it (min/maxEmployees); null when none. */
export function bandRange(bands: readonly Band[], values: readonly string[]): { min: number; max: number | null } | null {
  const chosen = bands.filter(band => values.includes(band.value));
  if (!chosen.length) return null;
  return { min: Math.min(...chosen.map(band => band.min)), max: chosen.some(band => band.max === null) ? null : Math.max(...chosen.map(band => band.max ?? 0)) };
}

/**
 * What a run of employee bands applies, for the bottom button and the chip:
 * "Firme cu 1–49 de angajați". A run from 0 says "cel mult"; all the bands
 * still leave out the firms without a balance sheet (the rest row), so they
 * say "Firme cu bilanț", not a limit of 0.
 */
export function bandsWords(range: { min: number; max: number | null }): string {
  if (range.max === 0) return "Firme fără angajați";
  if (range.min === 0) return range.max === null ? "Firme cu bilanț" : `Firme cu cel mult ${countWords(range.max, "angajat", "angajați")}`;
  if (range.max === null) return `Firme cu cel puțin ${countWords(range.min, "angajat", "angajați")}`;
  if (range.min === range.max) return `Firme cu ${countWords(range.max, "angajat", "angajați")}`;
  return `Firme cu ${range.min}–${countWords(range.max, "angajat", "angajați")}`;
}

/** What the live region says when a press chose or dropped bands besides the pressed one. */
export function bandsMessage(bands: readonly Band[], added: readonly number[], removed: readonly number[]): string {
  const words = (indexes: readonly number[]) => indexes.map(index => bands[index]?.label).filter(Boolean).join(", ");
  if (added.length) return `Am ales și ${words(added)}.`;
  if (removed.length) return `Am scos și ${words(removed)}.`;
  return "";
}

export interface BandsProps {
  label: string;
  bands: readonly Band[];
  /** The chosen bands' values. */
  value: readonly string[];
  onChange?: (values: string[]) => void;
  /** "Fără bilanț · 4,1% · 34": not a band, so the window adds to 100%. */
  rest?: readonly KitRestRow[];
  /** What the counts count, one and many, for the bands' names ("0 angajați, 6 firme"). */
  noun?: readonly [string, string];
}

export default function Bands({ label, bands, value, onChange, rest = [], noun = ["firmă", "firme"] }: BandsProps) {
  const [message, setMessage] = useState("");
  const pressed = bands.map(band => value.includes(band.value));
  return <>
    <div className="fk-bands" role="group" aria-label={label}>
      {bands.map((band, index) => <button
        key={band.value}
        type="button"
        className={`fk-band${band.className ? ` ${band.className}` : ""}`}
        aria-pressed={pressed[index]}
        aria-label={`${band.name ?? band.label}${band.count ? `, ${spokenCount(band.count, noun)}` : ""}`}
        onClick={() => {
          const next = toggleBand(pressed, index);
          setMessage(bandsMessage(bands, next.added, next.removed));
          onChange?.(bands.filter((_, at) => next.pressed[at]).map(item => item.value));
        }}
      >{band.label}{band.count && <small>{band.count}</small>}</button>)}
    </div>
    {rest.length > 0 && <div className="fk-opts">{rest.map(row => <div className="fk-opt fk-opt--rest" key={`rest:${row.label}`}>
      <span className="fk-opt-mark" aria-hidden="true" />
      <span className="fk-opt-t"><strong>{row.label}</strong></span>
      <span className="fk-opt-n">{row.count}</span>
    </div>)}</div>}
    <span className="fk-sr" role="status" aria-live="polite">{message}</span>
  </>;
}

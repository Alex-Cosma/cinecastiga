import type { FilterId, FilterSpec } from "./types";

/*
 * The conditions set aside (plan §2.4, kit §5.43, component 6): when a change
 * of lens makes a condition inapplicable ("Cine conduce?", value → index), it
 * leaves the spec, so the link, a saved question and a watch never carry it,
 * and waits in the builder's draft state: "Nu se aplică indicelui: ↺ 2025 ·
 * ↺ „medicamente”". Touching one goes back to the lens it came from and brings
 * every one of them back. Leaving a trend sets its own options aside the same
 * way ("Doar la schimbare: ↺ Noi față de 2024"). A reload loses them: a draft,
 * not a question.
 */

/** One condition set aside: the words of its chip and the values of its keys, to restore as they were. */
export interface ParkedItem { id: FilterId; label: string; values: Readonly<Record<string, unknown>> }
/**
 * The row: its label and (?), the lens to go back to, and what waits there: an
 * axis of "Cine conduce?", or the trend itself, whose options another question
 * cannot apply (trend-rules.ts leavingTrend).
 */
export interface Parked { label: string; tip: string; lens: "value" | "risk" | "trend"; items: readonly ParkedItem[] }

/** The value of every key of a spec path list ("filters.cpvTerm", "dataset"), absent ones left out. */
export function pathValues(spec: FilterSpec, paths: readonly string[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const path of paths) {
    const [head, sub] = path.split(".") as [string, string | undefined];
    const holder = sub === undefined ? spec as unknown as Record<string, unknown> : (spec as unknown as Record<string, Record<string, unknown> | undefined>)[head];
    const value = holder?.[sub ?? head];
    if (value !== undefined) values[path] = structuredClone(value);
  }
  return values;
}

/** The spec with these key values back, as they were (no picker side effects). */
export function withPathValues(spec: FilterSpec, values: Readonly<Record<string, unknown>>): FilterSpec {
  const next = structuredClone(spec) as unknown as Record<string, unknown> & { filters: Record<string, unknown> };
  for (const [path, value] of Object.entries(values)) {
    const [head, sub] = path.split(".") as [string, string | undefined];
    if (sub === undefined) next[head] = structuredClone(value);
    else next[head] = { ...(next[head] as Record<string, unknown> | undefined), [sub]: structuredClone(value) };
  }
  return next as unknown as FilterSpec;
}

/** The spec with every parked condition back. */
export const unpark = (spec: FilterSpec, parked: Parked | null): FilterSpec =>
  parked ? parked.items.reduce((next, item) => withPathValues(next, item.values), spec) : spec;

/** The row's words: where the conditions do not apply, and how to get them back (kit §4 "Puse deoparte"). */
export function parkedRow(lens: Parked["lens"], items: readonly ParkedItem[]): Parked {
  if (lens === "trend") return {
    label: "Doar la schimbare", lens, items,
    tip: "Țin de întrebarea „Cine are cea mai mare schimbare?”. Atinge una ca să revii la ea.",
  };
  if (lens === "value") return {
    label: "Nu se aplică indicelui", lens, items,
    tip: "Indicele de risc se calculează pe profilurile istorice, fără aceste condiții. Atinge una ca să revii la valoare.",
  };
  return {
    label: "Nu se aplică valorii", lens, items,
    tip: items.every((item) => item.id === "county")
      ? "Pe valoare, județul e locul instituției care cumpără, nu sediul firmei. Atinge-l ca să revii la indice."
      : "Pe valoare, aceste condiții nu se aplică. Atinge una ca să revii la indice.",
  };
}

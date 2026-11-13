import type { DbSql } from "@seap/db";
import type { AskSpec } from "./spec";
import { ground } from "./ground";
import { codeTotals } from "./facets";

/*
 * What an empty answer can still say (Cisnădie feedback, 13 November 2026). „Cât a contractat Primăria Cisnădie
 * pentru iluminat public în 2026?” has no record in the five lighting categories, yet the town hall bought a lighting
 * installation that year, coded one level up („Lucrări de instalații electrice”, 45310000, which holds 45316000). The
 * answer names the categories it searched, the broader categories holding them in which the same selection has
 * records, and the selection without its domain.
 */

export interface CpvName { code: string; name: string }
export interface BroaderCategory extends CpvName { n: number; v: number; /** A searched category it holds. */ contains: string }
export interface EmptyHints { searched: CpvName[]; broader: BroaderCategory[]; all: { n: number; v: number } | null }

/** At most this many broader categories, the largest by value first. */
export const BROADER_MAX = 3;

/** The significant digits of a CPV code: „45310000-3” → „4531”. */
export const cpvStem = (code: string): string => code.replace(/-.*$/, "").slice(0, 8).replace(/0+$/, "");

/**
 * The broader categories: a record's code whose stem starts a searched stem and is shorter (its category holds the
 * searched one), from the group level down (three digits: „Lucrări de construcții” (45) holds everything built).
 */
export function broaderOf(codes: readonly { code: string; n: number; v: number }[], searched: readonly CpvName[], names: ReadonlyMap<string, string>): BroaderCategory[] {
  const stems = searched.map((s) => ({ stem: cpvStem(s.code), name: s.name }));
  const out: BroaderCategory[] = [];
  for (const row of codes) {
    const stem = cpvStem(row.code);
    if (stem.length < 3 || row.n <= 0) continue;
    const held = stems.find((s) => s.stem.length > stem.length && s.stem.startsWith(stem));
    if (!held) continue;
    out.push({ code: row.code, name: names.get(row.code) ?? row.code, n: row.n, v: row.v, contains: held.name });
  }
  return out.sort((a, b) => b.v - a.v || b.n - a.n).slice(0, BROADER_MAX);
}

/** A selection narrow enough to group live: one buyer, one place or one firm. */
export const narrowSelection = (spec: AskSpec): boolean => {
  const f = spec.filters as Record<string, unknown>;
  return Boolean(f.authorityId || f.uatSiruta || f.supplierId || f.authorityName || f.supplierName);
};

export async function emptyHints(sql: DbSql, spec: AskSpec, opts: { signal?: AbortSignal } = {}): Promise<EmptyHints> {
  if (!spec.filters.cpvTerm) return { searched: [], broader: [], all: null };
  const grounding = await ground(sql, spec.filters, spec.population);
  const prefixes = grounding.cpv?.prefixes ?? [];
  const padded = [...new Set(prefixes.map((p) => p.replace(/\D/g, "").slice(0, 8).padEnd(8, "0")))];
  const codes = narrowSelection(spec) ? await codeTotals(sql, spec, opts) : [];
  const rows = Array.isArray(codes) ? codes : [];
  const wanted = [...new Set([...padded, ...rows.map((r) => r.code.slice(0, 8))])];
  const named = wanted.length
    ? (await sql`select code, name_ro from core.cpv_codes where left(code, 8) = any(${sql.array(wanted)}::text[])`) as unknown as { code: string; name_ro: string }[]
    : [];
  const byStem = new Map(named.map((r) => [r.code.slice(0, 8), r]));
  const searched: CpvName[] = padded.map((p) => byStem.get(p)).filter((r): r is { code: string; name_ro: string } => Boolean(r)).map((r) => ({ code: r.code, name: r.name_ro }));
  const names = new Map(rows.map((r) => [r.code, byStem.get(r.code.slice(0, 8))?.name_ro ?? r.code]));
  const total = rows.reduce((a, r) => ({ n: a.n + r.n, v: a.v + r.v }), { n: 0, v: 0 });
  return { searched, broader: broaderOf(rows, searched, names), all: total.n > 0 ? total : null };
}

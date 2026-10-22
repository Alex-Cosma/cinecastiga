/**
 * Plain-language labels for consortium shares (client-safe, no server imports).
 *
 * A contract with several winners appears once per winner in
 * marts.contract_transactions. `closing_value` is that winner's estimated share:
 * the source does not publish member amounts, so the value is split equally and
 * the last member receives the rounding remainder (apps/ingestion normalize/marts).
 * These helpers only describe that existing split; they never change a number.
 */

import { roCount } from "./ro-count";

const FRACTIONS: Record<number, string> = { 2: "½", 3: "⅓", 4: "¼", 5: "⅕", 6: "⅙" };

/** "⅓" for small consortia, null when an exact glyph would be hard to read. */
export function consortiumFraction(nWinners: number): string | null {
  return FRACTIONS[nWinners] ?? null;
}

export function isConsortium(nWinners: number | null | undefined): nWinners is number {
  return typeof nWinners === "number" && Number.isInteger(nWinners) && nWinners > 1;
}

/**
 * "⅓ din 381.909.792 lei · consorțiu de 3", or for larger consortia
 * "parte egală din 1.234.567 lei · consorțiu de 8". Null for a single winner.
 * `fullValue` is the whole contract amount, already formatted by the caller.
 */
export function consortiumShareLabel(nWinners: number | null | undefined, fullValue: string | null): string | null {
  if (!isConsortium(nWinners)) return null;
  const fraction = consortiumFraction(nWinners);
  const part = fraction ?? "parte egală";
  const of = fullValue ? `${part} din ${fullValue}` : fraction ? `${fraction} din contract` : "parte egală din contract";
  return `${of} · consorțiu de ${nWinners}`;
}

/**
 * "cu CONCELEX și Concelex Engineering", "cu A, B și încă 3" — the other members
 * of the consortium by name. `others` are the names we have; `nWinners` is the
 * published member count, so missing names are still counted, never invented.
 */
export function consortiumMembersLabel(others: readonly string[], nWinners: number, maxNames = 2): string | null {
  if (!isConsortium(nWinners)) return null;
  const nOthers = nWinners - 1;
  const names = others.filter((n) => n.trim().length > 0).slice(0, Math.min(maxNames, nOthers));
  if (names.length === 0) return null;
  const rest = nOthers - names.length;
  if (rest <= 0) {
    return names.length === 1 ? `cu ${names[0]}` : `cu ${names.slice(0, -1).join(", ")} și ${names[names.length - 1]}`;
  }
  return `cu ${names.join(", ")} și încă ${roCount(rest, "un membru", "membri")}`;
}

/** "consorțiu cu A și B", or "contract în consorțiu" when no member names are known. */
export function consortiumPhrase(others: readonly string[], nWinners: number): string {
  const members = consortiumMembersLabel(others, nWinners);
  return members ? `consorțiu ${members}` : "contract în consorțiu";
}

/** Tooltip/explanation shared by the tables: why the amount is a share. */
export function consortiumExplanation(nWinners: number): string {
  return `Contractul are ${nWinners} câștigători în consorțiu. Sursa nu publică partea fiecăruia, așa că împărțim valoarea egal între membri (estimare). Suma nu a fost atribuită de ${nWinners} ori; valorile înregistrate nu sunt plăți.`;
}

/** Ranking marker: the partner's total includes consortium shares. */
export function consortiumRankingNote(nContracts: number): string {
  return nContracts === 1
    ? "Totalul include partea estimată dintr-un contract în consorțiu (împărțire egală între membri)."
    : `Totalul include părțile estimate din ${roCount(nContracts, "un contract", "contracte")} în consorțiu (împărțire egală între membri).`;
}

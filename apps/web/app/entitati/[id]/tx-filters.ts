import { roCount } from "../../../lib/ro-count";
import type { Chip } from "../../../lib/table-filters/describe";
import type { FilterState } from "../../../lib/table-filters/types";
import type { TxType } from "../../../lib/entity-tx-columns";

/*
 * The words around the records table: its status line and what an empty table says. The filters themselves are the
 * column funnels (owner decision of 4 November 2026; lib/table-filters). Pure: TxTable draws it.
 */

const NOUNS: Record<TxType, [string, string]> = {
  directe: ["o achiziție directă", "achiziții directe"],
  contracte: ["un contract", "contracte"],
  excluse: ["o achiziție directă exclusă din total", "achiziții directe excluse din total"],
};

/** The records counted: „6 contracte” when the type filter names one type, „4.536 de înregistrări” otherwise. */
export function recordsWord(n: number, state: FilterState): string {
  const type = state["tip"];
  const only = type?.kind === "options" && type.values.length === 1 ? (type.values[0] as TxType) : null;
  const [one, many] = only && NOUNS[only] ? NOUNS[only] : ["o înregistrare", "înregistrări"];
  return roCount(n, one, many);
}

/** The status line: the records (the page is the pager's: owner, 17 November 2026). */
export function statusLine(total: number, state: FilterState): string {
  return recordsWord(total, state);
}

/** An empty table: what it says, and the filters to take out one by one (each a chip of the band). */
export function emptyState(chips: Chip[]): { text: string; exits: Chip[] } {
  return chips.length === 0
    ? { text: "Nicio înregistrare.", exits: [] }
    : { text: "Nicio înregistrare cu filtrele alese.", exits: chips };
}

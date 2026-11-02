import { countWords } from "../../lib/ask/answer-text";
import type { DrillRow } from "../../lib/ask/compile";
import { formatEvidenceAmount, type EvidenceFilters, type EvidenceStatus } from "../../lib/ask/evidence";

/*
 * The records drawer's words that depend on its figures (owner, 2 November 2026): on a phone the record comes
 * first, so the title is the part opened with its records counted and the selection's card is one line, with the
 * figures and formatters the desktop card shows. A record's exact value appears only where it says more than the
 * amount listed.
 */

export const records = (n: number) => countWords(n, "înregistrare", "înregistrări");
export const drawerDate = (value: string | null) => value ? value.split("-").reverse().join(".") : "Dată neprecizată";

/**
 * A scope label's name and its „ · înregistrările …” tail („NICOLASEB S.R.L.”, „ · înregistrările din clasament”).
 * The desktop says both; the phone's title puts the count in the tail's place („NICOLASEB S.R.L. · 28 de înregistrări”).
 */
export function splitScopeLabel(label: string): [name: string, tail: string] {
  const match = /^(.+?)( · înregistrările(?: .*)?)$/.exec(label);
  return match ? [match[1]!, match[2]!] : [label, ""];
}

/** The selection's dates, the year said once when both fall in it: „05.01–30.12.2024”. */
export function dateSpan(from: string | null, to: string | null): string | null {
  if (!from) return null;
  if (to === from) return drawerDate(from);
  if (to && from.slice(0, 4) === to.slice(0, 4)) return `${drawerDate(from).slice(0, 5)}–${drawerDate(to)}`;
  return `${drawerDate(from)}–${drawerDate(to)}`;
}

/** The phone's one-line card: „28”, „235.150,00 lei”, „05.01–30.12.2024”, shown joined by „ · ”. */
export function summaryParts(total: number, value: string, from: string | null, to: string | null): string[] {
  const dates = dateSpan(from, to);
  return [total.toLocaleString("ro-RO"), formatEvidenceAmount(value), ...(dates ? [dates] : [])];
}

/**
 * A record's value in its stored precision, when the amount listed (rounded to bani) does not already say it:
 * more decimals than shown, or a consortium's share. Null otherwise: the pair is left out.
 */
export function recordExactValue(row: Pick<DrillRow, "valueExact" | "nWinners">): string | null {
  const exact = formatEvidenceAmount(row.valueExact, true);
  return exact !== formatEvidenceAmount(row.valueExact) || (row.nWinners ?? 0) > 1 ? exact : null;
}

/** A record's state pill: accepted in green, an awarded contract neutral, amber for any other or unknown state. */
export function stateClass(row: Pick<DrillRow, "state" | "src">): string {
  if (row.state === "Oferta acceptata") return "ev-state ev-state-accepted";
  return row.state === null && row.src === "contracts" ? "ev-state ev-state-awarded" : "ev-state";
}

/*
 * „Ce fel de achiziții” is the drawer's only list filter besides the search (owner, 2 November 2026): every direct
 * acquisition it lists is an accepted offer and a contract has no state (compile.ts, daTx and contractTx), so the
 * former „Starea ofertei” split the list exactly as the kind does, and the two together could only empty it.
 */

/**
 * A saved filter's kind (a link, a clip, a watch made with „Starea ofertei”): its state read as the kind it meant.
 * Any other state, or one the saved kind contradicts, is kept as saved: a saved filter never broadens the list.
 */
export function savedKind(filters: EvidenceFilters | undefined): { stream: string; state: string } {
  const kind = filters?.state === "Oferta acceptata" ? "da" : filters?.state === "__unknown" ? "contracts" : null;
  return kind && (!filters?.stream || filters.stream === kind)
    ? { stream: kind, state: "" }
    : { stream: filters?.stream ?? "", state: filters?.state ?? "" };
}

/** Records per kind for its options, from the selection's records per state (the same reading). */
export function kindCounts(statuses: readonly Pick<EvidenceStatus, "state" | "count">[]): { da: number; contracts: number } {
  const of = (state: string | null) => statuses.filter((s) => s.state === state).reduce((n, s) => n + s.count, 0);
  return { da: of("Oferta acceptata"), contracts: of(null) };
}

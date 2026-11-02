import { FLAG_META, flagLabel } from "../../../lib/flags";
import { formatInt } from "../../../lib/format";
import { roCount } from "../../../lib/ro-count";
import type { TxYearCounts } from "../../../lib/marts";

/*
 * The records table's selection (critique of 2 November 2026, owner's pick of the mockups): what the controls, the
 * „Filtrat:” band, the status line and the address say is the selection the rows come from. A signal or the excluded
 * records narrow to direct acquisitions, and that shows; the year list counts each year's records for the channel; an
 * empty table says why and offers its ways out. Pure: TxTable draws it.
 */

export type TxSrc = "all" | "da" | "contracts";

export interface TxSelection {
  src: TxSrc;
  years: string[];
  flag: string | null;
  excluded: boolean;
}

export const EMPTY_SELECTION: TxSelection = { src: "all", years: [], flag: null, excluded: false };

/** A signal the table can filter rows by: one marked on direct acquisitions, not a yearly or entity-wide pattern. */
export const rowFlag = (code: string): boolean => FLAG_META[code]?.subject === "da" || code === "da_split";

/** Whether a signal or the excluded records hold the table to direct acquisitions. */
export const channelForced = (s: TxSelection): boolean => s.flag !== null || s.excluded;

/** The channel the rows come from. */
export const channelOf = (s: TxSelection): TxSrc => (channelForced(s) ? "da" : s.src);

const CANAL: Record<string, TxSrc> = { directe: "da", contracte: "contracts" };

/** The selection an address carries (?canal=directe|contracte&an=2023,2024&sem=…&excluse=1); unknown values are left out. */
export function selectionFromParams(get: (key: string) => string | null | undefined): TxSelection {
  const sem = get("sem");
  const flag = sem && rowFlag(sem) ? sem : null;
  const years = (get("an") ?? "").split(",").filter((y) => /^\d{4}$/.test(y));
  return { src: CANAL[get("canal") ?? ""] ?? "all", years: [...new Set(years)].sort(), flag, excluded: get("excluse") === "1" };
}

/** The address of a selection: the page's own parameters kept, the table's replaced; the default selection adds none. */
export function selectionSearch(current: string, s: TxSelection): string {
  const p = new URLSearchParams(current);
  for (const key of ["canal", "an", "sem", "excluse"]) p.delete(key);
  const channel = channelOf(s);
  if (!channelForced(s) && channel !== "all") p.set("canal", channel === "da" ? "directe" : "contracte");
  if (s.years.length > 0) p.set("an", [...s.years].sort().join(","));
  if (s.flag) p.set("sem", s.flag);
  if (s.excluded) p.set("excluse", "1");
  const query = p.toString();
  return query ? `?${query}` : "";
}

const channelCount = (counts: TxYearCounts, channel: TxSrc, year: string): number =>
  (channel !== "contracts" ? counts.da[year] ?? 0 : 0) + (channel !== "da" ? counts.contracts[year] ?? 0 : 0);

/** The year panel: every dated year of either channel, newest first, with its records in the shown channel. */
export function yearOptions(counts: TxYearCounts, channel: TxSrc, selected: string[]): { year: string; n: number; disabled: boolean }[] {
  const years = [...new Set([...Object.keys(counts.da), ...Object.keys(counts.contracts)])].filter((y) => y !== "").sort().reverse();
  return years.map((year) => {
    const n = channelCount(counts, channel, year);
    return { year, n, disabled: n === 0 && !selected.includes(year) };
  });
}

/** A channel's records over every year, the undated ones included. */
export function channelTotal(counts: TxYearCounts, channel: TxSrc): number {
  const years = new Set([...Object.keys(counts.da), ...Object.keys(counts.contracts)]);
  let n = 0;
  for (const y of years) n += channelCount(counts, channel, y);
  return n;
}

const yearsWords = (years: string[]): string => {
  const sorted = [...years].sort();
  return sorted.length === 1 ? `în ${sorted[0]}` : `în ${sorted.slice(0, -1).join(", ")} și ${sorted.at(-1)}`;
};

/** The records of a channel, counted: „6 contracte”, „4.530 de achiziții directe”, „4.536 de înregistrări”. */
export function channelRecords(n: number, channel: TxSrc): string {
  if (channel === "contracts") return roCount(n, "un contract", "contracte");
  if (channel === "da") return roCount(n, "o achiziție directă", "achiziții directe");
  return roCount(n, "o înregistrare", "înregistrări");
}

export type EmptyExit = { kind: "years" | "src" | "flag" | "excluded" | "all"; label: string };

/** What an empty table says, and its one-click ways out (with the records each one brings back, where known). */
export function emptyState(s: TxSelection, counts: TxYearCounts | null): { text: string; exits: EmptyExit[] } {
  const channel = channelOf(s);
  const noun = s.flag
    ? `Nicio achiziție directă cu semnalul „${flagLabel(s.flag)}”`
    : s.excluded
      ? "Nicio achiziție directă exclusă din total"
      : channel === "contracts" ? "Niciun contract" : channel === "da" ? "Nicio achiziție directă" : "Nicio înregistrare";
  const text = `${noun}${s.years.length > 0 ? ` ${yearsWords(s.years)}` : ""}.`;
  const exits: EmptyExit[] = [];
  if (s.years.length > 0) {
    const n = counts ? channelTotal(counts, channel) : 0;
    exits.push({ kind: "years", label: counts ? `Toți anii · ${channelRecords(n, channel)}` : "Toți anii" });
  }
  if (!channelForced(s) && s.src !== "all") {
    const inYears = counts && s.years.length > 0 ? s.years.reduce((n, y) => n + channelCount(counts, "all", y), 0) : null;
    exits.push({ kind: "src", label: inYears !== null ? `Toate sursele · ${formatInt(inYears)} ${yearsWords(s.years)}` : "Toate sursele" });
  }
  if (s.flag) exits.push({ kind: "flag", label: "Fără semnal" });
  if (s.excluded) exits.push({ kind: "excluded", label: "Înapoi la total" });
  if (exits.length === 0 && (s.years.length > 0 || s.src !== "all")) exits.push({ kind: "all", label: "Scoate toate" });
  return { text, exits };
}

/** The status line: the records, the channel when not both, the page. */
export function statusLine(total: number, page: number, pages: number, channel: TxSrc): string {
  const records = `${formatInt(total)} înregistrări${channel === "da" ? " · achiziții directe" : channel === "contracts" ? " · contracte" : ""}`;
  return total === 0 ? records : `${records} · pagina ${formatInt(page)} din ${formatInt(pages)}`;
}

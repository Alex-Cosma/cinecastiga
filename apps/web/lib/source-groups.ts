import type { SourceRecord } from "./source-evidence";
import { sumDecimalStrings } from "./ask/evidence";

/**
 * The rows of a source table (components/SourceEvidenceView.tsx): one row per record, a consortium contract's halves
 * (one record per winner, each with its share) under one contract. The values stay the records' own: a row's value is
 * the exact sum of the shares listed in it, so the column adds up to the selection's total.
 */

/** Rows per page of a source table. */
export const SOURCE_PAGE_SIZE = 50;

export interface SourceGroup<T extends SourceRecord = SourceRecord> {
  /** `${src}:${refId}`; a record without a reference keeps a row of its own. */
  key: string;
  first: T;
  /** One per winner in the selection, in the selection's order. */
  records: T[];
  /** The exact sum of the listed records' values. */
  valueExact: string;
  /** A listed record has no published value: the sum holds only the known ones. */
  missingValue: boolean;
}

export function groupSourceRecords<T extends SourceRecord>(records: readonly T[]): SourceGroup<T>[] {
  const groups = new Map<string, SourceGroup<T>>();
  records.forEach((record, index) => {
    const key = record.refId ? `${record.src}:${record.refId}` : `row:${index}`;
    const group = groups.get(key);
    if (group) group.records.push(record);
    else groups.set(key, { key, first: record, records: [record], valueExact: "0", missingValue: false });
  });
  for (const group of groups.values()) {
    group.valueExact = sumDecimalStrings(group.records.map((r) => r.valueExact ?? "0"));
    group.missingValue = group.records.some((r) => r.originalValueExact === null);
  }
  return [...groups.values()];
}

/** One page of rows (the requested page, kept inside the pages there are). */
export function sourcePage<T>(rows: readonly T[], requested: number): { page: number; pages: number; rows: T[] } {
  const pages = Math.max(1, Math.ceil(rows.length / SOURCE_PAGE_SIZE));
  const page = Math.max(0, Math.min(Number.isSafeInteger(requested) ? requested : 0, pages - 1));
  return { page, pages, rows: rows.slice(page * SOURCE_PAGE_SIZE, (page + 1) * SOURCE_PAGE_SIZE) };
}

// A lot marker ("Lot 2- Ecografe", "Lotul 3:", "lot nr. 4"), the last one in a title; SEAP lot titles end with it.
const LOT = /(?<![\p{L}\d])lot(?:ul)?\s*(?:nr\.?\s*)?(\d{1,3})(?!\d)\s*[-–—:.,]?\s*/giu;
const flat = (t: string) => t.replace(/\s+/g, " ").trim();
// Compared without quotes and case: the same notice's lots come with “ in one title and ““ in the next.
const loose = (t: string) => t.replace(/["“”„«»'’‘`]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

function lotSplit(title: string): { before: string; lot: string; after: string } | null {
  let last: RegExpMatchArray | null = null;
  for (const match of title.matchAll(LOT)) last = match;
  if (!last || last.index === undefined) return null;
  return { before: title.slice(0, last.index).trim(), lot: last[1]!, after: title.slice(last.index + last[0].length).trim() };
}

/**
 * Titles that repeat one long beginning (the lots of one notice, each titled with the whole notice and then its lot):
 * that beginning once, and each row's own part. When every title is the same text followed by its lot, a row is just
 * "Lot 2 · Ecografe" (`lots`); otherwise the continuation after the shared beginning. Null when fewer than two titles
 * share at least `min` characters up to a word's end, or when a title would be left with nothing of its own. `rest` is
 * keyed by the title as given; `start` and the rests have their spaces collapsed.
 */
export function sharedTitleStart(titles: readonly (string | null | undefined)[], min = 60): { start: string; rest: Map<string, string>; lots: boolean } | null {
  const known = [...new Set(titles.filter((t): t is string => !!t && t.trim().length > 0))];
  if (known.length < 2) return null;
  const lots = known.map((t) => lotSplit(flat(t)));
  if (lots.every((l) => l !== null)) {
    const head = loose(lots[0]!.before);
    if (head.length >= 20 && lots.every((l) => loose(l!.before) === head)) {
      const rest = new Map(known.map((t, i) => [t, lots[i]!.after ? `Lot ${lots[i]!.lot} · ${lots[i]!.after}` : `Lot ${lots[i]!.lot}`]));
      return { start: lots[0]!.before.replace(/[\s\-–—:;,.]+$/, ""), rest, lots: true };
    }
  }
  // Compared with their spaces collapsed: SEAP titles break lines in different places.
  let common = flat(known[0]!);
  for (const t of known.slice(1).map(flat)) {
    let i = 0;
    while (i < common.length && i < t.length && common[i] === t[i]) i++;
    common = common.slice(0, i);
  }
  // Cut back before the last shared word (it may be cut, or a "Lot" each row needs), so every row starts on a word.
  const trimmed = common.trimEnd();
  const cut = trimmed.search(/\s\S*$/);
  const start = cut >= 0 ? trimmed.slice(0, cut).trimEnd() : "";
  if (start.length < min) return null;
  const rest = new Map<string, string>();
  for (const t of known) {
    const tail = flat(t).slice(start.length).trim();
    if (tail.length < 3) return null;
    rest.set(t, tail);
  }
  return { start, rest, lots: false };
}

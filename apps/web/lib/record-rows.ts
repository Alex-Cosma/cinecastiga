/**
 * The rows of a case's record list (app/semnale/case/RecordList.tsx) and their order, shared by the page, the browser
 * and /api/semnale/[id]/inregistrari. A long list is paged on the server (owner, 12 November 2026): the largest case
 * (24,000 acquisitions with one partner) sent 5.6 MB of rows to the browser to show its first 15.
 */
export interface RecordRow {
  key: string;
  code: string;
  date: string | null;
  title: string;
  href: string;
  /** Null: the sum is not published. */
  value: number | null;
  valueText: string;
  seap: string | null;
  ted: string | null;
  /** The other patterns the same acquisition is in, named. */
  also: string[];
  /** The side the row names (the set-aside acquisitions are with other partners). */
  party: { id: string | null; name: string; role: "authority" | "supplier" } | null;
}

export type RecordSortKey = "date" | "title" | "value";
export type RecordSort = { key: RecordSortKey; dir: 1 | -1 };

/** The records come oldest first: that is the order until a column is chosen. */
export const RECORD_DEFAULT_SORT: RecordSort = { key: "date", dir: 1 };
/** Rows a list shows before „Arată…”. */
export const RECORDS_SHOWN = 15;
/** Rows per request of a server-paged list. */
export const RECORDS_PAGE = 50;
/** A list longer than this is paged on the server; a shorter one travels whole and is sorted in the browser. */
export const RECORDS_SERVER_ABOVE = 200;

export function compareRecordRows(a: Pick<RecordRow, "date" | "title" | "value">, b: Pick<RecordRow, "date" | "title" | "value">, { key, dir }: RecordSort): number {
  if (key === "title") return dir * a.title.localeCompare(b.title, "ro", { sensitivity: "base" });
  const x = key === "date" ? a.date : a.value, y = key === "date" ? b.date : b.value;
  // Missing dates and unpublished sums stay at the end, whichever the direction.
  if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
  return dir * (x < y ? -1 : x > y ? 1 : 0);
}

/** Records in the default order (oldest first, undated last), stable. */
export function oldestFirst<T extends { date?: string | null }>(records: readonly T[]): T[] {
  return records.map((r, i) => ({ r, i })).sort((a, b) => {
    const x = a.r.date ?? null, y = b.r.date ?? null;
    if (x === null || y === null) return x === y ? a.i - b.i : x === null ? 1 : -1;
    return x < y ? -1 : x > y ? 1 : a.i - b.i;
  }).map(({ r }) => r);
}

export function parseRecordSort(key: string | null, dir: string | null): RecordSort {
  const k = key === "title" || key === "value" || key === "date" ? key : RECORD_DEFAULT_SORT.key;
  return { key: k, dir: dir === "-1" ? -1 : 1 };
}

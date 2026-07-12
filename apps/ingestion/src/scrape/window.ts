/**
 * Europe/Bucharest date math (DEC-007). SEAP interprets all date filters
 * as Bucharest calendar days; nightly DA finalization batches land
 * 00:00–02:30 local, so jobs run after ~03:00 local and only ever ingest
 * closed windows (D-1 and older).
 */

const BUCHAREST_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Bucharest",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date YYYY-MM-DD. */
export type IsoDate = string;

/** Today's calendar date in Bucharest, regardless of host timezone. */
export function bucharestToday(now: Date = new Date()): IsoDate {
  return BUCHAREST_DAY.format(now);
}

/** Add days to a calendar date (pure calendar math, DST-immune). */
export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d! + days));
  return utc.toISOString().slice(0, 10);
}

/** N days before Bucharest-today. */
export function isoDaysAgo(n: number, now: Date = new Date()): IsoDate {
  return addDays(bucharestToday(now), -n);
}

export interface DateWindow {
  start: IsoDate;
  end: IsoDate;
}

/**
 * Closed window of `days` calendar days ending yesterday (Bucharest).
 * Open days are never ingested — paginating them shifts pages.
 */
export function closedWindow(days: number, now: Date = new Date()): DateWindow {
  const end = isoDaysAgo(1, now);
  return { start: addDays(end, -(days - 1)), end };
}

/** Inclusive day iterator. */
export function* eachDay(window: DateWindow): Generator<IsoDate> {
  for (let d = window.start; d <= window.end; d = addDays(d, 1)) {
    yield d;
  }
}

/** Number of days in an inclusive window. */
export function windowLengthDays(window: DateWindow): number {
  let count = 0;
  for (const _ of eachDay(window)) count += 1;
  return count;
}

/** True when `date` falls inside the inclusive window. */
export function inWindow(date: IsoDate, window: DateWindow): boolean {
  return date >= window.start && date <= window.end;
}

/** Extract the Bucharest calendar day from a SEAP timestamp string. */
export function bucharestDayOf(timestamp: string): IsoDate {
  return BUCHAREST_DAY.format(new Date(timestamp));
}

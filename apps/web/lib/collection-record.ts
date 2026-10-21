import type { CollectorCoverage, PublicCollectionStream } from "@seap/db";

/** Collector stream that took over each source of the windowed import log (`core.scrape_runs`). */
export const IMPORT_STREAM: Record<string, PublicCollectionStream> = {
  "elicitatie:das": "da", "elicitatie:awards": "awards", "ted:can-standard": "ted", "ted:fforms": "ted",
};

/**
 * Which record says when each source was collected (audit F17). A source the continuous collector
 * has completed work for is dated by the collector; its windowed imports are only history.
 * A source the collector has not collected yet (TED, while its stream stays off until
 * `ted-enable`) keeps its windowed imports as its current record.
 */
export function collectionRecords<T extends { source: string }>(collector: CollectorCoverage, imports: T[]) {
  const collected = new Set(collector.streams.filter(stream => stream.lastSuccessAt !== null).map(stream => stream.stream));
  const superseded = (row: T) => collected.has(IMPORT_STREAM[row.source]!);
  return { streams: collector.streams, currentImports: imports.filter(row => !superseded(row)), earlierImports: imports.filter(superseded) };
}

/** Instant of a PostgreSQL timestamptz text or ISO time carrying an offset; null without one. */
export function sourceInstant(value: unknown): number | null {
  const match = typeof value === "string" ? value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)(\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)$/) : null;
  if (!match) return null;
  const zone = match[4]!, offset = zone === "Z" ? zone : `${zone.slice(0, 3)}:${zone.length > 3 ? zone.slice(-2) : "00"}`;
  const instant = Date.parse(`${match[1]}T${match[2]}${(match[3] ?? "").slice(0, 4)}${offset}`);
  return Number.isNaN(instant) ? null : instant;
}

const bucharestDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" });
/** Bucharest day (YYYY-MM-DD) of the newest instant; times in different formats are compared as instants. */
export function newestCollectionDay(values: unknown[]): string | undefined {
  const instants = values.map(sourceInstant).filter((instant): instant is number => instant !== null);
  return instants.length ? bucharestDay.format(Math.max(...instants)) : undefined;
}

import { describe, expect, it } from "vitest";
import type { CollectorCoverage } from "@seap/db";
import { collectionRecords, newestCollectionDay, sourceInstant } from "./collection-record";

const imports = ["elicitatie:das", "elicitatie:awards", "ted:can-standard", "ted:fforms"].map(source => ({ source }));
const stream = (name: "da" | "awards" | "ted", lastSuccessAt: string | null) => ({ stream: name, lastSuccessAt, inBatch: true, open: false, gaps: false });
const collector = (...streams: CollectorCoverage["streams"]): CollectorCoverage => ({ batch: { id: "b", endDay: "2026-09-25", status: "collecting", followLatest: false }, streams });

// Audit F17 review: the TED collector stream stays off until `ted-enable`, so its windowed
// imports are still TED's only collection record and must not be filed away as an archive.
describe("which record dates each source", () => {
  it("keeps TED imports current while the collector has only collected SEAP", () => {
    const records = collectionRecords(collector(stream("da", "2026-10-02T07:11:13+03:00"), stream("awards", "2026-10-02T07:10:17+03:00")), imports);
    expect(records.currentImports.map(row => row.source)).toEqual(["ted:can-standard", "ted:fforms"]);
    expect(records.earlierImports.map(row => row.source)).toEqual(["elicitatie:das", "elicitatie:awards"]);
  });
  it("does not let a stream without a completed collection supersede its imports", () => {
    const records = collectionRecords(collector(stream("da", "2026-10-02T07:11:13+03:00"), stream("ted", null)), imports);
    expect(records.currentImports.map(row => row.source)).toEqual(["elicitatie:awards", "ted:can-standard", "ted:fforms"]);
  });
  it("keeps every import current when the collector never ran", () => {
    expect(collectionRecords({ batch: null, streams: [] }, imports).currentImports).toEqual(imports);
  });
});

describe("collection times in different formats", () => {
  it("reads PostgreSQL timestamptz text and offset ISO times as instants", () => {
    expect(sourceInstant("2026-07-17 20:58:03.123456+00")).toBe(Date.parse("2026-07-17T20:58:03.123Z"));
    expect(sourceInstant("2026-10-02T07:11:13+03:00")).toBe(Date.parse("2026-10-02T04:11:13Z"));
    expect(sourceInstant("2026-01-16 00:30:00+0200")).toBe(Date.parse("2026-01-15T22:30:00Z"));
    // Without an offset the instant is unknown; never guess a time zone.
    expect(sourceInstant("2026-10-02 07:11:13")).toBeNull();
    expect(sourceInstant(null)).toBeNull();
  });
  it("picks the newest instant, not the larger string, and gives its Bucharest day", () => {
    // 21:30 UTC is 00:30 the next day in Bucharest, and later than 23:45+03:00 the same evening.
    expect(newestCollectionDay(["2026-10-01 21:30:00+00", "2026-10-01T23:45:00+03:00"])).toBe("2026-10-02");
    expect(newestCollectionDay(["2026-10-01 20:30:00+00", "2026-10-01T23:45:00+03:00"])).toBe("2026-10-01");
    expect(newestCollectionDay([undefined, "invalid"])).toBeUndefined();
  });
});

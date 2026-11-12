import { describe, expect, it } from "vitest";
import { compareRecordRows, oldestFirst, parseRecordSort, RECORD_DEFAULT_SORT } from "./record-rows";
import { caseRecordRows } from "./signal-case-rows";
import type { CaseRecord } from "./signal-case";

const row = (date: string | null, value: number | null, title = "x") => ({ date, value, title });

describe("case record order (owner, 12 November 2026: long lists paged on the server)", () => {
  it("orders by date, sum or title, with missing dates and unpublished sums last in both directions", () => {
    const rows = [row("2020-03-01", 5, "b"), row(null, 9, "a"), row("2019-01-01", null, "c"), row("2021-01-01", 1, "Ă")];
    const by = (key: "date" | "value" | "title", dir: 1 | -1) => [...rows].sort((a, b) => compareRecordRows(a, b, { key, dir }));
    expect(by("date", 1).map((r) => r.date)).toEqual(["2019-01-01", "2020-03-01", "2021-01-01", null]);
    expect(by("date", -1).map((r) => r.date)).toEqual(["2021-01-01", "2020-03-01", "2019-01-01", null]);
    expect(by("value", -1).map((r) => r.value)).toEqual([9, 5, 1, null]);
    expect(by("title", 1).map((r) => r.title)).toEqual(["a", "Ă", "b", "c"]);
  });

  it("keeps the default order stable, undated records last", () => {
    const records = [{ id: 1, date: "2020-01-02" }, { id: 2, date: null }, { id: 3, date: "2020-01-01" }, { id: 4, date: "2020-01-02" }];
    expect(oldestFirst(records).map((r) => r.id)).toEqual([3, 1, 4, 2]);
  });

  it("reads the order from the address, defaulting to the oldest first", () => {
    expect(parseRecordSort("value", "-1")).toEqual({ key: "value", dir: -1 });
    expect(parseRecordSort("title", "1")).toEqual({ key: "title", dir: 1 });
    expect(parseRecordSort("drop table", null)).toEqual(RECORD_DEFAULT_SORT);
  });

  it("builds a row per record, naming the other patterns but not the page's own", () => {
    const record = { src: "da", refId: "77", daCode: "DA77", date: "2024-12-03", title: null, cpvName: "Lapte", valueExact: "12.50",
      originalValueExact: "12.50", authorityId: "1", authority: "SPITAL", supplierId: "2", supplier: "FIRMA SRL", value: 12.5 } as unknown as CaseRecord;
    const [r] = caseRecordRows([record], { "77": ["da_split", "da_year_end"] }, "da_year_end", "supplier");
    expect(r).toMatchObject({ code: "DA77", title: "Lapte", href: "/achizitii/77", value: 12.5, valueText: "12,50 lei",
      party: { id: "2", role: "supplier" } });
    expect(r!.also).toHaveLength(1);
  });
});

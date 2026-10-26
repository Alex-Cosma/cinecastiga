import { afterEach, describe, expect, it, vi } from "vitest";
import type { DbSql } from "@seap/db";
import {
  entryMembers, entrySelection, forgetTrendGroups, groupSourceTotals, hasMember, memberList, rememberTrendGroups, TREND_GROUP_ID_LIMIT, TREND_GROUP_TTL_MS,
  trendGroupEntry, trendGroupKey, trendGroupsFor, trendGroupStats, trendMemberPart, type TrendGroupEntry,
} from "./group-ids";
import { predicateContext, trendGroupOf, type TrendGroup } from "./predicates";
import type { TrendPartition } from "./trend-partition";
import type { AskSpec } from "./spec";

// F2 (plan §2.5): the members of a trend's groups kept from the answer, for its source drawers.

const group = (trend: NonNullable<AskSpec["trend"]>): TrendGroup => trendGroupOf({ trend });
const channel = (n: number, v: string, first: string | null, last: string | null) => ({ n, v, first, last });
const partition = (members: TrendPartition["members"]): TrendPartition => ({
  lists: {}, composition: {}, members,
  sources: { gone: { da: channel(3, "400.50", "2024-01-05", "2024-12-20"), contracts: channel(1, "99.5", "2024-03-01", "2024-03-01") } },
});
const entry = (size: number): TrendGroupEntry => ({ dim: "supplier", members: { up: new Float64Array(size) }, sources: {}, eligibleBase: null, size });

afterEach(() => { forgetTrendGroups(); vi.useRealTimers(); });

describe("the parts a drawer lists", () => {
  it("name the group of a trend's options, and none for every change", () => {
    expect([group({ change: "up" }), group({ change: "up", order: "percent", minBase: 5_000 }), group({ change: "new" }), group({ change: "new", firstOnly: true }),
      group({ change: "down" }), group({ change: "gone" }), group({}), group({ change: "all" })].map(trendMemberPart))
      .toEqual(["up", "eligible", "new", "first", "down", "gone", null, null]);
  });

  it("keep entity ids as ascending numbers and counties as names, and hold the growths in percent of one base only", () => {
    const firms = trendGroupEntry(partition({ up: ["7", "1964706", "9007199254740"], eligible: ["1964706"] }), { dim: "supplier", group: group({ change: "up", order: "percent", minBase: 5_000 }) });
    expect(firms.members.up).toBeInstanceOf(Float64Array);
    expect([...firms.members.up!]).toEqual([7, 1964706, 9007199254740]);
    expect(memberList(firms.members.up!)).toEqual(["7", "1964706", "9007199254740"]);
    expect(firms.size).toBe(4);
    expect(entryMembers(firms, group({ change: "up", order: "percent", minBase: 5_000 }))).toBe(firms.members.eligible);
    expect(entryMembers(firms, group({ change: "up", order: "percent", minBase: 10_000 }))).toBeNull();
    expect(entryMembers(firms, group({ change: "up" }))).toBe(firms.members.up);
    expect(entryMembers(firms, group({ change: "gone" }))).toBeNull();
    const counties = trendGroupEntry(partition({ down: ["Cluj", "Iași"] }), { dim: "county", group: group({ change: "down" }) });
    expect(counties.members.down).toEqual(["Cluj", "Iași"]);
    expect([hasMember(counties.members.down!, "Iași"), hasMember(counties.members.down!, "Iasi")]).toEqual([true, false]);
  });

  it("keep the band's records as „Toate”'s and every firm's as the selection a group names (S3 review: an employees band)", () => {
    const plain = trendGroupEntry(partition({ gone: ["7"] }), { dim: "supplier", group: group({ change: "gone" }) });
    expect([plain.selection, entrySelection(plain)]).toEqual([undefined, null]);
    const all = { da: channel(9, "900", "2024-01-02", "2025-12-30"), contracts: channel(2, "50", "2024-05-01", "2025-06-01") };
    const everyFirm = { da: channel(30, "3000", "2024-01-02", "2025-12-31"), contracts: channel(4, "70", "2024-02-01", "2025-06-01") };
    const banded = trendGroupEntry({ ...partition({ gone: ["7"] }), sources: { all }, selection: { totals: { count: 12, valueA: 1, valueB: 2 }, sources: everyFirm } },
      { dim: "supplier", group: group({ change: "all" }) });
    // „Toate” lists the band's records (its rows apply the band to every record): its totals are the band's, never every firm's.
    expect(banded.sources.all).toBe(all);
    expect(entrySelection(banded)).toBe(everyFirm);
    const { selection: _selection, ...unbanded } = banded;
    expect(entrySelection(unbanded)).toBe(all);
  });

  it("find a member by binary search over the ascending ids", () => {
    const ids = Float64Array.from([3, 10, 11, 250, 1964706, 2115381], Number);
    expect(["3", "11", "2115381", "1964706", "4", "2115382", "0"].map((id) => hasMember(ids, id))).toEqual([true, true, true, true, false, false, false]);
    expect(hasMember(new Float64Array(0), "1")).toBe(false);
  });
});

describe("the key of a selection", () => {
  const sql = {} as DbSql;
  const ctx = (spec: Partial<AskSpec> & { filters: AskSpec["filters"] }, months: [number, number] | null = null) =>
    predicateContext(sql, { block: "trend", measure: "value", dim: "supplier", ...spec } as AskSpec, {}, { dataset: spec.dataset ?? "all", yearFrom: 2024, yearTo: 2025, trendMonths: months });
  const key = (c: ReturnType<typeof ctx>, o: Partial<{ stamp: string; dim: "supplier" | "authority" | "county"; yearA: number; yearB: number }> = {}) =>
    trendGroupKey(c, { stamp: "db:1:2:3", dim: "supplier", yearA: 2024, yearB: 2025, ...o });

  it("is the conditions, the role, the two years, the months and the marts build, not the group or the period bounds", () => {
    const base = ctx({ filters: { yearFrom: 2024, yearTo: 2025 } });
    expect(key(base)).toBe(key(ctx({ filters: { yearFrom: 2024, yearTo: 2025 }, trend: { change: "gone" } })));
    expect(key(base)).toBe(key({ ...base, yearFrom: 2019, yearTo: 2026 }));
    for (const other of [key(base, { stamp: "db:1:2:4" }), key(base, { dim: "authority" }), key(base, { yearA: 2023 }), key(ctx({ filters: {} }, [1, 5])),
      key(ctx({ dataset: "da", filters: {} })), key(ctx({ filters: { minEmployees: 1, maxEmployees: 9 } }))])
      expect(other).not.toBe(key(base));
    expect(key(base)).not.toContain("\"sql\"");
  });
});

describe("the kept partitions", () => {
  it("are bounded by the ids they hold, the oldest dropped first, and a used one is the newest", () => {
    const half = Math.floor(TREND_GROUP_ID_LIMIT / 2);
    rememberTrendGroups("a", entry(half));
    rememberTrendGroups("b", entry(half - 10));
    expect(trendGroupsFor("a")).not.toBeNull(); // "a" is now the newest
    rememberTrendGroups("c", entry(100));
    expect([trendGroupsFor("a"), trendGroupsFor("b"), trendGroupsFor("c")].map(Boolean)).toEqual([true, false, true]);
    expect(trendGroupStats()).toMatchObject({ entries: 2, held: half + 100 });
    // Kept again under the same key: replaced, not counted twice.
    rememberTrendGroups("c", entry(50));
    expect(trendGroupStats().held).toBe(half + 50);
    // Larger than the bound alone: not kept.
    rememberTrendGroups("huge", entry(TREND_GROUP_ID_LIMIT + 1));
    expect(trendGroupsFor("huge")).toBeNull();
  });

  it("expire after ten minutes", () => {
    vi.useFakeTimers();
    rememberTrendGroups("a", entry(5));
    vi.advanceTimersByTime(TREND_GROUP_TTL_MS - 1);
    expect(trendGroupsFor("a")).not.toBeNull();
    vi.advanceTimersByTime(TREND_GROUP_TTL_MS + 1);
    expect(trendGroupsFor("a")).toBeNull();
    expect(trendGroupStats()).toMatchObject({ entries: 0, held: 0 });
  });
});

describe("a group's totals from its grouping", () => {
  const sources = partition({}).sources.gone!;
  it("are the totals query's rows per state, with the drawer's channel or state as a channel", () => {
    expect(groupSourceTotals(sources, {})).toEqual([
      { state: "Oferta acceptata", n: "3", v: "400.50", fn: "3", fv: "400.50", date_from: "2024-01-05", date_to: "2024-12-20" },
      { state: null, n: "1", v: "99.5", fn: "1", fv: "99.5", date_from: "2024-03-01", date_to: "2024-03-01" },
    ]);
    const kept = (local: Parameters<typeof groupSourceTotals>[1]) => groupSourceTotals(sources, local)!.map((r) => [r.state, r.fn, r.fv]);
    expect(kept({ stream: "contracts" })).toEqual([["Oferta acceptata", "0", "0"], [null, "1", "99.5"]]);
    expect(kept({ state: "__unknown" })).toEqual([["Oferta acceptata", "0", "0"], [null, "1", "99.5"]]);
    expect(kept({ state: "Oferta acceptata", stream: "da" })).toEqual([["Oferta acceptata", "3", "400.50"], [null, "0", "0"]]);
    expect(kept({ state: "Anulata" })).toEqual([["Oferta acceptata", "0", "0"], [null, "0", "0"]]);
  });

  it("leave out a channel without records, and give nothing when a channel with records has no days", () => {
    expect(groupSourceTotals({ ...sources, contracts: channel(0, "0", null, null) }, {})).toHaveLength(1);
    expect(groupSourceTotals({ ...sources, da: channel(3, "400.50", null, null) }, {})).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  ABROAD, countyOfFolded, facetCountText, facetSpec, facetTotalText, isFacetPart, FACET_PARTS, FACET_REST,
} from "./facet-parts";
import { aborted, assembleCounts, FACET_SLOTS, facetKey, facetRequest, facetSlots, inFacetSlot, placeOf, rankVector } from "./facets";
import type { AskSpec } from "./spec";

/*
 * The windows' counts (plan §2.5 "Fațetele", kit R5) without a database: what
 * each part leaves out of the draft, the key the counts are kept under, how
 * grouped rows become a window's options and rest, the rank vector of "Unde e
 * …?", the request's checks and the slots. The SQL is proved on a fixture
 * (facets.integration.test.ts).
 */

const stat = (filters: AskSpec["filters"] = {}, extra: Partial<AskSpec> = {}): AskSpec => ({ block: "stat", measure: "value", filters, ...extra });

describe("facetSpec: a window counts without its own key (R5)", () => {
  it("leaves out the part's keys and keeps the rest of the draft", () => {
    const draft = stat({ yearFrom: 2025, yearTo: 2025, county: "Cluj", purchaseKind: "lucrari", purchaseValueMin: 1_000_000, minEmployees: 1, maxEmployees: 9 }, { dataset: "da" });
    expect(facetSpec(draft, "domain").filters).toEqual({ yearFrom: 2025, yearTo: 2025, county: "Cluj", purchaseValueMin: 1_000_000, minEmployees: 1, maxEmployees: 9 });
    expect(facetSpec(draft, "size").filters).not.toHaveProperty("purchaseValueMin");
    expect(facetSpec(draft, "employees").filters).not.toHaveProperty("minEmployees");
    expect(facetSpec(draft, "years").filters).toEqual({ county: "Cluj", purchaseKind: "lucrari", purchaseValueMin: 1_000_000, minEmployees: 1, maxEmployees: 9 });
    expect(facetSpec(draft, "county").filters).not.toHaveProperty("county");
    // The draft itself is not changed.
    expect(draft.filters.purchaseKind).toBe("lucrari");
    expect(facetSpec(draft, "locate")).toBe(draft);
  });
  it("counts every channel without a procedure, and the procedures on the contracts", () => {
    const draft = stat({ procedure: "deschisa" }, { dataset: "contracts" });
    expect(facetSpec(draft, "channel")).toEqual(stat({}));
    expect(facetSpec(stat({}, { dataset: "da" }), "procedure")).toEqual(stat({}, { dataset: "contracts" }));
  });
  it("clears the buyer's window (a kind, an institution, a town hall) only where the buyer is a selection", () => {
    const buyer = { authorityKind: "spital" as const, authorityId: 7, authorityName: "Spitalul X", uatSiruta: 1, uatName: "X" };
    expect(facetSpec(stat(buyer), "kind").filters).toEqual({});
    // A network's institution is the question's entity: only the kind of its clients goes.
    expect(facetSpec({ block: "network", measure: "value", dim: "authority", filters: buyer }, "kind").filters).toEqual({ authorityId: 7, authorityName: "Spitalul X", uatSiruta: 1, uatName: "X" });
  });
  it("takes a firm profile's county as its seat, and the firm's seat keys elsewhere", () => {
    expect(facetSpec({ block: "scatter", dim: "supplier", measure: "value", filters: { county: "Cluj" } }, "seat").filters).toEqual({});
    expect(facetSpec(stat({ county: "Cluj", seatCounty: "Iasi", firmSeat: "other" }), "seat").filters).toEqual({ county: "Cluj" });
  });
  it("names every part, and nothing else", () => {
    expect(FACET_PARTS.every(isFacetPart)).toBe(true);
    expect(["mix", "pair", "", null, 3].some(isFacetPart)).toBe(false);
  });
});

describe("the key a part's counts are kept under (plan §2.5)", () => {
  const stamp = { build: "seap:1:2:3", checkpoint: "c1" };
  it("is the same for drafts that differ only in the window's own key", () => {
    expect(facetKey(stat({ authorityKind: "spital" }), "kind", stamp)).toBe(facetKey(stat({ authorityKind: "scoala" }), "kind", stamp));
    expect(facetKey(stat({ county: "Cluj" }), "kind", stamp)).not.toBe(facetKey(stat({ county: "Iasi" }), "kind", stamp));
  });
  it("changes with the part, the data checkpoint and the marts build", () => {
    const key = facetKey(stat(), "kind", stamp);
    expect(facetKey(stat(), "county", stamp)).not.toBe(key);
    expect(facetKey(stat(), "kind", { ...stamp, checkpoint: "c2" })).not.toBe(key);
    expect(facetKey(stat(), "kind", { ...stamp, build: "seap:1:2:4" })).not.toBe(key);
  });
  it("keeps one rank vector per ranking, whatever its length", () => {
    const table: AskSpec = { block: "table", dim: "supplier", measure: "value", topN: 10, filters: {} };
    expect(facetKey(table, "locate", stamp)).toBe(facetKey({ ...table, topN: 25 }, "locate", stamp));
    expect(facetKey(table, "locate", stamp)).not.toBe(facetKey({ ...table, measure: "count" }, "locate", stamp));
  });
});

describe("assembleCounts: grouped rows as a window's options", () => {
  const meta = { checkpoint: "c1", tookMs: 5 };
  it("gives every fixed option (0 for the absent), the rest and the shares of the value", () => {
    const counts = assembleCounts("kind", "institutions", [
      { k: "spital", v: "600", n: "3" }, { k: "comuna", v: "300", n: "10" }, { k: null, v: "100", n: "4" },
    ], meta);
    expect(counts.options.map((o) => [o.value, o.n, o.share])).toEqual([
      ["comuna", 10, 0.3], ["oras_municipiu", 0, 0], ["consiliu_judetean", 0, 0], ["spital", 3, 0.6], ["scoala", 0, 0],
    ]);
    expect(counts.rest).toEqual({ label: FACET_REST.kind, n: 4, value_ron: 100, share: 0.1 });
    expect(counts.total).toEqual({ n: 17, value_ron: 1000 });
    // Every option and the rest add up to the total (R5).
    expect(counts.options.reduce((a, o) => a + o.share, 0) + counts.rest!.share).toBeCloseTo(1);
  });
  it("names the data's counties as the list writes them, the rest unknown", () => {
    const counts = assembleCounts("county", "records", [
      { k: "Bucuresti", v: "50", n: "5" }, { k: "Arges", v: "30", n: "3" }, { k: null, v: "20", n: "2" },
    ], meta);
    expect(counts.options.map((o) => o.value)).toEqual(["București", "Argeș"]);
    expect(counts.rest).toMatchObject({ label: "Județ necunoscut", n: 2 });
  });
  it("places a firm's seat in a county, abroad, or unknown", () => {
    const counts = assembleCounts("seat", "firms", [
      { k: "SIBIU", v: "10", n: "1", f: false }, { k: "Sibiu", v: "10", n: "1", f: false },
      { k: "NA", v: "5", n: "2", f: true }, { k: null, v: "5", n: "1", f: true }, { k: "CASERTA", v: "1", n: "1", f: false },
    ], meta);
    expect(counts.options).toEqual([
      { value: "Sibiu", n: 2, value_ron: 20, share: 20 / 31 },
      { value: ABROAD, n: 3, value_ron: 10, share: 10 / 31 },
    ]);
    expect(counts.rest).toMatchObject({ label: "Sediu necunoscut", n: 1, value_ron: 1 });
  });
  it("shares profiles by their number, and says „Sediu necunoscut” on firm profiles", () => {
    const counts = assembleCounts("county", "profiles", [{ k: "Cluj", v: "900", n: "1" }, { k: null, v: "100", n: "3" }], { ...meta, firmProfiles: true });
    expect(counts.options[0]).toMatchObject({ value: "Cluj", share: 0.25 });
    expect(counts.rest).toMatchObject({ label: "Sediu necunoscut", share: 0.75 });
  });
  it("keeps the years of the data in order and the channels and ranges in the window's", () => {
    expect(assembleCounts("years", "records", [{ k: "2025", v: "1", n: "1" }, { k: "2019", v: "1", n: "1" }], meta).options.map((o) => o.value)).toEqual(["2019", "2025"]);
    expect(assembleCounts("channel", "records", [{ k: "contracts", v: "9", n: "1" }], meta).options.map((o) => [o.value, o.n])).toEqual([["da", 0], ["contracts", 1]]);
    expect(assembleCounts("size", "records", [], meta).options.map((o) => o.value)).toEqual(["0", "1", "2", "3"]);
    expect(assembleCounts("channel", "records", [], meta).rest).toBeNull();
  });
});

describe("the words of a count", () => {
  it("says the share and the number, the first row its number alone", () => {
    expect(facetCountText({ n: 2867, share: 0.099 })).toBe("9,9% · 2.867");
    expect(facetCountText({ n: 3, share: 0.0004 })).toBe("sub 0,1% · 3");
    expect(facetTotalText({ total: { n: 14911, value_ron: 1 } })).toBe("14.911");
  });
  it("reads a county in any spelling the data has", () => {
    expect(["bucuresti", "BUCUREȘTI", "București"].map(countyOfFolded)).toEqual(["București", "București", "București"]);
    expect(countyOfFolded("Bistrita-Nasaud")).toBe("Bistrița-Năsăud");
    expect(countyOfFolded("Satu Mare")).toBe("Satu Mare");
    expect([null, "", "Copenhagen", "NA"].map(countyOfFolded)).toEqual([null, null, null, null]);
  });
});

describe("the rank vector of „Unde e …?”", () => {
  const vector = rankVector([{ id: "30", v: "900", n: "1" }, { id: "7", v: "500", n: "9" }, { id: "12", v: "500", n: "2" }, { id: "1", v: "10", n: "3" }]);
  it("places each id as the answer orders it, and none it does not hold", () => {
    expect(["30", "7", "12", "1"].map((id) => placeOf(vector, Number(id)))).toEqual([1, 2, 3, 4]);
    expect(placeOf(vector, 99)).toBeNull();
    expect(vector.values[placeOf(vector, 12)! - 1]).toBe(500);
    expect(vector.size).toBe(4);
  });
  it("finds a place among many ids by a binary search", () => {
    const many = rankVector(Array.from({ length: 50_000 }, (_, i) => ({ id: String(50_000 - i), v: String(50_000 - i), n: "1" })));
    expect(placeOf(many, 1)).toBe(50_000);
    expect(placeOf(many, 37_000)).toBe(13_001);
  });
});

describe("a facet request", () => {
  it("names a known part, and „Unde e …?” at least two letters", () => {
    expect(facetRequest({ part: "kind" })).toEqual({ part: "kind", q: null });
    expect(facetRequest({ part: "locate", q: "  ded  " })).toEqual({ part: "locate", q: "ded" });
    expect(facetRequest({ part: "mix" })).toHaveProperty("error");
    expect(facetRequest({ part: "locate", q: "ă" })).toHaveProperty("error");
    expect(facetRequest({ part: "locate" })).toHaveProperty("error");
  });
  it("tells a closed window from a failure", () => {
    expect(aborted(Object.assign(new Error(""), { name: "ResponseAborted" }))).toBe(true);
    expect(aborted(Object.assign(new Error("x"), { name: "AbortError" }))).toBe(true);
    expect(aborted(new Error("canceling statement due to user request"))).toBe(true);
    expect(aborted(new Error("canceling statement due to statement timeout"))).toBe(false);
  });
});

describe("the slots (plan §2.5: at most three at a time)", () => {
  it("runs at most FACET_SLOTS parts and lets the next one in as one ends", async () => {
    let running = 0, most = 0;
    const releases: (() => void)[] = [];
    const work = () => new Promise<void>((resolve) => { running++; most = Math.max(most, running); releases.push(() => { running--; resolve(); }); });
    const all = Array.from({ length: FACET_SLOTS + 2 }, () => inFacetSlot(undefined, work));
    await new Promise((r) => setTimeout(r, 10));
    expect(facetSlots()).toEqual({ busy: FACET_SLOTS, waiting: 2 });
    while (releases.length) { releases.shift()!(); await new Promise((r) => setTimeout(r, 5)); }
    await Promise.all(all);
    expect(most).toBe(FACET_SLOTS);
    expect(facetSlots()).toEqual({ busy: 0, waiting: 0 });
  });
  it("drops a request whose window closed while it waited, without running it", async () => {
    const releases: (() => void)[] = [];
    const busy = Array.from({ length: FACET_SLOTS }, () => inFacetSlot(undefined, () => new Promise<void>((resolve) => releases.push(resolve))));
    const closed = new AbortController();
    let ran = false;
    const waiting = inFacetSlot(closed.signal, async () => { ran = true; });
    await new Promise((r) => setTimeout(r, 5));
    closed.abort();
    await expect(waiting).rejects.toThrow();
    for (const release of releases) release();
    await Promise.all(busy);
    expect(ran).toBe(false);
    expect(facetSlots()).toEqual({ busy: 0, waiting: 0 });
  });
});

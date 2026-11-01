import { describe, expect, it } from "vitest";
import { FLAG_LIVE_RECORDS, ROW_FLAGS, flagRecordsNote, flagSourcesWait } from "./scatter-records";
import { SCATTER_FLAGS } from "./spec";

/*
 * The sources of a signal on the risk cloud before the first nightly build with da_tx_flagged_idx (S6, F6b verify):
 * a row signal of a large cohort says it waits for that build instead of failing at the drawer's limit; a small
 * cohort, or a signal read from another index, stays live. The SQL is scatter.integration.test.ts's.
 */

describe("a signal's sources without da_tx_flagged_idx (flagSourcesWait)", () => {
  it("waits only for a row signal of more than FLAG_LIVE_RECORDS acquisitions while the index is missing", () => {
    // A split on the institutions of the country (10.8M acquisitions): waits; with the index, it reads it.
    expect(flagSourcesWait("da_split", 10_844_257, false)).toBe(true);
    expect(flagSourcesWait("da_split", 10_844_257, true)).toBe(false);
    // A row signal on the firms of the country (1.68M) and one firm's records stay live.
    expect(flagSourcesWait("da_above_ceiling", 1_678_541, false)).toBe(false);
    expect(flagSourcesWait("da_round", 28, false)).toBe(false);
    expect(flagSourcesWait("da_round", FLAG_LIVE_RECORDS, false)).toBe(false);
    expect(flagSourcesWait("da_above_ceiling", FLAG_LIVE_RECORDS + 1, false)).toBe(true);
    // December, the main supplier and the main institution read their own indexes, never this one.
    for (const flag of ["da_year_end", "da_concentration", "da_dependence"] as const) expect(flagSourcesWait(flag, 19_600_000, false)).toBe(false);
  });

  it("reads the per-acquisition signals from the flagged rows: repeated, just under and above the ceiling", () => {
    expect([...ROW_FLAGS].sort()).toEqual(["da_above_ceiling", "da_round", "da_split"]);
    for (const flag of ROW_FLAGS) expect(SCATTER_FLAGS).toContain(flag);
  });

  it("says which acquisitions a signal's sources are, with Ask's short label (just under the ceiling: 96–100%)", () => {
    expect(flagRecordsNote("da_round")).toBe("Sursele semnalului „Chiar sub plafon”: achizițiile cu valoarea între 96% și 100% din plafon, nu tot istoricul profilurilor.");
    expect(flagRecordsNote("da_above_ceiling")).toBe("Sursele semnalului „Peste plafon”: achizițiile înregistrate cu peste 10% peste plafon, unde excepțiile cunoscute nu se aplică, nu tot istoricul profilurilor.");
    for (const flag of SCATTER_FLAGS) expect(flagRecordsNote(flag)).toMatch(/^Sursele semnalului „[^”]+”: \S/);
  });
});

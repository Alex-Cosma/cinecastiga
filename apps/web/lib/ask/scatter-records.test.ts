import { describe, expect, it } from "vitest";
import { FLAG_LIVE_RECORDS, flagRecordsNote, flagSourcesWait } from "./scatter-records";

/*
 * The sources of a signal on the risk cloud before the first nightly build with da_tx_flagged_idx (S6, F6b verify):
 * a row signal of a large cohort says it waits for that build instead of failing at the drawer's limit; a small
 * cohort, or a signal read from another index, stays live. The SQL is scatter.integration.test.ts's.
 */

describe("a signal's sources without da_tx_flagged_idx (flagSourcesWait)", () => {
  it("waits only for a row signal of more than FLAG_LIVE_RECORDS acquisitions while the index is missing", () => {
    // A possible split on the institutions of the country (10.8M acquisitions): waits; with the index, it reads it.
    expect(flagSourcesWait("da_split", 10_844_257, false)).toBe(true);
    expect(flagSourcesWait("da_split", 10_844_257, true)).toBe(false);
    // Rapid on the firms of the country (1.68M) and one firm's records stay live.
    expect(flagSourcesWait("da_rapid", 1_678_541, false)).toBe(false);
    expect(flagSourcesWait("da_round", 28, false)).toBe(false);
    expect(flagSourcesWait("da_rapid", FLAG_LIVE_RECORDS, false)).toBe(false);
    expect(flagSourcesWait("da_rapid", FLAG_LIVE_RECORDS + 1, false)).toBe(true);
    // December, the main supplier and the main institution read their own indexes, never this one.
    for (const flag of ["da_year_end", "da_concentration", "da_dependence"] as const) expect(flagSourcesWait(flag, 19_600_000, false)).toBe(false);
  });

  it("says which acquisitions a signal's sources are, with Ask's short label", () => {
    expect(flagRecordsNote("da_rapid")).toBe("Sursele semnalului „Finalizare rapidă”: achizițiile finalizate în mai puțin de o oră de la publicare, nu tot istoricul profilurilor.");
  });
});

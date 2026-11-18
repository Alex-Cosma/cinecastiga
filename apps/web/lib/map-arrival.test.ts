import { describe, expect, it } from "vitest";
import { freshArrival, mapCountyHref } from "./map-arrival";

describe("from the home map to a county on /harta", () => {
  it("opens the county on the map's year", () => {
    expect(mapCountyHref("harghita", 2025)).toBe("/harta?ani=2025&judet=harghita");
  });
  it("draws the arrival only for the county just clicked", () => {
    const raw = JSON.stringify({ county: "harghita", at: 1_000 });
    expect(freshArrival(raw, "harghita", 1_400)).toBe(true);
    expect(freshArrival(raw, "cluj", 1_400)).toBe(false);
    expect(freshArrival(raw, null, 1_400)).toBe(false);
    expect(freshArrival(raw, "harghita", 60_000)).toBe(false);
    expect(freshArrival(null, "harghita", 1_400)).toBe(false);
    expect(freshArrival("not json", "harghita", 1_400)).toBe(false);
  });
});

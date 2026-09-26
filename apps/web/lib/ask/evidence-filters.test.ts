import { describe, expect, it } from "vitest";
import { validateEvidenceFilters } from "./evidence";

describe("saved source drawer filters", () => {
  it("preserves the exact list filters through a permalink round trip", () => {
    const filters = { search: "spații verzi", state: "Oferta acceptata", stream: "da" };
    const url = new URL("https://example.invalid/intreaba");
    url.searchParams.set("sourceFilters", JSON.stringify(filters));
    expect(validateEvidenceFilters(JSON.parse(url.searchParams.get("sourceFilters")!))).toEqual(filters);
  });
  it("does not quietly discard unsupported or malformed filters", () => {
    for (const filters of [{ ignored: true }, { stream: "ted" }, { search: 123 }, { state: "a".repeat(101) }, [], "da"])
      expect(validateEvidenceFilters(filters)).toHaveProperty("error");
  });
  it("accepts an explicitly unfiltered list", () => {
    expect(validateEvidenceFilters({ search: "", state: "", stream: "" })).toEqual({});
  });
});

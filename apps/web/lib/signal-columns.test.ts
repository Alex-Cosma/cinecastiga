import { describe, expect, it } from "vitest";
import { signalCaseColumns, signalRiskColumns } from "./signal-columns";
import { RISK_CRITERIA } from "./risk-score";
import { parseSignalState, signalUrl } from "./signals-shared";

describe("the column filters of /semnale", () => {
  it("gives a pattern's list the columns its rows show", () => {
    expect(signalCaseColumns("da_split", "authority").map((c) => c.key)).toEqual(["cine", "partener", "an", "masura", "valoare"]);
    // Whole-period patterns have no year; award patterns name winners, not one partner, and have no measure.
    expect(signalCaseColumns("da_concentration", "authority").map((c) => c.key)).toEqual(["cine", "partener", "masura", "valoare"]);
    expect(signalCaseColumns("award_single_bid", "authority").map((c) => c.key)).toEqual(["cine", "an", "valoare"]);
    expect(signalCaseColumns("da_split", "supplier")[0]!.label).toBe("Firma");
    expect(signalRiskColumns("authority", RISK_CRITERIA.authority).map((c) => c.key)).toEqual(["nume", "tipare", "achizitii", "valoare", "risc"]);
  });

  it("reads only its view's columns from the address and drops them for another list", () => {
    const cases = parseSignalState({ tip: "da_split", an: "2023", masura: "10..", tipare: "da_round" });
    expect(cases.filters).toEqual({ an: { kind: "options", values: ["2023"] }, masura: { kind: "range", min: 10, max: null } });
    expect(parseSignalState({ view: "cri", tipare: "da_round", an: "2023" }).filters).toEqual({ tipare: { kind: "options", values: ["da_round"] } });
    expect(signalUrl(cases, { page: 1 })).toBe("/semnale?tip=da_split&rol=authority&an=2023&masura=10..&p=1");
    expect(signalUrl(cases, { view: "cri" })).toBe("/semnale?tip=da_split&rol=authority&view=cri");
    expect(signalUrl(cases, { county: "Cluj" })).toContain("an=2023");
    // An entity's own signals page has no column filters.
    expect(parseSignalState({ tip: "da_split", ent: "5", an: "2023" }).filters).toEqual({});
  });
});

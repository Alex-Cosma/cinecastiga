import { describe, expect, it } from "vitest";
import { completIf, completeOnlyAnswer, networkOrderAtDefault, presentationAtDefault } from "./esential";

describe("Esențial marks on Întreabă's answers", () => {
  it("marks only what goes", () => {
    expect(completIf(true)).toBe("complet");
    expect(completIf(false)).toBeUndefined();
  });

  it("hides the presentation line only at its defaults", () => {
    expect(presentationAtDefault({ block: "table", measure: "value", topN: 10 })).toBe(true);
    expect(presentationAtDefault({ block: "table", measure: "value", topN: 25 })).toBe(false);
    expect(presentationAtDefault({ block: "table", measure: "value" })).toBe(false);
    expect(presentationAtDefault({ block: "table", measure: "count", topN: 10 })).toBe(false);
    expect(presentationAtDefault({ block: "network", measure: "value", network: { show: 15 } })).toBe(true);
    expect(presentationAtDefault({ block: "network", measure: "value" })).toBe(true);
    expect(presentationAtDefault({ block: "network", measure: "value", network: { show: 25 } })).toBe(false);
    expect(presentationAtDefault({ block: "network", measure: "value", network: { show: 15, order: "years" } })).toBe(false);
    expect(presentationAtDefault({ block: "trend", measure: "value" })).toBe(true);
    expect(presentationAtDefault({ block: "trend", measure: "value", trend: { order: "percent" } })).toBe(false);
    expect(presentationAtDefault({ block: "trend", measure: "value", topN: 25 })).toBe(false);
    expect(presentationAtDefault({ block: "breakdown", measure: "count" })).toBe(true);
  });

  it("knows the network's default order", () => {
    expect(networkOrderAtDefault({})).toBe(true);
    expect(networkOrderAtDefault({ network: { order: "value" } })).toBe(true);
    expect(networkOrderAtDefault({ network: { order: "count" } })).toBe(false);
  });

  it("keeps the answers that are the risk score in Complet", () => {
    expect(completeOnlyAnswer({ block: "scatter" })).toBe(true);
    expect(completeOnlyAnswer({ block: "distribution" })).toBe(true);
    expect(completeOnlyAnswer({ block: "entity_card", rankBy: "risk" })).toBe(true);
    expect(completeOnlyAnswer({ block: "entity_card", rankBy: "value" })).toBe(false);
    expect(completeOnlyAnswer({ block: "table" })).toBe(false);
    expect(completeOnlyAnswer(null)).toBe(false);
  });
});

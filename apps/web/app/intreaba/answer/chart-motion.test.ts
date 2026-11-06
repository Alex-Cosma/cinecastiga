import { describe, expect, it } from "vitest";
import type { AskSpec } from "../../../lib/ask/spec";
import { answerSubject } from "./chart-motion";

const spec = (over: Partial<AskSpec> & { filters?: AskSpec["filters"] } = {}): AskSpec => ({ block: "table", dim: "supplier", measure: "value", filters: {}, ...over });

describe("an answer's subject (its charts re-enter on another, tween on the same)", () => {
  it("stays the same across a measure, a channel, a filter or a group", () => {
    const base = answerSubject(spec({ filters: { authorityId: 7, authorityName: "COMUNA X" } }));
    expect(answerSubject(spec({ measure: "count", dataset: "da", filters: { authorityId: 7, authorityName: "COMUNA X", county: "Cluj", yearFrom: 2022 } }))).toBe(base);
    expect(answerSubject(spec({ filters: { authorityId: 7, authorityName: "COMUNA X" }, peers: { similar: true } }))).toBe(base);
  });
  it("changes with the block, the unit, the superlative or an entity", () => {
    const base = answerSubject(spec({ filters: { authorityId: 7 } }));
    expect(answerSubject(spec({ block: "timeseries", filters: { authorityId: 7 } }))).not.toBe(base);
    expect(answerSubject(spec({ dim: "authority", filters: { authorityId: 7 } }))).not.toBe(base);
    expect(answerSubject(spec({ rankBy: "risk", filters: { authorityId: 7 } }))).not.toBe(base);
    expect(answerSubject(spec({ filters: { authorityId: 8 } }))).not.toBe(base);
    expect(answerSubject(spec({ filters: { authorityId: 7, compareWithId: 9 } }))).not.toBe(base);
  });
  it("takes a breakdown's level (a domain one level down, a kind) as another subject", () => {
    const level = (filters: AskSpec["filters"]) => answerSubject({ block: "breakdown", measure: "value", filters });
    expect(level({ county: "Alba" })).toBe(level({ county: "Alba", yearFrom: 2024 }));
    expect(level({ cpvTerm: "45" })).not.toBe(level({}));
    expect(level({ purchaseKind: "lucrari" })).not.toBe(level({}));
  });
});

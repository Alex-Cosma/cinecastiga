import { describe, expect, it } from "vitest";
import type { AskSpec } from "../../../lib/ask/spec";
import { LIST_RETURN_MS, listReturnKey, parseListReturn } from "./list-return";

const cloud = { block: "scatter", measure: "value", dim: "authority", filters: {} } as unknown as AskSpec;
const byValue = { ...cloud, scatter: { rankBy: "value" } } as unknown as AskSpec;
const now = 1_800_000_000_000;
const stored = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ key: listReturnKey(cloud), shown: 40, id: "2139088", top: 312.5, at: now - 60_000, ...over });

describe("the risk cloud's list after «Înapoi»", () => {
  it("comes back for the question it left", () => {
    expect(parseListReturn(stored(), listReturnKey(cloud), now)).toEqual({ key: listReturnKey(cloud), shown: 40, id: "2139088", top: 312.5, at: now - 60_000 });
  });

  it("is another question's when the strip's order differs", () => {
    expect(listReturnKey(byValue)).not.toBe(listReturnKey(cloud));
    expect(parseListReturn(stored(), listReturnKey(byValue), now)).toBeNull();
  });

  it("is a new visit after thirty minutes, or with a clock gone back", () => {
    expect(parseListReturn(stored({ at: now - LIST_RETURN_MS - 1 }), listReturnKey(cloud), now)).toBeNull();
    expect(parseListReturn(stored({ at: now + 1 }), listReturnKey(cloud), now)).toBeNull();
  });

  it("ignores what it cannot read", () => {
    const key = listReturnKey(cloud);
    expect(parseListReturn(null, key, now)).toBeNull();
    expect(parseListReturn("{", key, now)).toBeNull();
    expect(parseListReturn("null", key, now)).toBeNull();
    expect(parseListReturn(stored({ id: "" }), key, now)).toBeNull();
    expect(parseListReturn(stored({ shown: 0 }), key, now)).toBeNull();
    expect(parseListReturn(stored({ top: "312" }), key, now)).toBeNull();
  });
});

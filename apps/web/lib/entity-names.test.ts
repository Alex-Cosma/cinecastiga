import { describe, expect, it } from "vitest";
import { entityNameIds, MAX_ENTITY_NAMES } from "./entity-names";

describe("GET /api/entity-names reads only well-formed ids, at most 20", () => {
  it("accepts a list of entity ids once each", () => {
    expect(entityNameIds("2146445,2124387,2146445")).toEqual(["2146445", "2124387"]);
    expect(entityNameIds(" 7 , 8 ")).toEqual(["7", "8"]);
  });

  it("refuses an empty, malformed or too long list", () => {
    for (const raw of [null, "", ",", "0", "012", "1;2", "abc", "1e5", "-3", "12345678901234567"]) expect(entityNameIds(raw), String(raw)).toBeNull();
    const ids = Array.from({ length: MAX_ENTITY_NAMES + 1 }, (_, i) => String(i + 1));
    expect(entityNameIds(ids.slice(0, MAX_ENTITY_NAMES).join(","))).toHaveLength(MAX_ENTITY_NAMES);
    expect(entityNameIds(ids.join(","))).toBeNull();
  });
});

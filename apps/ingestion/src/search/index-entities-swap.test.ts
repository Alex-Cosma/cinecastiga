import { describe, expect, it } from "vitest";
import { swapEntityIndexes } from "./index-entities.js";

describe("swapEntityIndexes (blue/green, 9 November 2026)", () => {
  it("sends only the pair: Meilisearch 1.16 rejects the client's `rename` field", async () => {
    let body: unknown;
    const client = { swapIndexes: (pairs: unknown) => { body = pairs; return Object.assign(Promise.resolve({}), { waitTask: async () => ({ status: "succeeded" }) }); } };
    expect(await swapEntityIndexes(client as never)).toBe("succeeded");
    expect(body).toEqual([{ indexes: ["entities", "entities_next"] }]);
  });
});

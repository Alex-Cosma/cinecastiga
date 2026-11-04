import { describe, expect, it } from "vitest";
import { orderLinkedHits, REVIEWED_SUCCESSORS, successorOf } from "./entity-successors";

describe("reviewed successors (owner, 4 November 2026)", () => {
  it("lists the ten approved pairs, each identity once on its older or secondary side", () => {
    expect(REVIEWED_SUCCESSORS).toHaveLength(10);
    expect(new Set(REVIEWED_SUCCESSORS.map((s) => s.from)).size).toBe(10);
    for (const s of REVIEWED_SUCCESSORS) expect(s.from).not.toBe(s.to);
    // No pair is a chain: a main identity is never itself an older one.
    for (const s of REVIEWED_SUCCESSORS) expect(successorOf(s.to)).toBeUndefined();
    expect(successorOf("2165580")).toMatchObject({ to: "2146445", kind: "secundar" });
    expect(successorOf(2134160)).toMatchObject({ to: "2161588", kind: "succesor", since: 2021 });
  });

  it("moves an older or secondary hit right under its main one, and leaves the rest in place", () => {
    const hits = [{ id: 2144687 }, { id: 9 }, { id: 2161577 }, { id: 2165580 }];
    expect(orderLinkedHits(hits)).toEqual([
      { id: 9 }, { id: 2161577 }, { id: 2144687, linked: "succesor" }, { id: 2165580, linked: "secundar" },
    ]);
  });
});

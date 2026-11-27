import { describe, expect, it } from "vitest";
import { BOARD_SIZE, SAME_KIND, firstDraw, nextDraw } from "./draw";
import { MOSAIC_VARIANTS } from "./mosaic";

// „Alte fapte” (owner, 27 November 2026): another draw of facts in another arrangement.
describe("the draw of facts on the board", () => {
  /** A repeatable sequence in [0, 1). */
  const dice = (seed: number) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  /** A pool of `n` facts, every one of its own kind unless `kinds` says how many kinds there are. */
  const pool = (n: number, kinds = n) => Array.from({ length: n }, (_, i) => ({ id: String(i + 1), kind: `k${i % kinds}` }));
  const ids = (facts: { id: string }[]) => facts.map((f) => f.id);

  it("opens with a draw of the pool, another at each visit", () => {
    const a = firstDraw(pool(40), dice(1)), b = firstDraw(pool(40), dice(2));
    expect(a.ids).toHaveLength(BOARD_SIZE);
    expect(new Set(a.ids).size).toBe(BOARD_SIZE);
    expect(a.ids).not.toEqual(b.ids);
    expect(a.variant).toBeLessThan(MOSAIC_VARIANTS);
    expect([...firstDraw(pool(3), dice(1)).ids].sort()).toEqual(ids(pool(3)));
  });
  it("shows every fact of the pool before any comes back", () => {
    const facts = pool(24), seen = new Set<string>(), random = dice(7);
    let draw = firstDraw(facts, random);
    const shown = [...draw.ids];
    for (let i = 0; i < 2; i++) { draw = nextDraw(facts, draw, seen, random); shown.push(...draw.ids); }
    expect(new Set(shown).size).toBe(24);
  });
  it("always changes the arrangement and the fact in the large tile", () => {
    for (const size of [2, 5, 8, 10, 100]) {
      const facts = pool(size), seen = new Set<string>(), random = dice(size);
      let draw = firstDraw(facts, random);
      for (let i = 0; i < 60; i++) {
        const next = nextDraw(facts, draw, seen, random);
        expect(next.ids).toHaveLength(Math.min(BOARD_SIZE, size));
        expect(new Set(next.ids).size).toBe(next.ids.length);
        expect(next.ids.every((id) => ids(facts).includes(id))).toBe(true);
        expect(next.variant).not.toBe(draw.variant);
        expect(next.variant).toBeLessThan(MOSAIC_VARIANTS);
        expect(next.toneShift).not.toBe(draw.toneShift);
        expect(next.ids[0], `pool of ${size}`).not.toBe(draw.ids[0]);
        draw = next;
      }
    }
  });
  it("with a pool barely larger than the board, brings in the facts that were left out", () => {
    const facts = pool(10), seen = new Set<string>();
    const first = firstDraw(facts, dice(5));
    const next = nextDraw(facts, first, seen, dice(3));
    for (const left of ids(facts).filter((id) => !first.ids.includes(id))) expect(next.ids).toContain(left);
  });
  it("mixes the kinds: at most two facts of one kind on a board while the pool has others", () => {
    // Forty records of one kind and twelve facts of twelve other kinds.
    const facts = [...Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, kind: "record" })), ...Array.from({ length: 12 }, (_, i) => ({ id: `o${i}`, kind: `other${i}` }))];
    const random = dice(11), seen = new Set<string>();
    let draw = firstDraw(facts, random);
    for (let i = 0; i < 4; i++) {
      expect(draw.ids.filter((id) => id.startsWith("r")).length, `draw ${i}`).toBeLessThanOrEqual(SAME_KIND);
      draw = nextDraw(facts, draw, seen, random);
    }
    // A pool of one kind still fills the board.
    expect(firstDraw(pool(20, 1), dice(2)).ids).toHaveLength(BOARD_SIZE);
  });
});

import { describe, expect, it } from "vitest";
import { mosaic, MOSAIC_VARIANTS } from "./mosaic";

// /stiati-ca as a mosaic (owner, 27 November 2026): six columns, the newest fact large, no hole in any row.
describe("the mosaic of facts", () => {
  const widths = (count: number, lead: boolean) => mosaic(count, lead).map((t) => t.span);
  it("makes the newest fact the large dark tile, with the next two stacked beside it", () => {
    const tiles = mosaic(9, true);
    expect(tiles[0]).toEqual({ span: 4, rows: 2, tone: "dark", lead: true });
    expect(tiles.slice(1, 3).map((t) => [t.span, t.rows])).toEqual([[2, 1], [2, 1]]);
    expect(widths(9, true)).toEqual([4, 2, 2, 2, 2, 2, 3, 3, 6]);
    expect(tiles.filter((t) => t.tone === "dark")).toHaveLength(1);
  });
  it("fills every row of six columns, whatever the count", () => {
    for (let count = 1; count <= 40; count++) for (const lead of [true, false]) {
      const tiles = mosaic(count, lead);
      expect(tiles).toHaveLength(count);
      // Columns taken, a two-row tile counted twice: always whole rows of six.
      expect(tiles.reduce((sum, t) => sum + t.span * t.rows, 0) % 6, `${count} tiles, lead ${lead}`).toBe(0);
    }
  });
  it("fills every row in each of the five arrangements, the large tile always first", () => {
    for (let variant = 0; variant < MOSAIC_VARIANTS; variant++) for (let count = 1; count <= 40; count++) {
      const tiles = mosaic(count, true, variant, variant);
      expect(tiles).toHaveLength(count);
      expect(tiles.reduce((sum, t) => sum + t.span * t.rows, 0) % 6, `${count} tiles, arrangement ${variant}`).toBe(0);
      expect(tiles[0]!.lead).toBe(true);
      expect(tiles.filter((t) => t.lead || t.tone === "dark")).toHaveLength(1);
    }
    // Eight tiles, as the board deals them.
    const widths8 = (variant: number) => mosaic(8, true, variant).map((t) => t.span);
    expect(widths8(1)).toEqual([4, 2, 2, 3, 3, 2, 2, 2]);
    expect(widths8(2)).toEqual([6, 2, 2, 2, 3, 3, 3, 3]);
    expect(widths8(3)).toEqual([4, 2, 2, 2, 2, 2, 3, 3]);
    expect(widths8(4)).toEqual([3, 3, 3, 2, 2, 2, 3, 3]);
    expect(mosaic(8, true, 1)[0]).toMatchObject({ col: 3, row: 1 });
    expect(mosaic(8, true, 3)[0]).toMatchObject({ col: 1, row: 2 });
    expect(mosaic(8, true, 4)[0]).toMatchObject({ col: 4, row: 1, rows: 2 });
  });
  it("keeps the opening arrangement where there are too few tiles for another, and shifts the tones on request", () => {
    expect(mosaic(5, true, 3)).toEqual(mosaic(5, true, 0));
    expect(mosaic(8, true, 0, 2).slice(1, 4).map((t) => t.tone)).toEqual(["soft", "plain", "plain"]);
  });
  it("gives a lone fact the whole width and a lone neighbour the lead's height", () => {
    expect(mosaic(1, true)).toEqual([{ span: 6, rows: 1, tone: "dark", lead: true }]);
    expect(mosaic(2, true).map((t) => [t.span, t.rows])).toEqual([[4, 2], [2, 2]]);
  });
  it("has no lead on a later page, and repeats the tones in one order", () => {
    const tiles = mosaic(5, false);
    expect(tiles.some((t) => t.lead || t.tone === "dark")).toBe(false);
    expect(widths(5, false)).toEqual([2, 2, 2, 3, 3]);
    expect(tiles.map((t) => t.tone)).toEqual(["warm", "plain", "soft", "plain", "plain"]);
    expect(mosaic(0, true)).toEqual([]);
  });
});

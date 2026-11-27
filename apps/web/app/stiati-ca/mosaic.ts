/*
 * /stiati-ca as a mosaic (owner, 27 November 2026: the single column of equal cards felt dry; „prima variantă e
 * super”). A grid of six columns. On the first page one fact is the large dark tile; the rest go in rows of three
 * tiles and of two. The last row is widened so it never leaves a hole. Tones repeat in a fixed order; on a phone the
 * grid is one column.
 *
 * The same day: „Alte fapte” deals the tiles again, and the look changes with them. Five arrangements (`variant`):
 *   0  the large tile at the left, four columns by two rows, two tiles stacked beside it (the page as it opens);
 *   1  the same block mirrored: the large tile at the right;
 *   2  the large tile as a band across the whole width;
 *   3  a row of three first, then the large tile's block;
 *   4  halves: the large tile takes the right half, two wide tiles are stacked at the left.
 * The large tile is always first in the list (so first on a phone and for a screen reader); where it does not sit at
 * the top left it carries its own column and row, and the others flow round it.
 */
export type TileTone = "dark" | "warm" | "soft" | "plain";
export interface Tile { span: 2 | 3 | 4 | 6; rows: 1 | 2; tone: TileTone; lead: boolean; col?: number; row?: number }
export const MOSAIC_VARIANTS = 5;
/** Under this many tiles only the opening arrangement holds without a hole. */
const VARIED_FROM = 6;

const TONES: TileTone[] = ["warm", "plain", "soft", "plain", "plain", "plain", "soft"];

export function mosaic(count: number, withLead: boolean, variant = 0, toneShift = 0): Tile[] {
  if (count <= 0) return [];
  const v = withLead && count >= VARIED_FROM ? ((variant % MOSAIC_VARIANTS) + MOSAIC_VARIANTS) % MOSAIC_VARIANTS : 0;
  const tiles: Tile[] = [];
  const tone = () => TONES[(tiles.length - (withLead ? 1 : 0) + Math.abs(toneShift)) % TONES.length]!;
  const small = (span: Tile["span"], rows: Tile["rows"] = 1) => tiles.push({ span, rows, tone: tone(), lead: false });
  let left = count;
  if (withLead) {
    left -= 1;
    if (left === 0) tiles.push({ span: 6, rows: 1, tone: "dark", lead: true });
    else if (v === 1) tiles.push({ span: 4, rows: 2, tone: "dark", lead: true, col: 3, row: 1 });
    else if (v === 2) tiles.push({ span: 6, rows: 1, tone: "dark", lead: true });
    else if (v === 3) tiles.push({ span: 4, rows: 2, tone: "dark", lead: true, col: 1, row: 2 });
    else if (v === 4) tiles.push({ span: 3, rows: 2, tone: "dark", lead: true, col: 4, row: 1 });
    else tiles.push({ span: 4, rows: 2, tone: "dark", lead: true });
    // The row above the block, where the arrangement has one.
    if (v === 3) { for (let i = 0; i < 3; i++) small(2); left -= 3; }
    // The tiles stacked beside the large one; a lone neighbour is as tall as it.
    if (v !== 2) {
      const beside = Math.min(2, left);
      for (let i = 0; i < beside; i++) small(v === 4 ? 3 : 2, beside === 1 ? 2 : 1);
      left -= beside;
    }
  }
  // The rows after the block: three tiles then two, or two then three.
  const rows = v === 1 || v === 3 ? [2, 3] : [3, 2];
  for (let row = 0; left > 0; row++) {
    const here = Math.min(rows[row % rows.length]!, left);
    for (let i = 0; i < here; i++) small(here === 1 ? 6 : here === 2 ? 3 : 2);
    left -= here;
  }
  return tiles;
}

export interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Squarified treemap layout (Bruls, Huizing & van Wijk 2000). Packs values into
 * `w`×`h` at (`x`,`y`) as rectangles whose areas are proportional to value and
 * whose aspect ratios stay close to 1. Pure geometry — rendered server-side.
 */
export function squarify<T extends { value: number }>(
  data: T[],
  x: number,
  y: number,
  w: number,
  h: number,
): (T & Tile)[] {
  const out: (T & Tile)[] = [];
  const positive = data.filter((d) => d.value > 0);
  const sum = positive.reduce((s, d) => s + d.value, 0);
  if (sum <= 0 || w <= 0 || h <= 0) return out;

  const items = positive.map((d) => ({ d, area: (d.value / sum) * (w * h) }));
  let rect = { x, y, w, h };

  const worst = (areas: number[], side: number): number => {
    const s = areas.reduce((a, v) => a + v, 0);
    const max = Math.max(...areas);
    const min = Math.min(...areas);
    const s2 = s * s;
    const side2 = side * side;
    return Math.max((side2 * max) / s2, s2 / (side2 * min));
  };

  let i = 0;
  while (i < items.length) {
    const side = Math.min(rect.w, rect.h);
    const row = [items[i]!];
    let j = i + 1;
    while (j < items.length) {
      const cur = row.map((r) => r.area);
      const next = [...cur, items[j]!.area];
      if (worst(next, side) <= worst(cur, side)) {
        row.push(items[j]!);
        j++;
      } else break;
    }
    const rowArea = row.reduce((a, r) => a + r.area, 0);
    if (rect.w >= rect.h) {
      const colW = rowArea / rect.h;
      let yy = rect.y;
      for (const r of row) {
        const hh = r.area / colW;
        out.push({ ...r.d, x: rect.x, y: yy, w: colW, h: hh });
        yy += hh;
      }
      rect = { x: rect.x + colW, y: rect.y, w: rect.w - colW, h: rect.h };
    } else {
      const rowH = rowArea / rect.w;
      let xx = rect.x;
      for (const r of row) {
        const ww = r.area / rowH;
        out.push({ ...r.d, x: xx, y: rect.y, w: ww, h: rowH });
        xx += ww;
      }
      rect = { x: rect.x, y: rect.y + rowH, w: rect.w, h: rect.h - rowH };
    }
    i = j;
  }
  return out;
}

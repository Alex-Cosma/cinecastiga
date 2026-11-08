/*
 * The geometry of /harta's hospital circles (owner, 8 November 2026), apart from the layer so the tests import it
 * without React: a UAT's centre from its path, a circle's radius from its beds, and the packing around a town.
 */

/** București as a whole (lib/map-capita.ts BUCHAREST_SIRUTA): no shape of its own, its hospitals sit at the city's centre. */
export const CITY = 179132;

/** A ring's points from the geometry's paths, whose only commands are "M x y", relative "l dx dy …" and "z". */
function rings(d: string): [number, number][][] {
  const out: [number, number][][] = [];
  let ring: [number, number][] = [], x = 0, y = 0, cmd = "";
  const tokens = d.match(/[Mlz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  for (let i = 0; i < tokens.length;) {
    const t = tokens[i]!;
    if (t === "M" || t === "l" || t === "z") {
      if (t === "z" && ring.length) { out.push(ring); ring = []; }
      cmd = t; i++; continue;
    }
    const a = Number(t), b = Number(tokens[i + 1]); i += 2;
    if (cmd === "M") { if (ring.length) out.push(ring); x = a; y = b; ring = [[x, y]]; cmd = "l"; } else { x += a; y += b; ring.push([x, y]); }
  }
  if (ring.length) out.push(ring);
  return out;
}

/** The area-weighted centre of a UAT's shape (its rings' shoelace sums), or its box's centre when the area is nil. */
export function pathCentroid(d: string): [number, number] | null {
  let area = 0, cx = 0, cy = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rings(d)) {
    for (let i = 0; i < r.length; i++) {
      const [x0, y0] = r[i]!, [x1, y1] = r[(i + 1) % r.length]!;
      const c = x0 * y1 - x1 * y0;
      area += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
      minX = Math.min(minX, x0); minY = Math.min(minY, y0); maxX = Math.max(maxX, x0); maxY = Math.max(maxY, y0);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return Math.abs(area) > 1e-9 ? [cx / (3 * area), cy / (3 * area)] : [(minX + maxX) / 2, (minY + maxY) / 2];
}

/** A circle's radius in screen pixels: its area proportional to the beds; a hospital without beds is a small ring. */
export const dotRadius = (beds: number | null | undefined): number => (beds && beds > 0 ? 3 + 13 * Math.sqrt(Math.min(beds, 2000) / 2000) : 3.5);
/** A school's circle (owner, 8 November 2026): its area proportional to its pupils, smaller than a hospital's (many share a town). */
export const pupilRadius = (pupils: number | null | undefined): number => (pupils && pupils > 0 ? 2.5 + 8.5 * Math.sqrt(Math.min(pupils, 3000) / 3000) : 3);

/**
 * Circles around their anchors without overlap: each town's circles start on a sunflower spiral around its centre,
 * the largest in the middle, then every overlapping pair is pushed apart while each circle is pulled back to its
 * anchor. Deterministic (the same input, the same picture). Radii and gap in the map's units.
 */
export function packDots(items: readonly { key: string; ax: number; ay: number; r: number }[], gap: number): Map<string, [number, number]> {
  const groups = new Map<string, number[]>();
  items.forEach((it, i) => { const k = `${it.ax.toFixed(3)},${it.ay.toFixed(3)}`; groups.set(k, [...(groups.get(k) ?? []), i]); });
  const x = new Float64Array(items.length), y = new Float64Array(items.length);
  for (const members of groups.values()) {
    const order = [...members].sort((a, b) => items[b]!.r - items[a]!.r || items[a]!.key.localeCompare(items[b]!.key));
    const mean = order.reduce((s, i) => s + items[i]!.r, 0) / order.length;
    order.forEach((i, n) => {
      const angle = n * 2.399963, dist = n === 0 ? 0 : Math.sqrt(n) * mean * 1.6;
      x[i] = items[i]!.ax + Math.cos(angle) * dist; y[i] = items[i]!.ay + Math.sin(angle) * dist;
    });
  }
  for (let step = 0; step < 220; step++) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        let dx = x[j]! - x[i]!, dy = y[j]! - y[i]!;
        let dist = Math.hypot(dx, dy);
        const min = items[i]!.r + items[j]!.r + gap;
        if (dist >= min) continue;
        if (dist < 1e-9) { dx = Math.cos(i + j); dy = Math.sin(i + j); dist = 1; }
        const push = (min - dist) / 2;
        x[i]! -= (dx / dist) * push; y[i]! -= (dy / dist) * push;
        x[j]! += (dx / dist) * push; y[j]! += (dy / dist) * push;
      }
    }
    const pull = step < 180 ? 0.03 : 0;
    for (let i = 0; i < items.length; i++) { x[i]! += (items[i]!.ax - x[i]!) * pull; y[i]! += (items[i]!.ay - y[i]!) * pull; }
  }
  return new Map(items.map((it, i) => [it.key, [x[i]!, y[i]!]]));
}

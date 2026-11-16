import { describe, expect, it } from "vitest";
import { fromView, glideFrames, mapping, viewUnder, type ViewBox } from "./camera";

// UX audit M-17: the camera is a transform of the map's group; the frames must show what today's viewBox showed.
const W = 1000, H = 707;
const screen = (v: ViewBox, p: [number, number]): [number, number] => { const m = mapping(v, W, H); return [m.s * p[0] + m.bx, m.s * p[1] + m.by]; };
const parse = (t: string) => t.match(/-?[\d.]+/g)!.map(Number) as [number, number, number, number, number, number];

describe("the map's camera", () => {
  const country: ViewBox = [0, 0, 1000, 707], county: ViewBox = [400, 120, 180, 140];
  it("centres a viewBox of another shape in the box (xMidYMid meet)", () => {
    const m = mapping(county, W, H);
    expect(m.s).toBeCloseTo(707 / 140);
    expect(screen(county, [490, 190])).toEqual([500, 353.5].map((x) => expect.closeTo(x, 6)));
  });
  it("draws under the new view exactly what the old view showed", () => {
    const [k, , , , cx, cy] = parse(fromView(country, county, W, H));
    for (const p of [[0, 0], [500, 300], [990, 700]] as [number, number][]) {
      const moved: [number, number] = [k * p[0] + cx, k * p[1] + cy];
      expect(screen(county, moved)[0]).toBeCloseTo(screen(country, p)[0], 1);
      expect(screen(county, moved)[1]).toBeCloseTo(screen(country, p)[1], 1);
    }
  });
  it("starts on the old view, ends with no transform, and eases out", () => {
    const frames = glideFrames(country, county, W, H, 24);
    expect(frames).toHaveLength(25);
    expect(frames[0]).toBe(fromView(country, county, W, H));
    expect(frames[24]).toBe("none");
    const scale = (f: string) => parse(f)[0];
    // ease-out: more of the way is done in the first half than in the second
    expect(scale(frames[0]!)).toBeLessThan(scale(frames[12]!));
  });
  it("finds the view on screen from a camera caught mid-way", () => {
    const [k, , , , cx, cy] = parse(fromView(country, county, W, H));
    const seen = viewUnder(county, k, cx, cy, W, H);
    expect(mapping(seen, W, H).s).toBeCloseTo(mapping(country, W, H).s, 4);
    expect(screen(seen, [250, 250])[0]).toBeCloseTo(screen(country, [250, 250])[0], 1);
  });
});

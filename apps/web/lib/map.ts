import mapData from "./ro-map.json" with { type: "json" };
import { COUNTIES } from "./counties";

/**
 * Precomputed Romania county map: projected SVG paths keyed by diacritic-folded
 * county name, matching `spend_by_county.county`. Geometry is GADM-derived
 * (non-commercial) — swap to Natural Earth (public domain) before wider release.
 */
export interface CountyShape {
  key: string;
  label: string;
  d: string;
}

export interface CountyMap {
  width: number;
  height: number;
  shapes: CountyShape[];
}

// Unicode combining-marks range (U+0300–U+036F), built from code points to keep
// the source ASCII-only.
const COMBINING = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");

/** Diacritic-fold + lowercase — the join key between data and map geometry. */
export function foldCounty(s: string): string {
  return s.normalize("NFD").replace(COMBINING, "").toLowerCase().trim();
}

// The geometry file carries mostly undiacritised labels ("Arges", but
// "Maramureș"); display the same spelling as every other county list.
const DISPLAY = new Map(COUNTIES.map((name) => [foldCounty(name), name]));

export const countyMap: CountyMap = {
  width: mapData.width,
  height: mapData.height,
  shapes: mapData.shapes.map((shape) => ({ ...shape, label: DISPLAY.get(shape.key) ?? shape.label })),
};

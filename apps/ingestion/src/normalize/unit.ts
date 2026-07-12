/**
 * Non-standard unit resolution (core-layer DEC-002). `unit_raw` is ALWAYS
 * kept; canonical unit + factor come from the `core.unit_map` reference and
 * are null when the raw unit isn't mapped (never guessed).
 */
import { foldDiacritics } from "./name.js";

/** Canonicalize a raw unit string to its map key (lowercased, folded, trimmed). */
export function unitKey(raw: string): string {
  return foldDiacritics(raw).replace(/\s+/g, " ").trim();
}

export interface ResolvedUnit {
  unitRaw: string | null;
  unitCanonical: string | null;
  unitFactor: string | null;
}

export interface UnitMapping {
  canonicalUnit: string;
  factor: string;
}

/** Resolve a raw unit against the map (keyed by `unitKey`). */
export function resolveUnit(
  raw: string | null | undefined,
  map: Map<string, UnitMapping>,
): ResolvedUnit {
  if (!raw) return { unitRaw: raw ?? null, unitCanonical: null, unitFactor: null };
  const hit = map.get(unitKey(raw));
  return {
    unitRaw: raw,
    unitCanonical: hit?.canonicalUnit ?? null,
    unitFactor: hit?.factor ?? null,
  };
}

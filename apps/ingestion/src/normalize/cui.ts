/**
 * Romanian CUI / CIF canonicalization + checksum (core-layer DEC-003).
 *
 * The `RO` prefix means VAT-registered only — the same legal entity exists
 * with or without it, so it is stripped for identity. Canonical form is the
 * integer value (leading zeros trimmed). Only a checksum-valid CUI may be used
 * as an entity merge key; foreign suppliers / CNPs fail the checksum and must
 * fall through to name/id resolution rather than being merged or discarded.
 */

/** Control key for the mod-11 check-digit algorithm. */
const KEY = [7, 5, 3, 2, 1, 7, 5, 3, 2] as const;

/**
 * Validate a bare numeric CUI (RO already stripped) against the official
 * mod-11 check-digit algorithm. 2–10 digits; last digit is the control.
 */
export function cuiIsValid(digits: string): boolean {
  if (!/^[0-9]{2,10}$/.test(digits)) return false;
  const control = Number(digits[digits.length - 1]);
  const body = digits.slice(0, -1).padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(body[i]) * KEY[i]!;
  let check = (sum * 10) % 11;
  if (check === 10) check = 0;
  return check === control;
}

export interface CanonicalCui {
  /** Canonical (RO-stripped, zero-trimmed) numeric string; may be invalid. */
  cui: string;
  /** True only if `cui` passes the checksum — the gate for using it as a merge key. */
  valid: boolean;
}

/**
 * Canonicalize a raw CUI token that may carry an `RO` prefix, spaces, or
 * punctuation. Never throws; returns `valid: false` for anything that isn't a
 * checksum-valid Romanian CUI (caller keeps the raw value, doesn't merge on it).
 */
export function canonicalCui(raw: string | null | undefined): CanonicalCui {
  if (!raw) return { cui: "", valid: false };
  let s = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (s.startsWith("RO")) s = s.slice(2);
  s = s.replace(/^0+/, "");
  if (s === "") return { cui: "", valid: false };
  return { cui: s, valid: cuiIsValid(s) };
}

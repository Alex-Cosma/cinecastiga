/**
 * CPV parsing + validation (core-layer DEC-001). The raw string is ALWAYS
 * kept; a code is only marked valid when it parses AND exists in the seeded
 * `core.cpv_codes` catalog. Unknown/malformed → `cpvValid=false`, never dropped.
 */

export interface ParsedCpv {
  /** Canonical code `NNNNNNNN-D` if parseable, else null. */
  code: string | null;
  /** Whatever we were handed, verbatim (for the `cpv_raw` column). */
  raw: string | null;
}

// LIST payloads: "15800000-6 - Diverse produse alimentare (Rev.2)".
const LIST_RE = /^\s*(\d{8}-\d)\b/;

/** Extract the code from a jammed LIST CPV string. */
export function parseCpvString(raw: string | null | undefined): ParsedCpv {
  if (!raw) return { code: null, raw: raw ?? null };
  const m = LIST_RE.exec(raw);
  return { code: m ? m[1]! : null, raw };
}

/**
 * Extract the code from a DETAIL `cpvCode` object
 * (`{ id, text, localeKey: "45453000-7" }`). `localeKey` is the clean code.
 */
export function parseCpvObject(
  obj:
    | { text?: string | null | undefined; localeKey?: string | null | undefined }
    | null
    | undefined,
): ParsedCpv {
  if (!obj) return { code: null, raw: null };
  const raw = obj.text ?? obj.localeKey ?? null;
  const key = obj.localeKey?.trim();
  const code = key && /^\d{8}-\d$/.test(key) ? key : parseCpvString(raw).code;
  return { code, raw };
}

export interface ResolvedCpv {
  cpvCode: string | null;
  cpvValid: boolean;
  cpvRaw: string | null;
}

/** Validate a parsed code against the catalog set. Keeps raw regardless. */
export function resolveCpv(parsed: ParsedCpv, catalog: Set<string>): ResolvedCpv {
  const valid = parsed.code != null && catalog.has(parsed.code);
  return {
    cpvCode: valid ? parsed.code : null,
    cpvValid: valid,
    cpvRaw: parsed.raw,
  };
}

/**
 * Resolve a TED/eForms CPV, which is the 8-digit code WITHOUT the check digit
 * (e.g. '33100000'). The check digit is deterministic from the 8 digits, so a
 * prefix map (8-digit → canonical 'NNNNNNNN-D') recovers the catalog code.
 * Raw is always kept; unknown prefixes stay invalid.
 */
export function resolveCpvPrefix(
  raw: string | null | undefined,
  prefixMap: Map<string, string>,
): ResolvedCpv {
  if (!raw) return { cpvCode: null, cpvValid: false, cpvRaw: raw ?? null };
  const m = /(\d{8})/.exec(raw);
  const code = m ? (prefixMap.get(m[1]!) ?? null) : null;
  return { cpvCode: code, cpvValid: code != null, cpvRaw: raw };
}

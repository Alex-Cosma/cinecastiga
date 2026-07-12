/**
 * Romanian organization-name normalization for the fuzzy suggestion tier
 * (core-layer DEC-003). The normalized form is used ONLY to generate
 * review suggestions — never to auto-merge.
 *
 * Rules that matter:
 *  - Fold diacritics, including BOTH the cedilla (ş U+015F, ţ U+0163) and the
 *    correct comma-below (ș U+0219, ț U+021B) variants — both occur in SICAP
 *    and the official EU CPV data.
 *  - Split legal-form tokens (SRL/SA/PFA/RA…) into a separate field; left in
 *    the match string they dominate trigram overlap and cause false merges.
 *  - KEEP the ordinal and locality (`nr 4`, `Lugoj`): for public institutions
 *    they ARE the identity (`Grădinița nr. 4 Lugoj` ≠ `nr. 5 Lugoj`).
 */

const DIACRITIC_MAP: Record<string, string> = {
  ă: "a", â: "a", î: "i",
  ș: "s", ş: "s", ț: "t", ţ: "t",
};

/** Lowercase + fold Romanian diacritics (both cedilla and comma-below). */
export function foldDiacritics(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ăâîșşțţ]/g, (c) => DIACRITIC_MAP[c] ?? c)
    // strip any remaining combining marks (NFD) as a safety net
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Company legal-form suffixes. Kept deliberately unambiguous — short tokens
// like "ii"/"if"/"cn" are excluded because they collide with real name words
// (e.g. "Colegiul Național C.N. …"). Matched as whole tokens after dots are
// removed (so "S.R.L." collapses to "srl").
const LEGAL_FORMS = ["srl-d", "srl", "sa", "sca", "snc", "scs", "pfa", "ra"];

// Positional prefix markers: stripped from the match string but NOT recorded as
// the legal form ("S.C." = "societate comercială", a lead-in, not the form).
const PREFIX_MARKERS = ["sc"];

export interface NormalizedName {
  /** Diacritic-folded, legal-form-stripped, whitespace-collapsed match string. */
  normalized: string;
  /** The legal-form token detected and removed, if any (e.g. "srl"). */
  legalForm: string | null;
}

/**
 * Produce the fuzzy-match string + detected legal form. Keeps numbers and
 * locality tokens intact.
 */
export function normalizeName(raw: string): NormalizedName {
  // Fold, remove dots (so S.R.L. collapses), turn other punctuation into spaces.
  let s = foldDiacritics(raw)
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  let legalForm: string | null = null;
  const tokens = s.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (const tok of tokens) {
    if (PREFIX_MARKERS.includes(tok)) continue; // drop, not a legal form
    if (LEGAL_FORMS.includes(tok)) {
      if (legalForm === null) legalForm = tok; // first real form wins
      continue;
    }
    kept.push(tok);
  }
  s = kept.join(" ").trim();
  return { normalized: s, legalForm };
}

export interface ParsedEntityString {
  /** Leading CUI token as it appeared (e.g. "RO21255449" or "29074847"), or null. */
  cuiRaw: string | null;
  /** The remaining name text (e.g. "S.C. INGRID S.R.L."). */
  name: string;
}

/**
 * Split a SICAP mashed "CUI name" string into its parts. Handles the RO-prefix
 * asymmetry (suppliers `"RO21255449 S.C. INGRID S.R.L."`, authorities
 * `"29074847 Gradinita PP nr. 4 Lugoj"`). If the leading token isn't a
 * CUI-shaped value, the whole string is treated as the name.
 */
export function parseEntityString(raw: string): ParsedEntityString {
  const trimmed = raw.trim();
  const m = /^(RO)?(\d{2,10})\s+(.+)$/i.exec(trimmed);
  if (m) {
    return { cuiRaw: `${m[1] ?? ""}${m[2]}`, name: m[3]!.trim() };
  }
  return { cuiRaw: null, name: trimmed };
}

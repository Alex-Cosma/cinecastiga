/**
 * Foreign-supplier identity (entity resolution tier 2b). Above-threshold/TED
 * winners are often non-Romanian and have no RO CUI to merge on. We instead
 * dedup them on (country, normalized foreign registration id), and flag them so
 * the app can surface/filter foreign-won contracts. Country codes are unified to
 * ISO-2 (TED eForms uses ISO-3; e-licitatie + TED F03 use ISO-2).
 */

/** ISO-3 → ISO-2 for the countries that actually appear as RO-tender winners. */
const ISO3_TO_ISO2: Record<string, string> = {
  ROU: "RO", DEU: "DE", ITA: "IT", FRA: "FR", ESP: "ES", NLD: "NL", BEL: "BE",
  AUT: "AT", POL: "PL", HUN: "HU", BGR: "BG", GRC: "GR", CZE: "CZ", SVK: "SK",
  SVN: "SI", HRV: "HR", PRT: "PT", IRL: "IE", DNK: "DK", SWE: "SE", FIN: "FI",
  LUX: "LU", LTU: "LT", LVA: "LV", EST: "EE", CYP: "CY", MLT: "MT", GBR: "GB",
  CHE: "CH", NOR: "NO", USA: "US", TUR: "TR", CHN: "CN", ISR: "IL", SRB: "RS",
  UKR: "UA", MDA: "MD", JPN: "JP", KOR: "KR", IND: "IN", RUS: "RU", CAN: "CA",
};

/** Normalize a country token (ISO-2 or ISO-3 or eForms 'ROU') to ISO-2; null if unusable. */
export function normCountry(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(s)) return s;
  if (/^[A-Z]{3}$/.test(s)) return ISO3_TO_ISO2[s] ?? s;
  return null;
}

/**
 * Stored country spellings that normCountry keeps as they are: the "UK" of
 * legacy TED and the eForms ISO-3 codes missing from ISO3_TO_ISO2 (data audit
 * F26). Used only to tell that two stored codes name the same country; stored
 * codes, normCountry and therefore the `foreign:` keys inside approved
 * contract-identity proofs do not change.
 */
const STORED_SPELLING_TO_ISO2: Record<string, string> = {
  UK: "GB", AUS: "AU", HKG: "HK", KAZ: "KZ", MKD: "MK", BIH: "BA", PER: "PE",
  ARG: "AR", BRA: "BR", COL: "CO", GTM: "GT", IDN: "ID", KEN: "KE", LKA: "LK",
  MEX: "MX", PHL: "PH", SGP: "SG", THA: "TH", TWN: "TW", UZB: "UZ", ZAF: "ZA",
};

/**
 * The ISO-2 country a stored country code names, for comparing two stored
 * codes ("UK" and "GB", "HKG" and "HK"). Null for an unknown 3-letter code or
 * anything else, so an unrecognised spelling never matches.
 */
export function countryIso2(raw: string | null | undefined): string | null {
  const s = raw?.trim().toUpperCase();
  if (!s) return null;
  const spelled = STORED_SPELLING_TO_ISO2[s];
  if (spelled) return spelled;
  if (/^[A-Z]{2}$/.test(s)) return s;
  if (/^[A-Z]{3}$/.test(s)) return ISO3_TO_ISO2[s] ?? null;
  return null;
}

/**
 * Normalize a foreign registration/VAT id for use as a merge key. Returns null
 * for values too short or placeholder-like to trust (avoids merging distinct
 * firms onto a junk id).
 */
export function normForeignId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (s.length < 4) return null;
  if (/^0+$/.test(s)) return null;
  return s;
}

export interface EntityIdentity {
  /** ISO-2 country, or null if unknown. */
  countryCode: string | null;
  /** A non-RO supplier (country known and not RO) — the display/filter flag. */
  isForeign: boolean;
  /**
   * Tier-2b merge id: `(country, mergeIdNorm)` dedups any entity that lacks a
   * valid RO CUI (foreign winners AND RO winners with a garbled/non-checksum id
   * that only ever appear via TED, so tier-1 SICAP id + tier-2 CUI both miss).
   * Null when the id isn't substantive enough to trust as a key.
   */
  mergeIdNorm: string | null;
}

/**
 * Derive entity identity from a country token + the raw id string. `isForeign`
 * is country-based (for flagging). `mergeIdNorm` is produced for ANY substantive
 * id regardless of country — it's only USED as a merge key when the RO CUI is
 * invalid (see resolve-entity tier 2b), so valid-CUI RO entities are unaffected.
 */
export function entityIdentity(
  countryRaw: string | null | undefined,
  idRaw: string | null | undefined,
): EntityIdentity {
  const countryCode = normCountry(countryRaw);
  return {
    countryCode,
    isForeign: countryCode != null && countryCode !== "RO",
    mergeIdNorm: normForeignId(idRaw),
  };
}

/**
 * VAT-number formats (the part after the country prefix, separators removed)
 * of the countries whose firms win Romanian direct awards. EU formats follow
 * VIES; CHE is the Swiss UID, NO the Norwegian organisation number. Exact
 * lengths keep an ordinary name ("DE 3 ...", "IT 2000 ...") from being read as
 * an identifier. NL also occurs without its "B01" suffix in SEAP.
 */
const VAT_FORMATS: Readonly<Record<string, RegExp>> = {
  AT: /^U\d{8}$/, BE: /^[01]?\d{9}$/, BG: /^\d{9,10}$/, CY: /^\d{8}[A-Z]$/,
  CZ: /^\d{8,10}$/, DE: /^\d{9}$/, DK: /^\d{8}$/, EE: /^\d{9}$/, EL: /^\d{9}$/,
  ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/, FI: /^\d{8}$/, FR: /^[A-HJ-NP-Z0-9]{2}\d{9}$/,
  HR: /^\d{11}$/, HU: /^\d{8}$/, IE: /^(?:\d{7}[A-W][A-I]?|\d[A-Z+*]\d{5}[A-W])$/,
  IT: /^\d{11}$/, LT: /^(?:\d{9}|\d{12})$/, LU: /^\d{8}$/, LV: /^\d{11}$/,
  MT: /^\d{8}$/, NL: /^\d{9}(?:B\d{2})?$/, PL: /^\d{10}$/, PT: /^\d{9}$/,
  SE: /^\d{12}$/, SI: /^\d{8}$/, SK: /^\d{10}$/,
  GB: /^(?:\d{9}|\d{12}|GD\d{3}|HA\d{3})$/,
  CHE: /^\d{9}(?:MWST|TVA|IVA)?$/, NO: /^\d{9}(?:MVA)?$/,
};

/** VAT prefixes that differ from the ISO-2 country code. */
const VAT_PREFIX_COUNTRY: Readonly<Record<string, string>> = { EL: "GR", CHE: "CH" };

export interface VatPrefixedString {
  /** ISO-2 country named by the VAT prefix (EL → GR, CHE → CH). */
  country: string;
  /** The identifier as written, prefix included (e.g. "ATU 18379608"). */
  idRaw: string;
  /** The rest of the string: the firm's name. */
  name: string;
}

/**
 * Split a SEAP "VAT-number name" string whose identifier is a foreign VAT
 * number with its country prefix: "ATU14260100 ECOLAB GMBH",
 * "ATU 18379608 Shimadzu …", "CHE-105.678.859 scope solutions ag" (data audit
 * F18). The DA list gives such suppliers no other key, so the
 * (country, VAT number) pair is their tier-2b merge key. Returns null for any
 * string that does not start with a VAT number of the exact national format,
 * or that has no name after it. The RO prefix is parseEntityString's.
 */
export function parseVatPrefixedString(raw: string): VatPrefixedString | null {
  const s = raw.trim();
  // The identifier may be split by a space ("AT U16818807", "SE 5569416893 01"):
  // take the fewest leading tokens that form a valid VAT number.
  for (let k = 1; k <= 3; k++) {
    const m = new RegExp(`^(\\S+(?:\\s+\\S+){${k - 1}})\\s+(\\S.*)$`, "s").exec(s);
    if (!m) return null;
    const compact = m[1]!.toUpperCase().replace(/[\s.-]/g, "");
    const pfx = /^(CHE|[A-Z]{2})/.exec(compact)?.[1];
    if (!pfx) return null;
    const body = compact.slice(pfx.length);
    if (VAT_FORMATS[pfx]?.test(body)) {
      const name = m[2]!.replace(/^[\s,:;–-]+/, "").trim();
      if (!/\p{L}/u.test(name)) return null;
      return { country: VAT_PREFIX_COUNTRY[pfx] ?? pfx, idRaw: m[1]!, name };
    }
  }
  return null;
}

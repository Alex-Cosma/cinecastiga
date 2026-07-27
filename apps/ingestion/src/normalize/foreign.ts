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

const int = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 1 });

/** Calendar fields already normalized by the data layer; never shift them through Date. */
export function formatCalendarDate(value: string | null | undefined, withTime = false): string {
  if (!value) return "Dată neprecizată";
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(value);
  if (!match) return "Dată neprecizată";
  const [, year, month, day, hour, minute] = match;
  return `${day}.${month}.${year}${withTime && hour ? `, ${hour}:${minute}` : ""}`;
}

/** Romanian money formatting, compacted for headline figures (mld./mil. lei). */
export function formatRon(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  if (n >= 1e9) return `${dec.format(n / 1e9)} mld. lei`;
  if (n >= 1e6) return `${dec.format(n / 1e6)} mil. lei`;
  return `${int.format(n)} lei`;
}

/** Full RON amount with thousands separators (no compaction). */
export function formatRonFull(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? `${int.format(n)} lei` : "—";
}

export function formatInt(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? int.format(n) : "—";
}

/** Group an exact database decimal without converting to Number or rounding. */
export function formatExactDecimal(value: string | null | undefined): string {
  if (value == null || !/^-?\d+(?:\.\d+)?$/.test(value)) return "—";
  const [whole, fraction] = value.split(".");
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return fraction === undefined ? grouped : `${grouped},${fraction}`;
}

/**
 * Strip a leading CUI token some imported entity names carry (e.g.
 * "9813902 COSTALEX CONSTRUCT" → "COSTALEX CONSTRUCT"). Display-only cleanup
 * until the DA-import entity data is rebuilt.
 */
export function cleanName(name: string | null | undefined): string {
  if (!name) return "(fără nume)";
  return name.replace(/^(RO)?\d{2,10}\s+/i, "").trim() || name;
}

/**
 * Name-only guess that an entity is a commercial company (SRL/SA/RA). Used where
 * the legal form is not in the row (search hits): a company acting as a
 * contracting authority is a state- or council-owned "companie publică".
 */
export function looksLikeCompany(name: string | null | undefined): boolean {
  if (!name) return false;
  return /(^|[\s.,(])(s\.?\s?r\.?\s?l|s\.?\s?a|r\.?\s?a)\.?(?=$|[\s.,)])/i.test(name);
}

/**
 * ONRC birth dates that cannot belong to a living legal representative: before
 * 1910 (aged 116+ in 2026; 0002-06-20 and 1000-01-01 occur) or under 16 in the
 * year of the ONRC snapshot, which also covers future dates (2074, 9999-01-01).
 * The 4 October repair kept these as audit cases, without invented corrections
 * (docs/implementation/reference-import-integrity/VALIDATION.md). The database
 * and the person key (identity) are untouched; only the displayed year is
 * withheld and labelled.
 */
export const ONRC_BIRTH_YEAR_MIN = 1910;
export const ONRC_REPRESENTATIVE_MIN_AGE = 16;
export const IMPLAUSIBLE_BIRTH_DATE_LABEL = "dată de naștere ONRC neplauzibilă";

export function onrcBirthYear(
  year: number | string | null | undefined,
  snapshotYear: number | string | null | undefined,
): { birthYear: number | null; birthDateImplausible: boolean } {
  if (year == null || year === "") return { birthYear: null, birthDateImplausible: false };
  const y = Number(year);
  const ref = snapshotYear == null || snapshotYear === "" ? NaN : Number(snapshotYear);
  const max = (Number.isInteger(ref) ? ref : new Date().getUTCFullYear()) - ONRC_REPRESENTATIVE_MIN_AGE;
  if (!Number.isInteger(y) || y < ONRC_BIRTH_YEAR_MIN || y > max)
    return { birthYear: null, birthDateImplausible: true };
  return { birthYear: y, birthDateImplausible: false };
}

/** "n. 1963, Cluj-Napoca", the implausible-date label, or null when ONRC has no date. */
export function birthNote(p: {
  birthYear: number | null;
  birthDateImplausible?: boolean | undefined;
  birthLocality: string | null;
}): string | null {
  const loc = p.birthLocality ? `, ${p.birthLocality}` : "";
  if (p.birthYear) return `n. ${p.birthYear}${loc}`;
  if (p.birthDateImplausible) return `${IMPLAUSIBLE_BIRTH_DATE_LABEL}${loc}`;
  return null;
}

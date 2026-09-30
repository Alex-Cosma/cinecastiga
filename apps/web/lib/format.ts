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

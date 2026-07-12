const int = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 1 });

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

import { formatExactDecimal } from "./format";

/*
 * A signal's sums in lei (UX audit bug, 16 November 2026): a sum the build derived (a consortium's shares, a firm's
 * contracts over years) can carry 4 to 24 decimals („2.499.651.305,2034 lei”); lei have bani, two decimals. Such a sum is
 * rounded half up to bani, exactly, on the decimal string (no float); a value with two decimals or fewer is shown as
 * stored (formatExactDecimal), the source's exact value.
 */
export function baniDecimal(value: string): string {
  const m = /^(-?)(\d+)\.(\d{3,})$/.exec(value.trim());
  if (!m) return value.trim();
  const [, sign, whole, fraction] = m as unknown as [string, string, string, string];
  const cents = BigInt(whole + fraction.slice(0, 2)) + (Number(fraction[2]) >= 5 ? 1n : 0n);
  const text = cents.toString().padStart(3, "0");
  return `${sign}${text.slice(0, -2)}.${text.slice(-2)}`;
}

/** „2.499.651.305,20 lei”: a signal's sum, in bani at most. Null or not a number: null. */
export function signalLei(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const text = typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : value.trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  return `${formatExactDecimal(baniDecimal(text))} lei`;
}

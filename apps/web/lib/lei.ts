import { formatExactDecimal } from "./format";
import { baniDecimal } from "./signal-money";

/*
 * Decision A (owner, 20 November 2026): a record's amount, and any sum of records, reads to the leu everywhere; the exact
 * amount, with bani, opens on hover or tap (components/Lei.tsx), as the entity's records table has done since 2 November.
 * Both work on the decimal string, never through a float, so a large amount keeps its last digit. CSV files stay exact.
 */

const DECIMAL = /^-?\d+(?:\.\d+)?$/;

function decimalText(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const text = typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : value.trim();
  return DECIMAL.test(text) ? text : null;
}

/** The amount rounded half up to the leu, as a decimal string: "1234.5" → "1235", "-0.4" → "0". */
function leuDecimal(text: string): string {
  const negative = text.startsWith("-");
  const [whole = "0", fraction = ""] = text.replace(/^-/, "").split(".");
  const lei = BigInt(whole) + (Number(fraction[0] ?? "0") >= 5 ? 1n : 0n);
  return `${negative && lei !== 0n ? "-" : ""}${lei.toString()}`;
}

/** „12.346 lei”: a record's amount or a sum, to the leu. Null when the value is not a number. */
/** `unit`: true for „lei”, false for none, or the currency a contract was published in („EUR”). */
export function leiRounded(value: string | number | null | undefined, unit: boolean | string = true): string | null {
  const text = decimalText(value);
  if (text === null) return null;
  return withUnit(formatExactDecimal(leuDecimal(text)), unit);
}

const withUnit = (grouped: string, unit: boolean | string) => (unit === false ? grouped : `${grouped} ${unit === true ? "lei" : unit}`);

/**
 * „12.345,60 lei”: the exact amount, rounded half up to bani only past two decimals (a derived sum), when it has bani;
 * null for a whole amount (nothing to add to the rounded one) or a value that is not a number.
 */
export function leiExact(value: string | number | null | undefined, unit: boolean | string = true): string | null {
  const text = decimalText(value);
  if (text === null) return null;
  const bani = baniDecimal(text);
  if (!/\.\d*[1-9]/.test(bani)) return null;
  return withUnit(formatExactDecimal(bani), unit);
}

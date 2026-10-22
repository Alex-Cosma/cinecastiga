import { formatInt } from "./format";

/**
 * Romanian counted noun: "un contract", "2 contracte", "20 de contracte",
 * "101 contracte". Numbers whose last two digits are 00 or 20–99 take "de".
 * `one` is the full phrase for 1 ("un contract", "o achiziție directă").
 */
export function roCount(n: number, one: string, many: string): string {
  if (n === 1) return one;
  const lastTwo = Math.abs(n) % 100;
  const de = n !== 0 && (lastTwo === 0 || lastTwo >= 20);
  return `${formatInt(n)} ${de ? "de " : ""}${many}`;
}

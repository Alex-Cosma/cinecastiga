import { formatInt } from "./format";

/**
 * Romanian counted noun: "un contract", "2 contracte", "20 de contracte",
 * "101 contracte", "0 contracte". Numbers whose last two digits are 00 or
 * 20–99 take "de"; 0 never does. `one` is the full phrase for 1 ("un contract",
 * "o achiziție directă"). The one rule for the whole site: `countWords`
 * ("1 înregistrare") and the price pages' `countWord` call this (owner, 20 November 2026).
 */
export function roCount(n: number, one: string, many: string): string {
  if (n === 1) return one;
  return `${formatInt(n)} ${takesDe(n) ? "de " : ""}${many}`;
}

/** Whether the count takes „de” before its noun, for a number drawn apart from its words (an animated figure). */
export function takesDe(n: number): boolean {
  const lastTwo = Math.abs(Math.trunc(n)) % 100;
  return n !== 0 && (lastTwo === 0 || lastTwo >= 20);
}

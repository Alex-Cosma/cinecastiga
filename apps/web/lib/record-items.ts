import { sumDecimalStrings } from "./ask/evidence";
import { formatExactDecimal } from "./format";
import { roCount } from "./ro-count";

/*
 * The products of a direct acquisition, as the institution wrote them (UX audit Z7-16, Z7-17, bug "cantitatea fără
 * separator de mii"): each line's total is its quantity times its unit price, exactly, rounded to the ban; the lines add
 * up to a sum that the page compares with the closing value. Nothing is converted: units stay the institution's.
 */

const DECIMAL = /^-?\d+(?:\.\d+)?$/;

/** "16100.000" → "16100", "1.50" → "1.5": the number without the zeros the database keeps after it. */
export function trimDecimal(value: string): string {
  return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
}

/** A quantity as the reader reads it: "16.100", "1,5" (thousands separated, no bani padding). */
export function formatQuantity(value: string | null | undefined): string {
  if (value == null || !DECIMAL.test(value.trim())) return value?.trim() || "—";
  return formatExactDecimal(trimDecimal(value.trim()), { money: false });
}

/** quantity × unit price, exact, rounded half up to the ban; null when either is missing or not a number. */
export function lineTotal(quantity: string | null | undefined, price: string | null | undefined): string | null {
  const q = quantity?.trim(), p = price?.trim();
  if (!q || !p || !DECIMAL.test(q) || !DECIMAL.test(p)) return null;
  const parts = (v: string) => { const [w = "0", f = ""] = v.replace("-", "").split("."); return { n: BigInt(w + f) * (v.startsWith("-") ? -1n : 1n), scale: f.length }; };
  const a = parts(q), b = parts(p);
  const scale = a.scale + b.scale;
  let product = a.n * b.n;
  // Round to two decimals, half away from zero.
  if (scale > 2) {
    const div = 10n ** BigInt(scale - 2);
    const sign = product < 0n ? -1n : 1n;
    const abs = product * sign;
    product = sign * ((abs + div / 2n) / div);
  } else product *= 10n ** BigInt(2 - scale);
  const negative = product < 0n;
  const digits = (negative ? -product : product).toString().padStart(3, "0");
  return trimMoney(`${negative ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`);
}

/** "90.00" → "90", "34.50" stays: whole lei without ",00", bani always two digits. */
export function trimMoney(value: string): string {
  return value.endsWith(".00") ? value.slice(0, -3) : value;
}

export interface ItemsSum {
  /** The exact sum of the lines that have both a quantity and a unit price. */
  sum: string;
  /** How many lines have a total. */
  counted: number;
  lines: number;
  /** "Egală cu valoarea de închidere." or by how much it differs; null without a closing value or a counted line. */
  note: string | null;
}

export function itemsSum(items: readonly { quantity: string | null; unitPriceRon: string | null }[], closing: string | null): ItemsSum {
  const totals = items.map((it) => lineTotal(it.quantity, it.unitPriceRon)).filter((t): t is string => t !== null);
  const sum = trimMoney(sumDecimalStrings(totals.length ? totals : ["0"]));
  let note: string | null = null;
  if (closing != null && DECIMAL.test(closing) && totals.length) {
    const gap = trimMoney(sumDecimalStrings([sum, closing.startsWith("-") ? closing.slice(1) : `-${closing}`]));
    const zero = /^-?0(?:\.0+)?$/.test(gap);
    note = zero ? "Egală cu valoarea de închidere." : `Diferă de valoarea de închidere cu ${formatExactDecimal(gap.replace(/^-/, ""))} lei.`;
  }
  return { sum, counted: totals.length, lines: items.length, note };
}

/**
 * A direct acquisition without a title, named after its first products in the institution's own words (UX audit
 * Z7-17): "Ceapa, morcovi, lamai și încă 31 de produse". The unit at the end of a name ("CEAPA, KG", "Morcovi kg") and
 * the capitals go; no diacritic is added. Null without a usable name (the CPV category stays the title then).
 */
export function productsTitle(names: readonly (string | null | undefined)[]): string | null {
  // The unit only when it stands apart after a word ("CEAPA, KG"), not a size after a number ("Lapte 1 L", "140g").
  const clean = (s: string) => s.replace(/(?<!\d)[\s,;.]+(kg|kilogram|buc(?:ata|ăți|ati)?|bucată|l|litr[iu]|g|gr|ml|set|pachet|cutie)\.?\s*$/i, "")
    .replace(/[\s,;.]+$/, "").replace(/\s+/g, " ").trim();
  const words = names.map((n) => clean(n ?? "")).filter((n) => (n.match(/\p{L}/gu)?.length ?? 0) >= 3);
  const unique = [...new Map(words.map((w) => [w.toLocaleLowerCase("ro-RO"), w])).values()];
  if (!unique.length) return null;
  const first = unique.slice(0, 3).map((w) => w.toLocaleLowerCase("ro-RO"));
  const rest = names.length - first.length;
  const head = first.length > 1 ? `${first.slice(0, -1).join(", ")}${rest > 0 ? ", " : " și "}${first.at(-1)}` : first[0]!;
  const titled = head.charAt(0).toLocaleUpperCase("ro-RO") + head.slice(1);
  return rest > 0 ? `${titled} și încă ${rest === 1 ? "un produs" : roCount(rest, "un produs", "produse")}` : titled;
}

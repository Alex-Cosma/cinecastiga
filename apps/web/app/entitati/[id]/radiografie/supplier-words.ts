import { formatInt } from "../../../../lib/format";

/** A share as the relation table writes it: one decimal, and a tiny one never reads as nothing. */
export const sharePct = (n: number): string =>
  n > 0 && n < 0.0005 ? "<0,1%" : `${(n * 100).toLocaleString("ro-RO", { maximumFractionDigits: 1 })}%`;

/** A pair's records by channel: „2 contracte · 802 directe”, „un contract”, nothing for none. */
export function recordWords(r: { n: number; nDa: number }): string {
  return [
    r.n ? `${formatInt(r.n)} ${r.n === 1 ? "contract" : "contracte"}` : null,
    r.nDa ? `${formatInt(r.nDa)} ${r.nDa === 1 ? "directă" : "directe"}` : null,
  ].filter(Boolean).join(" · ");
}

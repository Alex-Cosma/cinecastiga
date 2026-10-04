/** Source formats only: no timezone conversion and no inferred birth dates. */
export function onrcDate(input: string | undefined): {
  value: string | null;
  format: "empty" | "date" | "date_time" | "invalid";
} {
  const s = input?.trim();
  if (!s) return { value: null, format: "empty" };
  const m = /^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?$/.exec(s);
  if (!m) return { value: null, format: "invalid" };
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!year || !month || month > 12 || !day || day > days[month - 1]! ||
      (m[4] !== undefined && (Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6]) > 59))) {
    return { value: null, format: "invalid" };
  }
  return { value: `${m[3]}-${m[2]}-${m[1]}`, format: m[4] === undefined ? "date" : "date_time" };
}

const METRICS: Record<string, RegExp> = {
  employees: /numar\s+mediu\s+de\s+salariati/i,
  net_turnover: /cifra\s+de\s+afaceri\s+neta/i,
  total_revenue: /^venituri\s+totale/i,
  total_expenses: /^cheltuieli\s+totale/i,
  profit_net: /^profit(?:ul)?\s+net\s*$/i,
  loss_net: /^pierdere(?:a)?\s+neta\s*$/i,
};

/** Each category/year defines its own indicator numbers. Never assume I18. */
export function financialSpecCodes(specText: string): Record<string, string> {
  const codes: Record<string, string> = {};
  for (const line of specText.split(/\r?\n/)) {
    const [label, code] = line.split(/[;,]/).map((s) => s?.trim());
    if (!label || !code) continue;
    for (const [metric, rx] of Object.entries(METRICS)) {
      if (!rx.test(label)) continue;
      const normalized = code.toUpperCase();
      if ((metric === "profit_net" || metric === "loss_net") && !/^I\d+$/.test(normalized)) {
        throw new Error(`Invalid financial indicator for ${metric}`);
      }
      if ((metric === "profit_net" || metric === "loss_net") && codes[metric] && codes[metric] !== normalized) {
        throw new Error(`Ambiguous financial spec for ${metric}`);
      }
      // Preserve the existing mapping for other metrics. Some ONG specs have
      // budget and actual revenue labels; changing that is a separate repair.
      if (!codes[metric]) codes[metric] = normalized;
    }
  }
  return codes;
}

/** Preserve exact decimal amounts, including zero; empty is not zero. */
export function financialDecimal(value: string | undefined): string | null {
  const s = value?.trim();
  if (!s) return null;
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(s)) throw new Error("Invalid financial decimal in source");
  return s;
}

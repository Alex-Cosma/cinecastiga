import { readFileSync } from "node:fs";
import { financialDecimal } from "./parsers.js";

/** "WEB_BL_BS_SL_AN2021.txt" → { category: "BL_BS_SL", fy: 2021 } */
export function parseName(name: string): { category: string; fy: number } | null {
  const m = /^WEB_?([A-Za-z_ ]+?)_?(?:AN)?_?(20\d\d)\.txt$/i.exec(name.trim());
  if (!m) return null;
  return { category: m[1]!.toUpperCase().replace(/_+$/, ""), fy: Number(m[2]) };
}

/**
 * The standard indicator layout (UU / BL_BS_SL / IR share it). Used when no
 * .csv spec ships for a category-year; header-name matching still applies.
 */
const STANDARD_CODES: Record<string, string> = {
  net_turnover: "I13",
  total_revenue: "I14",
  total_expenses: "I15",
  profit_net: "I18",
  loss_net: "I19",
  employees: "I20",
};

export interface FinancialRow {
  cui: string;
  year: number;
  caen: string | null;
  category: string;
  source_vintage: number;
  employees: number | null;
  net_turnover: string | null;
  total_revenue: string | null;
  total_expenses: string | null;
  profit_net: string | null;
  loss_net: string | null;
}

export function parseTxt(
  path: string,
  category: string,
  fy: number,
  vintage: number,
  codes: Record<string, string>,
  hasSpec: boolean,
): FinancialRow[] {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/);
  const header = (lines[0] ?? "").split(",").map((h) => h.trim().toUpperCase());
  const cuiIdx = header.indexOf("CUI");
  if (cuiIdx < 0) return [];
  const caenIdx = header.indexOf("CAEN");
  // Trust ONLY spec-matched labels. Each category has its own indicator layout
  // (bank I20 = "profit din activități întrerupte", NOT employees; ONG/IFN
  // report no employees at all) — a blanket I13/I20 fallback poisons them.
  // The standard layout may be assumed only when no spec ships AND the header
  // is exactly the standard shape (last indicator I20).
  const standardShape = ["UU", "BL_BS_SL", "IR"].includes(category) &&
    header.join(",") === ["CUI", "CAEN", ...Array.from({ length: 20 }, (_, i) => `I${i + 1}`)].join(",");
  const effective = hasSpec ? codes : standardShape ? STANDARD_CODES : {};
  const idx: Record<string, number> = {};
  for (const [metric, code] of Object.entries(effective)) {
    const i = header.indexOf(code);
    if (i < 0 && (metric === "profit_net" || metric === "loss_net")) {
      throw new Error(`MF spec indicator ${code} missing from header`);
    }
    if (i >= 0) idx[metric] = i;
  }
  const num = (cols: string[], i: number | undefined): number | null => {
    if (i === undefined) return null;
    const v = cols[i]?.trim();
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const decimal = (cols: string[], i: number | undefined): string | null =>
    i === undefined ? null : financialDecimal(cols[i]);
  // source garbage exists (a 2019 row declares 3.1e9 employees) — anything
  // outside Romania's plausible workforce is a filing error, not a value
  const empl = (cols: string[], i: number | undefined): number | null => {
    const n = num(cols, i);
    return n !== null && n >= 0 && n <= 2_000_000 ? n : null;
  };
  // keyed by CUI: a duplicate row in one file would break the batched upsert
  // ("cannot affect row a second time") — keep the last occurrence
  const byCui = new Map<string, FinancialRow>();
  for (let li = 1; li < lines.length; li++) {
    const line = lines[li]!;
    if (!line) continue;
    const cols = line.split(",");
    const cui = cols[cuiIdx]?.trim();
    if (!cui || !/^\d+$/.test(cui)) continue;
    byCui.set(cui, {
      cui,
      year: fy,
      caen: caenIdx >= 0 ? (cols[caenIdx]?.trim() || null) : null,
      category,
      source_vintage: vintage,
      employees: empl(cols, idx["employees"]),
      net_turnover: decimal(cols, idx["net_turnover"]),
      total_revenue: decimal(cols, idx["total_revenue"]),
      total_expenses: decimal(cols, idx["total_expenses"]),
      profit_net: decimal(cols, idx["profit_net"]),
      loss_net: decimal(cols, idx["loss_net"]),
    });
  }
  return [...byCui.values()];
}

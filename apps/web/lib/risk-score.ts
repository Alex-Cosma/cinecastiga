/**
 * The risk score of a profile (rf-2026.18, owner decision of 1 November 2026),
 * for the pages: shown as a percentage ("73%") with "risc · {bandă}". The
 * nightly build computes it (apps/ingestion/src/flags/score.ts with the
 * shared formula in packages/db/src/profile-flags.ts); this client-safe copy
 * only names bands and splits the score into points, and
 * risk-score.test.ts keeps it equal to the shared one.
 */
import { countWords } from "./ask/answer-text";
import { formatInt, formatRon } from "./format";

/** The criteria of the score, per role, in the order a profile lists them. */
export const RISK_CRITERIA = {
  authority: ["da_split", "da_round", "da_year_end", "da_concentration", "da_above_ceiling"],
  supplier: ["da_split", "da_round", "da_dependence", "da_above_ceiling"],
} as const;
export type RiskRole = keyof typeof RISK_CRITERIA;
export type RiskCriterion = (typeof RISK_CRITERIA)[RiskRole][number];

/** Each criterion at full strength (3) removes this share of what is left of 100. */
export const RISK_WEIGHT = 0.6;

export type RiskBand = "none" | "slab" | "moderat" | "puternic";
/** Lowest displayed score of each band: 0 · 20–39 · 40–67 · 68–100. */
export const RISK_BAND_MIN = { slab: 1, moderat: 40, puternic: 68 } as const;

export function riskBand(score: number): RiskBand {
  if (!(score > 0)) return "none";
  if (score >= RISK_BAND_MIN.puternic) return "puternic";
  if (score >= RISK_BAND_MIN.moderat) return "moderat";
  return "slab";
}

/** The band's word after "risc · ". */
export const RISK_BAND_WORD: Record<RiskBand, string> = { none: "niciun tipar găsit", slab: "slab", moderat: "moderat", puternic: "puternic" };
/** The pill's colour class (globals.css). */
export const RISK_BAND_CLASS: Record<RiskBand, string> = { none: "risk-none", slab: "risk-slab", moderat: "risk-mid", puternic: "risk-high" };

/** "73%"; the score is a whole number from 0 to 100. */
export const riskPercent = (score: number): string => `${formatInt(Math.round(score))}%`;

/** "risc · puternic", or "niciun tipar găsit" at 0. */
export const riskLabel = (score: number): string => {
  const band = riskBand(score);
  return band === "none" ? RISK_BAND_WORD.none : `risc · ${RISK_BAND_WORD[band]}`;
};

/** A stored score is 0–100; a profile built before rf-2026.18 has none. */
export type ScorePart = { x: number } & Record<string, unknown>;
export type ScoreParts = Partial<Record<RiskCriterion, ScorePart>>;

/**
 * Whole points per criterion that add up to the displayed score ("73% = 39 +
 * 34"): each criterion's share is its term in −ln(1 − score/100), rounded by
 * the largest remainders. Same as @seap/db scorePoints.
 */
export function riskPoints(parts: ScoreParts, score: number): Partial<Record<RiskCriterion, number>> {
  const codes = Object.keys(parts) as RiskCriterion[];
  const terms = codes.map((c) => -Math.log(1 - (RISK_WEIGHT * Math.min(3, Math.max(0, Number(parts[c]?.x) || 0))) / 3));
  const total = terms.reduce((a, b) => a + b, 0);
  const out: Partial<Record<RiskCriterion, number>> = {};
  if (!(total > 0) || !(score > 0)) { for (const c of codes) out[c] = 0; return out; }
  const exact = terms.map((t) => (score * t) / total);
  const floors = exact.map(Math.floor);
  let rest = score - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - floors[i]!, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) { if (rest <= 0) break; floors[i]! += 1; rest -= 1; }
  codes.forEach((c, i) => { out[c] = floors[i]!; });
  return out;
}

const n = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0);
/** A share as a whole percentage ("13%"); a non-zero share under 0.5% says "sub 1%". */
const pct = (share: number): string => (share > 0 && share < 0.005 ? "sub 1%" : `${formatInt(Math.round(share * 100))}%`);

/**
 * The plain facts behind a criterion of one profile, terse: "3 grupuri · 13%
 * din valoare", "14 achiziții la 96–100% din plafon". The partner's name, where
 * there is one, is the caller's (a link).
 */
export function riskFact(code: RiskCriterion, part: ScorePart): string {
  switch (code) {
    case "da_split": {
      const a2 = n(part.annex2Share);
      return `${countWords(n(part.groups), "grup", "grupuri")} · ${pct(n(part.share))} din valoare`
        + (a2 >= 0.005 ? ` (plus ${pct(a2)} în CPV din Anexa 2)` : "");
    }
    case "da_round":
      return `${countWords(n(part.n), "achiziție", "achiziții")} la 96–100% din plafon (${pct(n(part.share))})`;
    case "da_year_end": {
      const years = Array.isArray(part.years) ? (part.years as { y: number; pct: number }[]) : [];
      return years.length
        ? `decembrie: ${years.map((y) => `${y.y} (${pct(n(y.pct))} din an)`).join(", ")}`
        : "vârf în decembrie";
    }
    case "da_concentration":
      return `${pct(n(part.share))} din valoare la un singur furnizor`;
    case "da_dependence":
      return `${pct(n(part.share))} din vânzări la o singură instituție, ${pct(n(part.partnerShare))} din achizițiile ei directe`;
    case "da_above_ceiling":
      return `${countWords(n(part.n), "achiziție", "achiziții")} peste plafon · ${formatRon(n(part.value))} (${pct(n(part.share))} din valoare)`;
  }
}

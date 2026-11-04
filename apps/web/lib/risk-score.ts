/**
 * The risk score of a profile (rf-2026.20, owner decisions of 3 November
 * 2026), for the pages: shown as "70 din 100" (never a percentage) with
 * "risc · {bandă}". The
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
  supplier: ["da_split", "da_round", "da_dependence", "da_above_ceiling", "da_capacity"],
} as const;
export type RiskRole = keyof typeof RISK_CRITERIA;
export type RiskCriterion = (typeof RISK_CRITERIA)[RiskRole][number];

/**
 * The rf-2026.18–19 weight: each criterion at full strength (3) removed this
 * share of what was left of 100. Only for splitting the score of a profile
 * built before rf-2026.20, whose parts carry no stored points.
 */
const LEGACY_RISK_WEIGHT = 0.6;

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

/** "70 din 100"; the score is a whole number from 0 to 100, not a percentage. */
export const riskScoreText = (score: number): string => `${formatInt(Math.round(score))} din 100`;

/** "risc · puternic", or "niciun tipar găsit" at 0. */
export const riskLabel = (score: number): string => {
  const band = riskBand(score);
  return band === "none" ? RISK_BAND_WORD.none : `risc · ${RISK_BAND_WORD[band]}`;
};

/**
 * Why a profile's score reads differently (marts.entity_flags.score_note,
 * rf-2026.20): the buyer's regime or an in-house firm. Shown as a hover next
 * to the score, never inline.
 */
export const RISK_SCORE_NOTE: Record<string, { title: string; text: string }> = {
  association: { title: "Asociație", text: "Asociație privată care cumpără cu bani publici. Regimul ei de achiziție nu e verificat." },
  private_buyer: { title: "Cumpărător privat", text: "Cumpărător privat: plafoanele achiziției directe nu i se aplică. Contează doar prețurile lipite de plafon și decembrie." },
  inhouse: { title: "Firmă in-house", text: "Firma instituției care o deține (in-house). Nu primește scor." },
};

/**
 * A stored score is 0–100; a profile built before rf-2026.18 has none. Since
 * rf-2026.20 each part carries its whole points (`pts`, adding up to the score).
 */
export type ScorePart = { x: number; pts?: number } & Record<string, unknown>;
export type ScoreParts = Partial<Record<RiskCriterion, ScorePart>>;

/**
 * Whole points per criterion that add up to the displayed score ("70 din 100
 * = 39 + 31"). A profile built since rf-2026.20 stores them (`pts`, from
 * @seap/db scorePoints); an older one is split by each criterion's term in
 * −ln(1 − score/100) under its own weight, rounded by the largest remainders.
 */
export function riskPoints(parts: ScoreParts, score: number): Partial<Record<RiskCriterion, number>> {
  const codes = Object.keys(parts) as RiskCriterion[];
  const out: Partial<Record<RiskCriterion, number>> = {};
  if (codes.length && codes.every((c) => typeof parts[c]?.pts === "number" && Number.isFinite(parts[c]!.pts))) {
    for (const c of codes) out[c] = parts[c]!.pts!;
    return out;
  }
  const terms = codes.map((c) => -Math.log(1 - (LEGACY_RISK_WEIGHT * Math.min(3, Math.max(0, Number(parts[c]?.x) || 0))) / 3));
  const total = terms.reduce((a, b) => a + b, 0);
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

/** A ratio with one decimal, Romanian comma ("2,4"). */
const ratioWords = (r: number): string => (Math.round(r * 10) / 10).toFixed(1).replace(".", ",").replace(/,0$/, "");
/** " · la 4 instituții" on a firm's buyer-duty criterion spread over 3+ institutions. */
const partnersTail = (role: RiskRole | undefined, partners: number): string =>
  role === "supplier" && partners >= 3 ? ` · la ${countWords(partners, "instituție", "instituții")}` : "";

/**
 * The plain facts behind a criterion of one profile, terse: "3 grupuri · 13%
 * din valoare", "14 achiziții la 96–100% din plafon · așteptat ~4". The
 * partner's name, where there is one, is the caller's (a link). The role,
 * where the caller knows it, adds how many institutions a firm's buyer-duty
 * criterion spreads over.
 */
export function riskFact(code: RiskCriterion, part: ScorePart, role?: RiskRole): string {
  switch (code) {
    case "da_split": {
      // rf-2026.20 stores rawShare (plain share of value) next to the weighted share; older builds only share.
      const share = part.rawShare != null ? n(part.rawShare) : n(part.share);
      return `${countWords(n(part.groups), "grup", "grupuri")} · ${pct(share)} din valoare` + partnersTail(role, n(part.partners));
    }
    case "da_round":
      return part.expected != null
        ? `${countWords(n(part.n), "achiziție", "achiziții")} la 96–100% din plafon · așteptat ~${formatInt(Math.round(n(part.expected)))}`
        : `${countWords(n(part.n), "achiziție", "achiziții")} la 96–100% din plafon`;
    case "da_year_end": {
      const years = Array.isArray(part.years) ? (part.years as { y: number; pct: number }[]) : [];
      return years.length
        ? `decembrie: ${years.map((y) => `${y.y} (${pct(n(y.pct))} din an)`).join(", ")}`
        : "decembrie peste instituțiile de același tip";
    }
    case "da_concentration":
      return `${pct(n(part.share))} din valoare la un singur furnizor, fără achiziția lui cea mai mare`;
    case "da_dependence":
      return `${pct(n(part.share))} din vânzări la o singură instituție, ${pct(n(part.partnerShare))} din achizițiile ei directe`
        + (part.capture === true ? " · peste capacitatea firmei" : "");
    case "da_above_ceiling":
      return `${countWords(n(part.n), "achiziție", "achiziții")} peste plafon · ${formatRon(n(part.value))} (${pct(n(part.share))} din valoare)`
        + partnersTail(role, n(part.partners));
    case "da_capacity": {
      const young = part.young === true ? " · firmă nouă" : "";
      if (part.zeroStaff === true) return `${n(part.year)}: 0 angajați, ${formatRon(n(part.value))} în achiziții directe${young}`;
      if (part.implausible === true) return `${n(part.year)}: cifră de afaceri ${formatRon(n(part.turnover))}, ${formatRon(n(part.value))} în achiziții directe${young}`;
      return `${n(part.year)}: achiziții directe de ${ratioWords(n(part.ratio))}× cifra de afaceri (${formatRon(n(part.turnover))})${young}`;
    }
  }
}

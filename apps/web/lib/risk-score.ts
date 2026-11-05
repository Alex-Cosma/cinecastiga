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
/**
 * Lowest displayed score of each band: 0–9 · 10–39 · 40–67 · 68–100
 * (rf-2026.22, owner decision S9b: under 10 points is "fără semnal în scor";
 * the build stores such a profile with 0).
 */
export const RISK_BAND_MIN = { slab: 10, moderat: 40, puternic: 68 } as const;
/** The fewest DAs a profile needs for a score (rf-2026.22, owner decision S4b; @seap/db SCORE_MIN_DAS). */
export const RISK_MIN_DAS = 10;

export function riskBand(score: number): RiskBand {
  if (!(score >= RISK_BAND_MIN.slab)) return "none";
  if (score >= RISK_BAND_MIN.puternic) return "puternic";
  if (score >= RISK_BAND_MIN.moderat) return "moderat";
  return "slab";
}

/** The band's word after "risc · ". */
/** rf-2026.22 (owner decision M6): the top band reads "pronunțat"; its key stays `puternic`. */
export const RISK_BAND_WORD: Record<RiskBand, string> = { none: "fără semnal în scor", slab: "slab", moderat: "moderat", puternic: "pronunțat" };
/** The pill's colour class (globals.css). */
export const RISK_BAND_CLASS: Record<RiskBand, string> = { none: "risk-none", slab: "risk-slab", moderat: "risk-mid", puternic: "risk-high" };

/** "70 din 100"; the score is a whole number from 0 to 100, not a percentage. */
export const riskScoreText = (score: number): string => `${formatInt(Math.round(score))} din 100`;

/** "risc · pronunțat", or "fără semnal în scor" under 10. */
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
  private_buyer: { title: "Cumpărător privat", text: "Cumpărător privat: plafoanele achiziției directe nu i se aplică, deci nu are scor. Tiparele găsite apar doar ca observații." },
  inhouse: { title: "Firmă in-house", text: "Firma instituției care o deține (in-house). Nu primește scor." },
};

/**
 * A stored score is 0–100; a profile built before rf-2026.18 has none. Since
 * rf-2026.20 each part carries its whole points (`pts`, adding up to the score).
 */
export type ScorePart = { x: number; pts?: number } & Record<string, unknown>;
export type ScoreParts = Partial<Record<RiskCriterion, ScorePart>>;

/**
 * Why a profile with signals has no score (rf-2026.22): fewer than 10 DAs
 * (S4b), a private buyer (S10), or patterns worth under 10 points (S9b).
 * The signals themselves stay listed.
 */
export function riskNoScoreReason(p: { nDas: number; scoreNote: string | null; score: number }): string | null {
  if (p.score >= RISK_BAND_MIN.slab) return null;
  if (p.scoreNote === "private_buyer") return "Cumpărător privat: plafoanele nu i se aplică, deci tiparele de mai jos nu fac un scor.";
  if (p.scoreNote === "inhouse") return null;
  if (p.nDas < RISK_MIN_DAS) return `Sub ${RISK_MIN_DAS} achiziții directe: semnalele se văd, dar nu fac un scor.`;
  return "Tiparele găsite aduc sub 10 puncte: fără semnal în scor.";
}

/**
 * A repeated-purchase group that is recurring supply, not splitting
 * (rf-2026.22, owner decision S5; equal to @seap/db splitGroupRecurring,
 * kept so by risk-score.test.ts): medical supplies (CPV 33), or at least 12
 * orders averaging under 10% of the ceiling.
 */
export function riskSplitRecurring(g: { total: number; n: number; ceiling: number; cpvClass?: string | null }): "medical" | "small_orders" | null {
  if (String(g.cpvClass ?? "").trim().startsWith("33")) return "medical";
  if (g.n >= 12 && g.ceiling > 0 && g.total / g.n < 0.1 * g.ceiling) return "small_orders";
  return null;
}

/**
 * A profile without any record in the last 24 months is "istoric" (rf-2026.22,
 * owner decision S8): its score and evidence stay, the rankings leave it out
 * by default. `last` is its latest dated record (YYYY-MM-DD…), `today` the
 * day of the reading.
 */
export const RISK_HISTORIC_MONTHS = 24;
export function riskHistoric(last: string | null | undefined, today: Date = new Date()): boolean {
  if (!last || !/^\d{4}-\d{2}-\d{2}/.test(last)) return false;
  const cut = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - RISK_HISTORIC_MONTHS, today.getUTCDate()));
  return last.slice(0, 10) < cut.toISOString().slice(0, 10);
}

/** "comenzi repetate, fără acord-cadru": the observation a recurring group shows instead of points (S5). */
export const RISK_RECURRING_WORDS = "comenzi repetate, fără acord-cadru";

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
      // rf-2026.22 (S7): the lei next to the share, where the build stores them.
      const lei = part.value != null ? ` · ${formatRon(n(part.value))}` : "";
      return `${countWords(n(part.groups), "grup", "grupuri")}${lei} · ${pct(share)} din valoare` + partnersTail(role, n(part.partners));
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
      return `${pct(n(part.share))} din valoare la un singur furnizor, fără achiziția lui cea mai mare${part.value != null ? ` · ${formatRon(n(part.value))} cu ea` : ""}`;
    case "da_dependence":
      return `${pct(n(part.share))} din vânzări la o singură instituție${part.value != null ? ` (${formatRon(n(part.value))})` : ""}, ${pct(n(part.partnerShare))} din achizițiile ei directe`
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

/**
 * The criteria of the historical risk profile (marts.entity_flags): the
 * signals on direct acquisitions that make an institution's or a firm's risk
 * score, per role, in the order the answers list them. The flag marts build
 * (apps/ingestion) scores with them; Ask's risk cloud and the distribution
 * read the same codes (apps/web/lib/ask/spec.ts SCATTER_FLAGS,
 * peer-groups-shared.ts CRITERIA, kept equal by a test).
 *
 * Since rf-2026.18 (owner decision, 1 November 2026) the profile is a score
 * from 0 to 100, shown as a percentage: each criterion has a strength x from
 * 0 to 3 (its level 1–3 where met, continuous between the level thresholds),
 * and the strengths combine without letting one criterion dominate:
 * score = 100 × (1 − Π (1 − 0.6 · x / 3)). One criterion at full strength
 * gives 60; level 1 alone gives 20. "Finalizare rapidă" no longer counts.
 */
/**
 * The methodology of the signals and the risk score, stamped on every flag
 * (apps/ingestion/src/flags/methodology.ts keeps its history). A ready
 * publication records it; when it differs, the next scheduled run is full
 * (processing.ts), since a daily run keeps the previous risk.
 */
export const FLAGS_METHODOLOGY_VERSION = 'rf-2026.19';

export const PROFILE_FLAG_CODES = {
  authority: ['da_split', 'da_round', 'da_year_end', 'da_concentration', 'da_above_ceiling'],
  supplier: ['da_split', 'da_round', 'da_dependence', 'da_above_ceiling'],
} as const;
export type ProfileFlagRole = keyof typeof PROFILE_FLAG_CODES;
export type ProfileFlagCode = (typeof PROFILE_FLAG_CODES)[ProfileFlagRole][number];

/** How many criteria each role can meet. */
export const PROFILE_FLAGS_APPLICABLE = {
  authority: PROFILE_FLAG_CODES.authority.length,
  supplier: PROFILE_FLAG_CODES.supplier.length,
} as const;

/** Each criterion at full strength (x = 3) removes this share of what is left of 100. */
export const SCORE_WEIGHT = 0.6;
/** Levels 2 and 3 need a profile this large; below it a met criterion has strength 1. */
export const SCORE_GATE = { minDas: 20, minValue: 500_000 } as const;

export type ScoreBand = 'none' | 'slab' | 'moderat' | 'puternic';
/** Band cut points on the displayed (rounded) score: 0 · 20–39 · 40–67 · 68–100. */
export const SCORE_BAND_MIN = { slab: 1, moderat: 40, puternic: 68 } as const;

export function scoreBand(score: number): ScoreBand {
  if (!(score > 0)) return 'none';
  if (score >= SCORE_BAND_MIN.puternic) return 'puternic';
  if (score >= SCORE_BAND_MIN.moderat) return 'moderat';
  return 'slab';
}

/*
 * Strength x of each criterion (0–3). x equals the criterion's level exactly
 * at each level threshold and is linear in the criterion's own measure between
 * thresholds, so floor(x) is the level; every level-3 profile has x = 3.
 * Without the gate a met criterion has x = 1. Validated on the local copy
 * (signals investigation E, 1 November 2026): floor(x) equals the level for
 * all 172,759 profiles in every period tested.
 */

/** Split: share s of the profile's value in repeated purchases over the cumulated ceiling, outside exact Annex 2 CPVs. */
export function strengthSplit(role: ProfileFlagRole, groups: number, gate: boolean, s: number): number {
  if (groups <= 0) return 0;
  if (!gate) return 1;
  const [t2, t3] = role === 'authority' ? [0.10, 0.25] : [0.25, 0.50];
  if (s >= t3) return 3;
  if (s >= t2) return 2 + (s - t2) / (t3 - t2);
  return 1 + Math.max(s, 0) / t2;
}

/**
 * Year end: k full years with a December share at or above max(the kind-year
 * 95th percentile, 35%); r how far the best other year went from a typical
 * December (the kind-year median) towards its threshold, 0 to 0.999.
 */
export function strengthYearEnd(k: number, gate: boolean, r: number): number {
  if (k <= 0) return 0;
  if (!gate) return 1;
  if (k >= 3) return 3;
  return k + Math.min(0.999, Math.max(0, r));
}

/**
 * Just under the ceiling: k of n DAs at 96–100% of their ceiling. Level 1:
 * n ≥ 5 and more than 10%, or (institutions) at least 5 such DAs and 1%;
 * levels 2 and 3 above 25% and 50%. The rules are strict, so a share exactly
 * at 25% or 50% stays below the next level (fraction capped at 0.99).
 */
export function strengthRound(role: ProfileFlagRole, n: number, gate: boolean, k: number): number {
  if (n <= 0) return 0;
  const q = k / n;
  if (!((n >= 5 && q > 0.10) || (role === 'authority' && k >= 5 && q >= 0.01))) return 0;
  if (!gate) return 1;
  if (q > 0.50) return 3;
  if (q > 0.25) return 2 + Math.min((q - 0.25) / 0.25, 0.99);
  const q1 = role === 'authority' ? 0.01 : 0.10;
  return 1 + Math.min(Math.max(q - q1, 0) / (0.25 - q1), 0.99);
}

/** Concentration: the main supplier's share t of the institution's DA value (met from 60%). */
export function strengthConcentration(met: boolean, gate: boolean, t: number): number {
  if (!met) return 0;
  if (!gate) return 1;
  if (t >= 0.90) return 3;
  if (t >= 0.75) return 2 + (t - 0.75) / 0.15;
  return 1 + (t - 0.60) / 0.15;
}

/** Dependence: the share of its main institution's DA value the firm holds (met at 85% of the firm's sales). */
export function strengthDependence(met: boolean, gate: boolean, rev: number): number {
  if (!met) return 0;
  if (!gate) return 1;
  if (rev >= 0.50) return 3;
  if (rev >= 0.20) return 2 + (rev - 0.20) / 0.30;
  return 1 + Math.max(rev, 0) / 0.20;
}

/**
 * Above the ceiling (the review's safe scope): hits and their share w of the
 * profile's value. Level 1 from 2 hits; 2 from 4 hits, or 3 and 5%; 3 from 10
 * hits, or 4 and 20%. One record never sets a level alone.
 */
export function strengthAbove(hits: number, gate: boolean, w: number): number {
  if (hits < 2) return 0;
  if (!gate) return 1;
  if (hits >= 10 || (hits >= 4 && w >= 0.20)) return 3;
  if (hits >= 4 || (hits >= 3 && w >= 0.05)) return 2 + Math.max(0, hits >= 4 ? (hits - 4) / 6 : 0, hits >= 4 ? (w - 0.05) / 0.15 : 0);
  return 1 + Math.max((hits - 2) / 2, hits >= 3 ? w / 0.05 : 0);
}

/** The unrounded score of a set of strengths (each 0–3). */
export function scoreOf(strengths: readonly number[]): number {
  let left = 1;
  for (const x of strengths) left *= 1 - (SCORE_WEIGHT * Math.min(3, Math.max(0, x))) / 3;
  return 100 * (1 - left);
}

/**
 * Whole points per criterion that add up to the displayed score: each
 * criterion's share is its term in −ln(1 − score/100), and the rounding uses
 * the largest remainders. "73% = 39 + 34" on the profile.
 */
export function scorePoints<K extends string>(strengths: Readonly<Record<K, number>>): Record<K, number> {
  const keys = Object.keys(strengths) as K[];
  const terms = keys.map((k) => -Math.log(1 - (SCORE_WEIGHT * Math.min(3, Math.max(0, strengths[k]))) / 3));
  const total = terms.reduce((a, b) => a + b, 0);
  const score = Math.round(scoreOf(keys.map((k) => strengths[k])));
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  if (!(total > 0) || score === 0) return out;
  const exact = terms.map((t) => (score * t) / total);
  const floors = exact.map(Math.floor);
  let rest = score - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - floors[i]!, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) { if (rest <= 0) break; floors[i]! += 1; rest -= 1; }
  keys.forEach((k, i) => { out[k] = floors[i]!; });
  return out;
}

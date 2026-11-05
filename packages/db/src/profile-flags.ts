/**
 * The criteria of the historical risk profile (marts.entity_flags): the
 * signals on direct acquisitions that make an institution's or a firm's risk
 * score, per role, in the order the answers list them. The flag marts build
 * (apps/ingestion) scores with them; Ask's risk cloud and the distribution
 * read the same codes (apps/web/lib/ask/spec.ts SCATTER_FLAGS,
 * peer-groups-shared.ts CRITERIA, kept equal by a test).
 *
 * rf-2026.20 (owner decisions of 3 November 2026, after the six-reader audit
 * of 200 profiles): the score is shown as "70 din 100". Each criterion has a
 * strength x from 0 to 3, measured against the size of the profile; the
 * criteria fall into four families, and a family counts its strongest
 * criterion plus 0.4 of the others (up to the family's cap), so evidence of
 * one kind does not add up as if it were independent:
 *   avoid     (evitarea plafonului)  da_above_ceiling, da_split, da_round   cap 4
 *   relation  (relația)              da_concentration (institution, cap 2), da_dependence (firm, cap 3)
 *   calendar  (calendarul)           da_year_end                            cap 1.25
 *   capacity  (capacitatea)          da_capacity (firm)                     cap 3
 * score = 100 × (1 − Π (1 − 0.2 · F)) over the families. A profile reaches
 * "puternic" only with evidence from more than one direction.
 *
 * rf-2026.21 (owner decisions of 4 November 2026): no step from 0 to level 1
 * — each scale climbs from a lower anchor to its first level; the evidence
 * cap and a firm's buyer-duty cap rise gradually; above the ceiling a firm's
 * value scale is 2% / 12% / 40% and two cases on an institution are at least
 * 0.5; a firm that is a small part of its institution's purchases starts its
 * dependence at 0.5; a capture climbs with the capacity.
 *
 * rf-2026.22 (owner decisions of 5 November 2026, after the eight-profile
 * audit of every institution and firm): no score under 10 DAs and none under
 * 10 points ("fără semnal în scor"; the evidence stays on the page); the
 * evidence cap per criterion — the sums (repeated purchases, above the
 * ceiling, capacity) climb with the lei (0.5M → 1, 1M → 2, 2M → 3) or the
 * count, whichever is higher, the frequencies and shares (just under the
 * ceiling, dependence, concentration) with the count only; no capture (the
 * same evidence counts once, in its family); capacity alone counts half;
 * just under the ceiling expects at least 0.5 and needs 5 / 8 records for
 * levels 2 / 3; a firm's buyer-duty cap holds the whole family; repeated
 * medical supplies (CPV 33) and small recurring orders are not splitting.
 */
/**
 * The methodology of the signals and the risk score, stamped on every flag
 * (apps/ingestion/src/flags/methodology.ts keeps its history). A ready
 * publication records it; when it differs, the next scheduled run is full
 * (processing.ts), since a daily run keeps the previous risk.
 */
export const FLAGS_METHODOLOGY_VERSION = 'rf-2026.22';

/**
 * Buyers reviewed by hand (owner decision S6 of 5 November 2026), by CUI:
 * the regime and why, shown on the methodology page. Each was checked
 * against a public source; an entry stays out until it is.
 */
export const BUYER_REGIME_OVERRIDES: readonly { cui: string; regime: 'classic' | 'private_buyer'; name: string; why: string }[] = [
  { cui: "713519", regime: "classic", name: "ACET S.A.", why: "operatorul regional de apă din Suceava, deținut de UAT-uri" },
  { cui: "24499588", regime: "classic", name: "HARVIZ S.A.", why: "operatorul regional de apă din Harghita, deținut de UAT-uri" },
  { cui: "27778056", regime: "classic", name: "EURO APAVOL S.A.", why: "întreprindere publică, autoritatea tutelară Primăria Voluntari" },
  { cui: "28355992", regime: "classic", name: "LACURILE NATURALE OCNA SIBIULUI S.A.", why: "acționar unic Orașul Ocna Sibiului" },
  { cui: "8942496", regime: "classic", name: "Fondul de Garantare a Depozitelor Bancare", why: "persoană juridică de drept public (Legea 311/2015)" },
  { cui: "13554423", regime: "classic", name: "ROMARM", why: "Compania Națională Romarm, deținută de stat" },
  { cui: "14423850", regime: "classic", name: "Romarm – Filiala Uzina Mecanică București", why: "filială a C.N. Romarm, deținută de stat" },
  { cui: "13165477", regime: "private_buyer", name: "ELYTIS HOSPITAL HOP", why: "spital privat" },
  { cui: "30662085", regime: "private_buyer", name: "OVIDIUS CLINICAL HOSPITAL S.R.L.", why: "spital privat" },
];

export const PROFILE_FLAG_CODES = {
  authority: ['da_split', 'da_round', 'da_year_end', 'da_concentration', 'da_above_ceiling'],
  supplier: ['da_split', 'da_round', 'da_dependence', 'da_above_ceiling', 'da_capacity'],
} as const;
export type ProfileFlagRole = keyof typeof PROFILE_FLAG_CODES;
export type ProfileFlagCode = (typeof PROFILE_FLAG_CODES)[ProfileFlagRole][number];

/** How many criteria each role can meet. */
export const PROFILE_FLAGS_APPLICABLE = {
  authority: PROFILE_FLAG_CODES.authority.length,
  supplier: PROFILE_FLAG_CODES.supplier.length,
} as const;

export type ScoreFamily = 'avoid' | 'relation' | 'calendar' | 'capacity';
export const SCORE_FAMILIES: readonly ScoreFamily[] = ['avoid', 'relation', 'calendar', 'capacity'];
/** The family of each criterion. */
export const SCORE_FAMILY: Record<ProfileFlagCode, ScoreFamily> = {
  da_above_ceiling: 'avoid', da_split: 'avoid', da_round: 'avoid',
  da_concentration: 'relation', da_dependence: 'relation',
  da_year_end: 'calendar',
  da_capacity: 'capacity',
};
/** The most a family can count, per role. */
export const SCORE_FAMILY_CAP: Record<ProfileFlagRole, Record<ScoreFamily, number>> = {
  authority: { avoid: 4, relation: 2, calendar: 1.25, capacity: 0 },
  supplier: { avoid: 4, relation: 3, calendar: 0, capacity: 3 },
};
/** Inside a family, each criterion after the strongest adds this share of its strength. */
export const SCORE_FAMILY_REST = 0.4;
/** Each unit of a family's strength removes this share of what is left of 100. */
export const SCORE_WEIGHT = 0.2;
/**
 * Capacity alone (no avoidance, no relationship) counts half its strength
 * (rf-2026.22, owner decision S9c; it was a flat 1.5, which put 2,011 firms
 * from 1.6× to 535× their turnover at the same 30); with other evidence the
 * share climbs to the whole once avoidance or a relationship reaches level 1.
 */
export const SCORE_CAPACITY_ALONE = 0.5;
/**
 * The evidence a score needs (rf-2026.22, owner decisions S4a/S4b of 5
 * November 2026): no score under 10 DAs; a criterion counts at most 1 at 10
 * DAs, rising to 3 at 30 (the count); the criteria about sums also climb with
 * the profile's DA value from 5 DAs: 0.5M → 1, 1M → 2, 2M → 3 (the value),
 * whichever is higher. It replaces the step "5 DAs worth 1M → 3".
 */
export const SCORE_GATE = { minDas: 10, fullDas: 30, valueFromDas: 5, value: [[500_000, 1], [1_000_000, 2], [2_000_000, 3]] } as const;
/** The cap by the number of DAs, for frequencies and shares (just under the ceiling, dependence, concentration). */
export function scoreCountCap(n: number): number {
  return clampCap(1 + (2 * (n - SCORE_GATE.minDas)) / (SCORE_GATE.fullDas - SCORE_GATE.minDas));
}
/** The cap for the criteria about sums (repeated purchases, above the ceiling, capacity): the count's or the value's. */
export function scoreValueCap(n: number, v: number): number {
  const count = scoreCountCap(n);
  return n >= SCORE_GATE.valueFromDas ? Math.max(count, ramp(v, SCORE_GATE.value)) : count;
}
const clampCap = (x: number) => Math.min(3, Math.max(1, x));
/** The fewest DAs a profile needs for a score (owner decision S4b): below it, the evidence shows without a number. */
export const SCORE_MIN_DAS = SCORE_GATE.minDas;

export type ScoreBand = 'none' | 'slab' | 'moderat' | 'puternic';
/**
 * Band cut points on the displayed (rounded) score: 0–9 · 10–39 · 40–67 ·
 * 68–100 (rf-2026.22, owner decision S9b: under 10 points is "fără semnal în
 * scor", and the build stores such a profile with 0).
 */
export const SCORE_BAND_MIN = { slab: 10, moderat: 40, puternic: 68 } as const;

export function scoreBand(score: number): ScoreBand {
  if (!(score >= SCORE_BAND_MIN.slab)) return 'none';
  if (score >= SCORE_BAND_MIN.puternic) return 'puternic';
  if (score >= SCORE_BAND_MIN.moderat) return 'moderat';
  return 'slab';
}

/** Piecewise linear through (measure, x) points: 0 below the first, the last x above the last. */
export function ramp(v: number, pts: readonly (readonly [number, number])[]): number {
  if (!(v >= pts[0]![0])) return 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, xa] = pts[i]!;
    const [b, xb] = pts[i + 1]!;
    if (v < b) return xa + ((xb - xa) * (v - a)) / (b - a);
  }
  return pts[pts.length - 1]![1];
}
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
/** A strength under the evidence cap: `cap` is scoreCap's number (a boolean reads as 3 or 1). */
const capped = (x: number, cap: number | boolean): number => Math.min(x, typeof cap === 'boolean' ? (cap ? 3 : 1) : cap);

/*
 * Strength x of each criterion (0–3), from the measures score.ts computes.
 * Below the evidence gate (scoreGate) the avoidance and relationship criteria
 * stay at most 1.
 */

/** How a firm's buyer-duty criteria are read (see firmDuty). */
export interface FirmDutyContext {
  /** Share of the criterion's value with the firm's two main institutions for it. */
  top2: number;
  /** Energy, fuel, telecom or post: everyone buys from it. */
  utility: boolean;
}
/**
 * A firm's share in a buyer's duty (above the ceiling, repeated purchases):
 * the ceiling binds the institution, so on a firm these count at most 1.5
 * unless at least 80% of them are with one or two institutions (a
 * relationship; owner decision B of 3 November 2026). A utility or mass
 * supplier counts only the part with its top two institutions.
 */
export const FIRM_DUTY = { cap: 1.5, from: 0.6, concentrated: 0.8 } as const;
/**
 * The buyer-duty cap for a share `top2` with the two main institutions:
 * 1.5 up to 60%, rising to none (3) at 80% (rf-2026.21, not in one step).
 */
export function firmDutyCap(top2: number): number {
  if (top2 >= FIRM_DUTY.concentrated) return 3;
  return FIRM_DUTY.cap + (3 - FIRM_DUTY.cap) * clamp((top2 - FIRM_DUTY.from) / (FIRM_DUTY.concentrated - FIRM_DUTY.from), 0, 1);
}
function firmDuty(x: number, firm: FirmDutyContext): number {
  const y = firm.utility ? x * clamp(firm.top2, 0, 1) : x;
  return Math.min(y, firmDutyCap(firm.top2));
}
const NO_FIRM: FirmDutyContext = { top2: 1, utility: false };

/**
 * Above the ceiling: events (one per partner and month, so one order split
 * over invoices counts once) and their share w of the profile's value; x is
 * the lower of the two scales, so ten records out of five thousand stay weak.
 * Counts 2 → 1, 3 → 2, 5 → 3; value 0.5% → 1, 3% → 2, 10% → 3. On an
 * institution two events are at least level 1.
 */
export function strengthAbove(role: ProfileFlagRole, events: number, w: number, gate: number | boolean, firm: FirmDutyContext = NO_FIRM): number {
  if (events < 2) return 0;
  const byCount = ramp(events, [[2, 1], [3, 2], [5, 3]]);
  // rf-2026.21: institutions climb from 0.25% to level 1 at 0.5%, two cases are at least 0.5; firms 2% / 12% / 40% from 0.
  const byValue = role === 'authority'
    ? ramp(w, [[0.0025, 0], [0.005, 1], [0.03, 2], [0.10, 3]])
    : ramp(w, [[0, 0], [0.02, 1], [0.12, 2], [0.40, 3]]);
  let x = role === 'authority' ? Math.min(byCount, Math.max(0.5, byValue)) : Math.min(byCount, byValue);
  if (role === 'supplier') x = firmDuty(x, firm);
  return capped(x, gate);
}

/**
 * Repeated purchases: s is the weighted value of the profile's groups over
 * its value (splitGroupWeight). Institutions 2% → 1, 8% → 2, 20% → 3;
 * firms 5%, 20%, 50%.
 */
export function strengthSplit(role: ProfileFlagRole, s: number, gate: number | boolean, firm: FirmDutyContext = NO_FIRM): number {
  // rf-2026.21: from half the first level (1% / 2.5%), not a step at it.
  let x = role === 'authority'
    ? ramp(s, [[0.01, 0], [0.02, 1], [0.08, 2], [0.20, 3]])
    : ramp(s, [[0.025, 0], [0.05, 1], [0.20, 2], [0.50, 3]]);
  if (role === 'supplier' && x > 0) x = firmDuty(x, firm);
  return capped(x, gate);
}

/**
 * The weight of one repeated-purchase group: by how far it passes the
 * cumulated ceiling (nothing at 1.2×, full from 2×), by the size of its
 * purchases (receipts of a few hundred lei weigh 0.2), half for an
 * association buyer, and on the institution half for a mass supplier (200+
 * institutions) of which it is a tiny client; a group mostly in Annex 2 CPVs
 * does not count.
 */
export function splitGroupWeight(g: {
  role: ProfileFlagRole; total: number; n: number; ceiling: number; annex2Share: number;
  association: boolean; massSupplier: boolean; cpvClass?: string | null;
}): number {
  if (!(g.ceiling > 0) || g.n <= 0 || g.annex2Share >= 0.5) return 0;
  if (splitGroupRecurring(g)) return 0;
  const over = clamp((g.total / g.ceiling - 1.2) / 0.8, 0, 1);
  const size = clamp(g.total / g.n / g.ceiling / 0.25, 0.2, 1);
  return over * size * (g.association ? 0.5 : 1) * (g.role === 'authority' && g.massSupplier ? 0.5 : 1);
}

/**
 * A repeated-purchase group that is recurring supply, not splitting
 * (rf-2026.22, owner decision S5 of 5 November 2026): medical supplies
 * (CPV 33, as above the ceiling), or at least 12 orders averaging under 10%
 * of the ceiling. It weighs nothing in the score and shows as "comenzi
 * repetate de la același furnizor, fără acord-cadru" (the law sums a yearly
 * need; a planning problem, not a lead on splitting).
 */
export const SPLIT_RECURRING = { cpvPrefix: '33', minOrders: 12, maxMeanShare: 0.1 } as const;
export function splitGroupRecurring(g: { total: number; n: number; ceiling: number; cpvClass?: string | null }): 'medical' | 'small_orders' | null {
  if (String(g.cpvClass ?? '').trim().startsWith(SPLIT_RECURRING.cpvPrefix)) return 'medical';
  if (g.n >= SPLIT_RECURRING.minOrders && g.ceiling > 0 && g.total / g.n < SPLIT_RECURRING.maxMeanShare * g.ceiling) return 'small_orders';
  return null;
}

/**
 * Just under the ceiling, as bunching: o DAs at 96–100% of their ceiling
 * against e, the number expected from the profile's own DAs at 50–96% and the
 * national ratio of the same type and ceiling era. θ = (o + 1) / (e + 1);
 * x = log2 θ from θ = 2 (twice the expected count), with at least 3 such DAs.
 * rf-2026.22 (audit B5): at least 0.5 expected (a profile with no DAs at
 * 50–96% made three at the ceiling level 2), level 2 only from 5 such DAs
 * and level 3 from 8.
 */
export const ROUND_EVIDENCE = { minExpected: 0.5, level2: 5, level3: 8 } as const;
export function strengthRound(o: number, e: number, gate: number | boolean): number {
  const theta = (o + 1) / (Math.max(ROUND_EVIDENCE.minExpected, e) + 1);
  if (o < 3 || theta < 1.5) return 0;
  // rf-2026.21: from 1.5 times the expected count to level 1 at twice, then log2 as before.
  const x = theta < 2 ? 2 * (theta - 1.5) : Math.min(3, Math.log2(theta));
  const byRecords = o < ROUND_EVIDENCE.level2 ? 1 : o < ROUND_EVIDENCE.level3 ? 2 : 3;
  return capped(Math.min(x, byRecords), gate);
}

/**
 * December: zs is how far the institution's two highest Decembers sit from
 * the kind-year median, in units of the distance from the median to the 95th
 * percentile, shrunk by years / (years + 2). x = 1.25 × (zs − 1) / 1.5,
 * between 0 and 1.25, so December alone never passes "slab".
 */
export function strengthYearEnd(zs: number): number {
  return 1.25 * clamp((zs - 1) / 1.5, 0, 1);
}

/**
 * Concentration: the main supplier's share t of the institution's DA value
 * without that supplier's largest single DA (one big purchase is not a
 * relationship). 60% → 1, 75% → 2, 90% → 3.
 */
export function strengthConcentration(t: number, gate: number | boolean): number {
  // rf-2026.21: from 50%, level 1 at 60%.
  const x = ramp(t, [[0.50, 0], [0.60, 1], [0.75, 2], [0.90, 3]]);
  return capped(x, gate);
}

/**
 * Dependence: f is the share of the firm's DA sales with its main
 * institution, rev the share of that institution's DA value the firm holds.
 * From 85% of the firm's sales: rev 0 → 0.5, 5% → 1, 20% → 2, 50% → 3;
 * 70–85% climbs to that. rf-2026.22 (owner decision S2): no capture — the
 * capacity that lifted it counts once, in its own family.
 */
export function strengthDependence(f: number, rev: number, gate: number | boolean): number {
  if (!(f >= 0.70)) return 0;
  // rf-2026.21: by the firm's weight for the institution, 0.5 under 5% of its purchases, 1 at 5%, 2 at 20%, 3 at 50%;
  // between 70% and 85% of the firm's sales that strength is reached gradually.
  const weight = ramp(Math.max(0, rev), [[0, 0.5], [0.05, 1], [0.20, 2], [0.50, 3]]);
  const x = f >= 0.85 ? weight : weight * ramp(f, [[0.70, 0.01], [0.85, 1]]);
  return capped(x, gate);
}

/**
 * Capacity: DA sales in a year against the firm's turnover in the balance
 * sheet of the same year (rf-2026.22, owner decision S3: a year without it is
 * not judged). 1.5× → 1, 3× → 2, 10× → 3; a turnover under 10,000 lei is
 * implausible next to the sales and counts 1; +0.5 for a firm in its first
 * two years since its ONRC registration (audit B1); a year with no employees
 * and 500,000 lei of DAs is at least 1; at most the evidence cap for sums
 * (audit B3).
 */
export function strengthCapacity(m: { ratio: number | null; implausible: boolean; young: boolean; zeroStaff: boolean }, gate: number | boolean = 3): number {
  // rf-2026.21: from sales equal to the turnover, level 1 at 1.5×.
  let x = m.implausible ? 1 : m.ratio == null ? 0 : ramp(m.ratio, [[1, 0], [1.5, 1], [3, 2], [10, 3]]);
  if (x > 0 && m.young) x = Math.min(3, x + 0.5);
  if (m.zeroStaff) x = Math.max(x, 1);
  return capped(x, gate);
}

/** A family's strength: its strongest criterion plus 0.4 of the others, at most the cap. */
export function familyStrength(xs: readonly number[], cap: number): number {
  const s = xs.filter((x) => x > 0).sort((a, b) => b - a);
  if (!s.length || cap <= 0) return 0;
  return Math.min(cap, Math.min(3, s[0]!) + SCORE_FAMILY_REST * s.slice(1).reduce((a, b) => a + b, 0));
}

type Strengths = Partial<Record<ProfileFlagCode, number>>;

/**
 * What a family needs besides the strengths: a firm's buyer-duty cap over
 * the whole threshold-avoidance family (rf-2026.22, audit B7: it held each
 * criterion, and not at all just under the ceiling, so 1.5 + 3 made 3.6).
 */
export interface FamilyContext {
  /** firmDutyCap of the firm's share of DA sales with its two main institutions; 3 = no cap. */
  dutyCap?: number;
}

/** The families' strengths of one profile's criteria (capacity alone at half, a firm's buyer duty capped). */
export function familyStrengths(role: ProfileFlagRole, x: Strengths, ctx: FamilyContext = {}): Record<ScoreFamily, number> {
  const out = { avoid: 0, relation: 0, calendar: 0, capacity: 0 } as Record<ScoreFamily, number>;
  for (const f of SCORE_FAMILIES) {
    const xs = (PROFILE_FLAG_CODES[role] as readonly ProfileFlagCode[]).filter((c) => SCORE_FAMILY[c] === f).map((c) => x[c] ?? 0);
    out[f] = familyStrength(xs, SCORE_FAMILY_CAP[role][f]);
  }
  if (role === 'supplier' && ctx.dutyCap != null) out.avoid = Math.min(out.avoid, ctx.dutyCap);
  // rf-2026.22: capacity alone counts half (S9c); the share climbs with the other evidence to the whole once
  // avoidance or a relationship reaches level 1, so a trace of another criterion does not lift it in one step.
  const other = Math.max(out.avoid, out.relation);
  if (other < 1) out.capacity *= SCORE_CAPACITY_ALONE + (1 - SCORE_CAPACITY_ALONE) * other;
  return out;
}

/** The unrounded score of a set of family strengths. */
export function scoreOf(families: readonly number[]): number {
  let left = 1;
  for (const f of families) left *= 1 - SCORE_WEIGHT * Math.max(0, f);
  return 100 * (1 - Math.max(0, left));
}

/** The unrounded score of one profile's criteria. */
export function scoreOfCriteria(role: ProfileFlagRole, x: Strengths, ctx: FamilyContext = {}): number {
  const fam = familyStrengths(role, x, ctx);
  return scoreOf(SCORE_FAMILIES.map((f) => fam[f]));
}

/**
 * Whole points per criterion that add up to the displayed score ("70 din 100
 * = 39 + 31"): each family's share is its term in −ln(1 − score/100), split
 * inside the family by what each criterion adds (the strongest its strength,
 * the others 0.4 of theirs); the rounding uses the largest remainders.
 */
export function scorePoints(role: ProfileFlagRole, x: Strengths, ctx: FamilyContext = {}): Partial<Record<ProfileFlagCode, number>> {
  const codes = (PROFILE_FLAG_CODES[role] as readonly ProfileFlagCode[]).filter((c) => (x[c] ?? 0) > 0);
  const fam = familyStrengths(role, x, ctx);
  const score = Math.round(scoreOf(SCORE_FAMILIES.map((f) => fam[f])));
  const out: Partial<Record<ProfileFlagCode, number>> = Object.fromEntries(codes.map((c) => [c, 0]));
  if (!codes.length || score === 0) return out;
  const terms = codes.map((c) => {
    const f = SCORE_FAMILY[c];
    const members = codes.filter((k) => SCORE_FAMILY[k] === f)
      .sort((a, b) => (x[b] ?? 0) - (x[a] ?? 0) || codes.indexOf(a) - codes.indexOf(b));
    const adds = members.map((k, i) => (i === 0 ? Math.min(3, x[k] ?? 0) : SCORE_FAMILY_REST * (x[k] ?? 0)));
    const sum = adds.reduce((a, b) => a + b, 0);
    const famTerm = -Math.log(1 - SCORE_WEIGHT * fam[f]);
    return sum > 0 ? (famTerm * adds[members.indexOf(c)]!) / sum : 0;
  });
  const total = terms.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return out;
  const exact = terms.map((t) => (score * t) / total);
  const floors = exact.map(Math.floor);
  let rest = score - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - floors[i]!, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) { if (rest <= 0) break; floors[i]! += 1; rest -= 1; }
  codes.forEach((c, i) => { out[c] = floors[i]!; });
  return out;
}

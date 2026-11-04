import type { DistributionDataV2, DistributionDataV3, ScoredMember } from "../compile";
import type { PeerDialogData, PeerFacts } from "../peer-groups-shared";
import { scoreOfCriteria, scorePoints, type ProfileFlagCode } from "@seap/db";
import type { ScoreParts } from "../../risk-score";

/*
 * Answers and windows of the distribution for the screen's tests (final
 * distribution §3.2, §3.6). distribution-3 (rf-2026.18, the owner's mockup of
 * 1 November 2026; scored as rf-2026.20): a town hall at 54 din 100 against the 38 others of its
 * population band (a strip and a list), a commune at 44 against 2,034 (the
 * chart by tenths of the score). distribution-2, as a watch or capture stored
 * it before: a town hall against 29 (a list), a commune against 2,034 (a chart
 * by number of criteria), with the criteria of the time (da_rapid retired
 * since). Names and numbers are examples on the local copy, not live data.
 */

/** The score of an institution's strengths x (@seap/db scoreOfCriteria, rf-2026.20), rounded as displayed. */
const strengths = (parts: ScoreParts) => Object.fromEntries(Object.entries(parts).map(([code, part]) => [code, part?.x ?? 0])) as Partial<Record<ProfileFlagCode, number>>;
export const scoreOf = (parts: ScoreParts): number => Math.round(scoreOfCriteria("authority", strengths(parts)));
/** The parts as the build stores them: each with its whole points (`pts`, @seap/db scorePoints). */
const withPoints = (parts: ScoreParts): ScoreParts => {
  const pts = scorePoints("authority", strengths(parts));
  return Object.fromEntries(Object.entries(parts).map(([code, part]) => [code, { ...part!, pts: pts[code as ProfileFlagCode] ?? 0 }])) as ScoreParts;
};

const VASLUI_FACTS: PeerFacts = {
  role: "authority", entityId: "2146445", name: "MUNICIPIUL VASLUI", county: "Vaslui", nDas: 1_953,
  similar: { rule: "population", value: 63_035, min: 31_518, max: 126_070 }, activity: { min: 977, max: 3_906 },
};
/** 54 din 100 = +44 (repeated acquisitions over the cumulated ceiling) + 10 (just under the ceiling, the same family). */
const VASLUI_PARTS: ScoreParts = withPoints({
  da_split: { x: 2.2, groups: 18, partners: 9, share: 0.08, rawShare: 0.11, top2: 0.4 },
  da_round: { x: 1.25, n: 37, expected: 13.6 },
});
/** The 38 others' scores in the mockup: 18 higher, 1 equal, 19 lower. */
const VASLUI_SCORES = [71, 69, 68, 65, 64, 63, 62, 62, 62, 61, 61, 59, 58, 57, 57, 56, 56, 55, 54, 53, 52, 47, 47, 43, 42, 41, 40, 39, 37, 36, 35, 33, 30, 29, 22, 21, 0, 0];
const NAMED = ["MUNICIPIUL BUZAU", "MUNICIPIUL TULCEA", "MUNICIPIUL BOTOSANI", "Municipiul Bistrita"];
const scored = VASLUI_SCORES.map((score, i): ScoredMember => ({
  entityId: String(3_100_000 + i), name: NAMED[i] ?? `MUNICIPIUL S${i}`, county: "Iași", population: 60_000 + i * 1_000,
  nFlags: score === 0 ? 0 : score < 45 ? 1 : 2, flags: score === 0 ? [] : score < 45 ? ["da_split"] : ["da_split", "da_round"], nDas: 2_000 - i * 10, score,
}));

export const VASLUI_LIST: DistributionDataV3 = {
  version: 3, role: "authority", status: "ok",
  criteria: ["da_split", "da_round", "da_year_end", "da_concentration", "da_above_ceiling"],
  focal: { entityId: "2146445", name: "MUNICIPIUL VASLUI", nDas: 1_953, county: "Vaslui", population: 63_035, inGroup: true,
    score: scoreOf(VASLUI_PARTS), parts: VASLUI_PARTS, nFlags: 2, flags: ["da_split", "da_round"] },
  group: { words: "primăriile cu 32–126 mii de locuitori", facts: VASLUI_FACTS, ticks: ["similar"], legacy: {}, others: 38,
    coverage: { inBand: 40, identified: 39, missing: ["Popești-Leordeni"] }, populationVersion: "ins-rpl-2021-table-1.22-v1",
    memberIds: scored.map((m) => m.entityId) },
  position: { higher: 18, equal: 1, lower: 19 },
  hist: [
    { from: 0, to: 0, n: 2 }, { from: 20, to: 29, n: 3 }, { from: 30, to: 39, n: 6 }, { from: 40, to: 49, n: 6 }, { from: 50, to: 59, n: 10 },
    { from: 60, to: 69, n: 10 }, { from: 70, to: 79, n: 1 }, { from: 80, to: 89, n: 0 }, { from: 90, to: 100, n: 0 },
  ],
  perCriterion: [
    { code: "da_split", others: 30, country: 3_610 }, { code: "da_round", others: 12, country: 1_210 }, { code: "da_year_end", others: 4, country: 2_890 },
    { code: "da_concentration", others: 0, country: 383 }, { code: "da_above_ceiling", others: 3, country: 640 },
  ],
  countryTotal: 15_729,
  members: scored,
};

/** 44 din 100 = December (x 1,25, its most) and repeated acquisitions (x 1,25), against the 2,034 others of its band: the chart. */
const RUSETU_PARTS: ScoreParts = withPoints({
  da_year_end: { x: 1.25, years: [{ y: 2023, pct: 0.41 }], zs: 2.5 },
  da_split: { x: 1.25, groups: 1, partners: 1, share: 0.03, rawShare: 0.04, top2: 1 },
});
export const RUSETU_SCORE_CHART: DistributionDataV3 = {
  version: 3, role: "authority", status: "ok",
  criteria: ["da_split", "da_round", "da_year_end", "da_concentration", "da_above_ceiling"],
  focal: { entityId: "2145000", name: "COMUNA RUSETU", nDas: 210, county: "Buzău", population: 3_173, inGroup: true,
    score: scoreOf(RUSETU_PARTS), parts: RUSETU_PARTS, nFlags: 2, flags: ["da_split", "da_year_end"] },
  group: { words: "primăriile cu 1.587–6.346 de locuitori", facts: { ...VASLUI_FACTS, entityId: "2145000", name: "COMUNA RUSETU", county: "Buzău", nDas: 210,
    similar: { rule: "population", value: 3_173, min: 1_587, max: 6_346 }, activity: { min: 105, max: 420 } }, ticks: ["similar"], legacy: {}, others: 2_034 },
  position: { higher: 412, equal: 61, lower: 1_561 },
  hist: [
    { from: 0, to: 0, n: 433 }, { from: 20, to: 29, n: 600 }, { from: 30, to: 39, n: 300 }, { from: 40, to: 49, n: 280 }, { from: 50, to: 59, n: 200 },
    { from: 60, to: 69, n: 150 }, { from: 70, to: 79, n: 50 }, { from: 80, to: 89, n: 18 }, { from: 90, to: 100, n: 3 },
  ],
  perCriterion: [
    { code: "da_split", others: 1_340, country: 3_610 }, { code: "da_round", others: 8, country: 1_210 }, { code: "da_year_end", others: 565, country: 2_890 },
    { code: "da_concentration", others: 0, country: 383 }, { code: "da_above_ceiling", others: 41, country: 640 },
  ],
  countryTotal: 15_729,
};

export const BUZAU_FACTS: PeerFacts = {
  role: "authority", entityId: "2144364", name: "MUNICIPIUL BUZAU", county: "Buzău", nDas: 782,
  similar: { rule: "population", value: 103_481, min: 51_741, max: 206_962 }, activity: { min: 391, max: 1_564 },
};

const others = (n: number, k: number) => Array.from({ length: n }, (_, i) => ({
  entityId: String(3_000_000 + k * 100 + i), name: `MUNICIPIUL ${k}-${i}`, county: "Bihor", population: 90_000 + i, nFlags: k,
  flags: ["da_split", "da_year_end", "da_rapid"].slice(0, k), nDas: 1_000 - i,
}));

/** distribution-2, stored before rf-2026.18 (watches, captures): the criteria of the time. */
export const BUZAU_LIST: DistributionDataV2 = {
  version: 2, role: "authority", status: "ok",
  criteria: ["da_split", "da_year_end", "da_round", "da_rapid", "da_concentration"],
  focal: { entityId: "2144364", name: "MUNICIPIUL BUZAU", nFlags: 3, cri: 0.6, flags: ["da_split", "da_year_end", "da_round"], nDas: 782, county: "Buzău", population: 103_481, inGroup: true },
  group: { words: "primăriile cu 52–207 mii de locuitori", facts: BUZAU_FACTS, ticks: ["similar"], legacy: {}, others: 29,
    coverage: { inBand: 32, identified: 30, missing: ["Alba Iulia", "Popești-Leordeni"] }, populationVersion: "ins-rpl-2021-table-1.22-v1" },
  position: { more: 0, same: 0, fewer: 29 },
  hist: [{ k: 0, n: 1 }, { k: 1, n: 24 }, { k: 2, n: 4 }, { k: 3, n: 0 }, { k: 4, n: 0 }, { k: 5, n: 0 }],
  perCriterion: [
    { code: "da_split", others: 27, country: 3_921 }, { code: "da_year_end", others: 2, country: 4_154 }, { code: "da_round", others: 3, country: 174 },
    { code: "da_rapid", others: 0, country: 3_336 }, { code: "da_concentration", others: 0, country: 383 },
  ],
  countryTotal: 15_729,
  members: [...others(4, 2), ...others(24, 1), ...others(1, 0)],
};

export const RUSETU_CHART: DistributionDataV2 = {
  version: 2, role: "authority", status: "ok",
  criteria: ["da_split", "da_year_end", "da_round", "da_rapid", "da_concentration"],
  focal: { entityId: "2145000", name: "COMUNA RUSETU", nFlags: 2, cri: 0.4, flags: ["da_year_end", "da_rapid"], nDas: 210, county: "Buzău", population: 3_173, inGroup: true },
  group: { words: "primăriile cu 1.587–6.346 de locuitori", facts: { ...BUZAU_FACTS, entityId: "2145000", name: "COMUNA RUSETU", nDas: 210,
    similar: { rule: "population", value: 3_173, min: 1_587, max: 6_346 }, activity: { min: 105, max: 420 } }, ticks: ["similar"], legacy: {}, others: 2_034 },
  position: { more: 29, same: 442, fewer: 1_563 },
  hist: [{ k: 0, n: 433 }, { k: 1, n: 1_130 }, { k: 2, n: 442 }, { k: 3, n: 29 }, { k: 4, n: 0 }, { k: 5, n: 0 }],
  perCriterion: [
    { code: "da_split", others: 1_340, country: 3_921 }, { code: "da_year_end", others: 565, country: 4_154 }, { code: "da_round", others: 8, country: 174 },
    { code: "da_rapid", others: 188, country: 3_336 }, { code: "da_concentration", others: 0, country: 383 },
  ],
  countryTotal: 15_729,
};

/** The window of "Față de cine?" for the town hall (final §3.1: populație apropiată → 29, Județul Buzău → 336, together 0). */
export const BUZAU_DIALOG: PeerDialogData = {
  facts: BUZAU_FACTS, profile: true, legacy: {},
  rows: [
    { id: "similar", label: "Primării cu 52–207 mii de locuitori", rule: "populație apropiată", tip: "Populația rezidentă INS, RPL 2021…" },
    { id: "county", label: "Județul Buzău", rule: "același județ", tip: "Județul instituției din registrul nostru." },
  ],
  sizes: { "": 15_728, similar: 29, county: 336, "similar+county": 0 },
};

/** A hospital (final §3.1: Spitale → 328, activity → 124 together, Olt → 364 alone but 4 with Spitale). */
export const HOSPITAL_DIALOG: PeerDialogData = {
  facts: { role: "authority", entityId: "2150000", name: "SPITALUL ORASENESC CORABIA", county: "Olt", nDas: 24_202,
    similar: { rule: "kind", kind: "spital" }, activity: { min: 12_101, max: 48_404 } },
  profile: true, legacy: {},
  rows: [
    { id: "similar", label: "Spitale", rule: "același tip", tip: "După denumire…" },
    { id: "county", label: "Județul Olt", rule: "același județ", tip: "Județul instituției din registrul nostru." },
    { id: "activity", label: "12.101–48.404 achiziții directe", rule: "activitate apropiată", tip: "Între jumătate și dublul…" },
  ],
  sizes: { "": 15_728, similar: 328, county: 364, activity: 2_799, "similar+county": 4, "similar+activity": 124, "county+activity": 40, "similar+county+activity": 1 },
};

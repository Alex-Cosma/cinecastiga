import type { DistributionData } from "../compile";
import type { PeerDialogData, PeerFacts } from "../peer-groups-shared";

/*
 * Answers and windows of distribution-2 for the screen's tests (final
 * distribution §3.2, §3.6): a town hall against the 29 others of its
 * population band (a list), a commune against 2,034 (a chart), a firm
 * against the whole country. Names and numbers are the final's examples on
 * the local copy, not live data.
 */

export const BUZAU_FACTS: PeerFacts = {
  role: "authority", entityId: "2144364", name: "MUNICIPIUL BUZAU", county: "Buzău", nDas: 782,
  similar: { rule: "population", value: 103_481, min: 51_741, max: 206_962 }, activity: { min: 391, max: 1_564 },
};

const others = (n: number, k: number) => Array.from({ length: n }, (_, i) => ({
  entityId: String(3_000_000 + k * 100 + i), name: `MUNICIPIUL ${k}-${i}`, county: "Bihor", population: 90_000 + i, nFlags: k,
  flags: ["da_split", "da_year_end", "da_rapid"].slice(0, k), nDas: 1_000 - i,
}));

export const BUZAU_LIST: DistributionData = {
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

export const RUSETU_CHART: DistributionData = {
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

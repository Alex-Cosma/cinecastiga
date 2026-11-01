import type { ScatterDataV2, ScatterDataV3, ScatterListRow, ScatterListRowV2 } from "../scatter-shared";

/*
 * The risk cloud as the screen tests draw it (scatter-3, rf-2026.18): the town
 * halls of Buzău, from the local copy read on 29 October 2026 (82 of them, 46
 * with repeated acquisitions over a cumulated ceiling), cut to what the markup
 * tests need, with illustrative risk scores; no private data. BUZAU_CLOUD_V2 is
 * the same group as a watch or a capture stored it before rf-2026.18
 * (scatter-2: bands by criteria met, the index, "Finalizare rapidă").
 */

const row = (entityId: string, name: string, nDas: number, value: number, score: number, scoreRaw: number, flags: ScatterListRow["flags"]): ScatterListRow =>
  ({ entityId, name, county: "Buzău", value, nDas, score, scoreRaw, nFlags: flags.length, flags, kind: "comuna" });

export const BUZAU_ROWS: ScatterListRow[] = [
  row("2144803", "Comuna Sageata (Primaria Comunei Sageata)", 2567, 21_000_000, 73, 72.8, [{ code: "da_split", years: [2018, 2019] }, { code: "da_round" }, { code: "da_year_end", years: [2022] }]),
  row("2144792", "Comuna Pardosi", 319, 11_000_000, 64, 63.6, [{ code: "da_split", years: [2019, 2021, 2022] }, { code: "da_year_end", years: [2021, 2024] }]),
  row("2146202", "COMUNA MEREI", 1941, 28_300_000, 47, 46.9, [{ code: "da_split", years: [2019, 2020, 2021, 2023] }, { code: "da_above_ceiling" }]),
];

/** The points' bits follow scatterFlagsOf("authority"): split 1, round 2, December 4, concentration 8, above the ceiling 16. */
const points = [
  ...BUZAU_ROWS.map((r, i) => ({ id: r.entityId, name: r.name, value: r.value, score: r.score, scoreRaw: r.scoreRaw, nFlags: r.nFlags, nDas: r.nDas, flags: [7, 5, 17][i]! })),
];

export const BUZAU_CLOUD: ScatterDataV3 = {
  version: 3, role: "authority", rankBy: "risk", flag: null,
  group: { n: 82, nList: 82 }, criteria: { da_split: 46, da_round: 12, da_year_end: 19, da_concentration: 0, da_above_ceiling: 4 }, p90: 22_700_000,
  cloud: { points: [...points, { id: "1", name: "Comuna Mica", value: 900_000, score: 0, scoreRaw: 0, nFlags: 0, nDas: 12, flags: 0 }] },
  list: BUZAU_ROWS,
};

/** The same group with the repeated acquisitions chosen: the list holds the 46 that have them, the cloud stays the whole group. */
export const BUZAU_SPLIT: ScatterDataV3 = { ...BUZAU_CLOUD, flag: "da_split", chosen: { n: 46, nList: 46 }, list: BUZAU_ROWS };

/** Five hospitals: no cloud, the whole group is the list. */
export const SPITALE_SMALL: ScatterDataV3 = {
  version: 3, role: "authority", rankBy: "risk", flag: null,
  group: { n: 5, nList: 5, small: true }, criteria: { da_split: 2 }, p90: 60_000_000, cloud: { points: [] },
  list: [row("2145984", "SPITALUL JUDETEAN DE URGENTA BUZAU", 25_622, 60_000_000, 20, 20, [{ code: "da_split", years: [2018] }])],
};

/** The national cloud: cells of the grey layer by tenths of the score, the named profiles exact. */
export const NATIONAL_BANDS: ScatterDataV3 = {
  ...BUZAU_CLOUD, group: { n: 15_729, nList: 14_972 },
  cloud: { bands: { minLog: 3, maxLog: 9.2, nx: 80, total: 15_729, cells: [[10, 0, 40], [20, 2, 300], [30, 4, 120], [40, 7, 8]] }, named: points },
};

// --- a stored scatter-2 (before rf-2026.18), drawn as it was

const rowV2 = (entityId: string, name: string, nDas: number, value: number, nFlags: number, flags: ScatterListRowV2["flags"]): ScatterListRowV2 =>
  ({ entityId, name, county: "Buzău", value, nDas, cri: nFlags / 5, nFlags, flags, kind: "comuna" });

export const BUZAU_ROWS_V2: ScatterListRowV2[] = [
  rowV2("2144803", "Comuna Sageata (Primaria Comunei Sageata)", 2567, 21_000_000, 3, [{ code: "da_split", years: [2018, 2019] }, { code: "da_year_end", years: [2022] }, { code: "da_rapid", share: 0.252, rows: 647 }]),
  rowV2("2144792", "Comuna Pardosi", 319, 11_000_000, 3, [{ code: "da_split", years: [2019, 2021, 2022] }, { code: "da_year_end", years: [2021, 2024] }, { code: "da_rapid" }]),
  rowV2("2146202", "COMUNA MEREI", 1941, 28_300_000, 2, [{ code: "da_split", years: [2019, 2020, 2021, 2023] }, { code: "da_rapid" }]),
];

/** scatter-2's bits: split 1, December 2, rapid 4, round 8, concentration 16. */
const pointsV2 = BUZAU_ROWS_V2.map((r, i) => ({ id: r.entityId, name: r.name, value: r.value, nFlags: r.nFlags, nDas: r.nDas, flags: i === 2 ? 5 : 7 }));

export const BUZAU_CLOUD_V2: ScatterDataV2 = {
  version: 2, role: "authority", levels: 5, rankBy: "risk", flag: null,
  group: { n: 82, nList: 82 }, criteria: { da_split: 46, da_year_end: 19, da_rapid: 15, da_round: 0, da_concentration: 0 }, p90: 22_700_000,
  cloud: { points: [...pointsV2, { id: "1", name: "Comuna Mica", value: 900_000, nFlags: 0, nDas: 12, flags: 0 }] },
  list: BUZAU_ROWS_V2,
};

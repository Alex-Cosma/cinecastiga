import type { ScatterData, ScatterListRow } from "../scatter-shared";

/*
 * The risk cloud as the screen tests draw it (scatter-2): the town halls of
 * Buzău, from the local copy read on 29 October 2026 (82 of them, 46 with a
 * possible split), cut to what the markup tests need; no private data.
 */

const row = (entityId: string, name: string, nDas: number, value: number, nFlags: number, flags: ScatterListRow["flags"]): ScatterListRow =>
  ({ entityId, name, county: "Buzău", value, nDas, cri: nFlags / 5, nFlags, flags, kind: "comuna" });

export const BUZAU_ROWS: ScatterListRow[] = [
  row("2144803", "Comuna Sageata (Primaria Comunei Sageata)", 2567, 21_000_000, 3, [{ code: "da_split", years: [2018, 2019] }, { code: "da_year_end", years: [2022] }, { code: "da_rapid" }]),
  row("2144792", "Comuna Pardosi", 319, 11_000_000, 3, [{ code: "da_split", years: [2019, 2021, 2022] }, { code: "da_year_end", years: [2021, 2024] }, { code: "da_rapid" }]),
  row("2146202", "COMUNA MEREI", 1941, 28_300_000, 2, [{ code: "da_split", years: [2019, 2020, 2021, 2023] }, { code: "da_rapid" }]),
];

const points = BUZAU_ROWS.map((r, i) => ({ id: r.entityId, name: r.name, value: r.value, nFlags: r.nFlags, nDas: r.nDas, flags: i === 2 ? 5 : 7 }));

export const BUZAU_CLOUD: ScatterData = {
  version: 2, role: "authority", levels: 5, rankBy: "risk", flag: null,
  group: { n: 82, nList: 82 }, criteria: { da_split: 46, da_year_end: 19, da_rapid: 15, da_round: 0, da_concentration: 0 }, p90: 22_700_000,
  cloud: { points: [...points, { id: "1", name: "Comuna Mica", value: 900_000, nFlags: 0, nDas: 12, flags: 0 }] },
  list: BUZAU_ROWS,
};

/** The same group with the possible split chosen: the list holds the 46 that have it, the cloud stays the whole group. */
export const BUZAU_SPLIT: ScatterData = { ...BUZAU_CLOUD, flag: "da_split", chosen: { n: 46, nList: 46 }, list: BUZAU_ROWS };

/** Five hospitals: no cloud, the whole group is the list. */
export const SPITALE_SMALL: ScatterData = {
  version: 2, role: "authority", levels: 5, rankBy: "risk", flag: null,
  group: { n: 5, nList: 5, small: true }, criteria: { da_split: 2 }, p90: 60_000_000, cloud: { points: [] },
  list: [row("2145984", "SPITALUL JUDETEAN DE URGENTA BUZAU", 25_622, 60_000_000, 1, [{ code: "da_split", years: [2018] }])],
};

/** The national cloud: cells of the grey layer, the named profiles exact. */
export const NATIONAL_BANDS: ScatterData = {
  ...BUZAU_CLOUD, group: { n: 15_729, nList: 14_972 },
  cloud: { bands: { minLog: 3, maxLog: 9.2, nx: 80, total: 15_729, cells: [[10, 0, 40], [20, 1, 300], [30, 2, 120], [40, 3, 8]] }, named: points },
};

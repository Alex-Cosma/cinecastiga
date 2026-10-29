import type { FactCheckData } from "../fact-check-shared";
import type { AskSpec } from "../spec";

/*
 * fact_check-2 answers for the screen tests (FactCheckAnswer.test.ts, answer
 * CSV): the figures of final fact_check §4–§5 as the engine returned them on
 * the local copy (par-f6a/factcheck/smoke-1.json), shortened. Names are the
 * public institutions and firms of the final's examples.
 */

const party = (entityId: string, name: string, cui: string, county: string | null) => ({ entityId, name, cui, county });
export const BUZAU = party("2144364", "MUNICIPIUL BUZAU", "4233874", "Buzau");
export const URBAN = party("2064733", "URBAN SCOPE", "35752863", "Bucuresti");
const COVERAGE = { da: "2026-09-25", contracts: "2026-09-25" };

const none = (over: Partial<FactCheckData>): FactCheckData => ({
  version: 2, state: "no", verdict: false, authority: BUZAU, supplier: URBAN, count: 0, value: 0, yearFirst: null, yearLast: null, samples: [],
  restricted: false, legacy: false, dateFirst: null, dateLast: null, undated: { count: 0, value: 0 }, years: [], partialYear: 2026,
  channels: { da: { count: 0, value: 0 }, contracts: { count: 0, value: 0 } }, domains: [], competition: null, consortium: null,
  frameworks: { count: 0, ceiling: 0, inSums: 0, inSumsCeiling: 0, rows: [] }, excluded: { count: 0, rows: [] }, share: null, relation: null,
  coverage: COVERAGE, partners: null, twins: [], ...over,
});

/** Buzău × URBAN SCOPE, the whole relation (final §4, frame D). */
export const BUZAU_URBAN: FactCheckData = none({
  state: "yes", verdict: true, count: 58, value: 51_111_528.67, yearFirst: 2018, yearLast: 2026, dateFirst: "2018-07-09", dateLast: "2026-06-11",
  years: [[2018, 1], [2019, 11], [2020, 4], [2021, 6], [2022, 7], [2023, 6], [2024, 11], [2025, 7], [2026, 5]].map(([year, count]) => ({ year: year!, count: count!, value: count! * 800_000 })),
  channels: { da: { count: 38, value: 6_885_374 }, contracts: { count: 20, value: 44_226_154.67 } },
  domains: [
    { code: "42", name: "Maşini industriale", count: 1, value: 16_679_036.4 },
    { code: "71", name: "Servicii de arhitectură, de construcţii, de inginerie şi de inspecţie", count: 32, value: 14_700_000 },
    { code: "45", name: "Lucrări de construcţii", count: 2, value: 7_800_000 },
    { code: "34", name: "Echipament de transport", count: 1, value: 6_126_490.09 },
    { code: "72", name: "Servicii IT", count: 22, value: 5_806_002.18 },
  ],
  competition: { single: 7, multiple: 0, unknown: 13 },
  consortium: { count: 6, share: 32_794_854.67, full: 79_487_656.35 },
  share: { ofSupplier: { rank: 2, of: 70, share: 0.1416 }, ofAuthority: { rank: 7, of: 282, share: 0.0325 } },
  samples: [
    { daCode: "C1", date: "2024-12-30", cpvName: "Diverse utilaje cu utilizare specială", value: 16_679_036.4, src: "contracts", refId: "227342", nid: "105891638", procedure: "Licitatie deschisa", nWinners: 2, fullValue: 33_358_072.8, bids: null, kind: "contract" },
    { daCode: "C2", date: "2021-09-14", cpvName: "Echipament de monitorizare a traficului", value: 6_126_490.09, src: "contracts", refId: "133229", nid: "101872189", procedure: "Licitatie deschisa", nWinners: 3, fullValue: 18_379_470.29, bids: 1, kind: "contract" },
    { daCode: "DA40578469", date: "2026-06-11", cpvName: "Servicii de inginerie rutieră", value: 223_000, src: "da", refId: "1", nid: null, procedure: null, nWinners: null, fullValue: null, bids: null, kind: null, recent: true },
  ],
});

/** Cluj-Napoca × CECONI in 2026: "Nu" for the choices, the whole relation beside it (final §5.1). */
export const CLUJ_2026: FactCheckData = none({
  authority: party("2146445", "Municipiul Cluj-Napoca", "4305857", "Cluj"), supplier: party("2122975", "CECONI", "6949560", "Satu Mare"),
  reason: "choices", restricted: true,
  relation: { count: 5, value: 70_235_806, yearFirst: 2022, yearLast: 2025, frameworks: 3, excluded: 0 },
});

/** ABA Someș-Tisa × PROEURO CONSTRUCT: "Nu" in the whole archive, the twin with the same name (final §5.4). */
export const ABA_NONE: FactCheckData = none({
  authority: party("2128873", "ADMINISTRATIA BAZINALA DE APA SOMES TISA", "42066043", "Cluj"), supplier: party("2020594", "PROEURO CONSTRUCT SRL", "17117170", "Salaj"),
  reason: "none", partners: { authoritySuppliers: 796, supplierAuthorities: 3 },
  twins: [{ role: "authority", entityId: "2145513", name: "ADMINISTRATIA BAZINALA DE APA  SOMES TISA", cui: "18269681", county: "Cluj", count: 6, yearFirst: 2018, yearLast: 2019 }],
});

/** Oradea × Kes Business on a build with the framework rule: one ceiling and no order (final §5.3). */
export const ORADEA_FRAMEWORK: FactCheckData = none({
  authority: party("2146127", "MUNICIPIUL ORADEA", "4230487", "Bihor"), supplier: party("2052755", "Kes Business", "34697191", "Bistrita-Nasaud"),
  state: "framework",
  frameworks: { count: 1, ceiling: 28_160_000, inSums: 0, inSumsCeiling: 0, rows: [{ category: "framework", src: "contracts", refId: "9", nid: "105426416", code: "1", date: "2024-08-01", what: "Servicii de proiectare", value: 28_160_000, estimated: null, procedure: "Licitatie deschisa" }] },
});

/** Saraiu × ELYAN MASTER GROUP: only a direct acquisition outside the sums (final §5.5). */
export const SARAIU_EXCLUDED: FactCheckData = none({
  authority: party("2140534", "COMUNA SARAIU", "5874273", "Constanta"), supplier: party("2217557", "ELYAN MASTER GROUP S.R.L.", "47374028", null),
  state: "yes", verdict: true,
  excluded: { count: 1, rows: [{ category: "da_above", src: "da", refId: "114778035", nid: null, code: "DA33516874", date: "2023-06-22", what: "Studiu de fezabilitate", value: 135_000_000, estimated: 135_000, procedure: null }] },
});

/** Timișoara × PROMPT on a build with the date floor: one contract without a plausible date (final §5.6). */
export const TIMISOARA_UNDATED: FactCheckData = none({
  authority: party("2146647", "Municipiul Timisoara", "14756536", "Timis"), supplier: party("2110695", "PROMPT S.A.", "1817950", "Timis"),
  state: "yes", verdict: true, count: 1, value: 41_835_276.09, undated: { count: 1, value: 41_835_276.09 },
  channels: { da: { count: 0, value: 0 }, contracts: { count: 1, value: 41_835_276.09 } },
  samples: [{ daCode: "C9", date: null, cpvName: "Lucrări de construcții", value: 41_835_276.09, src: "contracts", refId: "9", nid: "101977757", procedure: "Licitatie deschisa", nWinners: 1, fullValue: 41_835_276.09, bids: null, kind: "contract" }],
});

export const factSpec = (data: FactCheckData, over: Partial<AskSpec> = {}): AskSpec => ({
  block: "fact_check", measure: "value",
  filters: { authorityId: Number(data.authority.entityId), authorityName: data.authority.name, supplierId: Number(data.supplier.entityId), supplierName: data.supplier.name },
  ...over,
}) as AskSpec;

/**
 * Cases for scripts/ask-perf.ts (plan §6.4). Every spec is built the way the
 * builder builds it: defaultQuestion() → chooseType(block) → the reader's edits
 * → transitionQuestion → validateSpec, so the baseline measures questions a
 * reader can ask, with the keys the engine implements (today's, then F2's
 * trend lenses, as the builder will write them). Entity ids are those of the
 * local snapshot; a case whose identity no longer grounds reports the error
 * instead of a timing.
 */
import { defaultQuestion, QUESTION_TYPES, transitionQuestion, type QuestionSpec } from "../lib/ask/question-ui";
import { validateSpec, type AskSpec, type Block } from "../lib/ask/spec";
import { writeFocal } from "../lib/ask/filters/registry";
import type { EvidenceScope } from "../lib/ask/evidence";

export type PerfPath = "answer" | "rows" | "csv";
export type PerfGroup = "catalog" | "national" | "filtered" | "sources" | "csv";
export interface PerfCase {
  /** Stable key: later runs are compared with the baseline by id. */
  id: string;
  group: PerfGroup;
  label: string;
  /** answer = /api/ask; rows = /api/ask/rows page 0; csv = /api/ask/rows/csv. */
  path: PerfPath;
  /** What the builder sends (before validateSpec), kept for questionErrors. */
  question: QuestionSpec;
  spec: AskSpec;
  /** rows/csv only: the drawer's exact selection inside the answer. */
  scope?: EvidenceScope;
  /** Warm budget: 1 s for an answer, 2 s for the heaviest national filtered cases (owner, 24 Oct 2026). */
  barMs: 1000 | 2000;
  /** The matching row of plan §6.4, when there is one. */
  ref?: string;
}

/** Identities of the local snapshot (marts.entity_profile, 23 Oct 2026). */
export const PERF_ENTITIES = {
  selgros: { id: 2115381, name: "SELGROS CASH&CARRY SRL" },
  dedeman: { id: 2124387, name: "DEDEMAN S.R.L." },
  clujNapoca: { id: 2146445, name: "Municipiul Cluj-Napoca" },
  clujNapocaUat: { siruta: 54975, name: "mun. Cluj-Napoca (Cluj)" },
} as const;

type Edit = (q: QuestionSpec) => void;
const firm = (e: { id: number; name: string } = PERF_ENTITIES.selgros): Edit => (q) => { q.filters.supplierName = e.name; q.filters.supplierId = e.id; };
const buyer = (e: { id: number; name: string } = PERF_ENTITIES.clujNapoca): Edit => (q) => { q.filters.authorityName = e.name; q.filters.authorityId = e.id; };
/** The builder's focal picker (pickEntity, registry writeFocal): the entity, and the answer's role with it. */
const focal = (role: "authority" | "supplier", e: { id: number; name: string } = role === "authority" ? PERF_ENTITIES.clujNapoca : PERF_ENTITIES.selgros): Edit => (q) => {
  const next = writeFocal(q, role, { name: e.name, id: e.id });
  q.filters = next.filters;
  if (next.dim) q.dim = next.dim;
};
const years = (from: number, to: number = from): Edit => (q) => { q.filters.yearFrom = from; q.filters.yearTo = to; };
const set = (filters: QuestionSpec["filters"]): Edit => (q) => { Object.assign(q.filters, filters); };
const top = (spec: Partial<Omit<QuestionSpec, "filters">>): Edit => (q) => { Object.assign(q, spec); };
const all = (...edits: Edit[]): Edit => (q) => { for (const edit of edits) edit(q); };
/** The trend's options (F2). */
const lens = (trend: NonNullable<AskSpec["trend"]>): Edit => (q) => { q.trend = { ...trend }; };

/** One builder question: the catalogue choice, the edits, then the builder's own normalization. */
export function builderQuestion(block: Block, edit: Edit = () => {}): QuestionSpec {
  const draft = transitionQuestion(defaultQuestion(), block).spec;
  edit(draft);
  return transitionQuestion(draft).spec;
}

function perfCase(
  id: string, group: PerfGroup, label: string, block: Block, edit: Edit,
  extra: { path?: PerfPath; scope?: EvidenceScope; barMs?: 1000 | 2000; ref?: string } = {},
): PerfCase {
  const question = builderQuestion(block, edit);
  const spec = validateSpec(question);
  if ("error" in spec) throw new Error(`ask-perf case ${id}: ${spec.error}`);
  return {
    id, group, label, path: extra.path ?? "answer", question, spec,
    ...(extra.scope ? { scope: extra.scope } : {}),
    barMs: extra.barMs ?? 1000,
    ...(extra.ref ? { ref: extra.ref } : {}),
  };
}

/**
 * The catalogue default of the blocks that cannot run without a choice: the
 * entities (compare, network, sankey, fact_check, distribution) and the two
 * years of the trend (the owner's 2025 → 2026 example).
 */
const CATALOG_CHOICES: Partial<Record<Block, { note: string; edit: Edit }>> = {
  compare: { note: "SELGROS cu DEDEMAN", edit: all(focal("supplier"), set({ compareWith: PERF_ENTITIES.dedeman.name, compareWithId: PERF_ENTITIES.dedeman.id })) },
  trend: { note: "firme, 2025 → 2026", edit: years(2025, 2026) },
  network: { note: "SELGROS", edit: focal("supplier") },
  sankey: { note: "SELGROS", edit: focal("supplier") },
  fact_check: { note: "Cluj-Napoca × SELGROS", edit: all(buyer(), firm()) },
  distribution: { note: "Municipiul Cluj-Napoca", edit: focal("authority") },
};

const SELGROS_ROW: EvidenceScope = { entityIds: [String(PERF_ENTITIES.selgros.id)], role: "supplier" };

export function perfCases(): PerfCase[] {
  const catalog = QUESTION_TYPES.map((type) => {
    const choice = CATALOG_CHOICES[type.id];
    return perfCase(`catalog:${type.id}`, "catalog", choice ? `${type.label} (${choice.note})` : type.label, type.id, choice?.edit ?? (() => {}),
      type.id === "trend" ? { ref: "exemplul proprietarului (2025 → 2026)" } : {});
  });
  return [
    ...catalog,
    // Heaviest national cases of §6.4 that today's keys can express.
    perfCase("national:trend-suppliers-2024-2025", "national", "Firme cu cea mai mare schimbare, 2024 → 2025", "trend", years(2024, 2025), { barMs: 2000, ref: "Trend, furnizori, național, 2024 → 2025" }),
    perfCase("national:table-suppliers-without-selgros", "national", "Cine câștigă, național, fără SELGROS (selecție precisă)", "table",
      top({ population: { operator: "and", groups: [{ operator: "and", conditions: [{ field: "supplier", op: "not_in", values: [String(PERF_ENTITIES.selgros.id)], labels: [PERF_ENTITIES.selgros.name] }] }] } }),
      { barMs: 2000, ref: "„Cine câștigă?” național, cu o firmă scoasă din calcul" }),
    perfCase("national:table-suppliers-1-9-employees", "national", "Cine câștigă, național, firme cu 1–9 angajați", "table", set({ minEmployees: 1, maxEmployees: 9 }), { barMs: 2000, ref: "„Cine câștigă?” național, toți anii, firme cu 1–9 angajați" }),
    perfCase("national:table-authorities-1-9-employees", "national", "Instituțiile care cumpără cel mai mult de la firme cu 1–9 angajați", "table", all(top({ dim: "authority" }), set({ minEmployees: 1, maxEmployees: 9 })), { barMs: 2000, ref: "Angajați 1–9 pe clasamentul instituțiilor, toți anii" }),
    perfCase("national:table-suppliers-2025", "national", "Cine câștigă, național, 2025", "table", years(2025), { barMs: 2000, ref: "Clasamentul firmelor, 2025" }),
    perfCase("national:table-suppliers-paged", "national", "Cine câștigă, național, toate rezultatele (pagina 1)", "table", (q) => { delete q.topN; }, { barMs: 2000 }),
    perfCase("national:table-authorities-per-capita", "national", "Instituțiile după valoarea pe locuitor", "table", top({ dim: "authority", measure: "value_per_capita" }), { barMs: 2000 }),
    perfCase("national:table-authorities-min-records", "national", "Instituțiile, doar firme cu cel puțin 5 înregistrări", "table", top({ dim: "authority", minimumRecords: { role: "supplier", count: 5 } }), { barMs: 2000 }),
    perfCase("national:table-suppliers-single-bidder", "national", "Cine câștigă contractele cu un singur ofertant", "table", set({ singleBidder: true }), { barMs: 2000 }),
    perfCase("national:stat-2025", "national", "Cât valorează achizițiile din 2025", "stat", years(2025), { barMs: 2000, ref: "„Din care” la stat: național 2025 (baza)" }),
    perfCase("national:stat-da-home-bound", "national", "Achizițiile directe de cel mult 2 mil. lei (pagina principală)", "stat",
      top({ dataset: "da", population: { operator: "and", groups: [{ operator: "and", conditions: [{ field: "value", op: "lte", value: "2000000" }] }] } }), { barMs: 1000 }),
    perfCase("national:map-2025", "national", "Harta pe județe, 2025", "map", years(2025), { barMs: 2000, ref: "Harta, 2025 (județul cumpărătorului)" }),
    perfCase("national:timeseries-medicines", "national", "Evoluția achizițiilor de medicamente", "timeseries", set({ cpvTerm: "medicamente" }), { barMs: 2000, ref: "Evoluție: domenii" }),
    perfCase("national:breakdown-2025", "national", "Pe ce se duc banii, 2025", "breakdown", years(2025), { barMs: 2000 }),
    perfCase("national:entity-card-value-medicines-2025", "national", "Cine conduce la medicamente, 2025 (valoare)", "entity_card", all(set({ cpvTerm: "medicamente" }), years(2025)), { barMs: 2000, ref: "„Cine conduce?”: valoare live („medicamente” 2025)" }),
    perfCase("national:entity-card-risk-authorities", "national", "Instituția cu cel mai ridicat indice de risc", "entity_card", top({ dim: "authority", rankBy: "risk" }), { barMs: 1000, ref: "„Cine conduce?”: indice" }),
    perfCase("national:table-hospitals-2024-2025", "national", "Firmele care câștigă de la spitale, 2024–2025", "table", all(set({ authorityKind: "spital" }), years(2024, 2025)), { barMs: 2000 }),
    perfCase("national:stat-works-cpv-45", "national", "Cât valorează lucrările (CPV 45)", "stat", set({ cpvTerm: "45" }), { barMs: 2000 }),
    // Narrow selections: county, locality, CPV, authority, supplier, year and month ranges.
    perfCase("filtered:table-cluj", "filtered", "Cine câștigă în județul Cluj", "table", set({ county: "Cluj" })),
    perfCase("filtered:table-cluj-2025", "filtered", "Cine câștigă în județul Cluj, 2025", "table", all(set({ county: "Cluj" }), years(2025))),
    perfCase("filtered:stat-uat-cluj-napoca", "filtered", "Cât valorează achizițiile localității Cluj-Napoca", "stat", set({ uatSiruta: PERF_ENTITIES.clujNapocaUat.siruta, uatName: PERF_ENTITIES.clujNapocaUat.name })),
    perfCase("filtered:timeseries-cluj-napoca", "filtered", "Cum evoluează achizițiile Municipiului Cluj-Napoca", "timeseries", buyer()),
    perfCase("filtered:table-buyers-of-selgros", "filtered", "Instituțiile care cumpără de la SELGROS", "table", firm()),
    perfCase("filtered:map-selgros", "filtered", "Harta achizițiilor de la SELGROS", "map", firm()),
    perfCase("filtered:breakdown-cluj-2023-2025", "filtered", "Ce cumpără instituțiile din Cluj, 2023–2025", "breakdown", all(set({ county: "Cluj" }), years(2023, 2025))),
    perfCase("filtered:stat-iasi-2025-h1", "filtered", "Achizițiile din Iași, ianuarie–iunie 2025", "stat", all(set({ county: "Iași", monthFrom: 1, monthTo: 6 }), years(2025))),
    perfCase("filtered:table-cluj-medicines-2024-2026", "filtered", "Cine vinde medicamente în Cluj, 2024–2026", "table", all(set({ county: "Cluj", cpvTerm: "medicamente" }), years(2024, 2026))),
    perfCase("filtered:trend-cluj-2024-2025", "filtered", "Firmele din Cluj cu cea mai mare schimbare, 2024 → 2025", "trend", all(set({ county: "Cluj" }), years(2024, 2025))),
    perfCase("filtered:compare-selgros-dedeman-2025", "filtered", "SELGROS cu DEDEMAN, 2025", "compare", all(CATALOG_CHOICES.compare!.edit, years(2025)), { ref: "Pre-pasul P la comparație (SELGROS/DEDEMAN)" }),
    // Sources (the drawer's first page) and CSV exports through the real runRows.
    perfCase("sources:table-national", "sources", "Sursele clasamentului național implicit", "table", () => {}, { path: "rows", barMs: 2000 }),
    perfCase("sources:table-national-selgros-row", "sources", "„Înregistrări →” pe rândul SELGROS al clasamentului național", "table", () => {}, { path: "rows", scope: SELGROS_ROW, ref: "„Înregistrări →” pe un singur rând" }),
    perfCase("sources:trend-2025-2026", "sources", "Sursele trendului 2025 → 2026", "trend", years(2025, 2026), { path: "rows", barMs: 2000, ref: "Surse trend (ambii ani)" }),
    perfCase("sources:trend-2025-2026-selgros-row", "sources", "„Înregistrări →” pe rândul SELGROS al trendului 2025 → 2026", "trend", years(2025, 2026), { path: "rows", scope: SELGROS_ROW, ref: "„Înregistrări →” pe un singur rând" }),
    perfCase("sources:table-cluj", "sources", "Sursele clasamentului din Cluj", "table", set({ county: "Cluj" }), { path: "rows" }),
    perfCase("sources:network-selgros", "sources", "Sursele rețelei SELGROS", "network", focal("supplier"), { path: "rows" }),
    perfCase("sources:distribution-cluj-napoca", "sources", "Sursele profilului Municipiului Cluj-Napoca", "distribution", focal("authority"),
      { path: "rows", scope: { entityIds: [String(PERF_ENTITIES.clujNapoca.id)], role: "authority" } }),
    // The source paths whose conditions F0 moved into lib/ask/predicates.ts: the DA bound
    // on direct acquisitions only, a comparison, and a profile population chosen by kind.
    perfCase("sources:stat-da-2025", "sources", "Sursele achizițiilor directe din 2025", "stat", all(top({ dataset: "da" }), years(2025)), { path: "rows", barMs: 2000 }),
    perfCase("sources:compare-selgros-dedeman-2025", "sources", "Sursele comparației SELGROS cu DEDEMAN, 2025", "compare", all(CATALOG_CHOICES.compare!.edit, years(2025)), { path: "rows" }),
    perfCase("sources:entity-card-risk-hospitals", "sources", "Sursele spitalului cu cel mai ridicat indice de risc", "entity_card",
      all(top({ dim: "authority", rankBy: "risk" }), set({ authorityKind: "spital" })), { path: "rows" }),
    perfCase("csv:table-cluj-2025", "csv", "CSV: clasamentul din Cluj, 2025", "table", all(set({ county: "Cluj" }), years(2025)), { path: "csv", barMs: 2000 }),
    perfCase("csv:trend-2025-2026-selgros-row", "csv", "CSV: rândul SELGROS al trendului 2025 → 2026", "trend", years(2025, 2026), { path: "csv", scope: SELGROS_ROW, barMs: 2000 }),
    perfCase("csv:table-national", "csv", "CSV: clasamentul național implicit (primele 100.000)", "table", () => {}, { path: "csv", barMs: 2000 }),
    // F2 (track trend, T1): the trend's lenses, written as the builder will write them (plan §2.6).
    perfCase("national:trend-suppliers-2024-2025-up", "national", "Firme cu cea mai mare creștere, 2024 → 2025", "trend", all(years(2024, 2025), lens({ change: "up", months: "auto" })), { barMs: 2000 }),
    perfCase("national:trend-suppliers-2024-2025-new-first", "national", "Firme noi, prima dată în 2025", "trend", all(years(2024, 2025), lens({ change: "new", firstOnly: true, months: "auto" })), { barMs: 2000 }),
    perfCase("national:trend-suppliers-2024-2025-percent", "national", "Firme cu cea mai mare creștere în procente, de la 1 mil. lei", "trend",
      all(years(2024, 2025), lens({ change: "up", order: "percent", minBase: 1_000_000, months: "auto" })), { barMs: 2000 }),
    perfCase("national:trend-suppliers-2025-2026-jan-may", "national", "Firme cu cea mai mare creștere, ian.–mai 2025 → 2026", "trend", all(years(2025, 2026), lens({ change: "up", months: [1, 5] })), { barMs: 2000, ref: "exemplul proprietarului, aceleași luni" }),
    perfCase("filtered:trend-cluj-2024-2025-gone", "filtered", "Firmele din Cluj care nu mai apar în 2025", "trend", all(set({ county: "Cluj" }), years(2024, 2025), lens({ change: "gone", months: "auto" }))),
    perfCase("sources:trend-2024-2025-new", "sources", "Sursele firmelor noi, 2024 → 2025 (național)", "trend", all(years(2024, 2025), lens({ change: "new", months: "auto" })), { path: "rows", barMs: 2000, ref: "Surse trend pe un grup („Noi”, național)" }),
    perfCase("sources:trend-2024-2025-up-selgros-row", "sources", "„Înregistrări →” pe rândul SELGROS al creșterilor 2024 → 2025", "trend", all(years(2024, 2025), lens({ change: "up", months: "auto" })), { path: "rows", scope: SELGROS_ROW, ref: "„Înregistrări →” pe un singur rând al unei grupe" }),
    perfCase("sources:trend-2025-2026-jan-may", "sources", "Sursele creșterilor, ian.–mai 2025 → 2026", "trend", all(years(2025, 2026), lens({ change: "up", months: [1, 5] })), { path: "rows", barMs: 2000 }),
    perfCase("csv:trend-2024-2025-gone-cluj", "csv", "CSV: firmele din Cluj care nu mai apar în 2025", "trend", all(set({ county: "Cluj" }), years(2024, 2025), lens({ change: "gone", months: "auto" })), { path: "csv", barMs: 2000 }),
  ];
}

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
import { withExclusion } from "../lib/ask/filters/exclusions";
import type { EvidenceScope } from "../lib/ask/evidence";
import type { FacetPart } from "../lib/ask/facet-parts";

export type PerfPath = "answer" | "rows" | "csv" | "facet";
export interface PerfDrawer { sort?: "source" | "value" | "date"; dir?: "asc" | "desc"; search?: string }
export type PerfGroup = "catalog" | "national" | "filtered" | "sources" | "csv" | "facets";
/** facet only: the window's part (lib/ask/facets.ts), and the text "Unde e …?" searches. */
export interface PerfFacet { part: FacetPart; q?: string; ids?: string[] }
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
  /** rows only: the page of the list (0 = the first). */
  page?: number;
  /** rows only: the drawer's order or text search (DrillSort, „Caută în surse”); its default without. */
  drawer?: PerfDrawer;
  /**
   * facet only (POST /api/ask/facets): the part counted on the spec as a draft. The counts are
   * computed on every run (none kept); "Unde e …?" keeps its rank vector, so its warm runs are the
   * searches after the first (plan §6.4: the first ≤ the answer, the next ≤ 0.3 s).
   */
  facet?: PerfFacet;
  /**
   * rows/csv only: the answer runs first in the same process, untimed, as the
   * drawer opens after it (a trend group's members kept by the answer,
   * lib/ask/group-ids.ts). Without it the first run is the drawer of another
   * process (nothing kept) and the warm runs reuse what it kept.
   */
  afterAnswer?: true;
  /** Warm budget: 1 s for an answer, 2 s for the heaviest national filtered cases (owner, 24 Oct 2026). */
  barMs: 1000 | 2000;
  /** Known over the bar, recorded on PRECOMPUTE.md for the marts stage (the entry's title): reported, not a regression. */
  precompute?: string;
  /** The matching row of plan §6.4, when there is one. */
  ref?: string;
}

/** Identities of the local snapshot (marts.entity_profile, 23 Oct 2026). */
export const PERF_ENTITIES = {
  selgros: { id: 2115381, name: "SELGROS CASH&CARRY SRL" },
  dedeman: { id: 2124387, name: "DEDEMAN S.R.L." },
  // F4-exclude: the two first firms nationally, and a small one outside agg_top_entities.
  alliance: { id: 2128212, name: "ALLIANCE HEALTHCARE ROMANIA" },
  farmexim: { id: 2128622, name: "FARMEXIM S.A." },
  curelaru: { id: 1967089, name: "CURELARU PROD EXIM SRL" },
  clujNapoca: { id: 2146445, name: "Municipiul Cluj-Napoca" },
  clujNapocaUat: { siruta: 54975, name: "mun. Cluj-Napoca (Cluj)" },
  // F4-network-sankey: the final's institutions (network final §3.1), a county hospital with 1,095 partners.
  buzau: { id: 2144364, name: "MUNICIPIUL BUZAU" },
  bacau: { id: 2146264, name: "SPITALUL JUDETEAN DE URGENTA BACAU" },
  // F4-compare: the final's pairs (final compare §3.4, §4).
  erbasu: { id: 2124463, name: "CONSTRUCTII ERBASU S.A." },
  terraGaz: { id: 2128220, name: "TERRA GAZ CONSTRUCT" },
  timisoara: { id: 2146647, name: "Municipiul Timisoara" },
  // F6a's distribution groups (final distribution §3.2), with Buzău above.
  rusetu: { id: 2144926, name: "Comuna Rusetu" },
  corabia: { id: 2146373, name: "Spitalul Orasenesc Corabia" },
  // F6a's verification (final fact_check §4–§5).
  urbanScope: { id: 2064733, name: "URBAN SCOPE" },
  bucuresti: { id: 2144903, name: "MUNICIPIUL BUCURESTI" },
  ceconi: { id: 2122975, name: "CECONI" },
  abaSomesTisa: { id: 2128873, name: "ADMINISTRATIA BAZINALA DE APA SOMES TISA" },
  proeuro: { id: 2020594, name: "PROEURO CONSTRUCT SRL" },
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
  extra: { path?: PerfPath; scope?: EvidenceScope; page?: number; drawer?: PerfDrawer; afterAnswer?: true; barMs?: 1000 | 2000; ref?: string; precompute?: string; facet?: PerfFacet } = {},
): PerfCase {
  const question = builderQuestion(block, edit);
  const spec = validateSpec(question);
  if ("error" in spec) throw new Error(`ask-perf case ${id}: ${spec.error}`);
  return {
    id, group, label, path: extra.facet ? "facet" : extra.path ?? "answer", question, spec,
    ...(extra.facet ? { facet: extra.facet } : {}),
    ...(extra.scope ? { scope: extra.scope } : {}),
    ...(extra.page ? { page: extra.page } : {}),
    ...(extra.drawer ? { drawer: extra.drawer } : {}),
    ...(extra.afterAnswer ? { afterAnswer: true as const } : {}),
    barMs: extra.barMs ?? 1000,
    ...(extra.ref ? { ref: extra.ref } : {}),
    ...(extra.precompute ? { precompute: extra.precompute } : {}),
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
/** The PRECOMPUTE.md entry the orders of „Toate” other than the default still wait on (S3 review; S5 PRE-trend closed the rest). */
const ALL_DRAWER = "Sertarul „Toate” al trendului";

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
    // The kind of institution (D1: town halls from the locality registry, hospitals with the
    // clinical institutes), on the rollups and on the live paths the rollups refuse (months, CPV).
    perfCase("national:table-communes", "national", "Primăriile de comună care cumpără cel mai mult", "table", all(top({ dim: "authority" }), set({ authorityKind: "comuna" })), { barMs: 2000 }),
    perfCase("national:table-towns-2025", "national", "Primăriile de oraș și municipiu care cumpără cel mai mult, 2025", "table", all(top({ dim: "authority" }), set({ authorityKind: "oras_municipiu" }), years(2025)), { barMs: 2000 }),
    perfCase("national:stat-hospitals-2025-h1", "national", "Cât valorează achizițiile spitalelor, ianuarie–iunie 2025", "stat", all(set({ authorityKind: "spital", monthFrom: 1, monthTo: 6 }), years(2025)), { barMs: 2000 }),
    perfCase("national:breakdown-communes-2025", "national", "Ce cumpără primăriile de comună, 2025", "breakdown", all(set({ authorityKind: "comuna" }), years(2025)), { barMs: 2000 }),
    perfCase("national:scatter-towns", "national", "Primăriile de oraș și municipiu care ies din tipar", "scatter", all(top({ dim: "authority" }), set({ authorityKind: "oras_municipiu" })), { barMs: 1000 }),
    perfCase("national:entity-card-value-hospitals-2025", "national", "Spitalul care cumpără cel mai mult, 2025", "entity_card", all(top({ dim: "authority", rankBy: "value" }), set({ authorityKind: "spital" }), years(2025)), { barMs: 2000 }),
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
    perfCase("filtered:stat-cluj-hospitals-2025-h1", "filtered", "Achizițiile spitalelor din Cluj, ianuarie–iunie 2025", "stat", all(set({ county: "Cluj", authorityKind: "spital", monthFrom: 1, monthTo: 6 }), years(2025))),
    perfCase("filtered:breakdown-cluj-communes-2024", "filtered", "Ce cumpără primăriile de comună din Cluj, 2024", "breakdown", all(set({ county: "Cluj", authorityKind: "comuna" }), years(2024))),
    perfCase("filtered:compare-selgros-dedeman-2025", "filtered", "SELGROS cu DEDEMAN, 2025", "compare", all(CATALOG_CHOICES.compare!.edit, years(2025)), { ref: "Pre-pasul P la comparație (SELGROS/DEDEMAN)" }),
    // The strip beside the answer (F1b): the stream is a one-click toggle on an answer already on screen
    // (appliedAfterStrip: only `dataset` changes), so each question with it is measured on both streams.
    ...(["compare", "network", "sankey", "breakdown"] as const).flatMap((block) => (["da", "contracts"] as const).map((dataset) =>
      perfCase(`strip:${block}-${dataset}`, "filtered", `Banda: ${CATALOG_CHOICES[block]?.note ?? "pe domenii"}, ${dataset === "da" ? "Directe" : "Proceduri"}`, block,
        all(CATALOG_CHOICES[block]?.edit ?? years(2025), top({ dataset })), { ref: "Comutatorul de canal din bandă (F1b)" }))),
    // "+ Ce s-a cumpărat" is a first-row invitation of the rankings (F1b): national, all years, a domain.
    perfCase("national:table-suppliers-medicines", "national", "Cine câștigă la medicamente, național, toți anii", "table", set({ cpvTerm: "medicamente" }), { barMs: 2000, ref: "Invitația „+ Ce s-a cumpărat” pe clasament" }),
    perfCase("national:table-authorities-medicines", "national", "Instituțiile care cumpără cele mai multe medicamente, național", "table", all(top({ dim: "authority" }), set({ cpvTerm: "medicamente" })), { barMs: 2000 }),
    // Sources (the drawer's first page) and CSV exports through the real runRows.
    perfCase("sources:table-national", "sources", "Sursele clasamentului național implicit", "table", () => {}, { path: "rows", barMs: 2000 }),
    perfCase("sources:table-national-selgros-row", "sources", "„Înregistrări →” pe rândul SELGROS al clasamentului național", "table", () => {}, { path: "rows", scope: SELGROS_ROW, ref: "„Înregistrări →” pe un singur rând" }),
    perfCase("sources:trend-2025-2026", "sources", "Sursele trendului 2025 → 2026", "trend", years(2025, 2026), { path: "rows", barMs: 2000, ref: "Surse trend (ambii ani)" }),
    perfCase("sources:trend-2025-2026-selgros-row", "sources", "„Înregistrări →” pe rândul SELGROS al trendului 2025 → 2026", "trend", years(2025, 2026), { path: "rows", scope: SELGROS_ROW, ref: "„Înregistrări →” pe un singur rând" }),
    perfCase("sources:table-cluj", "sources", "Sursele clasamentului din Cluj", "table", set({ county: "Cluj" }), { path: "rows" }),
    perfCase("sources:network-selgros", "sources", "Sursele rețelei SELGROS", "network", focal("supplier"), { path: "rows" }),
    perfCase("sources:distribution-cluj-napoca", "sources", "Sursele profilului Municipiului Cluj-Napoca", "distribution", focal("authority"),
      { path: "rows", scope: { entityIds: [String(PERF_ENTITIES.clujNapoca.id)], role: "authority" } }),
    // F6a: the distribution's group (lib/ask/peer-groups.ts, distribution.ts): the answer, a bar's sources, the group's CSV.
    perfCase("national:distribution-buzau-population", "national", "Unde se situează Buzău față de primăriile cu 52–207 mii de locuitori", "distribution",
      all(focal("authority", PERF_ENTITIES.buzau), top({ peers: { similar: true } })), { barMs: 1000 }),
    perfCase("national:distribution-rusetu-population", "national", "Unde se situează Rusetu față de 2.034 de primării de mărimea ei", "distribution",
      all(focal("authority", PERF_ENTITIES.rusetu), top({ peers: { similar: true } })), { barMs: 1000 }),
    perfCase("national:distribution-dedeman-country", "national", "Unde se situează DEDEMAN față de toate firmele", "distribution", focal("supplier", PERF_ENTITIES.dedeman), { barMs: 1000 }),
    perfCase("national:distribution-dedeman-seat", "national", "Unde se situează DEDEMAN față de firmele cu sediul în Bacău", "distribution",
      all(focal("supplier", PERF_ENTITIES.dedeman), set({ county: "Bacău" })), { barMs: 1000 }),
    perfCase("national:distribution-hospital-kind-activity", "national", "Unde se situează Spitalul Corabia față de spitalele cu activitate apropiată", "distribution",
      all(focal("authority", PERF_ENTITIES.corabia), top({ peers: { similar: true, activity: true } })), { barMs: 1000 }),
    perfCase("sources:distribution-rusetu-bar", "sources", "Sursele profilurilor cu 2 criterii din grupul Rusetu (442)", "distribution",
      all(focal("authority", PERF_ENTITIES.rusetu), top({ peers: { similar: true } })), { path: "rows", scope: { criteria: 2 }, barMs: 2000 }),
    perfCase("csv:distribution-rusetu-group", "csv", "CSV-ul surselor grupului Rusetu (2.034 de profiluri)", "distribution",
      all(focal("authority", PERF_ENTITIES.rusetu), top({ peers: { similar: true } })), { path: "csv", barMs: 2000 }),
    // F6a: the verification (lib/ask/fact-check.ts): the whole answer, the weight among DEDEMAN's 10.575 clients, a narrower
    // "Nu" with the relation, "Nu" in the archive (twins, partners), the answer's lines in the drawer and the CSV.
    perfCase("national:fact-check-buzau-urban", "national", "A cumpărat Buzău de la URBAN SCOPE? (profil, pondere, listă)", "fact_check",
      all(buyer(PERF_ENTITIES.buzau), firm(PERF_ENTITIES.urbanScope)), { barMs: 1000 }),
    perfCase("national:fact-check-bucuresti-dedeman", "national", "A cumpărat Municipiul București de la DEDEMAN? (ponderea printre 10.575 de clienți)", "fact_check",
      all(buyer(PERF_ENTITIES.bucuresti), firm(PERF_ENTITIES.dedeman)), { barMs: 1000 }),
    perfCase("national:fact-check-cluj-ceconi-2026", "national", "A cumpărat Cluj-Napoca de la CECONI în 2026? (Nu, cu toată relația)", "fact_check",
      all(buyer(PERF_ENTITIES.clujNapoca), firm(PERF_ENTITIES.ceconi), years(2026)), { barMs: 1000 }),
    perfCase("national:fact-check-aba-proeuro", "national", "A cumpărat ABA Someș-Tisa de la PROEURO? (Nu în arhivă: același nume, parteneri)", "fact_check",
      all(buyer(PERF_ENTITIES.abaSomesTisa), firm(PERF_ENTITIES.proeuro)), { barMs: 1000 }),
    perfCase("sources:fact-check-buzau-urban-consortium", "sources", "Contractele în asociere Buzău × URBAN SCOPE", "fact_check",
      all(buyer(PERF_ENTITIES.buzau), firm(PERF_ENTITIES.urbanScope)), { path: "rows", scope: { consortium: true } }),
    perfCase("sources:fact-check-buzau-urban-single", "sources", "Licitațiile cu o singură ofertă Buzău × URBAN SCOPE", "fact_check",
      all(buyer(PERF_ENTITIES.buzau), firm(PERF_ENTITIES.urbanScope)), { path: "rows", scope: { singleBid: true } }),
    perfCase("csv:fact-check-bucuresti-dedeman", "csv", "CSV-ul surselor București × DEDEMAN", "fact_check",
      all(buyer(PERF_ENTITIES.bucuresti), firm(PERF_ENTITIES.dedeman)), { path: "csv", barMs: 2000 }),
    // The source paths whose conditions F0 moved into lib/ask/predicates.ts: the DA bound
    // on direct acquisitions only, a comparison, and a profile population chosen by kind.
    perfCase("sources:stat-da-2025", "sources", "Sursele achizițiilor directe din 2025", "stat", all(top({ dataset: "da" }), years(2025)), { path: "rows", barMs: 2000 }),
    perfCase("sources:compare-selgros-dedeman-2025", "sources", "Sursele comparației SELGROS cu DEDEMAN, 2025", "compare", all(CATALOG_CHOICES.compare!.edit, years(2025)), { path: "rows" }),
    perfCase("sources:compare-selgros-dedeman", "sources", "Sursele comparației SELGROS cu DEDEMAN, toți anii (catalogul)", "compare", CATALOG_CHOICES.compare!.edit, { path: "rows", barMs: 2000 }),
    perfCase("sources:entity-card-risk-hospitals", "sources", "Sursele spitalului cu cel mai ridicat indice de risc", "entity_card",
      all(top({ dim: "authority", rankBy: "risk" }), set({ authorityKind: "spital" })), { path: "rows" }),
    perfCase("sources:table-hospitals-2024-2025", "sources", "Sursele clasamentului firmelor care câștigă de la spitale, 2024–2025", "table",
      all(set({ authorityKind: "spital" }), years(2024, 2025)), { path: "rows", barMs: 2000 }),
    perfCase("sources:stat-communes-2025", "sources", "Sursele achizițiilor primăriilor de comună, 2025", "stat", all(set({ authorityKind: "comuna" }), years(2025)), { path: "rows", barMs: 2000 }),
    // A kind in a past year: the key walk read every newer record (communes, 2019: 17 s).
    perfCase("sources:stat-communes-2019", "sources", "Sursele achizițiilor primăriilor de comună, 2019", "stat", all(set({ authorityKind: "comuna" }), years(2019)), { path: "rows", barMs: 2000 }),
    perfCase("sources:trend-communes-2018-2019", "sources", "Sursele schimbării la primăriile de comună, 2018 → 2019", "trend", all(set({ authorityKind: "comuna" }), years(2018, 2019)), { path: "rows", barMs: 2000 }),
    perfCase("sources:stat-communes-2019-da", "sources", "Sursele achizițiilor directe ale primăriilor de comună, 2019", "stat",
      all(top({ dataset: "da" }), set({ authorityKind: "comuna" }), years(2019)), { path: "rows", barMs: 2000 }),
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
    // F2 (track trend, T2): the partition on the other subjects, a live grouping and an old link with 2018.
    perfCase("national:trend-authorities-2024-2025-up", "national", "Instituții cu cea mai mare creștere, 2024 → 2025", "trend", all(top({ dim: "authority" }), years(2024, 2025), lens({ change: "up", months: "auto" })), { barMs: 2000 }),
    perfCase("national:trend-counties-2024-2025-down", "national", "Județe cu cea mai mare scădere, 2024 → 2025", "trend", all(top({ dim: "county" }), years(2024, 2025), lens({ change: "down", months: "auto" })), { barMs: 2000 }),
    perfCase("national:trend-medicamente-2024-2025-new", "national", "Firme noi la medicamente, 2024 → 2025 (grupare live)", "trend", all(set({ cpvTerm: "medicamente" }), years(2024, 2025), lens({ change: "new", months: "auto" })), { barMs: 2000 }),
    perfCase("filtered:trend-cluj-napoca-suppliers-2024-2025-new", "filtered", "Furnizori noi ai Municipiului Cluj-Napoca, 2024 → 2025", "trend", all(buyer(), years(2024, 2025), lens({ change: "new", months: "auto" }))),
    perfCase("national:trend-suppliers-2018-2019", "national", "Firme cu cea mai mare schimbare, 2018 → 2019 (link vechi)", "trend", years(2018, 2019), { barMs: 2000 }),
    // F2 (track trend, T3): a group's sources from the members the answer keeps (group-ids.ts), cold and after the answer.
    perfCase("sources:trend-2024-2025-new-after-answer", "sources", "Sursele firmelor noi, 2024 → 2025, după răspuns", "trend", all(years(2024, 2025), lens({ change: "new", months: "auto" })),
      { path: "rows", afterAnswer: true, barMs: 2000, ref: "Surse trend pe un grup („Noi”, național), după răspuns (cache umplut)" }),
    perfCase("sources:trend-2024-2025-new-page-2", "sources", "Sursele firmelor noi, 2024 → 2025, pagina a doua", "trend", all(years(2024, 2025), lens({ change: "new", months: "auto" })),
      { path: "rows", page: 1, afterAnswer: true, barMs: 2000, ref: "Surse trend pe un grup, paginile următoare" }),
    perfCase("sources:trend-2024-2025-up", "sources", "Sursele creșterilor, 2024 → 2025 (național)", "trend", all(years(2024, 2025), lens({ change: "up", months: "auto" })),
      { path: "rows", barMs: 2000, ref: "Surse trend pe un grup („Creșteri”, național), la rece" }),
    perfCase("sources:trend-2024-2025-up-after-answer", "sources", "Sursele creșterilor, 2024 → 2025, după răspuns", "trend", all(years(2024, 2025), lens({ change: "up", months: "auto" })),
      { path: "rows", afterAnswer: true, barMs: 2000 }),
    perfCase("sources:trend-2024-2025-up-selgros-row-after-answer", "sources", "„Înregistrări →” pe rândul SELGROS al creșterilor, după răspuns", "trend", all(years(2024, 2025), lens({ change: "up", months: "auto" })),
      { path: "rows", scope: SELGROS_ROW, afterAnswer: true, ref: "„Înregistrări →” pe un singur rând al unei grupe, după răspuns" }),
    perfCase("sources:trend-counties-2024-2025-down", "sources", "Sursele județelor în scădere, 2024 → 2025", "trend", all(top({ dim: "county" }), years(2024, 2025), lens({ change: "down", months: "auto" })),
      { path: "rows", barMs: 2000 }),
    perfCase("sources:trend-cluj-napoca-suppliers-2024-2025-new", "sources", "Sursele furnizorilor noi ai Municipiului Cluj-Napoca, 2024 → 2025", "trend",
      all(buyer(), years(2024, 2025), lens({ change: "new", months: "auto" })), { path: "rows" }),
    perfCase("csv:trend-2024-2025-new-after-answer", "csv", "CSV: firmele noi, 2024 → 2025 (național), după răspuns", "trend", all(years(2024, 2025), lens({ change: "new", months: "auto" })),
      { path: "csv", afterAnswer: true, barMs: 2000 }),
    // S3 F2-merge-fixes: „Toate” of the national trend, „Înregistrările celor doi ani” (4.9M records; track verify problem 3).
    perfCase("sources:trend-2024-2025-all", "sources", "Înregistrările celor doi ani, „Toate”, 2024 → 2025 (național), la rece", "trend", all(years(2024, 2025), lens({ change: "all", months: "auto" })),
      { path: "rows", barMs: 2000, ref: "Surse trend „Toate” (ambii ani, național)" }),
    perfCase("sources:trend-2024-2025-all-after-answer", "sources", "Înregistrările celor doi ani, „Toate”, 2024 → 2025, după răspuns", "trend", all(years(2024, 2025), lens({ change: "all", months: "auto" })),
      { path: "rows", afterAnswer: true, barMs: 2000 }),
    // S3 review: „Toate” on every trend screen (old links, institutions, counties), over the bar wherever its page reads the
    // whole covering index; the marts stage is checked against each dimension, an older pair, the other orders and a search.
    perfCase("sources:trend-authorities-2024-2025-all-after-answer", "sources", "„Toate” la instituții, 2024 → 2025, după răspuns", "trend",
      all(top({ dim: "authority" }), years(2024, 2025), lens({ change: "all", months: "auto" })), { path: "rows", afterAnswer: true, barMs: 2000 }),
    perfCase("sources:trend-counties-2024-2025-all-after-answer", "sources", "„Toate” la județe, 2024 → 2025, după răspuns", "trend",
      all(top({ dim: "county" }), years(2024, 2025), lens({ change: "all", months: "auto" })), { path: "rows", afterAnswer: true, barMs: 2000 }),
    perfCase("sources:trend-2021-2022-all-after-answer", "sources", "„Toate” la firme, 2021 → 2022, după răspuns", "trend",
      all(years(2021, 2022), lens({ change: "all", months: "auto" })), { path: "rows", afterAnswer: true, barMs: 2000 }),
    perfCase("sources:trend-2024-2025-all-by-value-after-answer", "sources", "„Toate” la firme, 2024 → 2025, după valoare, după răspuns", "trend",
      all(years(2024, 2025), lens({ change: "all", months: "auto" })), { path: "rows", drawer: { sort: "value", dir: "desc" }, afterAnswer: true, barMs: 2000, precompute: ALL_DRAWER }),
    perfCase("sources:trend-2024-2025-all-source-asc-after-answer", "sources", "„Toate” la firme, 2024 → 2025, cele mai vechi surse întâi, după răspuns", "trend",
      all(years(2024, 2025), lens({ change: "all", months: "auto" })), { path: "rows", drawer: { sort: "source", dir: "asc" }, afterAnswer: true, barMs: 2000, precompute: ALL_DRAWER }),
    perfCase("sources:trend-2024-2025-all-search-after-answer", "sources", "„Toate” la firme, 2024 → 2025, căutare „medicamente”, după răspuns", "trend",
      all(years(2024, 2025), lens({ change: "all", months: "auto" })), { path: "rows", drawer: { search: "medicamente" }, afterAnswer: true, barMs: 2000 }),
    ...preTrendCases(),
    ...preSourcesCases(),
    ...f3Cases(),
    ...facetCases(),
    ...f3RowsCases(),
    ...seatCases(),
    ...excludeCases(),
    ...relationCases(),
    ...compareCases(),
  ];
}

/**
 * F4-network-sankey (S4; plan §4.8, §4.9, §6.4): the network's groups of the whole relation (the largest firm's 466
 * thousand direct acquisitions; a county hospital), „Cu semnale”, a group on one channel, a group's sources (its
 * partners' records, a semi-join on the relation); the flow two CPV digits below a domain and on one channel.
 */
/**
 * F4-compare (plan §4.6, §6.4): „Doar clienții comuni” (the pre-step P) on the heaviest pair and on the final's
 * example, its card's sources, the institutions' context rows (the suppliers' seat, the distinct contracts, the codes
 * above a domain), and the builder's pair facts and suggestions, asked when a window opens.
 */
function compareCases(): PerfCase[] {
  const pair = (b: { id: number; name: string }) => set({ compareWith: b.name, compareWithId: b.id });
  const selgrosDedeman = all(focal("supplier"), pair(PERF_ENTITIES.dedeman));
  const erbasuTerra = all(focal("supplier", PERF_ENTITIES.erbasu), pair(PERF_ENTITIES.terraGaz));
  const clujTimisoara = all(focal("authority"), pair(PERF_ENTITIES.timisoara));
  const shared = set({ sharedPartners: true });
  return [
    perfCase("filtered:compare-shared-selgros-dedeman", "filtered", "SELGROS cu DEDEMAN, doar clienții comuni (3.050), toți anii", "compare", all(selgrosDedeman, shared)),
    perfCase("filtered:compare-shared-erbasu-terra", "filtered", "Erbașu cu Terra Gaz, doar clienții comuni", "compare", all(erbasuTerra, shared)),
    perfCase("filtered:compare-cluj-timisoara", "filtered", "Cluj-Napoca cu Timișoara (sediul furnizorilor, contractele distincte)", "compare", clujTimisoara),
    perfCase("filtered:compare-cluj-timisoara-roads", "filtered", "Cluj-Napoca cu Timișoara, CPV 45233 (+ coduri mai generale)", "compare", all(clujTimisoara, set({ cpvTerm: "45233" }))),
    perfCase("sources:compare-shared-selgros", "sources", "Sursele cardului SELGROS, doar clienții comuni", "compare", all(selgrosDedeman, shared),
      { path: "rows", scope: SELGROS_ROW, barMs: 2000 }),
    perfCase("facets:pair-selgros-dedeman", "facets", "Indiciile perechii SELGROS / DEDEMAN (ani, domenii, clienți)", "compare", selgrosDedeman, { facet: { part: "pair" }, barMs: 2000 }),
    perfCase("facets:pair-cluj-timisoara", "facets", "Indiciile perechii Cluj-Napoca / Timișoara", "compare", clujTimisoara, { facet: { part: "pair" }, barMs: 1000 }),
    perfCase("facets:compare-peers-selgros", "facets", "„Cu cine comparăm?” pentru SELGROS (clienți comuni)", "compare", selgrosDedeman, { facet: { part: "compare-peers" }, barMs: 2000 }),
    perfCase("facets:compare-peers-cluj", "facets", "„Cu cine comparăm?” pentru Cluj-Napoca (populație)", "compare", clujTimisoara, { facet: { part: "compare-peers" }, barMs: 1000 }),
  ];
}

function relationCases(): PerfCase[] {
  const network = (edit: NonNullable<AskSpec["network"]>): Edit => (q) => { q.network = { show: 15, ...edit }; };
  const bacau = focal("authority", PERF_ENTITIES.bacau), buzau = focal("authority", PERF_ENTITIES.buzau), selgros = focal("supplier");
  return [
    perfCase("filtered:network-buzau-new", "filtered", "Cu cine a început să lucreze Buzăul din 2025", "network", all(buzau, network({ partners: "new", since: 2025 }))),
    perfCase("filtered:network-bacau-continuing-signals", "filtered", "Spitalul Bacău: partenerii care continuă, cu semnale", "network", all(bacau, network({ partners: "continuing", since: 2025, signals: true }))),
    perfCase("filtered:network-bacau-cpv33-2023", "filtered", "Spitalul Bacău, CPV 33, 2023–2024", "network", all(bacau, set({ cpvTerm: "33" }), years(2023, 2024))),
    perfCase("filtered:network-selgros-gone", "filtered", "SELGROS: clienții care nu mai apar din 2025", "network", all(selgros, network({ partners: "gone", since: 2025 }))),
    perfCase("filtered:network-selgros-new-da", "filtered", "SELGROS: clienți noi din 2025, directe", "network", all(selgros, top({ dataset: "da" }), network({ partners: "new", since: 2025 }))),
    perfCase("filtered:network-buzau-seat-other", "filtered", "Buzău: furnizorii cu sediul în alt județ", "network", all(buzau, set({ firmSeat: "other" }))),
    // S5 (S4 leftovers): the firms the seat cannot place, counted beside the answer on the busiest institution.
    perfCase("filtered:network-bacau-seat-other", "filtered", "Spitalul Bacău: furnizorii cu sediul în alt județ (+ fără sediu cunoscut)", "network", all(bacau, set({ firmSeat: "other" }))),
    perfCase("sources:network-selgros-gone", "sources", "Sursele grupei „Nu mai apar” a SELGROS", "network", all(selgros, network({ partners: "gone", since: 2025 })), { path: "rows", barMs: 2000 }),
    perfCase("sources:network-bacau-signals", "sources", "Sursele partenerilor cu semnale ai Spitalului Bacău", "network", all(bacau, network({ signals: true })), { path: "rows", barMs: 2000 }),
    perfCase("csv:network-selgros-new", "csv", "CSV: clienții noi ai SELGROS din 2025", "network", all(selgros, network({ partners: "new", since: 2025 })), { path: "csv", barMs: 2000 }),
    perfCase("filtered:sankey-buzau-45", "filtered", "Ce cumpără Buzăul în construcții și de la cine", "sankey", all(buzau, set({ cpvTerm: "45" }))),
    perfCase("filtered:sankey-bacau-15", "filtered", "Spitalul Bacău: primii 15 furnizori, pe domenii", "sankey", all(bacau, (q) => { q.sankey = { shown: 15 }; })),
    perfCase("filtered:sankey-bacau-seat-same", "filtered", "Spitalul Bacău: furnizorii din județ, pe domenii", "sankey", all(bacau, set({ firmSeat: "same" }))),
    // S4 review: „Toți” on one channel or in a period lists the partners from the records it bounds (as network-1); the
    // whole relation (groups, years, signals, the strip's shares) is asked after the answer (part=network).
    perfCase("filtered:network-selgros-2025", "filtered", "SELGROS, 2025, toate achizițiile", "network", all(selgros, years(2025))),
    perfCase("facets:network-whole-selgros-contracts", "facets", "Relația întreagă după „SELGROS, Proceduri”", "network", all(selgros, top({ dataset: "contracts" })),
      { facet: { part: "network" }, barMs: 2000 }),
    perfCase("facets:network-whole-selgros-2025", "facets", "Relația întreagă după „SELGROS, 2025”", "network", all(selgros, years(2025)), { facet: { part: "network" }, barMs: 2000 }),
    // S4 review: an anchored breakdown on one channel reads that channel only (no second pass for the strip's shares).
    perfCase("filtered:breakdown-selgros-contracts", "filtered", "Ce vinde SELGROS, Proceduri", "breakdown", all(set({ supplierName: PERF_ENTITIES.selgros.name, supplierId: PERF_ENTITIES.selgros.id }), top({ dataset: "contracts" }))),
    perfCase("filtered:breakdown-selgros-da", "filtered", "Ce vinde SELGROS, Directe", "breakdown", all(set({ supplierName: PERF_ENTITIES.selgros.name, supplierId: PERF_ENTITIES.selgros.id }), top({ dataset: "da" }))),
  ];
}

/**
 * F4-exclude (S4; plan §2.5, §4.2, §4.7, §4.13, §6.4): „Scoate din calcul” as the answer's "⋯" writes it
 * (exclusions.ts withExclusion): the national ranking's fast path (agg_top_entities less the rows, agg_national less
 * their sums), the rollups elsewhere, the trend, a map and a total with an institution or a firm left out, and their
 * sources and CSV.
 */
const YEAR_RANKING_SOURCES = "Prima pagină a surselor unui clasament național pe un an";
function excludeCases(): PerfCase[] {
  const firm = (e: { id: number; name: string }) => ({ field: "supplier" as const, value: String(e.id), label: e.name });
  const leaveOut = (...entities: { field: "authority" | "supplier"; value: string; label: string }[]): Edit => (q) => {
    for (const entity of entities) q.population = withExclusion(q.population, entity);
  };
  const selgros = leaveOut(firm(PERF_ENTITIES.selgros));
  const clujNapoca = leaveOut({ field: "authority", value: String(PERF_ENTITIES.clujNapoca.id), label: PERF_ENTITIES.clujNapoca.name });
  const institutions = top({ dim: "authority" });
  return [
    perfCase("national:table-authorities-without-cluj-napoca", "national", "Instituțiile care cumpără cel mai mult, fără Cluj-Napoca", "table", all(institutions, clujNapoca), { barMs: 2000 }),
    // Four firms, one outside the precomputed ranking (its records counted on its id index).
    perfCase("national:table-suppliers-without-four", "national", "Cine câștigă, național, fără 4 firme (una mică)", "table",
      leaveOut(firm(PERF_ENTITIES.alliance), firm(PERF_ENTITIES.farmexim), firm(PERF_ENTITIES.selgros), firm(PERF_ENTITIES.curelaru)), { barMs: 2000 }),
    perfCase("national:table-suppliers-2025-without-selgros", "national", "Cine câștigă, național, 2025, fără SELGROS", "table", all(years(2025), selgros), { barMs: 2000 }),
    perfCase("national:entity-card-value-without-leader", "national", "Care firmă câștigă cel mai mult, fără ALLIANCE HEALTHCARE", "entity_card",
      all(top({ dim: "supplier", rankBy: "value" }), leaveOut(firm(PERF_ENTITIES.alliance))), { barMs: 2000 }),
    perfCase("national:trend-suppliers-2024-2025-up-without-selgros", "national", "Creșterile firmelor, 2024 → 2025, fără SELGROS", "trend",
      all(years(2024, 2025), lens({ change: "up", months: "auto" }), selgros), { barMs: 2000 }),
    perfCase("national:map-without-cluj-napoca", "national", "Harta achizițiilor, fără Cluj-Napoca", "map", clujNapoca, { barMs: 2000 }),
    perfCase("national:stat-without-selgros", "national", "Cât valorează achizițiile, fără SELGROS", "stat", selgros, { barMs: 2000 }),
    perfCase("sources:table-national-without-selgros", "sources", "Sursele clasamentului național, fără SELGROS", "table", selgros, { path: "rows", barMs: 2000 }),
    perfCase("sources:table-authorities-without-cluj-napoca", "sources", "Sursele clasamentului instituțiilor, fără Cluj-Napoca", "table", all(institutions, clujNapoca), { path: "rows", barMs: 2000 }),
    // A year's national ranking: its sources' first page is the annual scan of both marts, with or without the exclusion.
    perfCase("sources:table-suppliers-2025", "sources", "Sursele clasamentului firmelor, 2025", "table", years(2025), { path: "rows", barMs: 2000, precompute: YEAR_RANKING_SOURCES }),
    perfCase("sources:table-suppliers-2025-without-selgros", "sources", "Sursele clasamentului firmelor, 2025, fără SELGROS", "table", all(years(2025), selgros), { path: "rows", barMs: 2000, precompute: YEAR_RANKING_SOURCES }),
    perfCase("csv:table-national-without-selgros", "csv", "CSV: clasamentul național, fără SELGROS", "table", selgros, { path: "csv", barMs: 2000 }),
  ];
}

/**
 * F4-seat (S4; plan §2.5, §4.2, §4.12, §4.13, §6.4): the firm's seat against the buyer's county (firmSeat) and of its
 * own (seatCounty), as the builder writes them, on rollups where they answer (the entity and pair rollups hold the firm
 * and the buyer county) and live elsewhere; the seat window's counts; the firms' profiles by their seat.
 */
function seatCases(): PerfCase[] {
  const firms = top({ dim: "supplier" });
  return [
    perfCase("national:table-suppliers-seat-other", "national", "Ce firme cu sediul în alt județ câștigă, toți anii", "table", all(firms, set({ firmSeat: "other" })), { barMs: 2000 }),
    perfCase("national:table-suppliers-seat-other-2025", "national", "Ce firme cu sediul în alt județ câștigă, 2025", "table", all(firms, set({ firmSeat: "other" }), years(2025)), { barMs: 2000 }),
    perfCase("national:table-suppliers-seat-abroad", "national", "Ce firme cu sediul în străinătate câștigă, toți anii", "table", all(firms, set({ firmSeat: "abroad" })), { barMs: 2000 }),
    perfCase("national:table-suppliers-seat-cluj", "national", "Ce firme cu sediul în județul Cluj câștigă, toți anii", "table", all(firms, set({ seatCounty: "Cluj" })), { barMs: 2000 }),
    perfCase("filtered:table-cluj-seat-same-2025", "filtered", "Ce firme cu sediul în județul Cluj câștigă în Cluj, 2025", "table", all(firms, set({ county: "Cluj", firmSeat: "same" }), years(2025))),
    perfCase("national:stat-seat-other-2025", "national", "Cât câștigă firmele cu sediul în alt județ, 2025", "stat", all(set({ firmSeat: "other" }), years(2025)), { barMs: 2000 }),
    perfCase("national:entity-card-value-seat-bucuresti", "national", "Care firmă cu sediul în București câștigă cel mai mult", "entity_card",
      all(top({ dim: "supplier", rankBy: "value" }), set({ seatCounty: "Bucuresti" })), { barMs: 2000 }),
    perfCase("national:entity-card-value-seat-abroad", "national", "Care firmă cu sediul în străinătate câștigă cel mai mult", "entity_card",
      all(top({ dim: "supplier", rankBy: "value" }), set({ firmSeat: "abroad" })), { barMs: 2000 }),
    perfCase("filtered:scatter-suppliers-seat-cluj", "filtered", "Ce firme cu sediul în județul Cluj ies din tipar", "scatter", all(firms, set({ seatCounty: "Cluj" }))),
    perfCase("filtered:entity-card-risk-seat-cluj", "filtered", "Care firmă cu sediul în județul Cluj are cel mai ridicat indice de risc", "entity_card",
      all(top({ dim: "supplier", rankBy: "risk" }), set({ seatCounty: "Cluj" }))),
    perfCase("sources:table-suppliers-seat-other-2025", "sources", "Sursele firmelor cu sediul în alt județ, 2025", "table", all(firms, set({ firmSeat: "other" }), years(2025)), { path: "rows", barMs: 2000 }),
    perfCase("sources:table-suppliers-seat-cluj", "sources", "Sursele firmelor cu sediul în județul Cluj", "table", all(firms, set({ seatCounty: "Cluj" })), { path: "rows", barMs: 2000 }),
    // S4 verify: abroad the page hides the key (compile.ts keyHidden; by the key 10–24 s, at the route's 20 s limit), and a
    // total's records selected by the seat take their totals from agg_entity_year (rollupSourceTotals; live 2.2–3.6 s).
    perfCase("sources:stat-seat-abroad", "sources", "Sursele totalului firmelor cu sediul în străinătate", "stat", set({ firmSeat: "abroad" }), { path: "rows", barMs: 2000 }),
    perfCase("sources:stat-seat-abroad-da", "sources", "Sursele achizițiilor directe de la firme cu sediul în străinătate", "stat", all(set({ firmSeat: "abroad" }), top({ dataset: "da" })), { path: "rows", barMs: 2000 }),
    perfCase("sources:table-suppliers-seat-abroad", "sources", "Sursele firmelor cu sediul în străinătate", "table", all(firms, set({ firmSeat: "abroad" })), { path: "rows", barMs: 2000 }),
    perfCase("sources:stat-seat-other", "sources", "Sursele totalului firmelor cu sediul în alt județ, toți anii", "stat", set({ firmSeat: "other" }), { path: "rows", barMs: 2000 }),
    // The seat window: the records' classes on a ranking (national: the entity rollup), each county's firms on „Cine conduce?”.
    perfCase("facets:seat-classes-national", "facets", "„Unde au sediul firmele?” pe clasamentul național", "table", firms, { facet: { part: "seat" }, barMs: 2000 }),
    perfCase("facets:seat-classes-2025", "facets", "„Unde au sediul firmele?” pe clasamentul din 2025", "table", all(firms, years(2025)), { facet: { part: "seat" }, barMs: 2000 }),
    perfCase("facets:seat-counties-leader", "facets", "„Unde au sediul firmele?” la „Cine conduce?”", "entity_card", top({ dim: "supplier", rankBy: "value" }), { facet: { part: "seat" }, barMs: 2000 }),
    // S5 (S4r-from-seat): „De la cine › Ce fel de firme” on institutions now writes the sellers' seat; the answers and
    // their sources as the builder offers them (national, a county, a year).
    perfCase("national:table-authorities-from-seat-other", "national", "Ce instituții cumpără cel mai mult de la firme cu sediul în alt județ", "table",
      all(top({ dim: "authority" }), set({ firmSeat: "other" })), { barMs: 2000 }),
    perfCase("filtered:table-cluj-authorities-from-seat-other-2025", "filtered", "Ce instituții din Cluj cumpără de la firme cu sediul în alt județ, 2025", "table",
      all(top({ dim: "authority" }), set({ county: "Cluj", firmSeat: "other" }), years(2025))),
    perfCase("sources:table-authorities-from-seat-other", "sources", "Sursele instituțiilor care cumpără de la firme cu sediul în alt județ", "table",
      all(top({ dim: "authority" }), set({ firmSeat: "other" })), { path: "rows", barMs: 2000 }),
  ];
}

/** PRECOMPUTE.md entries the F3-rows facts wait on (answer-facts.ts MIX_LIVE, BARS_LIVE). */
const MIX_LIVE = "„Din care” pe o selecție națională fără rollup";
/** F5: the map's county facts without agg_map_year nor an index (answer-facts.ts MAP_LIVE). */
const MAP_LIVE = "Faptele județelor pe o hartă națională fără rollup (domeniu, luni, mărime)";

/**
 * F3-rows (S4; plan §4.1–§4.3, §6.4): the evolution's options (agg_months), „Din care” (agg_national_mix
 * or one grouped pass), a bar's facts, and the ranked firms' employees as a group (CÂȘTIGĂTORII).
 */
function f3RowsCases(): PerfCase[] {
  const series = (options: NonNullable<AskSpec["timeseries"]>): Edit => (q) => { q.timeseries = { ...options }; };
  const facts = (part: "mix" | "bars", barMs: 1000 | 2000 = 2000) => ({ facet: { part }, barMs });
  const y2025 = years(2025);
  return [
    perfCase("national:timeseries-channel", "national", "Cum evoluează achizițiile, pe directe și proceduri", "timeseries", series({ split: "channel" }), { barMs: 2000 }),
    perfCase("national:timeseries-domain", "national", "Cum evoluează achizițiile, pe domenii", "timeseries", series({ split: "domain" }), { barMs: 2000, ref: "Evoluție: domenii" }),
    perfCase("national:timeseries-months-2024-2025", "national", "Cum evoluează achizițiile lună de lună, 2024–2025", "timeseries", all(years(2024, 2025), series({ grain: "month" })), { barMs: 2000 }),
    perfCase("national:timeseries-same-months-2021-2025", "national", "Cum evoluează achizițiile pe ianuarie–iunie, 2021–2025", "timeseries", all(years(2021, 2025), series({ months: [1, 6] })), { barMs: 2000 }),
    perfCase("national:timeseries-works-months-2025", "national", "Lucrările lună de lună, 2025", "timeseries", all(set({ purchaseKind: "lucrari" }), y2025, series({ grain: "month" })), { barMs: 2000 }),
    perfCase("national:timeseries-medicines-channel", "national", "Medicamentele pe directe și proceduri (live)", "timeseries", all(set({ cpvTerm: "medicamente" }), series({ split: "channel" })), { barMs: 2000 }),
    perfCase("filtered:timeseries-cluj-channel", "filtered", "Cluj pe directe și proceduri", "timeseries", all(set({ county: "Cluj" }), series({ split: "channel" }))),
    perfCase("filtered:timeseries-cluj-napoca-months-2025", "filtered", "Municipiul Cluj-Napoca lună de lună, 2025", "timeseries", all(buyer(), y2025, series({ grain: "month" }))),
    perfCase("national:table-suppliers-1-9-employees-2025", "national", "Cine câștigă, firme cu 1–9 angajați, 2025 (CÂȘTIGĂTORII)", "table", all(set({ minEmployees: 1, maxEmployees: 9 }), y2025), { barMs: 2000 }),
    perfCase("facets:mix-national", "facets", "„Din care”, național, toți anii", "stat", () => {}, facts("mix")),
    perfCase("facets:mix-national-2025", "facets", "„Din care”, național, 2025", "stat", y2025, { ...facts("mix"), ref: "„Din care” la stat: național 2025 (baza)" }),
    perfCase("facets:mix-works-2025", "facets", "„Din care”, lucrări, 2025", "stat", all(set({ purchaseKind: "lucrari" }), y2025), facts("mix")),
    perfCase("facets:mix-cluj-2025", "facets", "„Din care”, Cluj, 2025", "stat", all(set({ county: "Cluj" }), y2025), facts("mix", 1000)),
    perfCase("facets:mix-medicines-2025", "facets", "„Din care”, „medicamente”, 2025 (fără rollup)", "stat", all(set({ cpvTerm: "medicamente" }), y2025), { ...facts("mix"), precompute: MIX_LIVE }),
    perfCase("facets:mix-cluj-napoca", "facets", "„Din care”, Municipiul Cluj-Napoca, toți anii", "stat", buyer(), facts("mix", 1000)),
    perfCase("facets:bars-national", "facets", "Faptele barelor, național, toți anii", "timeseries", () => {}, facts("bars")),
    perfCase("facets:bars-national-months-2025", "facets", "Faptele barelor, lună de lună, 2025", "timeseries", all(y2025, series({ grain: "month" })), facts("bars")),
    perfCase("facets:bars-cluj-napoca", "facets", "Faptele barelor, Municipiul Cluj-Napoca", "timeseries", buyer(), facts("bars", 1000)),
  ];
}

/**
 * The windows' counts and "Unde e …?" (S4, F3-facets; plan §2.5, §6.4): each part on the national draft
 * the builder opens it on (every year, then one year) and on the heavier selections, counted on every run.
 */
function facetCases(): PerfCase[] {
  const facet = (part: FacetPart, q?: string, barMs: 1000 | 2000 = 2000) => ({ facet: { part, ...(q ? { q } : {}) }, barMs });
  const y2025 = years(2025);
  const medicines = set({ cpvTerm: "medicamente" });
  return [
    perfCase("facets:channel-national", "facets", "„Ce fel de achiziții?”, național, toți anii", "stat", () => {}, facet("channel")),
    perfCase("facets:channel-national-2025", "facets", "„Ce fel de achiziții?”, național, 2025", "stat", y2025, facet("channel")),
    perfCase("facets:procedure-national", "facets", "„O procedură anume”, național, toți anii", "stat", () => {}, facet("procedure")),
    perfCase("facets:procedure-national-2025", "facets", "„O procedură anume”, național, 2025", "stat", y2025, facet("procedure")),
    perfCase("facets:domain-national", "facets", "„Ce s-a cumpărat?” (tipul), național, toți anii", "stat", () => {}, facet("domain")),
    perfCase("facets:domain-medicines-2025", "facets", "Tipul în „medicamente”, 2025", "stat", all(medicines, y2025), facet("domain")),
    perfCase("facets:size-national-2025", "facets", "„Cât de mare e fiecare achiziție?”, național, 2025", "stat", y2025, facet("size")),
    perfCase("facets:size-national", "facets", "„Cât de mare e fiecare achiziție?”, național, toți anii", "stat", () => {}, facet("size")),
    perfCase("facets:size-cluj-2025", "facets", "Mărimea, Cluj, 2025", "stat", all(set({ county: "Cluj" }), y2025), facet("size", undefined, 1000)),
    perfCase("facets:kind-national", "facets", "Tipul instituției, național, toți anii", "stat", () => {}, { ...facet("kind"), ref: "Fațeta „Cine a cumpărat?” (part=kind), ciorna națională implicită" }),
    perfCase("facets:kind-national-2025", "facets", "Tipul instituției, național, 2025", "stat", y2025, facet("kind")),
    perfCase("facets:kind-medicines-2025", "facets", "Tipul instituției, „medicamente”, 2025", "stat", all(medicines, y2025), facet("kind")),
    perfCase("facets:kind-suppliers-2025", "facets", "Tipul instituției pe clasamentul firmelor, 2025", "table", y2025, facet("kind")),
    perfCase("facets:county-national", "facets", "„Unde?” (județul instituției), național, toți anii", "stat", () => {}, facet("county")),
    perfCase("facets:county-works-2025", "facets", "„Unde?”, lucrări, 2025", "stat", all(set({ purchaseKind: "lucrari" }), y2025), facet("county")),
    perfCase("facets:years-national", "facets", "Anii, național", "stat", () => {}, facet("years")),
    perfCase("facets:employees-national", "facets", "„Câți angajați au firmele?”, clasamentul firmelor, toți anii", "table", () => {}, facet("employees")),
    perfCase("facets:employees-national-2025", "facets", "Angajați, clasamentul firmelor, 2025", "table", y2025, facet("employees")),
    perfCase("facets:employees-medicines-2025", "facets", "Angajați, „medicamente”, 2025", "table", all(medicines, y2025), facet("employees")),
    perfCase("facets:seat-national-2025", "facets", "Sediul firmelor, clasamentul firmelor, 2025", "table", y2025, facet("seat")),
    perfCase("facets:kind-trend-2024-2025", "facets", "Tipul instituției pe trendul firmelor, 2024 → 2025", "trend", years(2024, 2025), facet("kind")),
    perfCase("facets:kind-scatter", "facets", "Tipul instituției pe norul de risc (profiluri)", "scatter", top({ dim: "authority" }), facet("kind", undefined, 1000)),
    perfCase("facets:kind-medicines-cluj-2025", "facets", "Tipul instituției, „medicamente” în Cluj, 2025", "stat", all(medicines, set({ county: "Cluj" }), y2025), facet("kind", undefined, 1000)),
    perfCase("facets:size-medicines-2025", "facets", "Mărimea, „medicamente”, 2025", "stat", all(medicines, y2025), facet("size")),
    perfCase("facets:employees-works-2025", "facets", "Angajați, lucrări, 2025", "table", all(set({ purchaseKind: "lucrari" }), y2025), facet("employees")),
    perfCase("facets:employees-negotiated-2025", "facets", "Angajați, contracte negociate fără publicare, 2025", "table",
      all(top({ dataset: "contracts" }), set({ procedure: "negociere_fara_publicare" }), y2025), facet("employees")),
    perfCase("facets:employees-hospitals-medicines-2025", "facets", "Angajați, „medicamente” la spitale, 2025", "table",
      all(medicines, set({ authorityKind: "spital" }), y2025), facet("employees")),
    perfCase("facets:locate-national", "facets", "„Unde e o firmă?”, clasamentul național, toți anii", "table", () => {},
      { ...facet("locate", "dedeman"), ref: "„Unde e o firmă?” pe clasamentul național implicit" }),
    perfCase("facets:locate-national-2025", "facets", "„Unde e o firmă?”, clasamentul firmelor, 2025", "table", y2025, facet("locate", "dedeman")),
    perfCase("facets:locate-works", "facets", "„Unde e o firmă?”, lucrări, toți anii", "table", set({ purchaseKind: "lucrari" }), facet("locate", "porr")),
    perfCase("facets:locate-authorities-count", "facets", "„Unde e o instituție?”, după înregistrări, toți anii", "table",
      top({ dim: "authority", measure: "count" }), facet("locate", "cluj")),
  ];
}

/** PRECOMPUTE.md entries the F3 cases wait on (S4 F3-keys). */
const SIZE_LIVE = "Sursele unei mărimi a achiziției pe o selecție națională";
const SIZE_RANKING = "Clasamentul național pe mărimea achiziției";
const SIZE_SOURCES_FIRMS = "Totalurile surselor unui clasament național pe angajați";
const KIND_ENTITY = "Produsele și serviciile pe instituții și firme, național";

/**
 * F3 (S4, F3-keys): the purchase kind, the procedure, the size of a purchase and the employee bands,
 * written as the builder writes them, on the heaviest national selections and their sources (plan §6.4).
 */
function f3Cases(): PerfCase[] {
  const works = set({ purchaseKind: "lucrari" });
  const open = all(top({ dataset: "contracts" }), set({ procedure: "deschisa" }));
  const negotiated = all(top({ dataset: "contracts" }), set({ procedure: "negociere_fara_publicare" }));
  const overMillion = set({ purchaseValueMin: 1_000_000 });
  return [
    // The kind is a condition on the code: totals, years, counties and breakdowns on agg_cpv_year.
    perfCase("national:stat-works", "national", "Cât valorează lucrările (tipul), toți anii", "stat", works, { barMs: 2000 }),
    perfCase("national:stat-works-2025", "national", "Cât valorează lucrările (tipul), 2025", "stat", all(works, years(2025)), { barMs: 2000 }),
    perfCase("national:timeseries-goods", "national", "Cum evoluează achizițiile de produse", "timeseries", set({ purchaseKind: "produse" }), { barMs: 2000 }),
    perfCase("national:map-services-2025", "national", "Harta serviciilor, 2025", "map", all(set({ purchaseKind: "servicii" }), years(2025)), { barMs: 2000 }),
    perfCase("national:breakdown-works-2025", "national", "Ce lucrări se cumpără, 2025", "breakdown", all(works, years(2025)), { barMs: 2000 }),
    // A ranking with a kind has no rollup (the entity rollups hold no code): live, as a domain is.
    perfCase("national:table-suppliers-works", "national", "Cine câștigă lucrările, național, toți anii", "table", works, { barMs: 2000 }),
    perfCase("national:table-suppliers-works-2025", "national", "Cine câștigă lucrările, național, 2025", "table", all(works, years(2025)), { barMs: 2000 }),
    perfCase("national:trend-suppliers-2024-2025-works-up", "national", "Firme cu cea mai mare creștere la lucrări, 2024 → 2025", "trend",
      all(works, years(2024, 2025), lens({ change: "up", months: "auto" })), { barMs: 2000 }),
    perfCase("filtered:table-cluj-works-2025", "filtered", "Cine câștigă lucrările în Cluj, 2025", "table", all(works, set({ county: "Cluj" }), years(2025))),
    // S4 review: goods and services cover most records, so per entity nationally they read both marts whole; the
    // builder does not offer them there (filters/context.ts nationalEntityScan) until S5's entity × division rollup.
    perfCase("national:table-suppliers-goods", "national", "Cine câștigă produsele, național, toți anii (link)", "table", set({ purchaseKind: "produse" }), { barMs: 2000, precompute: KIND_ENTITY }),
    perfCase("national:table-suppliers-services-2025", "national", "Cine câștigă serviciile, național, 2025 (link)", "table", all(set({ purchaseKind: "servicii" }), years(2025)), { barMs: 2000, precompute: KIND_ENTITY }),
    perfCase("national:leader-goods", "national", "Care firmă câștigă cel mai mult la produse (link)", "entity_card", all(top({ dim: "supplier", rankBy: "value" }), set({ purchaseKind: "produse" })), { barMs: 2000, precompute: KIND_ENTITY }),
    perfCase("national:trend-suppliers-goods-2024-2025", "national", "Firme cu cea mai mare schimbare la produse, 2024 → 2025 (link)", "trend",
      all(set({ purchaseKind: "produse" }), years(2024, 2025), lens({ change: "up", months: "auto" })), { barMs: 2000, precompute: KIND_ENTITY }),
    perfCase("filtered:table-cluj-goods-2025", "filtered", "Cine câștigă produsele în Cluj, 2025", "table", all(set({ purchaseKind: "produse", county: "Cluj" }), years(2025))),
    // The procedure: the contracts only (1.1M rows), live.
    perfCase("national:stat-open-tender", "national", "Cât valorează contractele din licitații deschise, toți anii", "stat", open, { barMs: 2000 }),
    perfCase("national:stat-negotiated-2025", "national", "Cât valorează contractele negociate fără publicare, 2025", "stat", all(negotiated, years(2025)), { barMs: 2000 }),
    perfCase("national:table-suppliers-negotiated", "national", "Cine câștigă contractele negociate fără publicare, toți anii", "table", negotiated, { barMs: 2000 }),
    perfCase("national:timeseries-open-tender", "national", "Cum evoluează contractele din licitații deschise", "timeseries", open, { barMs: 2000 }),
    perfCase("national:map-negotiated-2025", "national", "Harta contractelor negociate fără publicare, 2025", "map", all(negotiated, years(2025)), { barMs: 2000 }),
    // The size of the whole purchase: live, the union with contract_value_full.
    perfCase("national:stat-over-1m", "national", "Cât valorează achizițiile de peste 1 mil. lei, toți anii", "stat", overMillion, { barMs: 2000 }),
    perfCase("national:stat-over-1m-2025", "national", "Cât valorează achizițiile de peste 1 mil. lei, 2025", "stat", all(overMillion, years(2025)), { barMs: 2000 }),
    perfCase("national:stat-under-10k-2025", "national", "Cât valorează achizițiile sub 10.000 lei, 2025", "stat", all(set({ purchaseValueMax: 10_000 }), years(2025)), { barMs: 2000 }),
    perfCase("national:table-suppliers-over-1m-2025", "national", "Cine câștigă achizițiile de peste 1 mil. lei, 2025", "table", all(overMillion, years(2025)), { barMs: 2000, precompute: SIZE_RANKING }),
    perfCase("national:table-suppliers-over-1m", "national", "Cine câștigă achizițiile de peste 1 mil. lei, toți anii", "table", overMillion, { barMs: 2000, precompute: SIZE_RANKING }),
    perfCase("filtered:stat-cluj-over-1m-2025", "filtered", "Achizițiile de peste 1 mil. lei din Cluj, 2025", "stat", all(overMillion, set({ county: "Cluj" }), years(2025))),
    // The employee bands (kit §4, band 0 back at stat): the firms' size alone reads entity_profile.
    perfCase("national:table-suppliers-0-employees", "national", "Cine câștigă, național, firme fără angajați", "table", set({ minEmployees: 0, maxEmployees: 0 }), { barMs: 2000 }),
    perfCase("national:table-suppliers-250-employees-paged", "national", "Cine câștigă, național, firme cu cel puțin 250 de angajați (tot clasamentul)", "table",
      all(set({ minEmployees: 250 }), (q) => { delete q.topN; }), { barMs: 2000 }),
    perfCase("national:stat-0-employees", "national", "Cât valorează achizițiile de la firme fără angajați, toți anii", "stat", set({ minEmployees: 0, maxEmployees: 0 }), { barMs: 2000 }),
    perfCase("national:entity-card-value-1-9-employees", "national", "Care firmă cu 1–9 angajați câștigă cel mai mult", "entity_card",
      all(top({ dim: "supplier", rankBy: "value" }), set({ minEmployees: 1, maxEmployees: 9 })), { barMs: 2000 }),
    // Their sources and CSV, through runRows.
    perfCase("sources:stat-works-2025", "sources", "Sursele lucrărilor, 2025", "stat", all(works, years(2025)), { path: "rows", barMs: 2000 }),
    perfCase("sources:stat-negotiated-2025", "sources", "Sursele contractelor negociate fără publicare, 2025", "stat", all(negotiated, years(2025)), { path: "rows", barMs: 2000 }),
    perfCase("sources:stat-over-1m-2025", "sources", "Sursele achizițiilor de peste 1 mil. lei, 2025", "stat", all(overMillion, years(2025)), { path: "rows", barMs: 2000, precompute: SIZE_LIVE }),
    // In a county few direct acquisitions reach 1 mil. lei: the page hides the key (compile.ts sizeInCounty, S4 tests;
    // by the key 10–20 s, at the route's limit).
    perfCase("sources:stat-buzau-over-1m-2025", "sources", "Sursele achizițiilor de peste 1 mil. lei din Buzău, 2025", "stat", all(overMillion, set({ county: "Buzau" }), years(2025)), { path: "rows", barMs: 2000 }),
    perfCase("sources:stat-cluj-over-1m-2025", "sources", "Sursele achizițiilor de peste 1 mil. lei din Cluj, 2025", "stat", all(overMillion, set({ county: "Cluj" }), years(2025)), { path: "rows", barMs: 2000 }),
    perfCase("sources:table-suppliers-buzau-over-1m-2025", "sources", "Sursele clasamentului firmelor, achiziții de peste 1 mil. lei din Buzău, 2025", "table", all(overMillion, set({ county: "Buzau" }), years(2025)), { path: "rows", barMs: 2000 }),
    perfCase("sources:table-suppliers-1-9-employees", "sources", "Sursele clasamentului firmelor cu 1–9 angajați", "table", set({ minEmployees: 1, maxEmployees: 9 }), { path: "rows", barMs: 2000, precompute: SIZE_SOURCES_FIRMS }),
    perfCase("csv:stat-negotiated-cluj", "csv", "CSV: contractele negociate fără publicare din Cluj", "stat", all(negotiated, set({ county: "Cluj" })), { path: "csv", barMs: 2000 }),
    // F5 (plan §4.2, §6.4): the ranked winners. A firm's own year reads entity_profile; the relations are lists of ids
    // (lib/ask/winners.ts); one firm taking half reads agg_pair_year for a year, entity_top_partners for every year.
    perfCase("national:table-suppliers-registered-2024", "national", "Cine câștigă, firme înmatriculate din 2024, toți anii", "table",
      all(top({ dim: "supplier" }), set({ newSince: 2024, newScope: "registry" })), { barMs: 2000 }),
    perfCase("national:table-suppliers-2025-first-2025", "national", "Cine câștigă în 2025, firme cu prima înregistrare din 2025", "table",
      all(top({ dim: "supplier" }), set({ newSince: 2025, newScope: "archive" }), years(2025)), { barMs: 2000 }),
    perfCase("national:table-authorities-dominant-2025", "national", "Ce instituții cumpără cel mai mult în 2025, o firmă ia peste jumătate", "table",
      all(top({ dim: "authority" }), set({ dominantSupplier: true }), years(2025)), { barMs: 2000 }),
    perfCase("national:table-authorities-dominant", "national", "Ce instituții cumpără cel mai mult, o firmă ia peste jumătate, toți anii", "table",
      all(top({ dim: "authority" }), set({ dominantSupplier: true })), { barMs: 2000 }),
    perfCase("national:table-authorities-from-registered-2025", "national", "Ce instituții cumpără cel mai mult de la firme înmatriculate din 2024, 2025", "table",
      all(top({ dim: "authority" }), set({ newSince: 2024, newScope: "registry" }), years(2025)), { barMs: 2000 }),
    perfCase("filtered:table-cluj-new-suppliers-2024", "filtered", "Furnizorii noi (din 2024) ai primăriei Cluj-Napoca, 2024–2025", "table",
      all(top({ dim: "supplier" }), buyer(), years(2024, 2025), set({ newSince: 2024, newScope: "buyer" }))),
    perfCase("filtered:table-cluj-main-client", "filtered", "Firmele al căror principal client public e primăria Cluj-Napoca, 2024–2025", "table",
      all(top({ dim: "supplier" }), buyer(), years(2024, 2025), set({ mainClient: true }))),
    perfCase("sources:table-authorities-dominant-2025", "sources", "Sursele instituțiilor la care o firmă ia peste jumătate, 2025", "table",
      all(top({ dim: "authority" }), set({ dominantSupplier: true }), years(2025)), { path: "rows", barMs: 2000 }),
    perfCase("sources:table-suppliers-registered-2024-2025", "sources", "Sursele firmelor înmatriculate din 2024, 2025", "table",
      all(top({ dim: "supplier" }), set({ newSince: 2024, newScope: "registry" }), years(2025)), { path: "rows", barMs: 2000 }),
    perfCase("facets:winners-authorities-2025", "facets", "Numărul lui „O firmă ia peste jumătate”, instituții, 2025", "table",
      all(top({ dim: "authority" }), years(2025)), { facet: { part: "winners" }, barMs: 2000 }),
    perfCase("facets:winners-suppliers-2025", "facets", "Numerele lui „Firme noi”, firme, 2025", "table",
      all(top({ dim: "supplier" }), years(2025)), { facet: { part: "winners" }, barMs: 2000 }),
    perfCase("facets:rows-authorities-2025", "facets", "Cel mai mare furnizor al primelor instituții, 2025", "table",
      all(top({ dim: "authority" }), years(2025)), { facet: { part: "rows", ids: [String(PERF_ENTITIES.clujNapoca.id)] }, barMs: 2000 }),
    perfCase("facets:locate-registered-2025", "facets", "„Unde e o firmă?” printre firmele înmatriculate din 2024, 2025", "table",
      all(top({ dim: "supplier" }), set({ newSince: 2024, newScope: "registry" }), years(2025)), { facet: { part: "locate", q: "strabag" }, barMs: 2000 }),
    // F5 (plan §4.4, §6.4): the map of the local administrations (agg_map_year with the strict list) and the county
    // facts asked after a map (lib/ask/map-facts.ts): agg_map_year, the code index for a domain, live on an entity.
    perfCase("national:map-local-2025", "national", "Harta primăriilor și consiliilor județene pe locuitor, 2025", "map",
      all(set({ authorityKind: "local_admin" }), years(2025), (q) => { q.measure = "value_per_capita"; }), { barMs: 2000 }),
    perfCase("facets:map-all", "facets", "Faptele județelor, harta națională, toți anii", "map", () => {}, { facet: { part: "map" }, barMs: 2000 }),
    perfCase("facets:map-2025", "facets", "Faptele județelor, harta națională, 2025", "map", years(2025), { facet: { part: "map" }, barMs: 2000 }),
    perfCase("facets:map-works-2025", "facets", "Faptele județelor, lucrări, 2025", "map", all(set({ purchaseKind: "lucrari" }), years(2025)), { facet: { part: "map" }, barMs: 2000 }),
    perfCase("facets:map-local-2025", "facets", "Faptele județelor, primăriile și consiliile județene, 2025", "map",
      all(set({ authorityKind: "local_admin" }), years(2025)), { facet: { part: "map" }, barMs: 2000 }),
    perfCase("facets:map-without-cluj-napoca-2025", "facets", "Faptele județelor fără Cluj-Napoca, 2025", "map",
      all((q) => { q.population = withExclusion(q.population, { field: "authority", value: String(PERF_ENTITIES.clujNapoca.id), label: PERF_ENTITIES.clujNapoca.name }); }, years(2025)), { facet: { part: "map" }, barMs: 2000 }),
    perfCase("facets:map-medicines-2024-2025", "facets", "Faptele județelor, „medicamente”, 2024–2025 (fără rollup)", "map",
      all(set({ cpvTerm: "medicamente" }), years(2024, 2025)), { facet: { part: "map" }, barMs: 2000, precompute: MAP_LIVE }),
    perfCase("facets:map-lemne-2025", "facets", "Faptele județelor, „lemne”, 2025 (indexul codului)", "map",
      all(set({ cpvTerm: "lemne" }), years(2025)), { facet: { part: "map" }, barMs: 2000 }),
    perfCase("sources:map-cluj-2025", "sources", "Sursele județului Cluj pe hartă, 2025", "map", years(2025), { path: "rows", scope: { county: "Cluj" }, barMs: 2000 }),
    perfCase("facets:map-porr-works", "facets", "Faptele județelor și cota firmei, PORR CONSTRUCT, lucrări, 2024–2025", "map",
      all(set({ purchaseKind: "lucrari", supplierName: "PORR CONSTRUCT", supplierId: 2108050 }), years(2024, 2025)), { facet: { part: "map" }, barMs: 2000 }),
    perfCase("facets:map-h1-2025", "facets", "Faptele județelor, ian.–iun. 2025 (fără rollup)", "map",
      all(years(2025), set({ monthFrom: 1, monthTo: 6 })), { facet: { part: "map" }, barMs: 2000, precompute: MAP_LIVE }),
    perfCase("sources:map-local-ilfov-2025", "sources", "Sursele județului Ilfov pe harta primăriilor și consiliilor județene, 2025", "map",
      all(set({ authorityKind: "local_admin" }), years(2025)), { path: "rows", scope: { county: "Ilfov" }, barMs: 2000 }),
    perfCase("sources:map-cluj-same-seat-2025", "sources", "Sursele firmelor din județ, Cluj, 2025", "map",
      all(set({ firmSeat: "same" }), years(2025)), { path: "rows", scope: { county: "Cluj" }, barMs: 2000 }),
    // D2 (owner-D2-rollups): the per-inhabitant ranking on agg_entity_year (compile.ts perCapitaPlanFor); the 41 county
    // councils; "primăria X" with every identity of the town hall (Cluj-Napoca: 2146445 and 2165580).
    perfCase("national:table-authorities-per-capita-2025", "national", "Instituțiile după valoarea pe locuitor, 2025", "table",
      all(top({ dim: "authority", measure: "value_per_capita" }), years(2025)), { barMs: 2000 }),
    perfCase("national:table-councils-per-capita-2025", "national", "Consiliile județene după valoarea pe locuitor, 2025", "table",
      all(top({ dim: "authority", measure: "value_per_capita" }), set({ authorityKind: "consiliu_judetean" }), years(2025)), { barMs: 2000 }),
    perfCase("filtered:table-cluj-per-capita", "filtered", "Primăriile din Cluj după valoarea pe locuitor", "table",
      all(top({ dim: "authority", measure: "value_per_capita" }), set({ county: "Cluj" }))),
    perfCase("filtered:table-uat-cluj-napoca-2024-2025", "filtered", "Firmele care câștigă de la primăria Cluj-Napoca, 2024–2025", "table",
      all(set({ uatSiruta: PERF_ENTITIES.clujNapocaUat.siruta, uatName: PERF_ENTITIES.clujNapocaUat.name }), years(2024, 2025))),
  ];
}

/**
 * S5 PRE-trend: the trend's precompute entries closed at the marts stage. The domain with an entity list in a county and
 * its sources (nationally: national:trend-medicamente-2024-2025-new, da_tx_cpv_cover_idx); and „Caută în surse” by names
 * first (source-search.ts): a domain, a firm, a phrase, a record code and a county on the national two years, a group, the
 * national ranking's drawer and a county's (today's search).
 */
function preTrendCases(): PerfCase[] {
  const every = lens({ change: "all", months: "auto" });
  const search = (text: string) => ({ path: "rows" as const, drawer: { search: text }, afterAnswer: true as const, barMs: 2000 as const });
  return [
    perfCase("filtered:trend-cluj-medicamente-2024-2025-new", "filtered", "Firme noi la medicamente în Cluj, 2024 → 2025", "trend",
      all(set({ cpvTerm: "medicamente", county: "Cluj" }), years(2024, 2025), lens({ change: "new", months: "auto" }))),
    perfCase("sources:trend-medicamente-2024-2025-new", "sources", "Sursele firmelor noi la medicamente, 2024 → 2025, după răspuns", "trend",
      all(set({ cpvTerm: "medicamente" }), years(2024, 2025), lens({ change: "new", months: "auto" })), { path: "rows", afterAnswer: true, barMs: 2000 }),
    perfCase("sources:trend-2024-2025-all-search-selgros-after-answer", "sources", "„Toate”, 2024 → 2025, căutare „SELGROS”, după răspuns", "trend",
      all(years(2024, 2025), every), search("SELGROS")),
    perfCase("sources:trend-2024-2025-all-search-phrase-after-answer", "sources", "„Toate”, 2024 → 2025, căutare „spitalul judetean”, după răspuns", "trend",
      all(years(2024, 2025), every), search("spitalul judetean")),
    perfCase("sources:trend-2024-2025-all-search-code-after-answer", "sources", "„Toate”, 2024 → 2025, căutare după cod „DA38380070”, după răspuns", "trend",
      all(years(2024, 2025), every), search("DA38380070")),
    perfCase("sources:trend-2024-2025-all-search-county-after-answer", "sources", "„Toate”, 2024 → 2025, căutare „Vaslui”, după răspuns", "trend",
      all(years(2024, 2025), every), search("Vaslui")),
    perfCase("sources:trend-2024-2025-all-search-number-after-answer", "sources", "„Toate”, 2024 → 2025, căutare „33600000”, după răspuns", "trend",
      all(years(2024, 2025), every), search("33600000")),
    perfCase("sources:trend-2024-2025-all-search-common-after-answer", "sources", "„Toate”, 2024 → 2025, căutare „s.r.l. bucuresti”, după răspuns", "trend",
      all(years(2024, 2025), every), search("s.r.l. bucuresti")),
    perfCase("sources:table-national-2024-2025-search", "sources", "Sursele clasamentului național 2024–2025, căutare „medicamente”", "table",
      years(2024, 2025), search("medicamente")),
    perfCase("sources:trend-2024-2025-up-search-after-answer", "sources", "Creșterile, 2024 → 2025, căutare „medicamente”, după răspuns", "trend",
      all(years(2024, 2025), lens({ change: "up", months: "auto" })), search("medicamente")),
    perfCase("sources:trend-cluj-2024-2025-all-search", "sources", "„Toate” în Cluj, 2024 → 2025, căutare „medicamente”, după răspuns", "trend",
      all(set({ county: "Cluj" }), years(2024, 2025), every), search("medicamente")),
  ];
}

/**
 * S5 PRE-sources: the source lists PRECOMPUTE.md kept for the marts stage. The historical profiles' cohorts nationally
 * (a distribution's group of the whole country, of a county: the risk cloud's old links list the same cohorts, which
 * ask-golden runs, since the builder's cloud has no source rows), a precise selection of OR groups, the seat's sparse
 * drawers, the per-inhabitant ranking's drawer.
 */
function preSourcesCases(): PerfCase[] {
  const rows = { path: "rows" as const, barMs: 2000 as const };
  const orGroups: Edit = (q) => {
    q.population = { operator: "or", groups: [
      { operator: "and", conditions: [{ field: "authority", op: "in", values: [String(PERF_ENTITIES.clujNapoca.id)], labels: [PERF_ENTITIES.clujNapoca.name] }, { field: "cpv", op: "in", values: ["45"] }] },
      { operator: "or", conditions: [{ field: "supplier", op: "in", values: [String(PERF_ENTITIES.dedeman.id)], labels: [PERF_ENTITIES.dedeman.name] }, { field: "county", op: "in", values: ["Buzău"] }] },
    ] };
  };
  return [
    perfCase("sources:distribution-selgros-country", "sources", "Sursele grupului SELGROS: toate firmele țării", "distribution", focal("supplier"), rows),
    perfCase("sources:distribution-cluj-napoca-country", "sources", "Sursele grupului Cluj-Napoca: toate instituțiile țării", "distribution", focal("authority"), rows),
    perfCase("sources:distribution-selgros-buzau", "sources", "Sursele grupului SELGROS: firmele cu sediul în Buzău", "distribution", all(focal("supplier"), set({ county: "Buzău" })), rows),
    perfCase("sources:distribution-buzau-population", "sources", "Sursele grupului Buzău: primăriile cu 52–207 mii de locuitori", "distribution",
      all(focal("authority", PERF_ENTITIES.buzau), top({ peers: { similar: true } })), rows),
    perfCase("sources:timeseries-population-or-groups", "sources", "Sursele unei selecții precise SAU (Cluj-Napoca la CPV 45, DEDEMAN sau Buzău)", "timeseries", orGroups, rows),
    perfCase("sources:table-suppliers-seat-tulcea-satu-mare", "sources", "Sursele firmelor cu sediul în Tulcea care vând în Satu Mare", "table",
      all(top({ dim: "supplier" }), set({ seatCounty: "Tulcea", county: "Satu Mare" })), rows),
    perfCase("sources:table-authorities-per-capita", "sources", "Sursele clasamentului pe locuitor, național", "table", top({ dim: "authority", measure: "value_per_capita" }), rows),
  ];
}

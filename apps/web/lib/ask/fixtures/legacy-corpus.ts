import { defaultQuestion, transitionQuestion, QUESTION_TYPES, type QuestionSpec } from "../question-ui";
import type { Block } from "../spec";
import type { EvidenceScope } from "../evidence";
import type { DrillSort, TableSort } from "../compile";
import { countyBreakdownSpec } from "../../discovery-links";
import { breakdownDeeperSpec, entitySourceScope, entitySourceSpec } from "../source-spec";
import { domainSourceQuery, type DomainNode } from "../../domains-shared";
import { connectionPairSpec } from "../../connections-shared";
import { connectionEvidenceSpec } from "../../connection-evidence-shared";
import { peerSourceSpec } from "../../peers-shared";
import { peerEvidenceSpec } from "../../peers-evidence-shared";
import {
  CONTRACT_WINNERS_SPEC, HOSPITALS_BREAKDOWN_SPEC, NATIONAL_CONTRACT_COUNT_SPEC, NATIONAL_DA_COUNT_SPEC, NATIONAL_MAP_SPEC,
  NATIONAL_VALUE_SPEC, ROADS_RANKING_SPEC, domainContextSpec, entityCaptureSpec, entityChannelSpec, entityMonthSpec,
  pairContractsSpec, pairSpec, personCaptureSpec, personClipSpec, personFirmsSpec,
} from "../site-links";

/**
 * The legacy-link corpus (plan §2.6, §6.2): every question an old link, a
 * saved question or another page of the site can bring to "Întreabă" today,
 * in the shape it arrives in. lib/ask/golden-legacy.integration.test.ts runs it
 * through the routes on a synthetic fixture and compares the answers, sources
 * and CSV with fixtures/golden-legacy.json; scripts/ask-golden.ts runs it on a
 * restored copy for private comparison. Entries are only added: a stage that
 * changes an answer on purpose says so with an answer version, never by
 * removing or rewriting the entry that shows the change.
 *
 * Identities are parameters, so the same corpus runs on the fixture and on real data.
 */

export interface Party { id: number; name: string }
export interface CorpusIdentities {
  /** A buyer with records on both channels, and a second one to compare it with. */
  authority: Party;
  authority2: Party;
  /** A firm with records on both channels, and a second one sharing buyers (and one contract) with it. */
  supplier: Party;
  supplier2: Party;
  /** A buyer–firm pair with records, and one without any. */
  pair: { authority: Party; supplier: Party };
  unrelated: { authority: Party; supplier: Party };
  /** Profiles with at least ten direct acquisitions; one entity without a profile. */
  profileAuthority: Party;
  profileSupplier: Party;
  noProfile: Party;
  /** A buyer without records in the `cpv.quietWord` domain. */
  quietAuthority: Party;
  /** Two counties, as a reader writes them. */
  county: string;
  county2: string;
  uat: { siruta: number; name: string };
  person: { key: string; name: string } | null;
  unidentifiedPerson: string | null;
  cpv: { word: string; word2: string; quietWord: string; code: string; division: string; group: string; fuzzy: string; retired: string; unknown: string };
  /** Three consecutive years of the archive, the last one possibly partial. */
  years: { a: number; b: number; c: number };
}

export type CorpusOrigin = "catalog" | "site" | "saved" | "legacy" | "combo";
export interface CorpusEntry {
  /** Stable key: golden results are compared by id. */
  id: string;
  origin: CorpusOrigin;
  /** Where the spec comes from: a builder of lib/ask/site-links.ts, a page, a stored shape. */
  source: string;
  /** The spec exactly as the link, the page or the store carries it, before validateSpec. */
  spec: unknown;
  /** /api/ask paging of a clasament without topN. */
  table?: { page?: number; sort?: TableSort; dir?: "asc" | "desc" };
  /** /api/ask/rows and /csv: the drawer's selection (`evidence=`) and filters (`sourceFilters=`). */
  rows?: { page?: number; scope?: EvidenceScope; sort?: DrillSort; dir?: "asc" | "desc"; stream?: "da" | "contracts"; search?: string; state?: string };
}

type Edit = (q: QuestionSpec) => void;
/** A builder question: the catalogue choice, the reader's edits, then the builder's own normalization. */
export function builderQuestion(block: Block, edit: Edit = () => {}): QuestionSpec {
  const draft = transitionQuestion(defaultQuestion(), block).spec;
  edit(draft);
  return transitionQuestion(draft).spec;
}

export function legacyCorpus(ids: CorpusIdentities): CorpusEntry[] {
  const { authority, authority2, supplier, supplier2, pair, unrelated, cpv, years: { a, b, c } } = ids;
  const out: CorpusEntry[] = [];
  const add = (id: string, origin: CorpusOrigin, source: string, spec: unknown, extra: Pick<CorpusEntry, "table" | "rows"> = {}) => {
    if (out.some((e) => e.id === id)) throw new Error(`Duplicate corpus id ${id}`);
    out.push({ id, origin, source, spec, ...extra });
  };
  const buyer = (p: Party = authority): Edit => (q) => { q.filters.authorityName = p.name; q.filters.authorityId = p.id; };
  const firm = (p: Party = supplier): Edit => (q) => { q.filters.supplierName = p.name; q.filters.supplierId = p.id; };
  // The focal picker (network, flow, distribution, compare) also sets the role as the dimension (QuestionBuilder pickEntity).
  const focalBuyer = (p: Party = authority): Edit => (q) => { buyer(p)(q); q.dim = "authority"; };
  const focalFirm = (p: Party = supplier): Edit => (q) => { firm(p)(q); q.dim = "supplier"; };
  const set = (filters: QuestionSpec["filters"]): Edit => (q) => { Object.assign(q.filters, filters); };
  const top = (spec: Partial<Omit<QuestionSpec, "filters">>): Edit => (q) => { Object.assign(q, spec); };
  const all = (...edits: Edit[]): Edit => (q) => { for (const edit of edits) edit(q); };
  const yearsOf = (from: number, to: number = from) => set({ yearFrom: from, yearTo: to });
  const combo = (id: string, block: Block, edit: Edit, extra: Pick<CorpusEntry, "table" | "rows"> = {}) =>
    add(`combo:${block}:${id}`, "combo", "builder: defaultQuestion → chooseType → edits → transitionQuestion", builderQuestion(block, edit), extra);
  const legacy = (id: string, source: string, spec: unknown, extra: Pick<CorpusEntry, "table" | "rows"> = {}) => add(`legacy:${id}`, "legacy", source, spec, extra);
  const site = (id: string, source: string, spec: unknown, extra: Pick<CorpusEntry, "table" | "rows"> = {}) => add(`site:${id}`, "site", source, spec, extra);
  const str = (p: Party) => ({ id: String(p.id), name: p.name });

  // --- catalogue: "Toate întrebările", each with the choice it cannot run without
  add("catalog:default", "catalog", "question-ui.ts defaultQuestion", defaultQuestion());
  const choices: Partial<Record<Block, Edit>> = {
    compare: all(focalFirm(), set({ compareWith: supplier2.name, compareWithId: supplier2.id })),
    trend: yearsOf(b, c),
    network: focalFirm(),
    sankey: focalFirm(),
    fact_check: all(buyer(pair.authority), firm(pair.supplier)),
    distribution: focalBuyer(ids.profileAuthority),
  };
  for (const type of QUESTION_TYPES) add(`catalog:${type.id}`, "catalog", `QuestionBuilder chooseType("${type.id}")`, builderQuestion(type.id, choices[type.id]));

  // --- other pages of the site (fixtures/site-links-inventory.ts lists each one)
  site("home-roads", "site-links.ts ROADS_RANKING_SPEC (app/page.tsx, app/ghid/page.tsx)", ROADS_RANKING_SPEC);
  site("home-hospitals", "site-links.ts HOSPITALS_BREAKDOWN_SPEC (app/page.tsx)", HOSPITALS_BREAKDOWN_SPEC);
  site("home-contract-winners", "site-links.ts CONTRACT_WINNERS_SPEC (app/page.tsx)", CONTRACT_WINNERS_SPEC);
  site("home-da-count", "site-links.ts NATIONAL_DA_COUNT_SPEC (app/page.tsx)", NATIONAL_DA_COUNT_SPEC);
  site("home-contract-count", "site-links.ts NATIONAL_CONTRACT_COUNT_SPEC (app/page.tsx)", NATIONAL_CONTRACT_COUNT_SPEC);
  site("home-value", "site-links.ts NATIONAL_VALUE_SPEC (app/page.tsx)", NATIONAL_VALUE_SPEC);
  site("home-map", "site-links.ts NATIONAL_MAP_SPEC (app/DiscoveryMap.tsx)", NATIONAL_MAP_SPEC);
  site("county-breakdown", "discovery-links.ts countyBreakdownSpec (app/DiscoveryMap.tsx, app/ghid/page.tsx)", countyBreakdownSpec(ids.county2));
  for (const dataset of ["da", "contracts", "all"] as const)
    site(`entity-channel-authority-${dataset}`, "site-links.ts entityChannelSpec (app/entitati/[id]/page.tsx)", entityChannelSpec(String(authority.id), authority.name, "authority", dataset));
  site("entity-channel-supplier-da", "site-links.ts entityChannelSpec (app/entitati/[id]/page.tsx)", entityChannelSpec(String(supplier.id), supplier.name, "supplier", "da"));
  if (ids.person) site("person-firms", "site-links.ts personFirmsSpec (app/entitati/[id]/page.tsx)", personFirmsSpec(ids.person.key, ids.person.name));
  site("entity-month-authority", "site-links.ts entityMonthSpec (app/entitati/[id]/YearMiniChart.tsx)", entityMonthSpec(String(authority.id), authority.name, "authority", String(b), 3));
  site("entity-month-supplier", "site-links.ts entityMonthSpec (app/entitati/[id]/YearMiniChart.tsx)", entityMonthSpec(String(supplier.id), supplier.name, "supplier", String(b), 7));
  site("pair", "site-links.ts pairSpec (app/entitati/[id]/PartnersTable.tsx, app/contracte/[nid]/page.tsx)", pairSpec(str(pair.authority), str(pair.supplier)));
  site("domain-ranking", "site-links.ts domainContextSpec (app/domenii/DomainExplorer.tsx)", domainContextSpec("table", cpv.division, b, "supplier"));
  site("domain-evolution", "site-links.ts domainContextSpec (app/domenii/DomainExplorer.tsx)", domainContextSpec("timeseries", cpv.division, b));
  const division = { code: cpv.division, nodeKind: "division" } as DomainNode;
  const remainder = { code: "other", nodeKind: "remainder", isOther: true, excludedPrefixes: [cpv.division] } as DomainNode;
  for (const [name, node] of [["domain-sources-all", undefined], ["domain-sources-division", division], ["domain-sources-other", remainder]] as const) {
    const query = domainSourceQuery(b, node);
    site(name, "domains-shared.ts domainSourceQuery (app/domenii/DomainExplorer.tsx drawer, domainSourceUrl)", query.spec, { rows: { scope: query.scope } });
  }
  if (ids.person) site("person-clip", "site-links.ts personClipSpec (app/anchete/DossierEvidence.tsx)", personClipSpec(ids.person.key));
  site("pair-contracts", "site-links.ts pairContractsSpec (app/entitati/[id]/radiografie/DependencyScatter.tsx drawer)", pairContractsSpec(pair.authority.id, pair.supplier.id));
  if (ids.person) site("capture-person", "site-links.ts personCaptureSpec (lib/evidence-captures.ts)", personCaptureSpec(ids.person.key));
  site("capture-entity", "site-links.ts entityCaptureSpec (lib/evidence-captures.ts)", entityCaptureSpec(String(authority.id)));
  site("connection-pair", "connections-shared.ts connectionPairSpec (lib/connections.ts partner rows)",
    connectionPairSpec(str(pair.authority), str(pair.supplier), { dataset: "all", yearFrom: a, yearTo: b }));
  const identity = "0".repeat(64);
  site("connection-evidence", "connection-evidence-shared.ts connectionEvidenceSpec (app/entitati/[id]/legaturi/ConnectionsExplorer.tsx drawer, without the snapshot binding)",
    connectionEvidenceSpec({ version: "connection-evidence-1", checkpointId: "00000000-0000-0000-0000-000000000000", dataset: "all", yearFrom: a, yearTo: c, pairs: [
      { authority: { id: String(pair.authority.id), identity }, supplier: { id: String(pair.supplier.id), identity } },
      { authority: { id: String(authority.id), identity }, supplier: { id: String(pair.supplier.id), identity } },
    ] }));
  site("peer-source", "peers-shared.ts peerSourceSpec (lib/peers.ts members, app/entitati/[id]/comparatii)",
    peerSourceSpec({ id: String(authority.id), name: authority.name, role: "authority" }, { dataset: "all", year: b, cpv: cpv.division, page: 1 }));
  site("peer-evidence", "peers-evidence-shared.ts peerEvidenceSpec + peerEvidenceOptions scope (app/entitati/[id]/comparatii/PeersExplorer.tsx drawer, without the snapshot binding)",
    peerEvidenceSpec({ version: "peer-evidence-1", checkpointId: "00000000-0000-0000-0000-000000000000", entityId: String(supplier.id), identity, role: "supplier",
      dataset: "all", year: b, cpv: cpv.division, selection: { kind: "comparison" } }),
    { rows: { scope: { role: "supplier", entityIds: [String(supplier.id), String(supplier2.id)] } } });
  // lib/topic-search/interpretation.ts "Pe scurt": total, first three winners, and the buyer's domains (lib/intent/to-spec.ts specFor).
  site("topic-total", "lib/topic-search/interpretation.ts shortAnswer total (specFor 'total'; evidenceHref opens the sources)",
    { block: "stat", measure: "value", filters: { cpvTerm: cpv.word, county: ids.county, yearFrom: b, yearTo: b } });
  site("topic-top", "lib/topic-search/interpretation.ts shortAnswer top (specFor 'ranking_suppliers', topN 3)",
    { block: "table", measure: "value", filters: { cpvTerm: cpv.word, county: ids.county, yearFrom: b, yearTo: b }, dim: "supplier", topN: 3 });
  site("topic-domains", "lib/topic-search/interpretation.ts domainsOf (specFor 'breakdown' without the subject)",
    { block: "breakdown", measure: "value", filters: { authorityName: authority.name, authorityId: authority.id } });
  // Derived links inside "Întreabă" (blocks.tsx, MapBlock.tsx, source-spec.ts): same spec, a narrower drawer, or one level deeper.
  const ranking = builderQuestion("table", yearsOf(b));
  site("source-entity-row", "source-spec.ts entitySourceScope (clasament row → its records)", ranking,
    { rows: { scope: entitySourceScope(ranking as never, { entityId: String(supplier.id), name: supplier.name }) } });
  site("source-entity-spec", "source-spec.ts entitySourceSpec (clasament row → its own total)", entitySourceSpec(ranking as never, { entityId: String(supplier.id), name: supplier.name }));
  site("source-year", "source-spec.ts yearSourceLink (evolution bar → that year's records)", builderQuestion("timeseries"), { rows: { scope: { years: [b] } } });
  const slices = builderQuestion("breakdown", set({ cpvTerm: cpv.division }));
  site("slice-deeper", "app/intreaba/blocks.tsx sliceUrl (a slice one CPV level down)", breakdownDeeperSpec(slices, cpv.group));
  site("slice-records", "app/intreaba/blocks.tsx sliceUrl (an 8-digit slice → its records)", slices, { rows: { scope: { cpvPrefixes: [cpv.code] } } });
  site("node-records", "app/intreaba/blocks.tsx drillUrl (network node → the pair's records)", builderQuestion("network", focalBuyer()),
    { rows: { scope: { role: "supplier", entityIds: [String(supplier.id)] } } });
  site("ribbon-records", "app/intreaba/blocks.tsx drillUrl (flow ribbon → partner and domain)", builderQuestion("sankey", focalBuyer()),
    { rows: { scope: { role: "supplier", entityIds: [String(supplier.id)], cpvPrefixes: [cpv.division] } } });
  site("map-county-records", "app/intreaba/MapBlock.tsx (county → its records)", NATIONAL_MAP_SPEC, { rows: { scope: { county: ids.county } } });

  // --- stored shapes: saved questions (device, account), watches, captures
  add("saved:resolved", "saved", "resolved-spec.ts resolvedSpec (what /api/ask returns, saves and watches)",
    { block: "table", dataset: "all", dim: "supplier", measure: "value", topN: 10, filters: { authorityId: authority.id, authorityName: authority.name, county: "Cluj" } });
  add("saved:name-only", "saved", "an old link with a name and no id (grounded by name)", { block: "stat", measure: "value", filters: { authorityName: authority.name } });
  add("saved:county-lowercase", "saved", "an old link with a lower-case county", { block: "stat", measure: "value", filters: { county: ids.county.toLowerCase() } });
  add("saved:local-question", "saved", "local-questions.ts LocalQuestion.spec (dataset omitted, count measure)",
    { block: "timeseries", measure: "count", filters: { supplierId: supplier.id, supplierName: supplier.name } });
  add("saved:watch-selection", "saved", "app/urmariri/shared.tsx selectionHref (watch spec, scope and source filters)",
    { block: "table", dim: "authority", measure: "value", topN: 10, filters: { yearFrom: b, yearTo: b } },
    { rows: { scope: { role: "authority", entityIds: [String(authority.id)] }, stream: "da" } });
  add("saved:compare-profiles-mode", "saved", "comparisonMode profiles (accepted and ignored since 24 Oct 2026)",
    { block: "compare", comparisonMode: "profiles", measure: "value", filters: { authorityId: authority.id, authorityName: authority.name, compareWithId: authority2.id, compareWith: authority2.name } });

  // --- legacy shapes the builder no longer writes, and refusals that must stay refusals
  const tableAuthorities = { block: "table", dim: "authority", measure: "value", topN: 10, filters: { yearFrom: b, yearTo: b } };
  legacy("minimum-table-supplier-role", "Mai multe filtre: prag pe firme (implicit) pe clasamentul instituțiilor", { ...tableAuthorities, minimumRecords: { role: "supplier", count: 2 } });
  legacy("minimum-table-authority-role", "Mai multe filtre: prag pe instituții", { ...tableAuthorities, minimumRecords: { role: "authority", count: 3 } });
  legacy("minimum-stat", "Mai multe filtre pe total", { block: "stat", measure: "value", filters: {}, minimumRecords: { role: "supplier", count: 3 } });
  legacy("minimum-map", "Mai multe filtre pe hartă", { block: "map", measure: "count", filters: {}, minimumRecords: { role: "authority", count: 4 } });
  legacy("minimum-leader-value", "Mai multe filtre pe „Cine conduce?” pe valoare",
    { block: "entity_card", dim: "supplier", rankBy: "value", measure: "value", filters: {}, minimumRecords: { role: "supplier", count: 5 } });
  legacy("minimum-trend-refused", "prag pe trend (refuzat azi)", { block: "trend", dim: "supplier", measure: "value", topN: 10, filters: { yearFrom: a, yearTo: b }, minimumRecords: { role: "supplier", count: 2 } });
  legacy("minimum-profile-refused", "prag pe distribuție (refuzat azi)", { block: "distribution", dim: "authority", measure: "value", filters: { authorityId: ids.profileAuthority.id }, minimumRecords: { role: "authority", count: 2 } });
  legacy("single-bidder-stat", "„Un singur ofertant” pe toate canalele (parseSpec trece pe contracte)", { block: "stat", measure: "value", filters: { singleBidder: true } });
  legacy("single-bidder-table", "„Un singur ofertant” pe clasament", { block: "table", dataset: "contracts", dim: "supplier", measure: "value", topN: 10, filters: { singleBidder: true } });
  legacy("comparison-mode-transactions", "comparisonMode transactions", { block: "compare", comparisonMode: "transactions", measure: "value",
    filters: { supplierId: supplier.id, supplierName: supplier.name, compareWithId: supplier2.id, compareWith: supplier2.name, yearFrom: b, yearTo: b } });
  legacy("employees-under-5", "Mărimea firmelor: sub 5 angajați", { block: "table", dim: "supplier", measure: "value", topN: 10, filters: { maxEmployees: 4 } });
  legacy("employees-250-plus", "Mărimea firmelor: 250 sau mai mulți", { block: "stat", measure: "value", filters: { minEmployees: 250 } });
  legacy("employees-on-authorities", "Mărimea firmelor pe clasamentul instituțiilor", { block: "table", dim: "authority", measure: "value", topN: 10, filters: { minEmployees: 1, maxEmployees: 49 } });
  legacy("contracts-distribution-refused", "dataset contracts pe distribuție (refuzat azi)", { block: "distribution", dataset: "contracts", dim: "authority", measure: "value", filters: { authorityId: ids.profileAuthority.id } });
  legacy("contracts-scatter-refused", "dataset contracts pe nor (refuzat azi)", { block: "scatter", dataset: "contracts", dim: "authority", measure: "value", filters: {} });
  legacy("da-scatter", "dataset da pe nor (același profil)", { block: "scatter", dataset: "da", dim: "authority", measure: "value", filters: {} });
  legacy("county-scatter-firms", "județul pe norul de firme (sediul firmei)", { block: "scatter", dim: "supplier", measure: "value", filters: { county: ids.county } });
  legacy("leader-without-rankBy", "„Cine conduce?” fără rankBy (indicele de risc)", { block: "entity_card", dim: "authority", measure: "value", filters: {} });
  legacy("trend-without-years", "trend fără ani (primul și ultimul an al arhivei)", { block: "trend", dim: "supplier", measure: "value", topN: 10, filters: {} });
  legacy("trend-without-topN", "trend fără topN (10)", { block: "trend", dim: "supplier", measure: "value", filters: { yearFrom: a, yearTo: b } });
  legacy("count-on-breakdown", "measure count pe ce se cumpără (motorul răspunde în lei)", { block: "breakdown", measure: "count", filters: { county: ids.county } });
  legacy("count-on-trend", "measure count pe trend", { block: "trend", dim: "authority", measure: "count", topN: 5, filters: { yearFrom: b, yearTo: c } });
  legacy("per-capita-firms-refused", "pe locuitor pe clasamentul firmelor (refuzat)", { block: "table", dim: "supplier", measure: "value_per_capita", topN: 10, filters: {} });
  legacy("per-capita-stat", "pe locuitor în afara clasamentului", { block: "stat", measure: "value_per_capita", filters: { county: ids.county } });
  const population = (conditions: unknown[], operator = "and") => ({ operator: "and", groups: [{ operator, conditions }] });
  legacy("population-exclude-cpv", "Selecție precisă: exclude CPV", { block: "stat", measure: "value", filters: { yearFrom: b, yearTo: b },
    population: population([{ field: "cpv", op: "not_in", values: [cpv.division] }]) });
  legacy("population-exclude-firm", "Selecție precisă: exclude o firmă din clasament", { block: "table", dim: "supplier", measure: "value", topN: 10, filters: {},
    population: population([{ field: "supplier", op: "not_in", values: [String(supplier.id)] }]) });
  legacy("population-include-buyers", "Selecție precisă: lista de instituții incluse", { block: "table", dim: "supplier", measure: "value", topN: 10, filters: {},
    population: population([{ field: "authority", op: "in", values: [String(authority.id), String(authority2.id)] }]) });
  legacy("population-counties", "Selecție precisă: mai multe județe", { block: "map", measure: "value", filters: {},
    population: population([{ field: "county", op: "in", values: [ids.county, ids.county2] }]) });
  legacy("population-date-value", "Selecție precisă: date exacte și valoare pe cotă", { block: "stat", measure: "value", filters: {},
    population: population([{ field: "date", op: "gte", value: `${b}-03-01` }, { field: "date", op: "lte", value: `${b}-09-30` }, { field: "value", op: "gte", value: "5000" }]) });
  legacy("population-or-groups", "Selecție precisă: grupuri SAU", { block: "timeseries", measure: "value", filters: {}, population: { operator: "or", groups: [
    { operator: "and", conditions: [{ field: "authority", op: "in", values: [String(authority.id)] }, { field: "cpv", op: "in", values: [cpv.division] }] },
    { operator: "or", conditions: [{ field: "supplier", op: "in", values: [String(supplier2.id)] }, { field: "county", op: "in", values: [ids.county2] }] },
  ] } });
  legacy("population-on-trend", "Selecție precisă pe trend (acceptată)", { block: "trend", dim: "supplier", measure: "value", topN: 10, filters: { yearFrom: a, yearTo: b },
    population: population([{ field: "cpv", op: "in", values: [cpv.division] }]) });
  if (ids.person) {
    legacy("admin-trend", "administratorul pe trend", { block: "trend", dim: "authority", measure: "value", topN: 10, filters: { yearFrom: a, yearTo: b, adminPersonKey: ids.person.key, adminName: ids.person.name } });
    legacy("admin-leader-value", "administratorul pe „Cine conduce?” la firme", { block: "entity_card", dim: "supplier", rankBy: "value", measure: "value", filters: { adminPersonKey: ids.person.key } });
  }
  if (ids.unidentifiedPerson) legacy("admin-unidentified", "o persoană ONRC fără dată de naștere utilizabilă", { block: "stat", measure: "value", filters: { adminPersonKey: ids.unidentifiedPerson } });
  legacy("supplier-on-authority-leader", "supplierId pe „Cine conduce?” la instituții", { block: "entity_card", dim: "authority", rankBy: "value", measure: "value", filters: { supplierId: supplier.id, supplierName: supplier.name } });
  legacy("authority-on-supplier-leader", "authorityId pe „Cine conduce?” la firme", { block: "entity_card", dim: "supplier", rankBy: "value", measure: "value", filters: { authorityId: authority.id, authorityName: authority.name } });
  legacy("scatter-rankBy-value", "rankBy de sus pe nor (ignorat)", { block: "scatter", dim: "authority", rankBy: "value", measure: "value", filters: {} });
  legacy("months-stat", "lunile din graficul entității", { block: "stat", measure: "value", filters: { yearFrom: b, yearTo: b, monthFrom: 2, monthTo: 6 } });
  legacy("months-trend-refused", "lunile pe trend (refuzate)", { block: "trend", dim: "supplier", measure: "value", topN: 10, filters: { yearFrom: a, yearTo: b, monthFrom: 1, monthTo: 6 } });
  legacy("years-clamped", "ani în afara arhivei, restrânși", { block: "timeseries", measure: "value", filters: { yearFrom: a - 3, yearTo: c + 4 } });
  legacy("years-outside", "ani complet în afara arhivei", { block: "stat", measure: "value", filters: { yearFrom: a - 10, yearTo: a - 8 } });
  legacy("locality-map-refused", "localitate pe hartă (refuzată)", { block: "map", measure: "value", filters: { uatSiruta: ids.uat.siruta, uatName: ids.uat.name } });
  legacy("locality-stat", "localitate pe total", { block: "stat", measure: "value", filters: { uatSiruta: ids.uat.siruta, uatName: ids.uat.name } });
  legacy("locality-ranking", "localitate pe clasamentul firmelor", { block: "table", dim: "supplier", measure: "value", topN: 10, filters: { uatSiruta: ids.uat.siruta, uatName: ids.uat.name } });
  legacy("unknown-key-refused", "o cheie necunoscută", { block: "stat", measure: "value", filters: {}, future: 1 });
  legacy("unknown-filter-refused", "un filtru necunoscut", { block: "stat", measure: "value", filters: { color: "verde" } });
  legacy("newer-key-refused", "o cheie din versiunea următoare (F0a)", { block: "trend", dim: "supplier", measure: "value", topN: 10, filters: { yearFrom: a, yearTo: b }, trend: { change: "up" } });
  legacy("other-block-options", "opțiunile altei întrebări (scoase la parsare)", { block: "table", dim: "supplier", measure: "value", topN: 10, filters: {}, trend: { change: "up" } });
  legacy("cpv-retired", "un cuvânt retras („lucrări”)", { block: "stat", measure: "value", filters: { cpvTerm: cpv.retired } });
  legacy("cpv-unknown", "un domeniu negăsit", { block: "stat", measure: "value", filters: { cpvTerm: cpv.unknown } });
  legacy("cpv-fuzzy", "un domeniu potrivit aproximativ", { block: "stat", measure: "value", filters: { cpvTerm: cpv.fuzzy } });
  legacy("cpv-union", "două domenii numărate împreună", { block: "breakdown", measure: "value", filters: { cpvTerm: `${cpv.word} + ${cpv.word2}` } });
  legacy("cpv-code", "un cod CPV scris direct", { block: "table", dim: "authority", measure: "value", topN: 10, filters: { cpvTerm: cpv.code } });
  legacy("county-unknown", "un județ necunoscut", { block: "stat", measure: "value", filters: { county: "Atlantida" } });
  legacy("authority-unknown", "o instituție negăsită", { block: "stat", measure: "value", filters: { authorityName: "Instituția Inexistentă Zzz" } });
  legacy("fact-check-no", "verificare fără înregistrări", { block: "fact_check", measure: "value",
    filters: { authorityId: unrelated.authority.id, authorityName: unrelated.authority.name, supplierId: unrelated.supplier.id, supplierName: unrelated.supplier.name } });
  legacy("distribution-no-profile", "o entitate fără profil de risc", { block: "distribution", dim: "authority", measure: "value", filters: { authorityId: ids.noProfile.id, authorityName: ids.noProfile.name } });
  legacy("network-empty", "rețea fără parteneri în selecție", { block: "network", measure: "value", filters: { authorityId: ids.quietAuthority.id, authorityName: ids.quietAuthority.name, cpvTerm: cpv.quietWord } });
  legacy("sankey-empty", "flux fără parteneri în selecție", { block: "sankey", measure: "value", filters: { authorityId: ids.quietAuthority.id, authorityName: ids.quietAuthority.name, cpvTerm: cpv.quietWord } });
  legacy("leader-none", "„Cine conduce?” fără niciun profil eligibil", { block: "entity_card", dim: "supplier", rankBy: "risk", measure: "value", filters: { county: "Alba" } });
  legacy("trend-same-year", "trend cu doi ani egali", { block: "trend", dim: "supplier", measure: "value", topN: 10, filters: { yearFrom: b, yearTo: b } });
  legacy("profile-years-refused", "perioadă pe un profil (refuzată)", { block: "scatter", dim: "authority", measure: "value", filters: { yearFrom: b, yearTo: b } });
  legacy("profile-firm-kind-refused", "tipul instituției pe profilurile firmelor (refuzat)", { block: "entity_card", dim: "supplier", rankBy: "risk", measure: "value", filters: { authorityKind: "spital" } });

  // --- every question with today's filters, as the builder writes them
  // table
  combo("suppliers", "table", () => {});
  combo("authorities", "table", top({ dim: "authority" }));
  combo("counties", "table", top({ dim: "county" }));
  combo("suppliers-paged", "table", (q) => { delete q.topN; }, { table: { page: 0 } });
  combo("suppliers-paged-2", "table", (q) => { delete q.topN; }, { table: { page: 1 } });
  combo("suppliers-paged-by-name", "table", (q) => { delete q.topN; }, { table: { page: 0, sort: "name", dir: "asc" } });
  combo("authorities-paged-by-county", "table", all(top({ dim: "authority" }), (q) => { delete q.topN; }), { table: { page: 0, sort: "county", dir: "asc" } });
  combo("counties-paged-by-count", "table", all(top({ dim: "county" }), (q) => { delete q.topN; }), { table: { page: 0, sort: "count" } });
  combo("per-capita", "table", top({ dim: "authority", measure: "value_per_capita" }));
  combo("per-capita-paged", "table", all(top({ dim: "authority", measure: "value_per_capita" }), (q) => { delete q.topN; }), { table: { page: 0, sort: "percap" } });
  combo("count", "table", top({ measure: "count" }));
  combo("year", "table", yearsOf(b));
  combo("months", "table", set({ yearFrom: b, yearTo: b, monthFrom: 3, monthTo: 6 }));
  combo("county", "table", set({ county: ids.county }));
  combo("kind", "table", all(top({ dim: "authority" }), set({ authorityKind: "spital" })));
  combo("kind-suppliers", "table", set({ authorityKind: "comuna" }));
  combo("cpv-word", "table", set({ cpvTerm: cpv.word }));
  combo("cpv-division", "table", all(top({ dim: "authority" }), set({ cpvTerm: cpv.division })));
  combo("locality", "table", set({ uatSiruta: ids.uat.siruta, uatName: ids.uat.name }));
  combo("employees", "table", set({ minEmployees: 10, maxEmployees: 500 }));
  if (ids.person) combo("admin", "table", set({ adminPersonKey: ids.person.key, adminName: ids.person.name }));
  combo("da", "table", top({ dataset: "da" }));
  combo("contracts", "table", top({ dataset: "contracts" }));
  combo("single-bidder", "table", all(top({ dataset: "contracts" }), set({ singleBidder: true })));
  combo("buyer-named", "table", buyer());
  combo("firm-named", "table", firm());
  combo("firm-named-year-da", "table", all(firm(), yearsOf(b), top({ dataset: "da" })), { rows: { stream: "da", sort: "value", dir: "asc" } });
  // stat
  combo("bare", "stat", () => {});
  combo("bare-da", "stat", top({ dataset: "da" }));
  combo("bare-contracts", "stat", top({ dataset: "contracts" }));
  combo("count", "stat", top({ measure: "count" }));
  combo("county-year", "stat", all(set({ county: ids.county2 }), yearsOf(b)), { rows: { search: "medic" } });
  combo("kind", "stat", set({ authorityKind: "oras_municipiu" }));
  combo("cpv-county", "stat", set({ cpvTerm: cpv.word2, county: ids.county2 }));
  combo("buyer", "stat", buyer(), { rows: { stream: "contracts" } });
  combo("firm", "stat", firm(), { rows: { sort: "date", dir: "desc" } });
  combo("pair-years", "stat", all(buyer(pair.authority), firm(pair.supplier), yearsOf(a, b)));
  combo("months", "stat", set({ yearFrom: a, yearTo: b, monthFrom: 4, monthTo: 9 }));
  combo("employees", "stat", set({ maxEmployees: 49 }));
  if (ids.person) combo("admin", "stat", set({ adminPersonKey: ids.person.key, adminName: ids.person.name }));
  combo("locality", "stat", set({ uatSiruta: ids.uat.siruta, uatName: ids.uat.name }), { rows: { state: "Oferta acceptata" } });
  combo("da-year", "stat", all(top({ dataset: "da" }), yearsOf(c)));
  // timeseries
  combo("bare", "timeseries", () => {});
  combo("da", "timeseries", top({ dataset: "da" }));
  combo("contracts-count", "timeseries", top({ dataset: "contracts", measure: "count" }));
  combo("cpv-word", "timeseries", set({ cpvTerm: cpv.word }));
  combo("buyer", "timeseries", buyer());
  combo("firm-count", "timeseries", all(firm(), top({ measure: "count" })));
  combo("months", "timeseries", set({ yearFrom: a, yearTo: c, monthFrom: 2, monthTo: 4 }));
  combo("county", "timeseries", set({ county: ids.county }));
  // map
  combo("bare", "map", () => {});
  combo("da", "map", top({ dataset: "da" }));
  combo("count", "map", top({ measure: "count" }));
  combo("cpv-word", "map", set({ cpvTerm: cpv.word2 }));
  combo("kind", "map", set({ authorityKind: "consiliu_judetean" }));
  combo("buyer", "map", buyer());
  combo("employees-year", "map", all(set({ minEmployees: 1 }), yearsOf(b)));
  // breakdown
  combo("bare", "breakdown", () => {});
  combo("county", "breakdown", set({ county: ids.county }));
  combo("division", "breakdown", set({ cpvTerm: cpv.division }));
  combo("group", "breakdown", set({ cpvTerm: cpv.group }));
  combo("code", "breakdown", set({ cpvTerm: cpv.code }), { rows: { scope: { cpvPrefixes: [cpv.code] } } });
  combo("kind", "breakdown", set({ authorityKind: "spital" }));
  combo("firm", "breakdown", firm());
  combo("contracts-year", "breakdown", all(top({ dataset: "contracts" }), yearsOf(b)));
  // compare
  combo("authorities", "compare", all(focalBuyer(), set({ compareWith: authority2.name, compareWithId: authority2.id })));
  combo("suppliers", "compare", all(focalFirm(), set({ compareWith: supplier2.name, compareWithId: supplier2.id })), { rows: { scope: { role: "supplier", entityIds: [String(supplier2.id)] } } });
  combo("authorities-year", "compare", all(focalBuyer(), set({ compareWith: authority2.name, compareWithId: authority2.id }), yearsOf(b)));
  combo("suppliers-da", "compare", all(focalFirm(), set({ compareWith: supplier2.name, compareWithId: supplier2.id }), top({ dataset: "da" })));
  combo("authorities-cpv", "compare", all(focalBuyer(), set({ compareWith: authority2.name, compareWithId: authority2.id, cpvTerm: cpv.word })));
  // trend
  combo("suppliers", "trend", yearsOf(a, b));
  combo("authorities", "trend", all(top({ dim: "authority" }), yearsOf(b, c)));
  combo("counties", "trend", all(top({ dim: "county" }), yearsOf(a, c)));
  combo("top5-da", "trend", all(top({ topN: 5, dataset: "da" }), yearsOf(a, b)));
  combo("cpv-word", "trend", all(set({ cpvTerm: cpv.word }), yearsOf(b, c)));
  combo("county", "trend", all(set({ county: ids.county }), yearsOf(a, b)));
  // network
  combo("buyer", "network", focalBuyer());
  combo("firm", "network", focalFirm(), { rows: { scope: { role: "authority", entityIds: [String(pair.authority.id)] } } });
  combo("buyer-year", "network", all(focalBuyer(), yearsOf(b)));
  combo("firm-cpv", "network", all(focalFirm(), set({ cpvTerm: cpv.word })));
  combo("firm-county", "network", all(focalFirm(), set({ county: ids.county })));
  combo("buyer-contracts", "network", all(focalBuyer(authority2), top({ dataset: "contracts" })));
  // sankey
  combo("buyer", "sankey", focalBuyer());
  combo("firm", "sankey", focalFirm());
  combo("buyer-year", "sankey", all(focalBuyer(authority2), yearsOf(b)));
  combo("firm-da", "sankey", all(focalFirm(), top({ dataset: "da" })));
  // fact_check
  combo("pair", "fact_check", all(buyer(pair.authority), firm(pair.supplier)));
  combo("pair-year", "fact_check", all(buyer(pair.authority), firm(pair.supplier), yearsOf(b)));
  combo("pair-contracts", "fact_check", all(buyer(pair.authority), firm(pair.supplier), top({ dataset: "contracts" })));
  // distribution
  combo("authority", "distribution", focalBuyer(ids.profileAuthority));
  combo("authority-county", "distribution", all(focalBuyer(ids.profileAuthority), set({ county: "Alba" })));
  combo("authority-county-focal-records", "distribution", all(focalBuyer(ids.profileAuthority), set({ county: "Alba" })),
    { rows: { scope: { role: "authority", entityIds: [String(ids.profileAuthority.id)] } } });
  combo("authority-bucket", "distribution", focalBuyer(ids.profileAuthority), { rows: { scope: { riskBucket: { from: 0.2, to: 0.3 } } } });
  combo("authority-kind", "distribution", all(focalBuyer(authority), set({ authorityKind: "oras_municipiu" })));
  combo("supplier", "distribution", focalFirm(ids.profileSupplier));
  combo("supplier-county", "distribution", all(focalFirm(ids.profileSupplier), set({ county: ids.county2 })));
  // scatter
  combo("authorities", "scatter", top({ dim: "authority" }));
  combo("suppliers", "scatter", () => {});
  combo("county", "scatter", all(top({ dim: "authority" }), set({ county: ids.county })));
  combo("kind", "scatter", all(top({ dim: "authority" }), set({ authorityKind: "comuna" })), { rows: { scope: { role: "authority", entityIds: [String(authority.id)] } } });
  // entity_card
  combo("risk-authority", "entity_card", top({ rankBy: "risk", dim: "authority" }));
  combo("risk-supplier", "entity_card", top({ rankBy: "risk", dim: "supplier" }));
  combo("risk-county", "entity_card", all(top({ rankBy: "risk", dim: "authority" }), set({ county: ids.county2 })));
  combo("risk-kind", "entity_card", all(top({ rankBy: "risk", dim: "authority" }), set({ authorityKind: "spital" })));
  combo("value-authority", "entity_card", top({ dim: "authority" }));
  combo("value-supplier", "entity_card", top({ dim: "supplier" }), { rows: { stream: "contracts" } });
  combo("value-year", "entity_card", all(top({ dim: "authority" }), yearsOf(b)));
  combo("value-cpv", "entity_card", all(top({ dim: "supplier" }), set({ cpvTerm: cpv.word })));
  combo("value-contracts", "entity_card", all(top({ dim: "authority" }), top({ dataset: "contracts" })));
  combo("value-county", "entity_card", all(top({ dim: "supplier" }), set({ county: ids.county })));
  return out;
}

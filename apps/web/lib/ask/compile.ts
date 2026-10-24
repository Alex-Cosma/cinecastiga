import { canonicalAskIdentities } from "./canonical-identities";
import { retiredChoicesText } from "./retired-terms";
import { FORCE_CUSTOM_PLANS } from "../plan-cache";
import type { DbSql } from "@seap/db";
import { namedKind, NEWER_VERSION_LINK, unimplementedSpecKeys, type AskSpec, type Dim } from "./spec";
import type { Grounding } from "./ground";
import { EVIDENCE_CSV_LIMIT, PROFILE_BLOCKS, sumDecimalStrings, validateEvidenceScope, type EvidenceScope, type EvidenceStatus, type EvidenceProfile } from "./evidence";
import {
  andAll, DA_PLAFOND_RON, displayPredicates, ENTITY_CARD_MIN_DAS, fold, groupPredicates, perCapitaPredicate, plafondFor, predicateContext,
  profileMinDas, profilePredicates, RISK_MIN_DAS, rowPredicates, trendYearsPredicate, type PredicateCtx,
} from "./predicates";
import { authorityKindIds, KIND_LABEL } from "./authority-kind";
import { countyIsFirmSeat, isHistoricalProfile, unsupportedPopulationView } from "./population";
import { describeConditions, type ConditionLabels } from "./filters/describe";
import { retarget } from "./filters/retarget";
import type { OriginHint } from "./filters/origin";
import { PER_CAPITA_SOURCE, perCapitaCaveat, POPULATION_CARD_NOTE, readPerCapitaPopulations, type PerCapitaPopulations } from "./per-capita";
import { martColumns } from "./mart-columns";
import {
  compareParties, compareSharedPartners, compareTopPartners, planRollup, rollupBreakdown, rollupCountyTable, rollupMap, rollupMinimumCond,
  rollupSourceTotals, rollupStat, rollupsReady, rollupTable, rollupTimeseries, rollupTrend, scatterDensity, type RollupFilters, type RollupNeed, type RollupSource,
} from "./rollups";
import { sectorUnit } from "../peer-population";

/**
 * Compile a validated AskSpec + grounding into parameterized SQL and execute it
 * under guardrails (read-only transaction, statement timeout, row caps, DA
 * plausibility bound). The LLM never touches SQL — only this compiler does,
 * from a closed vocabulary, so the injection surface is enum fields plus
 * parameterized values.
 *
 * Every semantic guardrail that changes the result (plafond, year clamping,
 * per-capita subset) is reported back as a caveat — adjust loudly, never
 * silently.
 */

/** The DA plausibility bound is written with the other conditions (predicates.ts); its readers import it from here. */
export { DA_PLAFOND_RON };
/** Contracts above CONTRACT_VALUE_CAP_RON (@seap/db) never reach the marts, so
 * every contract answer must say so; the entity page lists them. */
/** Same wording as /metodologie: an analytical filter, never a claim that the record is wrong (audit F25). */
export const DA_PLAFOND_CAVEAT =
  `Achizițiile directe peste ${(DA_PLAFOND_RON / 1_000_000).toLocaleString("ro-RO")} milioane lei sunt excluse (filtru analitic de plauzibilitate, nu pragul legal și nici dovada unei erori).`;
export const CONTRACT_CAP_CAVEAT =
  "Contractele prin proceduri peste 1 miliard lei sunt scoase din totaluri și clasamente (filtru al aplicației, nu dovada unei erori); apar pe pagina instituției.";
/** Historical profiles drop it with the stream caveats: their own source line replaces them. */
const DA_ACCEPTED_CAVEAT =
  "Doar achizițiile directe acceptate («Ofertă acceptată»); cele refuzate sau expirate (~6%) sunt excluse. Acceptarea nu dovedește plata.";
const STATEMENT_TIMEOUT = "20s";

export interface TableRow {
  entityId: string | null;
  name: string;
  county: string | null;
  value: number;
  count: number;
  population: number | null;
}
export interface SeriesPoint {
  year: number;
  value: number;
  count: number;
}
export interface CountyValue {
  county: string;
  value: number;
  count: number;
}
export interface StatValue {
  value: number;
  count: number;
  /** dataset "all": the per-channel split behind the sum. */
  byStream?: { src: "da" | "contracts"; value: number; count: number }[];
}
export interface CompareEntity {
  entityId: string;
  name: string;
  county: string | null;
  role: string;
  value: number;
  count: number;
  /** Historical risk profile (all direct acquisitions, not the selection). */
  cri: number | null;
  nFlags: number;
  flags: string[];
  population: number | null;
  // Since 24 Oct 2026; older saved answers lack the fields below.
  hasProfile?: boolean;
  /** singleBid counts contracts with one bid among `bidsKnown`, those whose number of bids is published. */
  streams?: { da: { value: number; count: number }; contracts: { value: number; count: number; singleBid: number | null; bidsKnown: number } };
  /** Distinct counterparties: institutions for a firm, firms for an institution. */
  partners?: number;
  topPartners?: ComparePartner[];
  years?: { year: number; value: number }[];
  /** Top 5-digit CPV groups by value (at most COMPARE_DOMAINS), out of `domainCount`. */
  domains?: { code: string; name: string | null; value: number }[];
  domainCount?: number;
  /** Selection value whose records have no CPV code. */
  noCpvValue?: number;
  active?: { from: number | null; to: number | null } | null;
  firm?: { employees: number | null; year: number | null; turnover: number | null } | null;
}
/** A comparison lists each entity's CPV groups up to this many; the rest is one line. */
export const COMPARE_DOMAINS = 30;
export interface ComparePartner { entityId: string; name: string; value: number; count: number }
export interface CompareData {
  block: "compare";
  entities: CompareEntity[];
  /** Counterparties of both, by combined value (at most 30 rows). */
  shared?: { total: number; rows: { entityId: string; name: string; a: { value: number; count: number }; b: { value: number; count: number } }[] };
  /** Firms only: public contracts both won (at most 5 rows). */
  joint?: { total: number; rows: { nid: string; authority: string | null; date: string | null; value: number }[] };
}
export interface DistributionData {
  /** 10 CRI buckets [0,0.1) … [0.9,1]. */
  buckets: { from: number; to: number; n: number }[];
  focal: { entityId: string; name: string; cri: number | null; percentile: number | null };
  role: string;
  totalEntities: number;
}
export interface BreakdownSlice {
  code: string;
  name: string | null;
  value: number;
  count: number;
}
export interface ScatterPoint {
  entityId: string;
  name: string;
  county: string | null;
  value: number;
  cri: number;
  nFlags: number;
}
/** Full-population 2D histogram behind the scatter: log10(spend) × CRI. */
export interface ScatterDensity {
  minLog: number;
  maxLog: number;
  nx: number;
  ny: number;
  total: number;
  /** sparse cells as [xBucket (1-based), yBucket (1-based), count] */
  cells: [number, number, number][];
}
export interface SankeyFlow {
  partnerId: string;
  partner: string;
  categoryCode: string;
  category: string | null;
  value: number;
}
export interface NetworkNode {
  entityId: string;
  name: string;
  value: number;
  count: number;
}
export interface EntityCardData {
  entityId: string;
  name: string;
  county: string | null;
  role: string;
  value: number;
  count: number;
  cri: number | null;
  nFlags: number;
  flags: string[];
  population: number | null;
}
export interface FactCheckData {
  verdict: boolean;
  authority: { entityId: string; name: string };
  supplier: { entityId: string; name: string };
  count: number;
  value: number;
  yearFirst: number | null;
  yearLast: number | null;
  samples: { daCode: string | null; date: string | null; cpvName: string | null; value: number }[];
}
export interface TrendRow {
  entityId: string | null;
  name: string;
  county: string | null;
  valueA: number;
  valueB: number;
}

export type BlockData =
  // total/page/pageSize present only in paged mode (clasament without topN)
  // totals: the whole ranking (every ranked entity, not only the shown rows), when computed in the same query.
  | { block: "table"; rows: TableRow[]; total?: number; page?: number; pageSize?: number; totals?: { value: number; count: number; entities: number } }
  | { block: "stat"; stat: StatValue }
  | { block: "timeseries"; series: SeriesPoint[] }
  // unknown: records of the same selection whose authority has no county.
  // They are not on the map, but shares are of the whole selection (audit F13).
  | { block: "map"; counties: CountyValue[]; unknown: { value: number; count: number } }
  | CompareData
  | { block: "distribution"; distribution: DistributionData }
  | { block: "breakdown"; slices: BreakdownSlice[]; other: { value: number; count: number } }
  | { block: "scatter"; points: ScatterPoint[]; density?: ScatterDensity | undefined }
  | { block: "sankey"; flows: SankeyFlow[]; focal: { entityId: string; name: string; role: string } }
  | { block: "network"; nodes: NetworkNode[]; focal: { entityId: string; name: string; role: string } }
  | { block: "entity_card"; card: EntityCardData }
  | { block: "fact_check"; fact: FactCheckData }
  | { block: "trend"; rowsTrend: TrendRow[]; yearA: number; yearB: number };

export interface EngineResult {
  data: BlockData;
  displaySql: string;
  caveats: string[];
  tookMs: number;
  /** timeseries/trend: years the archive covers only in part (audit F19). */
  partialYears?: PartialYear[];
}

// Audit F15: the locality filter is the UAT's own administration, strictly
// associated (localAuthorityIdsForUnit) — never every institution in the UAT.
const UAT_SCOPE_METHOD =
  "Asocierea autoritate–UAT este o inferență a aplicației (cod SIRUTA din același județ sau nume și județ identice, CUI valid); asocierile din alt județ sau nesigure sunt excluse.";
const BUCURESTI_SIRUTA = 179132;
export function uatScopeCaveat(label: string, n: number, siruta?: number): string {
  const sector = siruta !== undefined && sectorUnit(siruta) !== undefined;
  const who = sector
    ? n === 1 ? "doar primăria sectorului" : `cele ${n} identități înregistrate ale primăriei sectorului`
    : n === 1
    ? "doar administrația locală a UAT-ului (primăria / consiliul local)"
    : `cele ${n} identități înregistrate ale administrației locale a UAT-ului (primăria / consiliul local)`;
  const sectors = siruta === BUCURESTI_SIRUTA ? " Primăriile celor șase sectoare sunt autorități separate și nu sunt incluse."
    : sector ? " Primăria Municipiului București și instituțiile subordonate sectorului (direcții, poliție locală, administrații, companii) sunt autorități separate și nu sunt incluse." : "";
  return `Localitatea „${label}”: includ ${who}, nu și școlile, spitalele sau alte instituții din localitate.${sectors} ${UAT_SCOPE_METHOD}`;
}
export function uatUnmappedError(label: string): string {
  return `Nu am putut asocia sigur nicio autoritate contractantă cu localitatea „${label}”. ${UAT_SCOPE_METHOD} ` +
    "Asta nu înseamnă că localitatea nu are achiziții: căutați primăria după nume.";
}

/** The county caveat says whose county it is (countyIsFirmSeat), where it comes from and who is left out. */
export function countyCaveat(spec: AskSpec, focal: "authority" | "supplier"): string {
  return countyIsFirmSeat(spec, focal)
    ? "Județul = sediul firmei (din adresă, cod NUTS sau ONRC), nu al instituțiilor care cumpără. Firmele fără județ cunoscut nu intră."
    : "Județul = sediul instituției care cumpără, nu al firmei (din adresă, cod NUTS, ONRC sau UAT verificat). Instituțiile fără județ cunoscut nu intră.";
}

/** A relationship view with no partner rows: on every stream, not only direct acquisitions. */
export function emptyRelationError(focalName: string): string {
  return `„${focalName}” nu are înregistrări în selecția aleasă.`;
}

/** Coverage of a stream ('da' | 'award'), cached per process (10 min). */
const coverageCache = new Map<string, { years: number[]; at: number }>();
const snapshotCoverageConnections = new WeakSet<DbSql>();
/** Coordinated snapshots must not inherit bounds from an earlier refresh. */
export function useSnapshotCoverage(sql: DbSql): DbSql {
  snapshotCoverageConnections.add(sql);
  return sql;
}
export async function daCoverageYears(sql: DbSql, kind: "da" | "award" = "da"): Promise<number[]> {
  const fresh = snapshotCoverageConnections.has(sql);
  const hit = fresh ? undefined : coverageCache.get(kind);
  if (hit && Date.now() - hit.at < 600_000) return hit.years;
  const rows = (await sql`
    select year from marts.national_stats where kind = ${kind} and year is not null order by year
  `) as unknown as { year: number }[];
  const years = rows.map((r) => Number(r.year));
  if (!fresh) coverageCache.set(kind, { years, at: Date.now() });
  return years;
}

/** First and last dated record of a channel (marts.data_coverage, Bucharest calendar days),
 * and the last day considered complete (audit F10; null or absent when not established). */
export interface ChannelPeriod { from: string | null; to: string | null; completeUntil?: string | null }
export type CoveragePeriods = Record<"da" | "contracts", ChannelPeriod>;
/** A year (or the selected months of it) that the archive covers only in part,
 * or whose contracts are provisional (audit F10). */
export interface PartialYear { year: number; note: string; provisional?: true }
let periodCache: { periods: CoveragePeriods | null; at: number } | undefined;
/** Archive period per channel, or null when the inventory has not been calculated. */
export async function coveragePeriods(sql: DbSql): Promise<CoveragePeriods | null> {
  const fresh = snapshotCoverageConnections.has(sql);
  if (!fresh && periodCache && Date.now() - periodCache.at < 600_000) return periodCache.periods;
  // Additive deployment: probe first, so a missing table cannot abort a caller's transaction.
  const [table] = (await sql`select to_regclass('marts.data_coverage') is not null ok`) as unknown as { ok: boolean }[];
  let periods: CoveragePeriods | null = null;
  if (table?.ok) {
    const rows = (await sql`
      select dataset, observation->>'date_from' date_from, observation->>'date_to' date_to,
        observation->>'complete_until' complete_until
      from marts.data_coverage where dataset in ('da', 'contracts')
    `) as unknown as { dataset: "da" | "contracts"; date_from: string | null; date_to: string | null; complete_until?: string | null }[];
    const da = rows.find((r) => r.dataset === "da"), contracts = rows.find((r) => r.dataset === "contracts");
    if (da && contracts) periods = {
      da: { from: da.date_from, to: da.date_to },
      contracts: { from: contracts.date_from, to: contracts.date_to, completeUntil: contracts.complete_until ?? null },
    };
  }
  if (!fresh) periodCache = { periods, at: Date.now() };
  return periods;
}

const PERIOD_CHANNEL: Record<"da" | "contracts", string> = { da: "achizițiile directe", contracts: "contractele" };
const roDay = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Audit F19: years whose selected window (the calendar year, or the chosen
 * months of the first/last selected year) begins before or ends after the
 * archive of a channel in the dataset. 2018 direct acquisitions start on
 * 2 April and the latest year stops at the last collected day, so their
 * totals are not comparable with complete years.
 */
export function partialYears(
  periods: CoveragePeriods,
  dataset: "all" | "da" | "contracts",
  years: readonly number[],
  window: { yearFrom?: number | null; yearTo?: number | null; monthFrom?: number | null; monthTo?: number | null } = {},
): PartialYear[] {
  const channels = dataset === "all" ? (["da", "contracts"] as const) : ([dataset] as const);
  const out: PartialYear[] = [];
  for (const year of [...new Set(years)].sort((a, b) => a - b)) {
    const m0 = window.monthFrom && year === window.yearFrom ? window.monthFrom : 1;
    const m1 = window.monthTo && year === window.yearTo ? window.monthTo : 12;
    const start = `${year}-${pad2(m0)}-01`;
    const end = `${year}-${pad2(m1)}-${pad2(new Date(Date.UTC(year, m1, 0)).getUTCDate())}`;
    // phrase kind + boundary date per channel; channels sharing both are merged
    const parts: { channel: "da" | "contracts"; kind: "starts" | "from" | "to" | "stops"; day: string }[] = [];
    for (const channel of channels) {
      const from = periods[channel].from?.slice(0, 10), to = periods[channel].to?.slice(0, 10);
      if (!from || !to) continue;
      if (from > end) parts.push({ channel, kind: "starts", day: from });
      else if (to < start) parts.push({ channel, kind: "stops", day: to });
      else {
        if (from > start) parts.push({ channel, kind: "from", day: from });
        if (to < end) parts.push({ channel, kind: "to", day: to });
      }
    }
    // Audit F10: contracts dated after the nightly "complete until" day are still being published.
    const until = periods.contracts.completeUntil?.slice(0, 10), last = periods.contracts.to?.slice(0, 10);
    const provisional = channels.some((c) => c === "contracts") && !!until && !!last && until < end && last > until && last >= start;
    if (parts.length === 0 && !provisional) continue;
    const phrases: string[] = [];
    for (const kind of ["starts", "from", "to", "stops"] as const) {
      const ofKind = parts.filter((p) => p.kind === kind);
      if (ofKind.length === 0) continue;
      const verb = { starts: "încep la", from: "de la", to: "până la", stops: "se opresc la" }[kind];
      const kindPhrases = ofKind.length === channels.length && ofKind.every((p) => p.day === ofKind[0]!.day)
        ? [kind === "starts" || kind === "stops" ? `înregistrările ${verb} ${roDay(ofKind[0]!.day)}` : `date ${verb} ${roDay(ofKind[0]!.day)}`]
        : ofKind.map((p) => `${PERIOD_CHANNEL[p.channel]} ${verb} ${roDay(p.day)}`);
      // A first archive year can also be thinner after its first day (contracts ramp up through 2018).
      if (kind === "from") kindPhrases[kindPhrases.length - 1] += ", începutul arhivei";
      phrases.push(...kindPhrases);
    }
    if (provisional) phrases.push(`contractele datate după ${roDay(until!)} sunt provizorii`);
    out.push({ year, note: phrases.join("; "), ...(provisional ? { provisional: true as const } : {}) });
  }
  return out;
}

export function partialYearsCaveat(list: readonly PartialYear[], context: "series" | "comparison" | "selection"): string | null {
  if (list.length === 0) return null;
  const one = list.length === 1;
  // Years sharing a note are listed once: "2016, 2017 (…)".
  const byNote = new Map<string, number[]>();
  for (const p of list) byNote.set(p.note, [...(byNote.get(p.note) ?? []), p.year]);
  const named = [...byNote].map(([note, years]) => `${years.join(", ")} (${note})`).join(", ");
  // Audit F10: provisional contract months are a publication lag, not a gap in the archive.
  if (list.some((p) => p.provisional)) {
    const lead = context === "selection"
      ? `Perioada aleasă include ${one ? "un an" : "ani"} cu date parțiale sau provizorii: ${named}.`
      : `${one ? "An" : "Ani"} cu date parțiale sau provizorii: ${named}.`;
    const tail = context === "series"
      ? ` ${one ? "Totalul lui nu este complet" : "Totalurile lor nu sunt complete"}; nu ${one ? "îl" : "le"} compara direct cu ceilalți ani din grafic.`
      : context === "comparison"
        ? " Diferența dintre cei doi ani reflectă și perioada neacoperită sau încă nepublicată, nu doar o schimbare reală."
        : ` ${one ? "Valoarea lui nu este completă" : "Valorile lor nu sunt complete"}.`;
    return `${lead}${tail} SEAP publică multe contracte la câteva săptămâni sau luni după semnare: cifrele provizorii pot crește la actualizările următoare.`;
  }
  const lead = context === "selection"
    ? `Perioada aleasă include ${one ? "un an acoperit" : "ani acoperiți"} parțial de date: ${named}.`
    : `${one ? "An acoperit" : "Ani acoperiți"} parțial de date: ${named}.`;
  const tail = context === "series"
    ? ` ${one ? "Totalul lui nu acoperă" : "Totalurile lor nu acoperă"} un an întreg; nu ${one ? "îl" : "le"} compara direct cu ceilalți ani din grafic.`
    : context === "comparison"
      ? " Diferența dintre cei doi ani reflectă și perioada neacoperită, nu doar o schimbare reală."
      : ` ${one ? "Valoarea lui nu acoperă" : "Valorile lor nu acoperă"} un an întreg.`;
  return lead + tail;
}
export const PERIOD_UNKNOWN_CAVEAT =
  "Nu am putut citi perioada acoperită de date; primul și ultimul an pot fi acoperiți doar parțial.";

/**
 * The FROM target per dataset. For "all", a UNION ALL subquery with aligned
 * column names (both marts share them by design); `src` tags the channel,
 * `da_code` doubles as the generic reference code (contract_no on the
 * contracts branch), `ref_id` as the source row id. Postgres pushes WHERE
 * quals into both branches, so the union costs what its filtered branches cost.
 */
function txFragment(sql: DbSql, dataset: "all" | "da" | "contracts") {
  if (dataset === "contracts") return sql`marts.contract_transactions`;
  if (dataset === "da") return sql`marts.da_transactions`;
  return sql`(
    select authority_id, authority_name, supplier_id, supplier_name, county,
           cpv_code, cpv_name, closing_value, finalization_date,
           da_code, sicap_da_id as ref_id, null::bigint as ca_notice_id,
           null::text as ted_pubnum, null::boolean as is_single_bidder,
           'da'::text as src, estimated_value_ron, value_suspect
    from marts.da_transactions
    union all
    select authority_id, authority_name, supplier_id, supplier_name, county,
           cpv_code, cpv_name, closing_value, finalization_date,
           contract_no, contract_id, ca_notice_id,
           ted_pubnum, is_single_bidder,
           'contracts'::text, null::numeric, false
    from marts.contract_transactions
  )`;
}


/**
 * Slim union for AGGREGATE blocks. Postgres does not prune unreferenced
 * union-branch columns through the appendrel, so the wide fragment drags
 * ref/notice/ted columns into every aggregate and blocks index-only scans
 * (measured: 3.3s wide vs 0.22s slim on county aggregates). Aggregates never
 * display row-level fields, so they only get what filters and grouping can
 * touch; `withNames` adds the display-name columns needed when the block
 * groups by entity or a kind filter matches on authority_name.
 */
function txAggFragment(sql: DbSql, dataset: "all" | "da" | "contracts", withNames: boolean) {
  if (dataset === "contracts") return sql`marts.contract_transactions`;
  if (dataset === "da") return sql`marts.da_transactions`;
  if (withNames)
    return sql`(
    select authority_id, authority_name, supplier_id, supplier_name, county,
           cpv_code, closing_value, finalization_date,
           null::boolean as is_single_bidder, 'da'::text as src
    from marts.da_transactions
    union all
    select authority_id, authority_name, supplier_id, supplier_name, county,
           cpv_code, closing_value, finalization_date, is_single_bidder, 'contracts'::text
    from marts.contract_transactions
  )`;
  return sql`(
    select authority_id, supplier_id, county, cpv_code, closing_value,
           finalization_date, null::boolean as is_single_bidder, 'da'::text as src
    from marts.da_transactions
    union all
    select authority_id, supplier_id, county, cpv_code, closing_value,
           finalization_date, is_single_bidder, 'contracts'::text
    from marts.contract_transactions
  )`;
}

/** Look up CPV names for a set of tree-node codes (2- or 4-digit stems). */
async function cpvNamesFor(
  sql: DbSql,
  stems: string[],
): Promise<Map<string, string | null>> {
  if (stems.length === 0) return new Map();
  const padded = stems.map((s) => s.padEnd(8, "0"));
  const rows = (await sql`
    select distinct on (substr(c.code, 1, 8)) substr(c.code, 1, 8) stem8, c.name_ro
    from core.cpv_codes c
    where substr(c.code, 1, 8) = any(${sql.array(padded)}::text[])
    order by substr(c.code, 1, 8), length(c.code)
  `) as unknown as { stem8: string; name_ro: string | null }[];
  const map = new Map<string, string | null>();
  for (const r of rows) {
    const stem = stems.find((s) => s.padEnd(8, "0") === r.stem8);
    if (stem) map.set(stem, r.name_ro);
  }
  return map;
}

/** Paged clasament (table block WITHOUT an explicit topN): 10 rows/page. */
export const TABLE_PAGE_SIZE = 10;
export const TABLE_SORTS = ["name", "county", "value", "count", "percap"] as const;
export type TableSort = (typeof TABLE_SORTS)[number];
export interface TableOpts {
  page?: number;
  sort?: TableSort;
  dir?: "asc" | "desc";
}

/**
 * What a block groups by, for planRollup (rollups.ts); null for the blocks the
 * rollups do not serve (profiles, relationships, compare, scatter).
 */
function rollupNeed(spec: AskSpec): RollupNeed | null {
  switch (spec.block) {
    case "stat": case "timeseries": case "map": return { by: "total" };
    case "breakdown": return { by: "cpv" };
    case "table": case "trend": return spec.dim === "county" ? { by: "county" } : { by: spec.dim === "supplier" ? "supplier" : "authority" };
    default: return null;
  }
}

/**
 * The rollup plan of a selection, or null for its live query: the rollups are
 * read only once the nightly build has created them (rollupsReady, with the
 * pool, before the caller's transaction) and only for what planRollup can
 * answer exactly.
 */
async function rollupPlanFor(sql: DbSql, spec: AskSpec, ctx: PredicateCtx): Promise<{ source: RollupSource; filters: RollupFilters } | null> {
  const need = rollupNeed(spec);
  if (!need || spec.measure === "value_per_capita" || !(await rollupsReady(sql))) return null;
  const plan = planRollup(ctx, need);
  return "source" in plan ? plan : null;
}

export async function runSpec(
  sql: DbSql,
  spec: AskSpec,
  grounding: Grounding,
  tableOpts: TableOpts = {},
  /** Server-only: names of the ids a population lists, where the caller knows them (an entity capture). */
  labels: Pick<ConditionLabels, "entities"> = {},
): Promise<EngineResult | { error: string; caveats: string[] }> {
  // Read first, write later (plan F0a): a key this release parses but does not
  // apply is refused before any query, on every path that runs a spec.
  if (unimplementedSpecKeys(spec).length) return { error: NEWER_VERSION_LINK, caveats: [] };
  ({spec,grounding}=await canonicalAskIdentities(sql,spec,grounding));
  // Value superlatives share the transaction ranking, including both streams,
  // its filters, allocation rules and deterministic tie break. CRI stays historical.
  if (spec.block === "entity_card" && spec.rankBy === "value") {
    const ranked = await runSpec(sql, { ...retarget(spec, "table"), measure: "value", topN: 1 }, grounding);
    if ("error" in ranked) return ranked;
    const winner = ranked.data.block === "table" ? ranked.data.rows[0] : undefined;
    if (!winner?.entityId) return { error: "Niciun rezultat pentru aceste filtre.", caveats: ranked.caveats };
    return { ...ranked, data: { block: "entity_card", card: {
      ...winner, entityId: winner.entityId, role: spec.dim === "supplier" ? "supplier" : "authority",
      cri: null, nFlags: 0, flags: [],
    } } };
  }
  const caveats: string[] = [];
  const started = Date.now();

  // --- data stream. "all" = DA ∪ contracts (DISJOINT channels — a direct
  // acquisition is never also a contract, so the union is an honest sum). TED
  // is never unioned: it overlaps contracts and would double-count.
  const unsupported = unsupportedPopulationView(spec);
  if (unsupported) return { error: unsupported, caveats: [] };
  const dataset = spec.dataset ?? "all";
  const txt = txFragment(sql, dataset);
  const codeCol = dataset === "contracts" ? sql`d.contract_no` : sql`d.da_code`;
  if (dataset === "contracts") {
    caveats.push(
      "Sursă: DOAR contracte atribuite prin proceduri. Valoarea consorțiilor e împărțită egal între câștigători. " +
        "Plafoanele acordurilor-cadru și publicațiile cu identitate incertă sunt excluse din totaluri. Lipsa comenzilor identificate înseamnă acoperire incompletă.",
      CONTRACT_CAP_CAVEAT,
    );
  } else if (dataset === "da") {
    caveats.push("Sursă: DOAR achiziții directe.");
  } else {
    caveats.push(
      "Sursă: achiziții directe + contracte din proceduri, fără dubluri. TED nu se adună.",
      CONTRACT_CAP_CAVEAT,
    );
  }
  if (spec.filters.singleBidder) {
    caveats.push(
      "„Un singur ofertant”: numărul de ofertanți e cunoscut doar pentru contractele regăsite și în TED (confirmate). Contractele fără date de competiție NU apar aici — necunoscut nu înseamnă competitiv.",
    );
  }

  // --- resolve grounded anchors, failing loudly when grounding came up empty
  const cpvPrefixes = grounding.cpv?.prefixes ?? [];
  if (spec.filters.cpvTerm && cpvPrefixes.length === 0) {
    const retired = grounding.cpv?.retired;
    return {
      error: retired
        ? `${retired.message} ${retiredChoicesText(retired)}`
        : `Nu am găsit nicio categorie CPV pentru „${spec.filters.cpvTerm}”. Încearcă alt cuvânt (ex: „lemn de foc”, „medicamente”, „asfaltare”).`,
      caveats,
    };
  }
  // Curated notes about what a subject includes ("iluminat" includes traffic signalling).
  for (const note of grounding.cpv?.notes ?? []) caveats.push(`Despre „${grounding.cpv!.term}”: ${note}`);
  const cpvExclude = grounding.cpv?.excludePrefixes ?? [];
  if (cpvExclude.length)
    caveats.push(`Din „${grounding.cpv!.term}” nu sunt numărate: ${(grounding.cpv!.excludedNames?.length ? grounding.cpv!.excludedNames : cpvExclude).join("; ")}.`);
  if (grounding.cpv && grounding.cpv.method === "fuzzy") {
    caveats.push(
      `Am interpretat „${grounding.cpv.term}” prin potrivire aproximativă pe catalogul CPV: ${grounding.cpv.matchedNames.join("; ")}. Verifică dacă e ce ai vrut.`,
    );
  }

  // The anchors themselves are read by predicateContext below; here each one is checked and disclosed.
  if (spec.filters.authorityName || spec.filters.authorityId) {
    if (!grounding.authority?.entityId) {
      return {
        error: `Nu am găsit autoritatea „${spec.filters.authorityName ?? spec.filters.authorityId}”. Încearcă numele oficial (ex: „Comuna X”, „Municipiul Y”).`,
        caveats,
      };
    }
    if (grounding.authority.alternatives.length > 0) {
      caveats.push(
        `Am ales „${grounding.authority.nameDisplay}”. Alte potriviri: ${grounding.authority.alternatives.join("; ")}.`,
      );
    }
  }
  if (spec.filters.supplierName || spec.filters.supplierId) {
    if (!grounding.supplier?.entityId) {
      return {
        error: `Nu am găsit firma „${spec.filters.supplierName ?? spec.filters.supplierId}”.`,
        caveats,
      };
    }
    if (grounding.supplier.alternatives.length > 0) {
      caveats.push(
        `Am ales „${grounding.supplier.nameDisplay}”. Alte potriviri: ${grounding.supplier.alternatives.join("; ")}.`,
      );
    }
  }
  if (spec.block === "compare") {
    if (!grounding.compare?.entityId) {
      return {
        error: `Nu am găsit a doua entitate din comparație („${spec.filters.compareWith}”).`,
        caveats,
      };
    }
    if (grounding.compare.alternatives.length > 0) {
      caveats.push(
        `Pentru a doua entitate am ales „${grounding.compare.nameDisplay}”. Alte potriviri: ${grounding.compare.alternatives.join("; ")}.`,
      );
    }
  }
  if (spec.filters.county) {
    if (!grounding.county?.canonical) {
      return { error: `Nu recunosc județul „${spec.filters.county}”.`, caveats };
    }
    // Audit F13: a county comes from the source address or NUTS-3 code, the ONRC
    // registered office of a supplier, or a strict UAT link (normalize step).
    // One caveat for every dimension: whose county it is, where it comes from, who is left out.
    caveats.push(countyCaveat(spec, spec.filters.authorityName || spec.filters.authorityId ? "authority" : "supplier"));
  }
  if (spec.filters.uatSiruta) {
    const uat = grounding.uat;
    const uatLabel = spec.filters.uatName ?? uat?.name ?? `UAT ${spec.filters.uatSiruta}`;
    if (!uat || !uat.authorityIds?.length) {
      return { error: uatUnmappedError(uatLabel), caveats };
    }
    caveats.push(uatScopeCaveat(uatLabel, uat.authorityIds.length, uat.siruta));
  }

  // --- year clamping against actual coverage (union of both streams on "all")
  const covered =
    dataset === "contracts"
      ? await daCoverageYears(sql, "award")
      : dataset === "da"
        ? await daCoverageYears(sql, "da")
        : [
            ...new Set([...(await daCoverageYears(sql, "da")), ...(await daCoverageYears(sql, "award"))]),
          ].sort((a, b) => a - b);
  const minY = covered[0] ?? 2018;
  const maxY = covered[covered.length - 1] ?? 2026;
  let yearFrom = spec.filters.yearFrom ?? null;
  let yearTo = spec.filters.yearTo ?? null;
  if (yearFrom !== null || yearTo !== null) {
    const reqFrom = yearFrom ?? minY;
    const reqTo = yearTo ?? maxY;
    if (reqTo < minY || reqFrom > maxY) {
      return { error:`Perioada cerută (${reqFrom}–${reqTo}) este în afara datelor disponibile (${minY}–${maxY}). Alege altă perioadă; selecția nu a fost extinsă.`, caveats };
    } else {
      const cf = Math.max(reqFrom, minY);
      const ct = Math.min(reqTo, maxY);
      if (cf !== reqFrom || ct !== reqTo) {
        caveats.push(`Am restrâns perioada la acoperirea reală a datelor: ${cf}–${ct}.`);
      }
      yearFrom = cf;
      yearTo = ct;
    }
  }

  // Plafond is a DA-specific plausibility bound (legal DA ceiling ≈ 2M works /
  // far less for goods). Contracts are legitimately huge; their bound (1 mld)
  // was applied at mart build time and is disclosed by CONTRACT_CAP_CAVEAT
  // above. On "all" it binds only the DA branch (plafondFor).
  if (plafondFor(dataset) !== "none") {
    caveats.push(DA_PLAFOND_CAVEAT, DA_ACCEPTED_CAVEAT);
  }

  // Every condition of the question, written by lib/ask/predicates.ts for the
  // answer, its sources, the CSV, the captures and the displayed SQL alike.
  // The kind of institution is a list of ids, read once per marts build (authority-kind.ts, D1).
  const kindIds = await authorityKindIds(sql, namedKind(spec.filters.authorityKind));
  const w: PredicateCtx = predicateContext(sql, spec, grounding, { dataset, yearFrom, yearTo, kindIds });
  const { authorityId, supplierId } = w;
  const compareId = w.comparison?.compareId ?? null;
  if (w.minEmployees !== null || w.maxEmployees !== null) {
    caveats.push(
      "Filtrul pe angajați folosește ultimul bilanț depus la Ministerul Finanțelor. " +
        "Furnizorii fără bilanț (PFA-uri, firme străine, firme radiate) sunt excluși din rezultat.",
    );
  }
  if (spec.filters.adminPersonKey || spec.filters.adminName) {
    if (!grounding.admin?.personKey) {
      return {
        error: grounding.admin?.unidentified
          ? `Registrul Comerțului nu are pentru „${spec.filters.adminName ?? "persoana selectată"}” o dată de naștere care să o identifice (lipsește, este de completare sau este neplauzibilă). Firmele nu pot fi grupate fără riscul de a amesteca persoane cu același nume.`
          : `Nu am găsit niciun administrator „${spec.filters.adminName ?? "?"}” în Registrul Comerțului.`,
        caveats,
      };
    }
    if (grounding.admin.supplierIds.length === 0) {
      return {
        error: `${grounding.admin.display ?? "Persoana"} reprezintă ${grounding.admin.nFirms} firme, dar niciuna nu apare ca furnizor în datele noastre.`,
        caveats,
      };
    }
    caveats.push(
      "Filtrul «conduse de» folosește reprezentanții legali din Registrul Comerțului (instantaneu lunar): " +
        "administratorul de AZI, nu neapărat cel de la momentul achiziției; administratorii nu sunt neapărat asociații/proprietarii.",
    );
    if (grounding.admin.nFirms > grounding.admin.supplierIds.length) {
      const n = grounding.admin.supplierIds.length;
      caveats.push(
        `${grounding.admin.display ?? "Persoana"} reprezintă ${grounding.admin.nFirms} firme la Registrul Comerțului; ` +
          (n === 1
            ? "doar una apare cu bani publici în datele noastre — restul nu au achiziții publice."
            : `doar ${n} apar cu bani publici în datele noastre — restul nu au achiziții publice.`),
      );
    }
    if (grounding.admin.alternatives.length > 0) {
      caveats.push(
        `Am ales „${grounding.admin.display}”. Alte persoane cu nume asemănător: ${grounding.admin.alternatives.join("; ")}.`,
      );
    }
  }

  // The focal entity for entity-centric blocks (sankey/network/distribution).
  const focalRole: "authority" | "supplier" = authorityId ? "authority" : "supplier";
  const focalId = authorityId ?? supplierId;
  const focalName =
    (authorityId ? grounding.authority?.nameDisplay : grounding.supplier?.nameDisplay) ?? "?";

  // --- WHERE fragment over the transaction mart (da_/contract_, all parameterized):
  // the record conditions, then the record threshold counted over the same rows.
  const whereFrag = (opts?: { years?: boolean }): ReturnType<DbSql> => {
    const base = andAll(sql, rowPredicates(w, opts));
    return andAll(sql, [base, ...groupPredicates(w, txAggFragment(sql, dataset, false) as unknown as ReturnType<DbSql>, base)]);
  };

  // aggregate fragments (see txAggFragment): slim (the kind is a list of
  // authority ids, D1); the named variant serves entity-grouped blocks
  const txtAggNames = txAggFragment(sql, dataset, true);
  const txtAgg = txAggFragment(sql, dataset, false);
  // The homepage states the DA bound explicitly in its population: reuse the
  // matching mart only for this exact predicate, never discard a more specific
  // selection.
  const populationGroup = spec.population?.groups[0];
  const populationCondition = populationGroup?.conditions[0];
  const nationalDaBound = spec.block === "stat" && dataset === "da"
    && spec.population?.operator === "and" && spec.population.groups.length === 1
    && populationGroup?.operator === "and" && populationGroup.conditions.length === 1
    && populationCondition?.field === "value" && populationCondition.op === "lte"
    && populationCondition.value === String(DA_PLAFOND_RON);
  // Bare national query, or the exact DA bound represented in the mart:
  // serve the precomputed agg_* marts — same union, same plafond semantics,
  // rebuilt with the other marts. Live scans over 20M rows cost 12-17s here.
  const unfiltered =
    !w.county && w.cpvPrefixes.length === 0 && !w.kind &&
    !w.authorityId && !w.supplierId && w.uatSiruta === null &&
    !w.singleBidder && w.adminSupplierIds === null &&
    w.minEmployees === null && w.maxEmployees === null &&
    w.yearFrom === null && w.yearTo === null &&
    w.monthFrom === null && w.monthTo === null && (!spec.population || nationalDaBound) && !spec.minimumRecords;
  // The other rollups combine both streams; agg_national retains src and can
  // also serve filter-free DA-only and contract-only totals without a scan.
  const bare = dataset === "all" && unfiltered;
  const aggV = w.plafond === "none" && !nationalDaBound ? sql`v_all` : sql`v_plaf`;
  const aggN = w.plafond === "none" && !nationalDaBound ? sql`n_all` : sql`n_plaf`;

  // --- WHERE fragment over marts.entity_flags (risk-centric blocks)
  const efWhere = (role: "authority" | "supplier", minDas: number) => andAll(sql, profilePredicates(w, role, minDas));

  const displaySql = buildDisplaySql(spec, w);
  // The precise selection (or the page it comes from) and the record threshold, in the words of describeConditions.
  caveats.push(...describeConditions(spec, { grounding, entities: labels.entities }).caveats);

  // The county caveat above already says the filter is the buyer's county, not
  // the firm's; the firm's own county column is explained next to its header.
  // Strict RPL 2021 denominators, never the legacy entity_profile population.
  // Only the ranking divides by population; elsewhere a per-inhabitant link answers in lei (pills.ts) and says nothing of it.
  const perCapita: PerCapitaPopulations | null =
    spec.measure === "value_per_capita" && spec.block === "table" ? await readPerCapitaPopulations(sql) : null;
  if (perCapita) caveats.push(perCapitaCaveat(perCapita));
  if (isHistoricalProfile(spec)) {
    // These blocks use entity_flags, whose historical source population is
    // intentionally different from the accepted-only transaction mart.
    for (let i = caveats.length - 1; i >= 0; i--) {
      if (/^(Sursă:|Valorile peste)/.test(caveats[i]!) || caveats[i] === CONTRACT_CAP_CAVEAT || caveats[i] === DA_ACCEPTED_CAVEAT) caveats.splice(i, 1);
    }
    caveats.push(
      "Sursă: profiluri istorice de achiziții directe acceptate, cu valori pozitive de cel mult 2 milioane lei. Totalurile sunt valori înregistrate, nu plăți. Lista surselor folosește aceeași selecție.",
    );
    caveats.push(
      "Indicele de risc este un semnal statistic, nu o dovadă de neregulă. Semnalele au explicații legitime posibile — verifică întotdeauna detaliile.",
    );
  }
  if (isHistoricalProfile(spec) && (w.cpvPrefixes.length > 0 || w.yearFrom !== null)) {
    caveats.push(
      "Indicele de risc și semnalele sunt calculate pe TOATĂ activitatea entității — filtrele de subiect/perioadă nu li se aplică.",
    );
  }

  // The nightly rollups answer the selections that otherwise group the transaction marts.
  const rollup = isHistoricalProfile(spec) ? null : await rollupPlanFor(sql, spec, w);
  const columns = spec.block === "scatter" ? await martColumns(sql) : null;

  // --- execute under guardrails
  const exec = async (): Promise<BlockData | { error: string }> => {
    return await sql.begin("read only", async (tx) => {
      await tx.unsafe(FORCE_CUSTOM_PLANS);
      await tx.unsafe(`set local statement_timeout = '${STATEMENT_TIMEOUT}'`);
      const s = tx as unknown as DbSql;

      switch (spec.block) {
        case "stat": {
          if (unfiltered) {
            const r = (await s`
              select src, ${aggV} v, ${aggN} n from marts.agg_national
              where ${dataset === "all" ? s`true` : s`src = ${dataset}`}
            `) as unknown as { src: "da" | "contracts"; v: string; n: string }[];
            const byStream = r.map((x) => ({ src: x.src, value: Number(x.v), count: Number(x.n) }));
            return {
              block: "stat",
              stat: {
                value: byStream.reduce((a, b) => a + b.value, 0),
                count: byStream.reduce((a, b) => a + b.count, 0),
                ...(dataset === "all" ? { byStream } : {}),
              },
            };
          }
          if (dataset === "all") {
            const r = rollup ? (await rollupStat(s, rollup)).rows as { src: "da" | "contracts"; v: string; n: string }[] : (await s`
              select d.src, coalesce(sum(d.closing_value), 0) v, count(*) n
              from ${txtAgg} d
              where ${whereFrag()}
              group by d.src
            `) as unknown as { src: "da" | "contracts"; v: string; n: string }[];
            const byStream = r.map((x) => ({
              src: x.src,
              value: Number(x.v),
              count: Number(x.n),
            }));
            return {
              block: "stat",
              stat: {
                value: byStream.reduce((a, b) => a + b.value, 0),
                count: byStream.reduce((a, b) => a + b.count, 0),
                byStream,
              },
            };
          }
          const r = rollup ? (await rollupStat(s, rollup)).rows : (await s`
            select coalesce(sum(d.closing_value), 0) v, count(*) n
            from ${txtAgg} d
            where ${whereFrag()}
          `) as unknown as { v: string; n: string }[];
          return {
            block: "stat",
            stat: { value: Number(r[0]?.v ?? 0), count: Number(r[0]?.n ?? 0) },
          };
        }

        case "timeseries": {
          if (bare) {
            const r = (await s`
              select y, ${aggV} v, ${aggN} n from marts.agg_years order by y limit 60
            `) as unknown as { y: string; v: string; n: string }[];
            return {
              block: "timeseries",
              series: r
                .filter((p) => /^\d{4}$/.test(p.y))
                .map((p) => ({ year: Number(p.y), value: Number(p.v), count: Number(p.n) })),
            };
          }
          const r = rollup ? (await rollupTimeseries(s, rollup)).rows : (await s`
            select substr(d.finalization_date, 1, 4) y,
                   coalesce(sum(d.closing_value), 0) v, count(*) n
            from ${txtAgg} d
            where ${whereFrag()}
            group by 1 order by 1
            limit 60
          `) as unknown as { y: string | null; v: string; n: string }[];
          return {
            block: "timeseries",
            series: r
              .filter((p) => /^\d{4}$/.test(p.y ?? ""))
              .map((p) => ({ year: Number(p.y), value: Number(p.v), count: Number(p.n) })),
          };
        }

        case "map": {
          if (bare) {
            const r = (await s`
              select county c, ${aggV} v, ${aggN} n from marts.agg_map_county order by 2 desc limit 200
            `) as unknown as { c: string; v: string; n: string }[];
            // Same population as the national total, minus what the map places.
            const [rest] = (await s`
              select (select coalesce(sum(${aggV}), 0) from marts.agg_national)
                     - (select coalesce(sum(${aggV}), 0) from marts.agg_map_county) v,
                     (select coalesce(sum(${aggN}), 0) from marts.agg_national)
                     - (select coalesce(sum(${aggN}), 0) from marts.agg_map_county) n
            `) as unknown as { v: string; n: string }[];
            return {
              block: "map",
              counties: r.map((p) => ({ county: p.c, value: Number(p.v), count: Number(p.n) })),
              unknown: { value: Number(rest?.v ?? 0), count: Number(rest?.n ?? 0) },
            };
          }
          const r = rollup ? (await rollupMap(s, rollup)).rows : (await s`
            select nullif(d.county, '') c, coalesce(sum(d.closing_value), 0) v, count(*) n
            from ${txtAgg} d
            where ${whereFrag()}
            group by 1 order by v desc
            limit 200
          `) as unknown as { c: string | null; v: string; n: string }[];
          const unknown = r.find((p) => p.c == null);
          return {
            block: "map",
            counties: r
              .filter((p): p is { c: string; v: string; n: string } => p.c != null)
              .map((p) => ({ county: p.c, value: Number(p.v), count: Number(p.n) })),
            unknown: { value: Number(unknown?.v ?? 0), count: Number(unknown?.n ?? 0) },
          };
        }

        case "table": {
          // No explicit topN → paged mode: full ranking, 25/page, sortable.
          const paged = spec.topN == null;
          const topN = spec.topN ?? 10;
          const page = paged ? Math.max(0, Math.floor(tableOpts.page ?? 0)) : 0;
          const limitFrag = paged
            ? s`limit ${TABLE_PAGE_SIZE} offset ${page * TABLE_PAGE_SIZE}`
            : s`limit ${topN}`;
          const dir = tableOpts.dir === "asc" ? s`asc nulls first` : s`desc nulls last`;
          const dim = spec.dim ?? "authority";
          // The paged total is the number of ranked groups, `count(*) over ()`
          // on the grouped rows before LIMIT/OFFSET in the ranking statement
          // itself. A separate count(distinct) read the whole selection again:
          // 5–8 s on the national supplier ranking. Only a page past the end
          // has no row to carry it; that page counts on its own.
          const pagedMeta = async (r: { te: string }[], count: () => Promise<{ t: string }[]>) =>
            paged
              ? { total: r[0] ? Number(r[0].te) : page > 0 ? Number((await count())[0]?.t ?? 0) : 0, page, pageSize: TABLE_PAGE_SIZE }
              : {};
          if (bare && !paged && spec.measure !== "value_per_capita") {
            const ord =
              spec.measure === "count" ? s`${aggN} desc, eid` : s`${aggV} desc, eid`;
            const r = (await s`
              select eid id, nm, county co, ${aggV} v, ${aggN} n
              from marts.agg_top_entities
              where role = ${dim}
              order by ${ord}
              limit ${topN}
            `) as unknown as { id: string; nm: string; co: string | null; v: string; n: string }[];
            return {
              block: "table",
              rows: r.map((p) => ({
                entityId: String(p.id),
                name: p.nm,
                county: p.co,
                value: Number(p.v),
                count: Number(p.n),
                population: null,
              })),
            };
          }
          const rollupOpts = {
            measure: spec.measure === "count" ? "count" as const : "value" as const, paged, topN, page, pageSize: TABLE_PAGE_SIZE,
            ...(tableOpts.sort ? { sort: tableOpts.sort } : {}), ...(tableOpts.dir ? { dir: tableOpts.dir } : {}),
          };
          if (dim === "county" && rollup) {
            const r = await rollupCountyTable(s, rollup, rollupOpts);
            return {
              block: "table",
              rows: r.rows.map((p) => ({ entityId: null, name: p.c, county: null, value: Number(p.v), count: Number(p.n), population: null })),
              ...(paged ? { total: r.total ?? 0, page, pageSize: TABLE_PAGE_SIZE } : {}),
            };
          }
          if (dim === "county") {
            const sortFrag = {
              name: s`c`,
              county: s`c`,
              value: s`v`,
              count: s`n`,
              percap: s`v`,
            }[tableOpts.sort ?? (spec.measure === "count" ? "count" : "value")];
            const count = () => s`
              select count(distinct d.county) t from ${txtAgg} d
              where ${whereFrag()} and d.county is not null
            ` as unknown as Promise<{ t: string }[]>;
            const r = (await s`
              select d.county c, coalesce(sum(d.closing_value), 0) v, count(*) n, count(*) over () te
              from ${txtAgg} d
              where ${whereFrag()} and d.county is not null
              group by 1
              order by ${sortFrag} ${tableOpts.sort ? dir : s`desc`}, c
              ${limitFrag}
            `) as unknown as { c: string; v: string; n: string; te: string }[];
            return {
              block: "table",
              rows: r.map((p) => ({
                entityId: null,
                name: p.c,
                county: null,
                value: Number(p.v),
                count: Number(p.n),
                population: null,
              })),
              ...(await pagedMeta(r, count)),
            };
          }
          const idCol = dim === "authority" ? s`d.authority_id` : s`d.supplier_id`;
          const nameCol = dim === "authority" ? s`d.authority_name` : s`d.supplier_name`;
          if (spec.measure === "value_per_capita") {
            const sortFrag = {
              name: s`max(d.authority_name)`,
              county: s`max(d.county)`,
              value: s`coalesce(sum(d.closing_value), 0)`,
              count: s`count(*)`,
              percap: s`coalesce(sum(d.closing_value), 0) / max(rpl.population)`,
            }[tableOpts.sort ?? "percap"];
            const populations = s`unnest(${s.array(perCapita!.ids)}::bigint[], ${s.array(perCapita!.populations)}::integer[]) rpl(entity_id, population)`;
            // Repeating the id list as a predicate lets it reach the authority indexes of both streams.
            const eligible = perCapitaPredicate(s, perCapita!.ids);
            const count = () => s`
              select count(distinct d.authority_id) t
              from ${txtAggNames} d
              join ${populations} on rpl.entity_id = d.authority_id
              where ${whereFrag()} and ${eligible}
            ` as unknown as Promise<{ t: string }[]>;
            const r = (await s`
              select d.authority_id id, max(d.authority_name) nm, max(d.county) co,
                     coalesce(sum(d.closing_value), 0) v, count(*) n, max(rpl.population) pop,
                     count(*) over () te
              from ${txtAggNames} d
              join ${populations} on rpl.entity_id = d.authority_id
              where ${whereFrag()} and ${eligible}
              group by d.authority_id
              order by ${sortFrag} ${tableOpts.sort ? dir : s`desc`}, d.authority_id
              ${limitFrag}
            `) as unknown as { id: string; nm: string; co: string | null; v: string; n: string; pop: string; te: string }[];
            return {
              block: "table",
              rows: r.map((p) => ({
                entityId: String(p.id),
                name: p.nm,
                county: p.co,
                value: Number(p.v),
                count: Number(p.n),
                population: Number(p.pop),
              })),
              ...(await pagedMeta(r, count)),
            };
          }
          const rolled = rollup ? await rollupTable(s, rollup, { ...rollupOpts, dim }) : null;
          if (rolled && "rows" in rolled) {
            const first = rolled.rows[0];
            return {
              block: "table",
              rows: rolled.rows.map((p) => ({ entityId: String(p.id), name: p.nm, county: p.co, value: Number(p.v), count: Number(p.n), population: null })),
              ...(paged ? { total: rolled.total ?? 0, page, pageSize: TABLE_PAGE_SIZE } : {}),
              ...(first?.tv !== undefined ? { totals: { value: Number(first.tv), count: Number(first.tn), entities: Number(first.te) } } : {}),
            };
          }
          const sortKey = tableOpts.sort ?? (spec.measure === "count" ? "count" : "value");
          const count = () => s`
            select count(distinct ${idCol}) t from ${txtAgg} d
            where ${whereFrag()} and ${idCol} is not null
          ` as unknown as Promise<{ t: string }[]>;
          if (sortKey === "value" || sortKey === "count" || sortKey === "percap") {
            // Aggregate WITHOUT names (index-only over the slim union — names
            // would force a heap fetch per row, a full seq scan on big
            // counties), then attach display names for just the winners.
            const aggSort = sortKey === "count" ? s`n` : s`v`;
            // Window totals are evaluated after grouping and before the limit:
            // the whole ranking's value, records and entities, at no extra scan,
            // so the answer can say "% din total" and "Alte N firme".
            const r = (await s`
              with topg as (
                select ${idCol} id, coalesce(sum(d.closing_value), 0) v, count(*) n,
                       sum(coalesce(sum(d.closing_value), 0)) over () tv,
                       sum(count(*)) over () tn,
                       count(*) over () te
                from ${txtAgg} d
                where ${whereFrag()} and ${idCol} is not null
                group by ${idCol}
                order by ${aggSort} ${tableOpts.sort ? dir : s`desc`}, ${idCol}
                ${limitFrag}
              )
              select t.id, coalesce(max(ep.name_display), '(fără nume)') nm,
                     max(ep.county) co, t.v, t.n, t.tv, t.tn, t.te
              from topg t
              left join marts.entity_profile ep on ep.entity_id = t.id and ep.role = ${dim}
              group by t.id, t.v, t.n, t.tv, t.tn, t.te
              order by ${sortKey === "count" ? s`t.n` : s`t.v`} ${tableOpts.sort ? dir : s`desc`}, t.id
            `) as unknown as { id: string; nm: string; co: string | null; v: string; n: string; tv: string; tn: string; te: string }[];
            const first = r[0];
            return {
              block: "table",
              rows: r.map((p) => ({
                entityId: String(p.id),
                name: p.nm,
                county: p.co,
                value: Number(p.v),
                count: Number(p.n),
                population: null,
              })),
              ...(await pagedMeta(r, count)),
              ...(first ? { totals: { value: Number(first.tv), count: Number(first.tn), entities: Number(first.te) } } : {}),
            };
          }
          // The entity's own county, as on the value/count path above: a
          // transaction's county is the buyer's, so max() over a supplier's
          // rows would be an arbitrary buyer county (audit F16). Joined after
          // aggregation, once per entity.
          const sortFrag = {
            name: s`g.nm`,
            county: s`ep.county`,
            value: s`g.v`,
            count: s`g.n`,
            percap: s`g.v`,
          }[sortKey];
          const r = (await s`
            with g as (
              select ${idCol} id, max(${nameCol}) nm,
                     coalesce(sum(d.closing_value), 0) v, count(*) n, count(*) over () te
              from ${txtAggNames} d
              where ${whereFrag()} and ${idCol} is not null
              group by ${idCol}
            )
            select g.id, g.nm, ep.county co, g.v, g.n, g.te
            from g
            left join marts.entity_profile ep on ep.entity_id = g.id and ep.role = ${dim}
            order by ${sortFrag} ${tableOpts.sort ? dir : s`desc`}, g.id
            ${limitFrag}
          `) as unknown as { id: string; nm: string; co: string | null; v: string; n: string; te: string }[];
          return {
            block: "table",
            rows: r.map((p) => ({
              entityId: String(p.id),
              name: p.nm,
              county: p.co,
              value: Number(p.v),
              count: Number(p.n),
              population: null,
            })),
            ...(await pagedMeta(r, count)),
          };
        }

        case "compare": {
          // One selection for both entities (same filters, values and periods),
          // plus each one's historical risk profile, which covers all its direct
          // acquisitions and ignores the filters. The two are labelled apart.
          const ids = [focalId!, compareId!];
          const party = focalRole === "authority" ? s`d.authority_id` : s`d.supplier_id`;
          const where = whereFrag();
          // Partners, top partners and shared partners group the slim union and
          // name the shown partners from entity_profile after (rollups.ts).
          const partners = { source: txtAgg as unknown as ReturnType<DbSql>, where, focalRole, focalId: focalId!, compareId: compareId! };
          const src = dataset === "all" ? s`d.src` : s`${dataset}::text`;
          // The number of bids is published only for part of the contracts (mostly via TED).
          const singleBid = dataset === "da" ? s`0 single_bid, 0 single_known` : s`count(*) filter (where d.is_single_bidder) single_bid, count(*) filter (where d.is_single_bidder is not null) single_known`;
          const contractRows = dataset === "da" ? null
            : s`(select c.authority_id, c.authority_name, c.supplier_id, c.supplier_name, c.county, c.cpv_code,
                        c.closing_value, c.finalization_date, c.is_single_bidder, 'contracts'::text src, c.contract_id
                 from marts.contract_transactions c)`;
          const [streams, parties, years, domains, top, shared, joint, profiles, risk] = await Promise.all([
            s`select ${party}::text id, ${src} src, sum(d.closing_value)::text value, count(*)::int n, ${singleBid},
                     coalesce(sum(d.closing_value) filter (where d.cpv_code is null), 0)::text no_cpv
              from ${txtAgg} d where ${where} group by 1, 2`,
            compareParties(s, partners),
            s`select ${party}::text id, substr(d.finalization_date, 1, 4)::int y, sum(d.closing_value)::text value
              from ${txtAgg} d where ${where} and d.finalization_date is not null group by 1, 2`,
            s`select id, g, value, groups from (
                select ${party}::text id, substr(d.cpv_code, 1, 5) g, sum(d.closing_value) value,
                       row_number() over (partition by ${party} order by sum(d.closing_value) desc, substr(d.cpv_code, 1, 5)) r,
                       count(*) over (partition by ${party})::int groups
                from ${txtAgg} d where ${where} and d.cpv_code is not null group by ${party}, 2) x
              where r <= ${COMPARE_DOMAINS}`,
            compareTopPartners(s, partners),
            compareSharedPartners(s, partners),
            // Firms only: contracts both won, with the public page key of each.
            focalRole === "supplier" && contractRows
              ? s`select k.ca_notice_contract_id::text nid, max(d.authority_name) authority, min(d.finalization_date) date,
                         sum(d.closing_value)::text value, count(*) over ()::int total
                  from ${contractRows} d join core.contracts k on k.id = d.contract_id
                  where ${where} and k.ca_notice_contract_id is not null
                  group by k.ca_notice_contract_id having count(distinct d.supplier_id) = 2
                  order by sum(d.closing_value) desc limit 5`
              : Promise.resolve([]),
            s`select entity_id::text id, first_activity, last_activity, employees, employees_year, net_turnover::text turnover
              from marts.entity_profile where role = ${focalRole} and entity_id = any(${s.array(ids)}::bigint[])`,
            s`select entity_id::text id, cri, n_flags, flags from marts.entity_flags where role = ${focalRole} and entity_id = any(${s.array(ids)}::bigint[])`,
          ]) as unknown as [
            { id: string; src: string; value: string; n: number; single_bid: string; single_known: string; no_cpv: string }[],
            { id: string; n: number }[],
            { id: string; y: number; value: string }[],
            { id: string; g: string; value: string; groups: number }[],
            { id: string; other_id: string; name: string | null; value: string; n: number }[],
            { other_id: string; name: string | null; value_a: string; n_a: number; value_b: string; n_b: number; total: number }[],
            { nid: string; authority: string | null; date: string | null; value: string; total: number }[],
            { id: string; first_activity: string | null; last_activity: string | null; employees: number | null; employees_year: number | null; turnover: string | null }[],
            { id: string; cri: string | null; n_flags: number; flags: string[] | null }[],
          ];
          const cpvNames = await cpvNamesFor(s, [...new Set(domains.map((d) => d.g))]);
          const populations = focalRole === "authority" ? (await readPerCapitaPopulations(s)).byEntity : null;
          if (populations && ids.some((id) => populations.get(id))) caveats.push(POPULATION_CARD_NOTE);
          const year = (date: string | null) => (date ? Number(date.slice(0, 4)) : null);
          const identities = [{ id:focalId!, name:focalName, county:grounding.authority?.county ?? grounding.supplier?.county ?? null },
            { id:compareId!, name:grounding.compare?.nameDisplay ?? "?", county:grounding.compare?.county ?? null }];
          return {
            block: "compare",
            entities: identities.map((identity) => {
              const mine = streams.filter((r) => r.id === identity.id);
              const stream = (name: string) => {
                const r = mine.find((m) => m.src === name);
                return { value: Number(r?.value ?? 0), count: r?.n ?? 0 };
              };
              const contracts = mine.find((m) => m.src === "contracts");
              const profile = profiles.find((p) => p.id === identity.id);
              const flags = risk.find((r) => r.id === identity.id);
              return {
                entityId: identity.id, name: identity.name, county: identity.county, role: focalRole,
                // Exact decimal sum of the streams, so the total equals one SQL sum.
                value: Number(sumDecimalStrings(mine.map((r) => r.value))),
                count: mine.reduce((sum, r) => sum + r.n, 0),
                cri: flags?.cri == null ? null : Number(flags.cri),
                nFlags: flags?.n_flags ?? 0,
                flags: flags?.flags ?? [],
                population: populations?.get(identity.id) ?? null,
                hasProfile: Boolean(flags),
                streams: { da: stream("da"), contracts: { ...stream("contracts"), singleBid: contracts ? Number(contracts.single_bid) : null, bidsKnown: contracts ? Number(contracts.single_known) : 0 } },
                partners: parties.find((p) => p.id === identity.id)?.n ?? 0,
                topPartners: top.filter((t) => t.id === identity.id).map((t) => ({ entityId: t.other_id, name: t.name ?? "?", value: Number(t.value), count: t.n })),
                years: years.filter((y) => y.id === identity.id).map((y) => ({ year: y.y, value: Number(y.value) })).sort((a, b) => a.year - b.year),
                domains: domains.filter((d) => d.id === identity.id).sort((a, b) => Number(b.value) - Number(a.value))
                  .map((d) => ({ code: d.g, name: cpvNames.get(d.g) ?? null, value: Number(d.value) })),
                domainCount: domains.find((d) => d.id === identity.id)?.groups ?? 0,
                noCpvValue: Number(sumDecimalStrings(mine.map((r) => r.no_cpv))),
                active: profile ? { from: year(profile.first_activity), to: year(profile.last_activity) } : null,
                firm: focalRole === "supplier" && profile && (profile.employees !== null || profile.turnover !== null)
                  ? { employees: profile.employees, year: profile.employees_year, turnover: profile.turnover === null ? null : Number(profile.turnover) }
                  : null,
              };
            }),
            shared: {
              total: shared[0]?.total ?? 0,
              rows: shared.map((r) => ({ entityId: r.other_id, name: r.name ?? "?", a: { value: Number(r.value_a), count: r.n_a }, b: { value: Number(r.value_b), count: r.n_b } })),
            },
            ...(joint.length ? { joint: { total: joint[0]!.total, rows: joint.map((j) => ({ nid: j.nid, authority: j.authority, date: j.date, value: Number(j.value) })) } } : {}),
          };
        }

        case "distribution": {
          const buckets = (await s`
            select width_bucket(coalesce(ef.cri, 0), 0, 1.0000001, 10) b, count(*) n
            from marts.entity_flags ef
            where ${efWhere(focalRole, RISK_MIN_DAS)}
            group by 1 order by 1
          `) as unknown as { b: number; n: string }[];
          const focal = (await s`
            select ef.entity_id, ef.name_display, ef.cri
            from marts.entity_flags ef
            where ef.role = ${focalRole} and ef.entity_id = ${focalId}
          `) as unknown as { entity_id: string; name_display: string | null; cri: string | null }[];
          if (focal.length === 0) {
            return {
              error: `„${focalName}” nu are profil de risc (prea puține achiziții directe).`,
            };
          }
          const cri = focal[0]!.cri === null ? null : Number(focal[0]!.cri);
          let percentile: number | null = null;
          if (cri !== null) {
            const pct = (await s`
              select count(*) filter (where coalesce(ef.cri, 0) <= ${cri}) le, count(*) total
              from marts.entity_flags ef
              where ${efWhere(focalRole, RISK_MIN_DAS)}
            `) as unknown as { le: string; total: string }[];
            const total = Number(pct[0]?.total ?? 0);
            if (total > 0) percentile = Math.round((Number(pct[0]!.le) / total) * 100);
          }
          const byBucket = new Map(buckets.map((b) => [Number(b.b), Number(b.n)]));
          const totalEntities = buckets.reduce((sum, b) => sum + Number(b.n), 0);
          return {
            block: "distribution",
            distribution: {
              buckets: Array.from({ length: 10 }, (_, i) => ({
                from: i / 10,
                to: (i + 1) / 10,
                n: byBucket.get(i + 1) ?? 0,
              })),
              focal: {
                entityId: String(focal[0]!.entity_id),
                name: focal[0]!.name_display ?? focalName,
                cri,
                percentile,
              },
              role: focalRole,
              totalEntities,
            },
          };
        }

        case "breakdown": {
          // With a CPV subject: break down inside that subtree, two digits
          // deeper than the subject's own prefix (so a breakdown of a group
          // yields its classes, of a class its categories, …, capped at the
          // full 8-digit code). Otherwise: top-level divisions (2-digit).
          const plen = w.cpvPrefixes.reduce((a, p) => Math.max(a, p.length), 0);
          const stemLen = plen === 0 ? 2 : Math.min(plen + 2, 8);
          const rolled = rollup ? await rollupBreakdown(s, rollup, stemLen) : null;
          // Equal values come out by stem, as from the rollup.
          const r = rolled && "rows" in rolled ? rolled.rows : (await s`
            select substr(d.cpv_code, 1, ${stemLen}) stem,
                   coalesce(sum(d.closing_value), 0) v, count(*) n
            from ${txtAgg} d
            where ${whereFrag()} and d.cpv_code is not null
            group by 1 order by v desc, stem
          `) as unknown as { stem: string; v: string; n: string }[];
          const top = r.slice(0, 8);
          const rest = r.slice(8);
          const names = await cpvNamesFor(s, top.map((t) => t.stem));
          return {
            block: "breakdown",
            slices: top.map((t) => ({
              code: t.stem,
              name: names.get(t.stem) ?? null,
              value: Number(t.v),
              count: Number(t.n),
            })),
            other: {
              value: rest.reduce((a, b) => a + Number(b.v), 0),
              count: rest.reduce((a, b) => a + Number(b.n), 0),
            },
          };
        }

        case "scatter": {
          const role: Dim = spec.dim === "supplier" ? "supplier" : "authority";
          const r = (await s`
            (select ef.entity_id, ef.name_display, ef.county, ef.total_ron, ef.cri, ef.n_flags
             from marts.entity_flags ef
             where ${efWhere(role as "authority" | "supplier", RISK_MIN_DAS)} and ef.cri is not null
             order by ef.cri desc, ef.total_ron desc limit 200)
            union
            (select ef.entity_id, ef.name_display, ef.county, ef.total_ron, ef.cri, ef.n_flags
             from marts.entity_flags ef
             where ${efWhere(role as "authority" | "supplier", RISK_MIN_DAS)} and ef.cri is not null
             order by ef.total_ron desc nulls last limit 200)
          `) as unknown as {
            entity_id: string;
            name_display: string | null;
            county: string | null;
            total_ron: string | null;
            cri: string;
            n_flags: number;
          }[];
          // full-population density layer (same filters as the sample), from the
          // stored log_total_ron once migration 0085 has added it (rollups.ts)
          const density = await scatterDensity(s, efWhere(role as "authority" | "supplier", RISK_MIN_DAS), columns?.logTotal ?? false);
          return {
            block: "scatter",
            points: r.map((p) => ({
              entityId: String(p.entity_id),
              name: p.name_display ?? "?",
              county: p.county,
              value: Number(p.total_ron ?? 0),
              cri: Number(p.cri),
              nFlags: Number(p.n_flags),
            })),
            density,
          };
        }

        case "sankey": {
          if (!focalId) return { error: "Lipsește entitatea centrală." };
          const partnerId = focalRole === "authority" ? s`d.supplier_id` : s`d.authority_id`;
          const partnerName = focalRole === "authority" ? s`d.supplier_name` : s`d.authority_name`;
          const focalCol = focalRole === "authority" ? s`d.authority_id` : s`d.supplier_id`;
          const r = (await s`
            select ${partnerId} pid, max(${partnerName}) pnm,
                   substr(d.cpv_code, 1, 2) stem,
                   coalesce(sum(d.closing_value), 0) v
            from ${txtAggNames} d
            where ${whereFrag()} and ${focalCol} = ${focalId}
              and ${partnerId} is not null and d.cpv_code is not null
            group by 1, 3
            order by v desc
          `) as unknown as { pid: string; pnm: string; stem: string; v: string }[];
          if (r.length === 0) {
            return { error: emptyRelationError(focalName) };
          }
          // keep top 6 partners / top 5 categories, roll the rest up
          const byPartner = new Map<string, number>();
          const byCat = new Map<string, number>();
          for (const row of r) {
            byPartner.set(row.pid, (byPartner.get(row.pid) ?? 0) + Number(row.v));
            byCat.set(row.stem, (byCat.get(row.stem) ?? 0) + Number(row.v));
          }
          const topPartners = new Set(
            [...byPartner.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k),
          );
          const topCats = new Set(
            [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k),
          );
          const agg = new Map<string, { partnerId: string; partner: string; categoryCode: string; value: number }>();
          for (const row of r) {
            const pk = topPartners.has(row.pid) ? row.pid : "_alt";
            const pn = topPartners.has(row.pid)
              ? (r.find((x) => x.pid === row.pid)?.pnm ?? "?")
              : "alți parteneri";
            const ck = topCats.has(row.stem) ? row.stem : "_alt";
            const key = `${pk}|${ck}`;
            const cur = agg.get(key);
            if (cur) cur.value += Number(row.v);
            else agg.set(key, { partnerId: pk, partner: pn, categoryCode: ck, value: Number(row.v) });
          }
          const catStems = [...topCats];
          const names = await cpvNamesFor(s, catStems);
          return {
            block: "sankey",
            flows: [...agg.values()]
              .sort((a, b) => b.value - a.value)
              .map((f) => ({
                partnerId: f.partnerId,
                partner: f.partner,
                categoryCode: f.categoryCode,
                category: f.categoryCode === "_alt" ? "alte categorii" : (names.get(f.categoryCode) ?? f.categoryCode),
                value: f.value,
              })),
            focal: { entityId: String(focalId), name: focalName, role: focalRole },
          };
        }

        case "network": {
          if (!focalId) return { error: "Lipsește entitatea centrală." };
          const partnerId = focalRole === "authority" ? s`d.supplier_id` : s`d.authority_id`;
          const partnerName = focalRole === "authority" ? s`d.supplier_name` : s`d.authority_name`;
          const focalCol = focalRole === "authority" ? s`d.authority_id` : s`d.supplier_id`;
          const r = (await s`
            select ${partnerId} pid, max(${partnerName}) pnm,
                   coalesce(sum(d.closing_value), 0) v, count(*) n
            from ${txtAggNames} d
            where ${whereFrag()} and ${focalCol} = ${focalId}
              and ${partnerId} is not null
            group by 1
            order by v desc
            limit 14
          `) as unknown as { pid: string; pnm: string; v: string; n: string }[];
          if (r.length === 0) {
            return { error: emptyRelationError(focalName) };
          }
          return {
            block: "network",
            nodes: r.map((p) => ({
              entityId: String(p.pid),
              name: p.pnm ?? "?",
              value: Number(p.v),
              count: Number(p.n),
            })),
            focal: { entityId: String(focalId), name: focalName, role: focalRole },
          };
        }

        case "entity_card": {
          const role = spec.dim === "supplier" ? ("supplier" as const) : ("authority" as const);
          const minDas = profileMinDas(spec.block);
          const order =
            (spec.rankBy ?? "risk") === "risk"
              ? s`ef.cri desc nulls last, ef.total_ron desc nulls last, ef.entity_id`
              : s`ef.total_ron desc nulls last, ef.entity_id`;
          const r = (await s`
            select ef.entity_id, ef.name_display, ef.county, ef.role, ef.n_das, ef.total_ron,
                   ef.cri, ef.n_flags, ef.flags
            from marts.entity_flags ef
            where ${efWhere(role, minDas)}
            order by ${order}
            limit 1
          `) as unknown as {
            entity_id: string;
            name_display: string | null;
            county: string | null;
            role: string;
            n_das: number;
            total_ron: string | null;
            cri: string | null;
            n_flags: number;
            flags: string[] | null;
          }[];
          if (r.length === 0) return { error: "Niciun rezultat pentru aceste filtre." };
          const e = r[0]!;
          const cardPopulation = role === "authority"
            ? (await readPerCapitaPopulations(s)).byEntity.get(String(e.entity_id)) ?? null : null;
          if (cardPopulation !== null) caveats.push(POPULATION_CARD_NOTE);
          return {
            block: "entity_card",
            card: {
              entityId: String(e.entity_id),
              name: e.name_display ?? "?",
              county: e.county,
              role: e.role,
              value: Number(e.total_ron ?? 0),
              count: Number(e.n_das),
              cri: e.cri === null ? null : Number(e.cri),
              nFlags: Number(e.n_flags),
              flags: e.flags ?? [],
              population: cardPopulation,
            },
          };
        }

        case "fact_check": {
          const agg = (await s`
            select coalesce(sum(d.closing_value), 0) v, count(*) n,
                   min(substr(d.finalization_date, 1, 4)) y1,
                   max(substr(d.finalization_date, 1, 4)) y2
            from ${txt} d
            where ${whereFrag()}
          `) as unknown as { v: string; n: string; y1: string | null; y2: string | null }[];
          const n = Number(agg[0]?.n ?? 0);
          const samples =
            n > 0
              ? ((await s`
                  select ${codeCol} da_code, d.finalization_date, d.cpv_name, d.closing_value
                  from ${txt} d
                  where ${whereFrag()}
                  order by d.closing_value desc
                  limit 5
                `) as unknown as {
                  da_code: string | null;
                  finalization_date: string | null;
                  cpv_name: string | null;
                  closing_value: string;
                }[])
              : [];
          return {
            block: "fact_check",
            fact: {
              verdict: n > 0,
              authority: {
                entityId: String(authorityId),
                name: grounding.authority?.nameDisplay ?? "?",
              },
              supplier: {
                entityId: String(supplierId),
                name: grounding.supplier?.nameDisplay ?? "?",
              },
              count: n,
              value: Number(agg[0]?.v ?? 0),
              yearFirst: agg[0]?.y1 ? Number(agg[0].y1) : null,
              yearLast: agg[0]?.y2 ? Number(agg[0].y2) : null,
              samples: samples.map((x) => ({
                daCode: x.da_code,
                date: x.finalization_date ? x.finalization_date.slice(0, 10) : null,
                cpvName: x.cpv_name,
                value: Number(x.closing_value),
              })),
            },
          };
        }

        case "trend": {
          const yA = w.yearFrom ?? minY;
          const yB = w.yearTo ?? maxY;
          if (yA === yB) {
            return {
              error: `Pentru o comparație în timp am nevoie de doi ani diferiți (am primit doar ${yA}).`,
            };
          }
          const topN = spec.topN ?? 10;
          const dim = spec.dim ?? "authority";
          const rolledTrend = rollup ? await rollupTrend(s, rollup, { dim, yearA: yA, yearB: yB, topN }) : null;
          if (dim === "county") {
            // Equal changes come out by county, as from the rollup.
            const r = rolledTrend && "rows" in rolledTrend ? rolledTrend.rows.map((p) => ({ c: p.nm, va: p.va, vb: p.vb })) : (await s`
              select d.county c,
                     coalesce(sum(d.closing_value) filter (where substr(d.finalization_date,1,4) = ${String(yA)}), 0) va,
                     coalesce(sum(d.closing_value) filter (where substr(d.finalization_date,1,4) = ${String(yB)}), 0) vb
              from ${txtAggNames} d
              where ${whereFrag({ years: false })} and d.county is not null
                and ${trendYearsPredicate(s, yA, yB)}
              group by 1
              order by abs(
                coalesce(sum(d.closing_value) filter (where substr(d.finalization_date,1,4) = ${String(yB)}), 0)
                - coalesce(sum(d.closing_value) filter (where substr(d.finalization_date,1,4) = ${String(yA)}), 0)
              ) desc, c
              limit ${topN}
            `) as unknown as { c: string; va: string; vb: string }[];
            return {
              block: "trend",
              yearA: yA,
              yearB: yB,
              rowsTrend: r.map((p) => ({
                entityId: null,
                name: p.c,
                county: null,
                valueA: Number(p.va),
                valueB: Number(p.vb),
              })),
            };
          }
          const idCol = dim === "authority" ? s`d.authority_id` : s`d.supplier_id`;
          const nameCol = dim === "authority" ? s`d.authority_name` : s`d.supplier_name`;
          // Equal changes come out by id, as from the rollup (consortium partners share a value).
          const r = rolledTrend && "rows" in rolledTrend ? rolledTrend.rows : (await s`
            select ${idCol} id, max(${nameCol}) nm, max(d.county) co,
                   coalesce(sum(d.closing_value) filter (where substr(d.finalization_date,1,4) = ${String(yA)}), 0) va,
                   coalesce(sum(d.closing_value) filter (where substr(d.finalization_date,1,4) = ${String(yB)}), 0) vb
            from ${txtAggNames} d
            where ${whereFrag({ years: false })} and ${idCol} is not null
              and ${trendYearsPredicate(s, yA, yB)}
            group by ${idCol}
            order by abs(
              coalesce(sum(d.closing_value) filter (where substr(d.finalization_date,1,4) = ${String(yB)}), 0)
              - coalesce(sum(d.closing_value) filter (where substr(d.finalization_date,1,4) = ${String(yA)}), 0)
            ) desc, ${idCol}
            limit ${topN}
          `) as unknown as { id: string; nm: string; co: string | null; va: string; vb: string }[];
          return {
            block: "trend",
            yearA: yA,
            yearB: yB,
            rowsTrend: r.map((p) => ({
              entityId: String(p.id),
              name: p.nm,
              county: p.co,
              valueA: Number(p.va),
              valueB: Number(p.vb),
            })),
          };
        }
      }
    });
  };

  const data = await exec();
  if ("error" in data) return { error: data.error, caveats };
  // Audit F19: an annual total or comparison over a partly covered year says so.
  // The markers travel beside `data`, so watched results keep their shape.
  let partial: PartialYear[] | undefined;
  const annual = data.block === "timeseries" || data.block === "trend" || data.block === "compare";
  const selected = !annual && !isHistoricalProfile(spec) && (w.yearFrom !== null || w.yearTo !== null);
  if (annual || selected) {
    const periods = await coveragePeriods(sql);
    if (!periods) {
      if (annual) caveats.push(PERIOD_UNKNOWN_CAVEAT);
    } else if (data.block === "timeseries") {
      partial = partialYears(periods, dataset, data.series.map((p) => p.year), w);
      const note = partialYearsCaveat(partial, "series");
      if (note) caveats.push(note);
    } else if (data.block === "compare") {
      // The side-by-side years hatch partly covered years like the series does.
      const years = [...new Set(data.entities.flatMap((e) => (e.years ?? []).map((y) => y.year)))].sort((a, b) => a - b);
      partial = partialYears(periods, dataset, years, w);
      const note = partialYearsCaveat(partial, "series");
      if (note) caveats.push(note);
    } else if (data.block === "trend") {
      partial = partialYears(periods, dataset, [data.yearA, data.yearB]);
      const note = partialYearsCaveat(partial, "comparison");
      if (note) caveats.push(note);
    } else {
      const from = w.yearFrom ?? minY, to = w.yearTo ?? maxY;
      const years = Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
      const note = partialYearsCaveat(partialYears(periods, dataset, years, w), "selection");
      if (note) caveats.push(note);
    }
  }
  return { data, displaySql, caveats, tookMs: Date.now() - started, ...(partial ? { partialYears: partial } : {}) };
}

export interface DrillRow {
  title?: string | null;
  daCode: string | null;
  date: string | null;
  authorityId: string | null;
  authority: string | null;
  supplierId: string | null;
  supplier: string | null;
  county: string | null;
  cpvName: string | null;
  value: number;
  /** Which channel the row came from. */
  src: "da" | "contracts";
  /** Source row id: sicap_da_id (da) / contract_id (contracts). */
  refId: string | null;
  /** SEAP award-notice id (contracts only) — builds the e-licitatie link. */
  caNoticeId: string | null;
  /** TED publication number of the confirmed twin (contracts only). */
  tedPubnum: string | null;
  /** DA rows only: the estimate, for exposing typo'd closing values. */
  estimatedValueRon: number | null;
  /** Recorded value implausible (>2M or ≥100× estimate) — show a warning. */
  valueSuspect: boolean;
  /** Exact PostgreSQL numeric, preserved for arithmetic/CSV. */
  valueExact: string;
  cpvCode: string | null;
  state: string | null;
  nWinners: number | null;
  contractValueFull: string | null;
}
export interface DrillResult {
  /** Full applied answer (or selected chart group), before drawer filters. */
  sourceTotal: number;
  sourceValue: string;
  /** Count is `total`; exact value below follows search/status/stream filters. */
  value: string;
  accepted: { count: number; value: string };
  statuses: EvidenceStatus[];
  dateFrom: string | null;
  dateTo: string | null;
  profile: boolean;
  profiles: EvidenceProfile[];
  profileCount: number;
  profileReconciled: boolean | null;
  scopeNotes: string[];
  rows: DrillRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** Whitelisted sort keys → columns (everything else falls back to value). */
export const DRILL_SORTS = {
  source: "ref_id",
  value: "closing_value",
  date: "finalization_date",
  authority: "authority_name",
  supplier: "supplier_name",
  county: "county",
  cpv: "cpv_name",
} as const;
export type DrillSort = keyof typeof DRILL_SORTS;

export interface DrillOpts {
  /** Server-only frozen capture: persist the complete filtered SELECT in the
   * caller's repeatable-read transaction. Never accepted by evidenceOptions. */
  capture?: { maxRows?: number; persist: (database: DbSql, rowsQuery: ReturnType<DbSql>) => Promise<void> };
  /** Server-only: cancel the running read when the HTTP request is abandoned. */
  signal?: AbortSignal;
  scope?: EvidenceScope;
  search?: string;
  /** Exact imported state; __unknown selects missing state. */
  state?: string;
  sort?: DrillSort;
  dir?: "asc" | "desc";
  /** dataset "all" only: restrict the rows to one channel. */
  stream?: "da" | "contracts";
  /**
   * Server-internal (CSV export): fetch up to this many rows in one go instead
   * of a DRILL_PAGE_SIZE page. Always capped at CSV_MAX_ROWS.
   */
  limit?: number;
  /** Server-internal: the comparison group a peer drawer bound (peerEvidenceOptions), for the note's label. */
  origin?: OriginHint;
  /** Server-internal: names of the ids a population lists, where the caller knows them (an entity capture). */
  entities?: Readonly<Record<string, string>>;
}

export const DRILL_PAGE_SIZE = 10;
/** Hard cap for full-result CSV exports (~15MB of CSV). */
export const CSV_MAX_ROWS = EVIDENCE_CSV_LIMIT;
/** Blocks whose result is an aggregate over da_transactions — drillable to rows. */
export const DRILLABLE_BLOCKS: AskSpec["block"][] = [
  "table",
  "stat",
  "timeseries",
  "map",
  "breakdown",
  "sankey",
  "network",
  "fact_check",
  "trend",
  "compare",
  "distribution",
  "scatter",
  "entity_card",
];

async function readEvidenceQuery(query: ReturnType<DbSql>, signal?: AbortSignal) {
  if (!signal) return await query;
  signal.throwIfAborted();
  const cancel = () => query.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try { return await query; }
  finally { signal.removeEventListener("abort", cancel); }
}

/**
 * "Go to data": the underlying da_transactions rows behind an answer, paginated.
 * Same grounded filters as the aggregate — no derived number is a dead end.
 */
export async function runRows(
  sql: DbSql,
  spec: AskSpec,
  grounding: Grounding,
  page: number,
  opts: DrillOpts = {},
): Promise<DrillResult | { error: string }> {
  opts.signal?.throwIfAborted();
  if (unimplementedSpecKeys(spec).length) return { error: NEWER_VERSION_LINK };
  const canonical=await canonicalAskIdentities(sql,spec,grounding,opts.scope);
  spec=canonical.spec; grounding=canonical.grounding;
  if(canonical.scope)opts={...opts,scope:canonical.scope};
  if (spec.block === "entity_card" && spec.rankBy === "value") spec = { ...spec, measure: "value" };
  const unsupported = unsupportedPopulationView(spec);
  if (unsupported) return { error: unsupported };
  if (!DRILLABLE_BLOCKS.includes(spec.block)) {
    return { error: "Acest tip de răspuns nu are rânduri-sursă directe." };
  }
  const cpvPrefixes = grounding.cpv?.prefixes ?? [];
  if (spec.filters.cpvTerm && cpvPrefixes.length === 0) {
    const retired = grounding.cpv?.retired;
    return { error: retired ? `${retired.message} ${retiredChoicesText(retired)}` : `Nu am găsit CPV pentru „${spec.filters.cpvTerm}”.` };
  }
  if ((spec.filters.authorityName || spec.filters.authorityId) && !grounding.authority?.entityId) {
    return {
      error: `Nu am găsit autoritatea „${spec.filters.authorityName ?? spec.filters.authorityId}”.`,
    };
  }
  if ((spec.filters.supplierName || spec.filters.supplierId) && !grounding.supplier?.entityId) {
    return {
      error: `Nu am găsit firma „${spec.filters.supplierName ?? spec.filters.supplierId}”.`,
    };
  }
  if (spec.filters.county && !grounding.county?.canonical) {
    return { error: `Nu recunosc județul „${spec.filters.county}”.` };
  }
  if (
    (spec.filters.adminPersonKey || spec.filters.adminName) &&
    (!grounding.admin?.personKey || grounding.admin.supplierIds.length === 0)
  ) {
    return { error: "Nu am găsit firmele persoanei în date (filtrul «conduse de»)." };
  }
  if (spec.filters.uatSiruta && !grounding.uat?.authorityIds?.length) {
    return { error: uatUnmappedError(spec.filters.uatName ?? grounding.uat?.name ?? `UAT ${spec.filters.uatSiruta}`) };
  }
  const scope = validateEvidenceScope(opts.scope);
  if ("error" in scope) return scope;
  const profile = isHistoricalProfile(spec);
  // Resolve the winner from the original population before any drawer filters.
  // Intersect it below, so a caller cannot substitute a different entity.
  let valueWinner: string | null = null;
  if (spec.block === "entity_card" && spec.rankBy === "value") {
    const result = await runSpec(sql, spec, grounding);
    opts.signal?.throwIfAborted();
    if ("error" in result) return { error: result.error };
    if (result.data.block !== "entity_card") return { error: "Nu am putut identifica entitatea cu valoarea maximă." };
    valueWinner = result.data.card.entityId;
    if (scope.role && scope.role !== (spec.dim === "supplier" ? "supplier" : "authority"))
      return { error: "Rolul selectat nu aparține entității din răspuns." };
  }

  if (scope.riskBucket && spec.block !== "distribution") return { error: "Intervalul de risc se aplică distribuției." };
  if (profile && (scope.cpvPrefixes || scope.excludeCpvPrefixes || scope.years))
    return { error: "Profilul istoric nu se restrânge la CPV sau perioadă. Deschide o întrebare despre achiziții pentru aceste filtre." };
  const dataset = profile ? "da" : spec.dataset ?? "all";
  const focalRole = grounding.authority?.entityId ? "authority" : "supplier";
  const focalId = grounding.authority?.entityId ?? grounding.supplier?.entityId;
  const role = spec.block === "compare" || spec.block === "distribution"
    ? focalRole : spec.dim === "supplier" ? "supplier" : "authority";
  if (profile && scope.role && scope.role !== role) return { error: "Rolul selectat nu aparține acestei populații de profiluri." };
  if (spec.block === "compare" && (!focalId || !grounding.compare?.entityId))
    return { error: "Comparația necesită două entități identificate." };

  const notes: string[] = [];
  const covered = profile ? [] : dataset === "contracts" ? await daCoverageYears(sql, "award")
    : dataset === "da" ? await daCoverageYears(sql, "da")
    : [...new Set([...(await daCoverageYears(sql, "da")), ...(await daCoverageYears(sql, "award"))])].sort((a, b) => a - b);
  const minY = covered[0] ?? 2018;
  const maxY = covered.at(-1) ?? 2026;
  let yearFrom = spec.filters.yearFrom ?? null;
  let yearTo = spec.filters.yearTo ?? null;
  if (!profile && (yearFrom !== null || yearTo !== null)) {
    const from = yearFrom ?? minY;
    const to = yearTo ?? maxY;
    if (to < minY || from > maxY) {
      return { error:`Perioada cerută este în afara datelor disponibile (${minY}–${maxY}); lista surselor nu a fost extinsă.` };
    } else {
      yearFrom = Math.max(from, minY); yearTo = Math.min(to, maxY);
      if (yearFrom !== from || yearTo !== to) notes.push(`Perioada efectivă: ${yearFrom}–${yearTo}, conform acoperirii datelor.`);
    }
  }
  // The question's conditions, written for the sources as for the answer (predicates.ts).
  const kindIds = await authorityKindIds(sql, namedKind(spec.filters.authorityKind));
  const ctx = predicateContext(sql, spec, grounding, { dataset, yearFrom, yearTo, kindIds });
  // The rollups give the record threshold's party list and, without a local
  // filter, the totals of a selection without entity conditions (rollups.ts).
  const rollup = profile || valueWinner ? null : await rollupPlanFor(sql, spec, ctx);
  let profileParts: ReturnType<DbSql>[];
  if (spec.block === "compare") {
    profileParts = [sql`ef.role = ${role}`, sql`ef.entity_id in (${focalId!}, ${grounding.compare!.entityId!})`];
  } else if (spec.block === "distribution" && scope.entityIds) {
    // The focal profile can legitimately lie outside the displayed peer group.
    // Its own source button explicitly selects its full historical activity.
    profileParts = [sql`ef.role = ${role}`, sql`ef.entity_id = any(${sql.array([...scope.entityIds])}::bigint[])`];
  } else {
    profileParts = profilePredicates(ctx, role, profileMinDas(spec.block));
    if (spec.block === "scatter") profileParts.push(sql`ef.cri is not null`);
  }
  const baseProfileWhere = profileParts.reduce((a, b) => sql`${a} and ${b}`);
  const profileOrder = (spec.rankBy ?? "risk") === "risk"
    ? sql`ef.cri desc nulls last, ef.total_ron desc nulls last, ef.entity_id`
    : sql`ef.total_ron desc nulls last, ef.entity_id`;
  // Select the winner before intersecting a requested profile ID, so a client
  // cannot replace the superlative with an arbitrary lower-ranked entity.
  const profileBase = spec.block === "entity_card"
    ? sql`(select ef.* from marts.entity_flags ef where ${baseProfileWhere} order by ${profileOrder} limit 1)`
    : sql`(select ef.* from marts.entity_flags ef where ${baseProfileWhere})`;
  const selectionParts: ReturnType<DbSql>[] = [sql`true`];
  if (scope.county) selectionParts.push(sql`lower(unaccent(ef.county)) = ${fold(scope.county)}`);
  if (scope.entityIds) selectionParts.push(sql`ef.entity_id = any(${sql.array([...scope.entityIds])}::bigint[])`);
  if (scope.excludeEntityIds) selectionParts.push(sql`not (ef.entity_id = any(${sql.array([...scope.excludeEntityIds])}::bigint[]))`);
  if (scope.riskBucket) selectionParts.push(sql`width_bucket(coalesce(ef.cri, 0), 0, 1.0000001, 10) = ${Math.round(scope.riskBucket.from * 10) + 1}`);
  const profileSelection = selectionParts.reduce((a, b) => sql`${a} and ${b}`);
  const cohort = sql`(select ef.* from ${profileBase} ef where ${profileSelection})`;
  // Same supplier as marts.da_transactions: one equal to the authority is not a supplier (audit F12).
  const partyCore = role === "authority" ? sql`da.authority_entity_id` : sql`nullif(da.supplier_entity_id, da.authority_entity_id)`;
  const daTx = sql`(
    select sicap_da_id as ref_id, da_code, finalization_date, authority_id, authority_name,
           supplier_id, supplier_name, county, cpv_code, cpv_name, closing_value,
           'da'::text as src, null::bigint as ca_notice_id, null::text as ted_pubnum,
           estimated_value_ron, value_suspect, 'Oferta acceptata'::text as state,
           null::integer as n_winners, null::numeric as contract_value_full,
           null::boolean as is_single_bidder
    from marts.da_transactions
  )`;
  const contractTx = sql`(
    select contract_id as ref_id, contract_no as da_code, finalization_date, authority_id, authority_name,
           supplier_id, supplier_name, county, cpv_code, cpv_name, closing_value,
           'contracts'::text as src, ca_notice_id, ted_pubnum, null::numeric as estimated_value_ron,
           false as value_suspect, null::text as state, n_winners, contract_value_full, is_single_bidder
    from marts.contract_transactions
  )`;
  const txt = profile ? sql`(
    select da.sicap_da_id as ref_id, da.da_code, to_char(da.finalization_date at time zone 'Europe/Bucharest', 'YYYY-MM-DD HH24:MI') as finalization_date,
           da.authority_entity_id as authority_id, a.name_display as authority_name,
           nullif(da.supplier_entity_id, da.authority_entity_id) as supplier_id, su.name_display as supplier_name,
           a.county, da.cpv_code, cpv.name_ro as cpv_name, da.closing_value,
           'da'::text as src, null::bigint as ca_notice_id, null::text as ted_pubnum,
           da.estimated_value_ron, false as value_suspect, da.state,
           null::integer as n_winners, null::numeric as contract_value_full, null::boolean as is_single_bidder
    from core.direct_acquisitions da
    left join core.entities a on a.id = da.authority_entity_id
    left join core.entities su on su.id = da.supplier_entity_id
    left join core.cpv_codes cpv on cpv.code = da.cpv_code
    where da.state = 'Oferta acceptata' and da.closing_value > 0 and da.closing_value <= ${DA_PLAFOND_RON}
      and ${partyCore} in (select entity_id from ${cohort} selected_profiles)
  )` : dataset === "da" ? daTx : dataset === "contracts" ? contractTx : sql`(select * from ${daTx} direct_rows union all select * from ${contractTx} contract_rows)`;

  // Only what is proper to the sources is added below: the relationship's focal entity,
  // the two years of a trend, the value winner, the drawer's scope and its exclusions.
  const parts: ReturnType<DbSql>[] = profile ? [sql`true`] : rowPredicates(ctx, { years: spec.block !== "trend" });
  if (profile) {
    notes.push("Profil istoric: achiziții directe acceptate, cu valoare pozitivă de cel mult 2 milioane lei. Totalul reprezintă valori înregistrate, nu plăți.");
    notes.push("Subiectul și perioada întrebării nu restrâng profilurile istorice; județul și tipul instituției selectează populația comparată. CRI este un semnal statistic, nu o dovadă de neregulă.");
  } else {
    // The precise selection and the record threshold, in the words of describeConditions.
    const conditions = describeConditions(spec, { grounding, origin: opts.origin, entities: opts.entities }).byId;
    if (conditions.population?.note) notes.push(conditions.population.note);
    const isRelationship = spec.block === "network" || spec.block === "sankey";
    if (isRelationship) {
      if (!focalId) return { error: "Lipsește entitatea centrală." };
      // The answer repeats it beside its own conditions too (focalCol = focalId).
      parts.push(focalRole === "authority" ? sql`d.authority_id = ${focalId}` : sql`d.supplier_id = ${focalId}`);
    }
    if (spec.block === "trend") {
      parts.push(trendYearsPredicate(sql, yearFrom ?? minY, yearTo ?? maxY));
      notes.push(`Schimbare între ${yearFrom ?? minY} și ${yearTo ?? maxY}: sursele includ numai cei doi ani; diferența este totalul final minus totalul inițial.`);
    }
    if (spec.minimumRecords) {
      // Counted over the selection itself (rowPredicates): the rollups hold the same party list.
      const party = (spec.minimumRecords.role === "authority" ? sql`d.authority_id` : sql`d.supplier_id`) as unknown as ReturnType<DbSql>;
      const fromRollups = rollup && !isRelationship && spec.block !== "trend" ? rollupMinimumCond(sql, rollup, party) : null;
      parts.push(...(fromRollups ? [fromRollups] : groupPredicates(ctx, txt as unknown as ReturnType<DbSql>, andAll(sql, parts))));
      if (conditions.minimumRecords?.note) notes.push(conditions.minimumRecords.note);
    }
    if (valueWinner) {
      parts.push(spec.dim === "supplier" ? sql`d.supplier_id = ${valueWinner}` : sql`d.authority_id = ${valueWinner}`);
      notes.push("Sursele sunt limitate la entitatea cu cea mai mare valoare în selecția întrebării; filtrele din listă nu schimbă câștigătorul.");
    }
    if (scope.county) parts.push(sql`lower(unaccent(d.county)) = ${fold(scope.county)}`);
    if (isRelationship) parts.push(focalRole === "authority" ? sql`d.supplier_id is not null` : sql`d.authority_id is not null`);
    if (spec.block === "table" || spec.block === "trend") {
      if (spec.dim === "county") parts.push(sql`d.county is not null`);
      else parts.push(spec.dim === "supplier" ? sql`d.supplier_id is not null` : sql`d.authority_id is not null`);
    }
    if (spec.measure === "value_per_capita" && spec.block === "table") {
      // Same eligible administrations and denominators as the ranking.
      const perCapita = await readPerCapitaPopulations(sql);
      parts.push(perCapitaPredicate(sql, perCapita.ids));
      notes.push(`Lei/locuitor: valoarea înregistrărilor unei administrații se împarte la ${PER_CAPITA_SOURCE}. Sursele includ doar primăriile (inclusiv cele de sector) și consiliile județene identificate strict, ca în clasament.`);
    }
    if (spec.block === "map") parts.push(sql`d.county is not null`);
    if (spec.block === "timeseries") parts.push(sql`substr(d.finalization_date, 1, 4) ~ '^[0-9]{4}$'`);
    if (spec.block === "breakdown" || spec.block === "sankey") parts.push(sql`d.cpv_code is not null`);
    if (scope.entityIds || scope.excludeEntityIds) {
      const col = scope.role === "supplier" ? sql`d.supplier_id` : sql`d.authority_id`;
      if (scope.entityIds) parts.push(sql`${col} = any(${sql.array([...scope.entityIds])}::bigint[])`);
      if (scope.excludeEntityIds) parts.push(sql`not (${col} = any(${sql.array([...scope.excludeEntityIds])}::bigint[]))`);
    }
    if (scope.cpvPrefixes) parts.push(sql`d.cpv_code like any(${sql.array(scope.cpvPrefixes.map((p) => p + "%"))}::text[])`);
    if (scope.excludeCpvPrefixes) parts.push(sql`not (d.cpv_code like any(${sql.array(scope.excludeCpvPrefixes.map((p) => p + "%"))}::text[]))`);
    if (scope.years) parts.push(sql`substr(d.finalization_date, 1, 4) = any(${sql.array(scope.years.map(String))}::text[])`);
    notes.push("Valoare înregistrată în achiziții, nu dovada plății. Achizițiile directe din acest rezultat au starea «Oferta acceptata». Valorile nule sau nepozitive nu intră în agregatul de achiziții.");
    if (dataset !== "contracts") notes.push("Achizițiile directe peste 2 milioane lei sunt excluse prin același plafon de plauzibilitate ca în răspuns.");
    if (dataset !== "da") notes.push(CONTRACT_CAP_CAVEAT);
    if (dataset !== "da") notes.push("Un contract cu mai mulți câștigători apare pe câte un rând pentru fiecare furnizor, cu valoarea împărțită egal. Suma folosește aceste cote; numărul de rânduri nu este numărul de contracte distincte. Detaliile și exportul păstrează valoarea integrală și numărul câștigătorilor.");
    if (spec.block === "table" || spec.block === "network" || spec.block === "trend") notes.push("Lista surselor acoperă întregul rezultat filtrat; limita de poziții din clasament sau diagramă nu limitează sursele.");
  }
  const sourceWhere = parts.reduce((a, b) => sql`${a} and ${b}`);
  const localParts: ReturnType<DbSql>[] = [sql`true`];
  if (opts.stream) localParts.push(sql`d.src = ${opts.stream}`);
  if (opts.state === "__unknown") localParts.push(sql`d.state is null`);
  else if (opts.state) localParts.push(sql`d.state = ${opts.state}`);
  const search = opts.search?.trim().slice(0, 200);
  if (search) {
    // strpos treats percent/underscore literally and remains parameterized.
    localParts.push(sql`strpos(lower(unaccent(concat_ws(' ', d.da_code, d.authority_name, d.supplier_name, d.cpv_name, d.cpv_code, d.county, d.ref_id::text))), ${fold(search)}) > 0`);
  }
  const localWhere = localParts.reduce((a, b) => sql`${a} and ${b}`);
  // The blocks whose source condition rollupSourceTotals adds itself.
  const totalsBlock = spec.block === "stat" || spec.block === "map" || spec.block === "breakdown" || spec.block === "timeseries" ? spec.block
    : spec.block === "table" && spec.dim === "county" ? "county" as const : null;
  const defaultSort = !profile && !grounding.authority?.entityId && !grounding.supplier?.entityId ? "source" : "value";
  const sortKey: DrillSort = opts.sort && Object.hasOwn(DRILL_SORTS, opts.sort) ? opts.sort : defaultSort;
  const sortFrag = { source: sql`d.ref_id`, value: sql`d.closing_value`, date: sql`d.finalization_date`, authority: sql`d.authority_name`, supplier: sql`d.supplier_name`, county: sql`d.county`, cpv: sql`d.cpv_name` }[sortKey];
  const dirFrag = sortKey === "source" ? opts.dir === "asc" ? sql`asc` : sql`desc`
    : opts.dir === "asc" ? sql`asc nulls last` : sql`desc nulls last`;
  const requestedPage = Number.isFinite(page) ? Math.max(0, Math.floor(page)) : 0;
  const pageSize = opts.limit && opts.limit > 0 ? Math.min(Math.floor(opts.limit), CSV_MAX_ROWS) : DRILL_PAGE_SIZE;

  return await sql.begin("isolation level repeatable read read only", async (tx) => {
    await tx.unsafe(FORCE_CUSTOM_PLANS);
    await tx.unsafe(`set local statement_timeout = '${opts.capture ? '15min' : STATEMENT_TIMEOUT}'`);
    // The production database uses SSD costs. Keep the same covering-index
    // choices in local source verification without changing database settings.
    await tx.unsafe("set local random_page_cost = 1.1");
    const s = tx as unknown as DbSql;
    const rolledTotals = rollup && totalsBlock && localParts.length === 1 && Object.keys(scope).every((key) => key === "role")
      ? await rollupSourceTotals(s, rollup, totalsBlock) : null;
    const totals = rolledTotals && "rows" in rolledTotals ? rolledTotals.rows : (await readEvidenceQuery(s`
      select d.state, count(*) n, coalesce(sum(d.closing_value), 0)::text v,
             count(*) filter (where ${localWhere}) fn,
             coalesce(sum(d.closing_value) filter (where ${localWhere}), 0)::text fv,
             min(d.finalization_date) date_from, max(d.finalization_date) date_to
      from ${txt} d where ${sourceWhere} group by d.state
    `, opts.signal)) as unknown as { state: string | null; n: string; v: string; fn: string; fv: string; date_from: string | null; date_to: string | null }[];
    const sourceTotal = totals.reduce((n, r) => n + Number(r.n), 0);
    const sourceValue = sumDecimalStrings(totals.map((r) => r.v));
    const total = totals.reduce((n, r) => n + Number(r.fn), 0);
    const value = sumDecimalStrings(totals.map((r) => r.fv));
    if (opts.capture?.maxRows !== undefined && total > opts.capture.maxRows) {
      return { error:`Selecția are ${total.toLocaleString("ro-RO")} de înregistrări; limita acestei verificări este ${opts.capture.maxRows.toLocaleString("ro-RO")}. Restrânge perioada, instituția sau domeniul. Nu am salvat un eșantion.` };
    }
    const p = Math.min(requestedPage, Math.max(0, Math.ceil(total / pageSize) - 1));
    const acceptedRows = totals.filter((r) => r.state === "Oferta acceptata");
    // Bound each stream before combining it. A global sort on the wide union
    // scans 20M rows even for ten references; each branch can instead stop at
    // its indexed IDs. Taking offset+limit from BOTH branches preserves every
    // possible row in the requested global page, including tied contract IDs.
    const branchLimit = (p + 1) * pageSize;
    // IDs and calendar years are correlated. A backward primary-key walk can
    // read millions of newer records before reaching an earlier annual scope.
    // For a broad period selection, scan/filter narrow candidate IDs first and
    // sort the bounded result. Adding zero preserves bigint reference order
    // while avoiding that misleading early-stop index plan. Fetch wide rows
    // only for the selected IDs, inside this same repeatable-read snapshot.
    const latestSelectedYear = scope.years?.length ? Math.max(...scope.years) : yearTo;
    const annualScan = !profile && dataset === "all" && sortKey === "source"
      && latestSelectedYear !== null && latestSelectedYear < maxY
      && Object.keys(spec.filters).every((key) => ["yearFrom", "yearTo", "monthFrom", "monthTo"].includes(key))
      && Object.keys(scope).every((key) => ["years", "excludeCpvPrefixes"].includes(key));
    const annualKeys = annualScan ? sql`(
      (select d.ref_id, d.src, d.supplier_id from ${daTx} d where ${sourceWhere} and ${localWhere}
       order by (d.ref_id + 0) ${dirFrag}, d.supplier_id nulls first limit ${branchLimit})
      union all
      (select d.ref_id, d.src, d.supplier_id from ${contractTx} d where ${sourceWhere} and ${localWhere}
       order by (d.ref_id + 0) ${dirFrag}, d.supplier_id nulls first limit ${branchLimit})
    )` : null;
    const pageTxt = annualKeys ? sql`(
      select selected_row.* from ${annualKeys} selected_key
      cross join lateral (
        select d.* from ${daTx} d
        where selected_key.src = 'da' and d.ref_id = selected_key.ref_id
        union all
        select d.* from ${contractTx} d
        where selected_key.src = 'contracts' and d.ref_id = selected_key.ref_id
          and d.supplier_id is not distinct from selected_key.supplier_id
      ) selected_row
    )` : !profile && dataset === "all" && sortKey === "source" ? sql`(
      (select * from ${daTx} d where ${sourceWhere} and ${localWhere}
       order by d.ref_id ${dirFrag}, d.supplier_id nulls first limit ${branchLimit})
      union all
      (select * from ${contractTx} d where ${sourceWhere} and ${localWhere}
       order by d.ref_id ${dirFrag}, d.supplier_id nulls first limit ${branchLimit})
    )` : txt;
    if (opts.capture) await opts.capture.persist(s, s`
      select d.da_code, d.finalization_date, d.authority_id, d.authority_name,
             d.supplier_id, d.supplier_name, d.county, d.cpv_code, d.cpv_name, d.closing_value::text,
             d.src, d.ref_id, d.ca_notice_id, d.ted_pubnum, d.estimated_value_ron,
             d.value_suspect, d.state, d.n_winners, d.contract_value_full::text
      from ${txt} d where ${sourceWhere} and ${localWhere}
    `);
    const rows = (opts.capture ? [] : await readEvidenceQuery(s`
      select d.da_code, d.finalization_date, d.authority_id, d.authority_name,
             d.supplier_id, d.supplier_name, d.county, d.cpv_code, d.cpv_name, d.closing_value::text,
             d.src, d.ref_id, d.ca_notice_id, d.ted_pubnum, d.estimated_value_ron,
             d.value_suspect, d.state, d.n_winners, d.contract_value_full::text,
             case when d.src='contracts' then (select c.title from core.contracts c where c.id=d.ref_id) else (select r.payload->>'directAcquisitionName' from core.direct_acquisitions a join raw.raw_documents r on r.id=a.raw_id where a.sicap_da_id=d.ref_id) end title
      from ${pageTxt} d where ${sourceWhere} and ${localWhere}
      order by ${sortFrag} ${dirFrag}, d.src, d.ref_id, d.supplier_id nulls first
      limit ${pageSize} offset ${p * pageSize}
    `, opts.signal)) as unknown as {
      title: string | null; da_code: string | null; finalization_date: string | null; authority_id: string | null; authority_name: string | null;
      supplier_id: string | null; supplier_name: string | null; county: string | null; cpv_code: string | null; cpv_name: string | null;
      closing_value: string; src: "da" | "contracts"; ref_id: string | null; ca_notice_id: string | null; ted_pubnum: string | null;
      estimated_value_ron: string | null; value_suspect: boolean | null; state: string | null; n_winners: number | null; contract_value_full: string | null;
    }[];
    let profiles: EvidenceProfile[] = [];
    let profileCount = 0;
    let profileReconciled: boolean | null = null;
    if (profile) {
      const expected = (await readEvidenceQuery(s`select count(*) n, coalesce(sum(n_das), 0) records, coalesce(sum(total_ron), 0)::text v from ${cohort} selected_profiles`, opts.signal)) as unknown as { n: string; records: string; v: string }[];
      profileCount = Number(expected[0]?.n ?? 0);
      const difference = sumDecimalStrings([expected[0]?.v ?? "0", sourceValue.startsWith("-") ? sourceValue.slice(1) : `-${sourceValue}`]);
      profileReconciled = Number(expected[0]?.records ?? 0) === sourceTotal && /^-?0(?:\.0+)?$/.test(difference);
      if (!profileReconciled) notes.push("Sursele disponibile acum nu coincid exact cu instantaneul agregat al profilurilor. Recalcularea agregatelor poate rămâne în urmă față de import; totalul de mai sus este calculat direct din înregistrările disponibile.");
      const ps = (await readEvidenceQuery(s`select entity_id, name_display, role, n_das, total_ron::text, cri, flags from ${cohort} selected_profiles order by entity_id limit 20`, opts.signal)) as unknown as { entity_id: string; name_display: string | null; role: "authority" | "supplier"; n_das: number; total_ron: string; cri: string | null; flags: string[] | null }[];
      profiles = ps.map((r) => ({ entityId: String(r.entity_id), name: r.name_display ?? "?", role: r.role, count: Number(r.n_das), value: r.total_ron, cri: r.cri === null ? null : Number(r.cri), flags: r.flags ?? [], applicable: r.role === "authority" ? 5 : 4 }));
    }
    return {
      rows: rows.map((r) => ({
        title: r.title, daCode: r.da_code, date: r.finalization_date?.slice(0, 10) ?? null,
        authorityId: r.authority_id === null ? null : String(r.authority_id), authority: r.authority_name,
        supplierId: r.supplier_id === null ? null : String(r.supplier_id), supplier: r.supplier_name,
        county: r.county, cpvCode: r.cpv_code, cpvName: r.cpv_name, value: Number(r.closing_value), valueExact: r.closing_value,
        src: r.src, refId: r.ref_id === null ? null : String(r.ref_id), caNoticeId: r.ca_notice_id === null ? null : String(r.ca_notice_id), tedPubnum: r.ted_pubnum,
        estimatedValueRon: r.estimated_value_ron === null ? null : Number(r.estimated_value_ron), valueSuspect: Boolean(r.value_suspect),
        state: r.state, nWinners: r.n_winners === null ? null : Number(r.n_winners), contractValueFull: r.contract_value_full,
      })),
      total, value, sourceTotal, sourceValue, page: p, pageSize,
      accepted: { count: acceptedRows.reduce((n, r) => n + Number(r.n), 0), value: sumDecimalStrings(acceptedRows.map((r) => r.v)) },
      statuses: totals.map((r) => ({ state: r.state, count: Number(r.n), value: r.v })),
      dateFrom: totals.map((r) => r.date_from).filter((d): d is string => d !== null).sort()[0]?.slice(0, 10) ?? null,
      dateTo: totals.map((r) => r.date_to).filter((d): d is string => d !== null).sort().at(-1)?.slice(0, 10) ?? null,
      profile, profiles, profileCount, profileReconciled, scopeNotes: notes,
    };
  });
}

/**
 * Human-readable SQL for the "vezi interogarea (avansat)" toggle. Display-only —
 * execution always goes through the parameterized builder above.
 */
function buildDisplaySql(spec: AskSpec, w: PredicateCtx): string {
  const ds = spec.dataset ?? "all";
  const dtable =
    ds === "contracts"
      ? "marts.contract_transactions"
      : ds === "da"
        ? "marts.da_transactions"
        : "(marts.da_transactions ∪ marts.contract_transactions)  -- canale disjuncte";
  const conds = displayPredicates(w, dtable);
  const where = conds.join("\n  and ");
  const measure = spec.measure === "count" ? "count(*)" : "sum(closing_value)";
  const dim = spec.dim ?? "authority";
  const dimCol =
    dim === "county" ? "county" : dim === "authority" ? "authority_name" : "supplier_name";

  switch (spec.block) {
    case "stat":
      return `select ${measure}\nfrom ${dtable}\nwhere ${where};`;
    case "timeseries":
      return `select an, ${measure}\nfrom ${dtable}\nwhere ${where}\ngroup by an order by an;`;
    case "map":
      return `select county, ${measure}\nfrom ${dtable}\nwhere ${where}\ngroup by county;`;
    case "table": {
      const perCap = spec.measure === "value_per_capita";
      return (
        `select ${dimCol}, ${perCap ? "sum(closing_value) / populatie" : measure}\n` +
        `from ${dtable}${perCap ? "\njoin populatie_rpl2021 using (entity_id)  -- INS RPL 2021, doar primării (inclusiv de sector) și consilii județene identificate strict" : ""}\n` +
        `where ${where}\n` +
        `group by ${dimCol}\norder by 2 desc\nlimit ${spec.topN ?? `${TABLE_PAGE_SIZE} offset <pagină>`};`
      );
    }
    case "compare":
      return `select ${w.authorityId ? "authority_id" : "supplier_id"}, sum(closing_value), count(*)\nfrom ${dtable}\nwhere ${where}\ngroup by ${w.authorityId ? "authority_id" : "supplier_id"};\n-- + ani, domenii, parteneri comuni pe aceeași selecție\n-- + profilul de risc istoric: marts.entity_flags (toate achizițiile directe)`;
    case "distribution":
      return `select width_bucket(cri, 0, 1, 10) interval_risc, count(*)\nfrom marts.entity_flags\nwhere n_das >= ${RISK_MIN_DAS}\ngroup by 1;\n-- + poziția entității tale în distribuție`;
    case "breakdown":
      // The slices are always ordered by value: a count measure from another question is not applied here.
      return `select categoria_cpv, sum(closing_value)\nfrom ${dtable}\nwhere ${where}\ngroup by categoria_cpv\norder by 2 desc;`;
    case "scatter":
      return `select name_display, total_ron, cri, n_flags\nfrom marts.entity_flags\nwhere n_das >= ${RISK_MIN_DAS} and cri is not null;`;
    case "sankey":
      return `select partener, categoria_cpv, sum(closing_value)\nfrom ${dtable}\nwhere ${where}\ngroup by partener, categoria_cpv;`;
    case "network":
      return `select partener, sum(closing_value), count(*)\nfrom ${dtable}\nwhere ${where}\ngroup by partener\norder by 2 desc;`;
    case "entity_card":
      return `select *\nfrom marts.entity_flags\nwhere n_das >= ${ENTITY_CARD_MIN_DAS} ${w.kind ? `-- doar ${KIND_LABEL[w.kind]}` : ""}\norder by ${(spec.rankBy ?? "risk") === "risk" ? "cri" : "total_ron"} desc\nlimit 1;`;
    case "fact_check":
      return `select count(*), sum(closing_value)\nfrom ${dtable}\nwhere ${where};`;
    case "trend":
      return (
        `select ${dimCol},\n  sum(closing_value) filter (where an = ${w.yearFrom ?? "primul_an"}) inainte,\n` +
        `  sum(closing_value) filter (where an = ${w.yearTo ?? "ultimul_an"}) dupa\n` +
        `from ${dtable}\nwhere ${where}\ngroup by ${dimCol}\norder by abs(dupa - inainte) desc\nlimit ${spec.topN ?? 10};`
      );
  }
}

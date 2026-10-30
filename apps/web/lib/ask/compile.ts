import { canonicalAskIdentities } from "./canonical-identities";
import { retiredChoicesText } from "./retired-terms";
import { countWords } from "./answer-text";
import { FORCE_CUSTOM_PLANS } from "../plan-cache";
import type { DbSql } from "@seap/db";
import { LOCAL_ADMIN_KIND, namedKind, NEWER_VERSION_LINK, unimplementedSpecKeys, type AskSpec, type Dim, type MonthWindow, type TrendChange } from "./spec";
import type { Grounding } from "./ground";
import { EVIDENCE_CSV_LIMIT, PROFILE_BLOCKS, sumDecimalStrings, validateEvidenceScope, type EvidenceScope, type EvidenceStatus, type EvidenceProfile } from "./evidence";
import {
  andAll, asksWinners, DA_PLAFOND_RON, displayPredicates, employeesBounds, employeesCond, ENTITY_CARD_MIN_DAS, fold, fullValueUnion, groupPredicates, isEveryChange, newFirmCond, ownCountySql, perCapitaPredicate, plafondFor, predicateContext,
  profileCounty as profileCountyOf, profileMinDas, profilePredicates, RISK_MIN_DAS, rowPredicates, seatOf, trendGroupOf, trendGroupSql, trendYearsPredicate, winnersPredicates, type PredicateCtx, type TrendGroup,
} from "./predicates";
import { authorityKindIds, KIND_LABEL } from "./authority-kind";
import { monthsLabel, partialMonths, sameMonthsWindow, WHOLE_YEAR, type CoveragePeriods, type MonthsMode, type MonthsWindow } from "./months-window";
import { formatBucharestDay as frozenDay } from "../format";
import { TREND_CHANGE_LABELS } from "./filters/defs/trend";
import { countyIsFirmSeat, isHistoricalProfile, unsupportedPopulationView } from "./population";
import { firmCountyShown } from "./seat";
import { describeConditions, type ConditionLabels } from "./filters/describe";
import { employeesWords, NEW_FIRMS_LIST } from "./filters/words";
import { resolveWinners } from "./winners";
import { retarget } from "./filters/retarget";
import type { OriginHint } from "./filters/origin";
import { martsCounty, PER_CAPITA_SOURCE, perCapitaCaveat, POPULATION_CARD_NOTE, readPerCapitaPopulations, type PerCapitaPopulations } from "./per-capita";
import { localAdminMap, localMapSql, mapLocal, mapRollupFilters, mapRollupReady, type MapLocal } from "./map-facts";
import { asksSharedPartners, sharedPartnersPrestep } from "./compare-prestep";
import { generalCodes } from "./compare-shared";
import { martColumns } from "./mart-columns";
import {
  compareInstitutionParties, comparePairRows, comparePartnerPass, compareRecordPass, planRollup, rankedWithout, rollupBreakdown, rollupCountyTable, rollupMap, rollupMinimumCond,
  coverRefReady, daCodesPlain, daRecordCount, daYearKeyRange, kindRollupReady, monthRollupReady, pairIndexReady, profileRollupTotals, profileValueKeys, rollupDaysReady, valueKeysReady, yearKeysReady, rollupRows, rollupSourceTotals, rollupStat, rollupsReady, rollupTable, rollupTimeseries, rollupTrendGrouped, sameRoleExclusions, scatterDensity,
  type RollupFilters, type RollupNeed, type RollupSource,
} from "./rollups";
import {
  factsOfRow, factsSource, factsYears, liveTrendChannels, trendFactsRows, trendListOf, trendMembersFigures, trendNoun, trendPartition, trendProfiles,
  type TrendAttribute, type TrendComposition, type TrendList, type TrendMemberPart, type TrendNoun, type TrendPartitionRow, type TrendPartSources, type TrendRowFacts,
} from "./trend-partition";
import { TREND_LISTS, trendListSpec, trendPartLabel } from "./trend-shared";
import {
  entryMembers, entrySelection, groupSourceTotals, hasMember, memberList, rememberTrendGroups, trendCacheStamp, trendGroupEntry, trendGroupKey, trendGroupsFor, trendMemberPart,
  type SourceTotalsRow,
} from "./group-ids";
import { sectorUnit } from "../peer-population";
import { kindApplies, kindLeftOutNote } from "./purchase";
import { assembleSeries, type SeriesPart, type SeriesPoint, type SeriesRef, type SeriesRow } from "./series";
import { mixRollupReady, mixWhere, monthsWhere } from "./series-rollups";
import { networkLastYear, networkList, networkSince, networkSourcesNote } from "./network-shared";
import { networkAnswer, networkMembersCond, networkMembersList, sankeyAnswer, unknownSeatPartners, type NetworkWatch, type RelationQuery } from "./relations";
import type { NetworkData, NetworkGroup } from "./network-shared";
import type { SankeyData } from "./sankey-shared";
import { distributionData, distributionGroup } from "./distribution";
import type { PeerCoverage, PeerFacts, PeerRowId } from "./peer-groups-shared";
import { factCheckData } from "./fact-check";
import { SEARCH_FEW_RECORDS, searchCandidates, searchLists, searchWords } from "./source-search";
import { COMPETITION_PROCEDURES, type FactCheckData } from "./fact-check-shared";

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
export type { SeriesPart, SeriesPoint, SeriesRef } from "./series";
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
  /**
   * singleBid counts contracts with one bid among `bidsKnown`, those whose number of bids is published.
   * F4: `distinct`, an institution's distinct contracts among its records (a consortium has one record per winner).
   */
  streams?: { da: { value: number; count: number }; contracts: { value: number; count: number; singleBid: number | null; bidsKnown: number; distinct?: number } };
  /** Distinct counterparties: institutions for a firm, firms for an institution. */
  partners?: number;
  topPartners?: ComparePartner[];
  /** F4: `count`, the records of the year (a year's tap says both). */
  years?: { year: number; value: number; count?: number }[];
  /** Top 5-digit CPV groups by value (at most COMPARE_DOMAINS), out of `domainCount`. */
  domains?: { code: string; name: string | null; value: number }[];
  domainCount?: number;
  /** Selection value whose records have no CPV code. */
  noCpvValue?: number;
  active?: { from: number | null; to: number | null } | null;
  firm?: { employees: number | null; year: number | null; turnover: number | null } | null;
  // F4 (plan §4.6 P8, final compare §4): the cards' context rows; not compared by a watch (answer-core.ts).
  /** With a CPV domain: the value coded above it (its division, group, class…), "+ X lei pe coduri mai generale". */
  general?: number;
  /** An institution's suppliers by their seat against its county: "Sediul furnizorilor" (by value). */
  seats?: { same: number; other: number; abroad: number; unknown: number };
  /** The level of `population`: "Pe locuitor" only between two town halls or two county councils. */
  populationLevel?: "local" | "county";
  /** „Doar clienții comuni”: the firm's selection without P (the card's "59% din totalul firmei", "15 din 73"). */
  whole?: { value: number; count: number; partners: number };
  /** „Doar clienții comuni”: of this firm's value, what it won together with the other firm (same contracts). */
  joint?: { value: number; contracts: number };
}
/** A comparison lists each entity's CPV groups up to this many; the rest is one line. */
export const COMPARE_DOMAINS = 30;
/** A firm's value and contracts won together with the other, from its rows per institution (a contract has one buyer). */
const jointOf = (rows: readonly { value: string; n: number }[]): { value: number; contracts: number } =>
  ({ value: Number(sumDecimalStrings(rows.map((r) => r.value))), contracts: rows.reduce((sum, r) => sum + r.n, 0) });
export interface ComparePartner { entityId: string; name: string; value: number; count: number }
export interface CompareData {
  block: "compare";
  entities: CompareEntity[];
  /**
   * Counterparties of both, by combined value (at most 30 rows). F4, „Doar clienții comuni”: `joint`, each
   * firm's value at the institution from the contracts both won (hatched in its bar).
   */
  shared?: { total: number; rows: { entityId: string; name: string; a: { value: number; count: number; joint?: number }; b: { value: number; count: number; joint?: number } }[] };
  /** Firms only: public contracts both won (at most 5 rows). */
  joint?: { total: number; rows: { nid: string; authority: string | null; date: string | null; value: number }[] };
}
/** distribution-1 (before F6a): 10 CRI buckets and a percentile. Only in answers stored before distribution-2. */
export interface DistributionDataV1 {
  /** 10 CRI buckets [0,0.1) … [0.9,1]. */
  buckets: { from: number; to: number; n: number }[];
  focal: { entityId: string; name: string; cri: number | null; percentile: number | null };
  role: string;
  totalEntities: number;
}
/** A member of the group, listed up to PEER_LIST_LIMIT (final distribution §3.8). */
export interface DistributionMember { entityId: string; name: string; county: string | null; population: number | null; nFlags: number; flags: string[]; nDas: number }
/**
 * distribution-2 (F6a, plan §4.11, final distribution §3.6–§3.8): how many
 * criteria the entity meets against its group. The group is the other
 * profiles (≥ 10 accepted direct acquisitions) that the ticks select; the
 * entity is never one of its own others, so more + same + fewer = others.
 * `status`: "below" the entity has fewer than 10 (no position); "small" the
 * group has fewer than 5 others (no position, the ticks to remove); "ok".
 */
export interface DistributionData {
  version: 2;
  role: "authority" | "supplier";
  status: "ok" | "below" | "small";
  /** The criteria a role can meet, in their order (5 for institutions, 4 for firms). */
  criteria: string[];
  focal: { entityId: string; name: string; nFlags: number; cri: number | null; flags: string[]; nDas: number; county: string | null; population: number | null; inGroup: boolean };
  group: {
    /** The words after "față de" and the facts that name them (sentence.ts reads these). */
    words: string;
    facts: PeerFacts;
    ticks: PeerRowId[];
    /** An old link's conditions, applied (final §5). */
    legacy: { county?: string; authorityKind?: string };
    others: number;
    coverage?: PeerCoverage;
    populationVersion?: string;
    /** The members' ids when they are at most 50: a capture freezes the group it compared. */
    memberIds?: string[];
  };
  position?: { more: number; same: number; fewer: number };
  /** The others by number of criteria, 0…criteria.length. */
  hist?: { k: number; n: number }[];
  /** Each criterion: the others that meet it, and every profile of the role (the country's mark). */
  perCriterion?: { code: string; others: number; country: number }[];
  /** Profiles of the role with ≥ 10 accepted direct acquisitions, nationally. */
  countryTotal?: number;
  /** The others, when they are at most 50, by criteria then direct acquisitions. */
  members?: DistributionMember[];
  /** Two members with the same name (SICAP identities): the list says so. */
  sameNames?: true;
}
export interface BreakdownSlice {
  code: string;
  name: string | null;
  value: number;
  count: number;
}
/** A group of a breakdown's level (F3): its code, name, value and records, and its largest record with the channel. */
export interface BreakdownGroup extends BreakdownSlice { max?: number; maxSrc?: "da" | "contracts" }
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
export type { NetworkData } from "./network-shared";
export type { SankeyData, SankeyFlow } from "./sankey-shared";
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
/** fact_check-2 (plan §4.10): the verdict, the profile, the rows outside the sums (fact-check-shared.ts). */
export type { FactCheckData } from "./fact-check-shared";
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
  // group (F3, table:employees-2): a ranking of firms narrowed to a band of employees, the band's own totals; `totals`
  // stay the whole selection's („% din total”). Absent elsewhere, and from older answers.
  | { block: "table"; rows: TableRow[]; total?: number; page?: number; pageSize?: number; totals?: { value: number; count: number; entities: number }; group?: { value: number; count: number; entities: number } }
  | { block: "stat"; stat: StatValue }
  // F3 (plan §4.3): month by month, the split's parts, the same months it ran on and the marker of the
  // incomplete last year; absent on answers to questions without the options (older answers too).
  | { block: "timeseries"; series: SeriesPoint[]; grain?: "month"; parts?: SeriesPart[]; months?: MonthsWindow; ref?: SeriesRef }
  // unknown: records of the same selection whose authority has no county.
  // They are not on the map, but shares are of the whole selection (audit F13).
  // F5 (map final §3.3, §3.8): `local` on the map of the local administrations (the counties they administer, their
  // population, the councils the list lacks); absent elsewhere and from older answers. Not compared by a watch (answerCore).
  | { block: "map"; counties: CountyValue[]; unknown: { value: number; count: number }; local?: MapLocal }
  | CompareData
  | { block: "distribution"; distribution: DistributionData }
  // F3: every group of the level (base, with its largest record where known) and each channel's totals in the same
  // selection with every channel (streams); absent from older answers. Not compared by a watch (answerCore).
  | { block: "breakdown"; slices: BreakdownSlice[]; other: { value: number; count: number }; base?: BreakdownGroup[]; streams?: Record<"da" | "contracts", { value: number; count: number }> }
  | { block: "scatter"; points: ScatterPoint[]; density?: ScatterDensity | undefined }
  // sankey-2 and network-2 (F4, plan §4.8–§4.9): relations.ts. An answer stored before them (flows only, the
  // first 14 nodes) is read by ResultComparison as plain data.
  | SankeyData
  | NetworkData
  | { block: "entity_card"; card: EntityCardData }
  | { block: "fact_check"; fact: FactCheckData }
  // trend-2 (F2, plan §4.7): rowsTrend is the chosen group (today's shape; every change without trend options), beside
  // the first N of every group, the composition, the group noun and the facts of the shown rows (trend-partition.ts).
  // The optional fields are absent from answers stored before trend-2 (captures, watch runs).
  | {
    block: "trend"; rowsTrend: TrendRow[]; yearA: number; yearB: number; change?: TrendChange; months?: MonthsWindow;
    /** The list rowsTrend is (the change, or "first" with firstOnly). */
    list?: TrendList; groups?: Partial<Record<TrendList, TrendRow[]>>; composition?: TrendComposition; noun?: TrendNoun;
    /** By entity id, for the rows of every list; none on counties. Not compared by a watch (answerCore). */
    rowFacts?: Record<string, TrendRowFacts>;
    /** A watch on a group (TableOpts.fixedMembers): the answer is its fixed members', not the live group's. */
    members?: TrendFrozenGroup;
    /** A trend of firms with an employees band: per list, the firms left out without a filing. Not compared by a watch. */
    withoutFiling?: Partial<Record<TrendList, number>>;
  };

/**
 * 2018 on a trend (trend final §3.2, decision F2 "2018 scos doar din trend"):
 * partialYears marks the direct acquisitions from 2 April, not the contracts,
 * whose archive is dated from 2000 but holds half the contracts of 2019
 * (59,967 against 129,947 on the local copy). The direct acquisitions have
 * partialYears' own note (on "all" too, beside this one), never repeated here.
 */
export const TREND_2018_NOTE: Record<"all" | "da" | "contracts", string | null> = {
  all: "Și contractele din 2018 sunt jumătate din cele din 2019.",
  contracts: "2018 e incomplet: contractele din 2018 sunt jumătate din cele din 2019.",
  da: null,
};

/**
 * A trend's statements (its answer and its sources) run without JIT: the cost
 * of a live national grouping (a CPV, the same months) passes the JIT
 * thresholds, and compiling it took 1–1.4 s of 3.3–3.6 s, more than it saved
 * (local, production settings: medicines 2024 → 2025 3.6 → 2.5 s, growths
 * Jan–May 3.6 → 2.4 s, a group's sources 1.0 → 0.4 s; the rollup answers unchanged).
 */
export const TREND_NO_JIT = "set local jit = off";

/** The months a trend's answer counted and the data checkpoint it read them at; its sources send them back (runRows `months`). */
export interface ExecutedWindow { months: MonthWindow; mode: MonthsMode; checkpoint: string | null }
const monthsOf = (window: MonthsWindow | null): MonthsWindow => window ? { from: window.from, to: window.to, mode: window.mode } : { ...WHOLE_YEAR };
/** The answer's window is no longer the one the data gives (a new checkpoint moved `auto`): its sources would list other records. */
export const DATA_CHANGED = "Datele s-au actualizat; reîncarcă răspunsul.";

/**
 * A watch on a trend's group (plan §2.8, F2), or on a network's (the centre's
 * partners of one group, S5): the members fixed when it was activated (entity
 * ids already followed through core.entity_redirects, or county names). Its
 * answer and its sources are those of the same members at every check, never
 * of the live group. Server-only (TableOpts.fixedMembers,
 * DrillOpts.fixedMembers): no request carries it.
 */
export interface TrendFixedMembers { role: "supplier" | "authority" | "county"; ids: readonly string[]; frozen: number; frozenAt: string }
/** What an answer computed on fixed members says it is: the list, how many were fixed and when. The same at every check. */
export interface TrendFrozenGroup { list: TrendList; frozen: number; frozenAt: string }
/**
 * Where the fixed members stand in the live group, for the watch's note only
 * ("3 firme au intrat în grupă, 1 a ieșit"): never in `data`, so the movement
 * of other entities never changes the watched result.
 */
export interface TrendGroupMovement { part: TrendMemberPart | NetworkGroup; members: number; stayed: number; live: number }
/** A group watch whose question no longer lists that group (another role or change): never run on another group. */
export const FIXED_GROUP_MISMATCH = "Grupa fixată nu corespunde întrebării. Creează o urmărire nouă pentru această grupă.";

export interface EngineResult {
  data: BlockData;
  displaySql: string;
  caveats: string[];
  tookMs: number;
  /** timeseries/trend: years the archive covers only in part (audit F19). */
  partialYears?: PartialYear[];
  /**
   * The SQL shown for each display state the strip switches on the data
   * already fetched (plan §2.3 variants): the map's lens, value or records.
   */
  displaySqlByMeasure?: Partial<Record<"value" | "count" | "value_per_capita", string>>;
  /** trend: the SQL shown for each list of the answer (the group buttons switch on the data already fetched). */
  displaySqlByList?: Partial<Record<TrendList, string>>;
  /** trend with `trend.months`: the window `auto` resolved to (plan §2.8); the spec keeps `auto`. */
  executed?: ExecutedWindow;
  /** trend with TableOpts.freezeGroup: every member of the chosen group (ids ascending, or county names), for a watch to fix. */
  groupMembers?: string[];
  /** trend with TableOpts.fixedMembers: where the fixed members stand in the live group (the watch's note). */
  movement?: TrendGroupMovement;
  /**
   * F4: false when a firm's county was its SEAP county, the seat column not filled yet (mart-columns.ts): the answer
   * is computed as before seat-2, so it carries no seat version (answer-core.ts answerVersion).
   */
  seatColumn?: false;
  /**
   * D2: "primăria X" (uatSiruta) took identities the rule of before D2 left out (ground.ts UatGrounding.joined): the
   * answer carries uat-2 (answer-core.ts answerVersion), so a watch on that town hall hears of the union once.
   */
  uatJoined?: true;
}

// Audit F15: the locality filter is the UAT's own administration, strictly
// associated (localAuthorityIdsForUnit) — never every institution in the UAT.
const UAT_SCOPE_METHOD =
  "Asocierea autoritate–UAT este o inferență a aplicației (cod SIRUTA din același județ, ori fără județ cu un nume unic în țară, sau nume și județ identice; CUI valid); asocierile din alt județ sau nesigure sunt excluse.";
const BUCURESTI_SIRUTA = 179132;
export function uatScopeCaveat(label: string, n: number, siruta?: number): string {
  const sector = siruta !== undefined && sectorUnit(siruta) !== undefined;
  const who = sector
    ? n === 1 ? "doar primăria sectorului" : `cele ${countWords(n, "identitate înregistrată", "identități înregistrate")} ale primăriei sectorului`
    : n === 1
    ? "doar administrația locală a UAT-ului (primăria / consiliul local)"
    : `cele ${countWords(n, "identitate înregistrată", "identități înregistrate")} ale administrației locale a UAT-ului (primăria / consiliul local)`;
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
    ? "Județul = sediul firmei, nu al instituțiilor care cumpără. Firmele fără sediu cunoscut nu intră."
    : "Județul = sediul instituției care cumpără, nu al firmei (din adresă, cod NUTS, ONRC sau UAT verificat). Instituțiile fără județ cunoscut nu intră.";
}

/**
 * Where a firm's county comes from (owner-seat-switch, F4): the methodology
 * note of every answer that shows a firm's own county or selects firms by
 * their seat (seat.ts firmCountyShown). `filled`: the seat column of the marts
 * build (mart-columns.ts); before it, the SEAP county stands in, and says so.
 */
export function seatNote(filled: boolean): string {
  return filled
    ? "Județul firmei = sediul ei: ultima înmatriculare la Registrul Comerțului, apoi județul din SEAP; firmele străine apar separat. Nu e locul lucrării."
    : "Județul firmei = județul din SEAP; sediul din Registrul Comerțului nu e încă calculat. Nu e locul lucrării.";
}

/** A relationship view with no partner rows: on every stream, not only direct acquisitions. */
/** F5: „Înmatriculate” before a marts build has filled the register year (mart-columns.ts registeredYear). */
export const REGISTERED_YEAR_MISSING = "Anul înmatriculării nu e încă în date. Alege „Prima dată” sau revino după actualizarea de noapte.";

export function emptyRelationError(focalName: string): string {
  return `„${focalName}” nu are înregistrări în selecția aleasă.`;
}

/** A reference year the archive has not completed on every channel (network final §3.2: no 2026 while it runs). */
export function networkSinceError(since: number, last: number): string {
  return `Anul ${since} nu e încheiat în date. Alege ${last} sau un an mai vechi.`;
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

export type { ChannelPeriod, CoveragePeriods } from "./months-window";
/** A year (or the selected months of it) that the archive covers only in part,
 * or whose contracts are provisional (audit F10). */
export interface PartialYear { year: number; note: string; provisional?: true }
let periodCache: { periods: CoveragePeriods | null; checkpoint: string | null; at: number } | undefined;
/**
 * Archive period per channel, or null when the inventory has not been
 * calculated: the one coverage source of the engine, the trend's window and
 * default years (months-window.ts) and /api/data-coverage (plan §2.8). The
 * cache (10 minutes per process) is keyed on the data checkpoint, so a
 * published refresh is read at once by every process.
 */
export async function coveragePeriods(sql: DbSql): Promise<CoveragePeriods | null> {
  const fresh = snapshotCoverageConnections.has(sql);
  // Additive deployment: probe first, so a missing table cannot abort a caller's transaction.
  const [table] = (await sql`
    select to_regclass('marts.data_coverage') is not null ok, to_regclass('app.monitoring_refreshes') is not null refreshes
  `) as unknown as { ok: boolean; refreshes?: boolean }[];
  const [ready] = table?.refreshes
    ? (await sql`select id::text id from app.monitoring_refreshes where status = 'ready' order by version desc limit 1`) as unknown as { id: string }[]
    : [];
  const checkpoint = ready?.id ?? null;
  if (!fresh && periodCache && periodCache.checkpoint === checkpoint && Date.now() - periodCache.at < 600_000) return periodCache.periods;
  let periods: CoveragePeriods | null = null;
  if (table?.ok) {
    const rows = (await sql`
      select dataset, observation->>'date_from' date_from, observation->>'date_to' date_to,
        observation->>'complete_until' complete_until
      from marts.data_coverage where dataset in ('da', 'contracts')
    `) as unknown as { dataset: "da" | "contracts"; date_from: string | null; date_to: string | null; complete_until?: string | null }[];
    const da = rows.find((r) => r.dataset === "da"), contracts = rows.find((r) => r.dataset === "contracts");
    // Both channels' "complet până la" day: the trend's same months need the earlier one (sameMonthsWindow).
    if (da && contracts) periods = {
      da: { from: da.date_from, to: da.date_to, completeUntil: da.complete_until ?? null },
      contracts: { from: contracts.date_from, to: contracts.date_to, completeUntil: contracts.complete_until ?? null },
      checkpoint,
    };
  }
  if (!fresh) periodCache = { periods, checkpoint, at: Date.now() };
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
 * `contract_value_full` is the size of the whole purchase (F3,
 * purchaseValueConds): null on a direct acquisition, whose own value it is.
 */
function txFragment(sql: DbSql, dataset: "all" | "da" | "contracts") {
  if (dataset === "contracts") return sql`marts.contract_transactions`;
  if (dataset === "da") return sql`marts.da_transactions`;
  return sql`(
    select authority_id, authority_name, supplier_id, supplier_name, county,
           cpv_code, cpv_name, closing_value, finalization_date,
           da_code, sicap_da_id as ref_id, null::bigint as ca_notice_id,
           null::text as ted_pubnum, null::boolean as is_single_bidder,
           'da'::text as src, estimated_value_ron, value_suspect, null::numeric as contract_value_full
    from marts.da_transactions
    union all
    select authority_id, authority_name, supplier_id, supplier_name, county,
           cpv_code, cpv_name, closing_value, finalization_date,
           contract_no, contract_id, ca_notice_id,
           ted_pubnum, is_single_bidder,
           'contracts'::text, null::numeric, false, contract_value_full
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
 * groups by entity or a kind filter matches on authority_name; `full` the
 * size of the whole purchase, only when a question asks for it (F3,
 * fullValueUnion: plan §4.1, "a third variant").
 */
export function txAggFragment(sql: DbSql, dataset: "all" | "da" | "contracts", withNames: boolean, full = false) {
  if (dataset === "contracts") return sql`marts.contract_transactions`;
  if (dataset === "da") return sql`marts.da_transactions`;
  const fullDa = full ? sql`, null::numeric as contract_value_full` : sql``;
  const fullContracts = full ? sql`, contract_value_full` : sql``;
  if (withNames)
    return sql`(
    select authority_id, authority_name, supplier_id, supplier_name, county,
           cpv_code, closing_value, finalization_date,
           null::boolean as is_single_bidder, 'da'::text as src${fullDa}
    from marts.da_transactions
    union all
    select authority_id, authority_name, supplier_id, supplier_name, county,
           cpv_code, closing_value, finalization_date, is_single_bidder, 'contracts'::text${fullContracts}
    from marts.contract_transactions
  )`;
  return sql`(
    select authority_id, supplier_id, county, cpv_code, closing_value,
           finalization_date, null::boolean as is_single_bidder, 'da'::text as src${fullDa}
    from marts.da_transactions
    union all
    select authority_id, supplier_id, county, cpv_code, closing_value,
           finalization_date, is_single_bidder, 'contracts'::text${fullContracts}
    from marts.contract_transactions
  )`;
}

/** Look up CPV names for a set of tree-node codes (2- or 4-digit stems; the comparison's 5-digit groups). */
export async function cpvNamesFor(
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

/** A row of a ranking of firms narrowed to a band (F3): the selection's totals (tv, tn, te) and the band's (gv, gn, ge). */
interface BandRow { id: string; nm: string; co: string | null; v: string; n: string; tv: string; tn: string; te: string; gv: string; gn: string; ge: string }
/** The totals of such a ranking: the whole selection's (`totals`: „% din total”) and the band's (`group`: the list). */
function bandTotals(first: BandRow | undefined): { totals?: RankingTotalsData; group?: RankingTotalsData } {
  return first ? {
    totals: { value: Number(first.tv), count: Number(first.tn), entities: Number(first.te) },
    group: { value: Number(first.gv), count: Number(first.gn), entities: Number(first.ge) },
  } : {};
}
type RankingTotalsData = { value: number; count: number; entities: number };

/** A breakdown answer keeps at most this many groups of its level (`base`, F3): the kinds row, the order by records, the tags. */
export const BREAKDOWN_BASE = 400;

/** A breakdown's live rows by stem and channel, as the stem rows of the live query (value first, then the stem; exact sums). */
function breakdownStems(rows: readonly { stem: string; v: string; n: string }[]): { stem: string; v: string; n: string }[] {
  const by = new Map<string, { v: string[]; n: number }>();
  for (const row of rows) { const at = by.get(row.stem) ?? { v: [], n: 0 }; at.v.push(row.v); at.n += Number(row.n); by.set(row.stem, at); }
  return [...by.entries()].map(([stem, at]) => ({ stem, v: sumDecimalStrings(at.v), n: String(at.n) }))
    .sort((a, b) => Number(b.v) - Number(a.v) || (a.stem < b.stem ? -1 : a.stem > b.stem ? 1 : 0));
}
/** Each channel's value and records over rows by channel: a breakdown's strip shares (F3, final breakdown §3.6). */
function channelTotals(rows: readonly { src: string; v: string; n: string }[]): Record<"da" | "contracts", { value: number; count: number }> {
  const by = new Map<string, { v: string[]; n: number }>();
  for (const row of rows) { const at = by.get(row.src) ?? { v: [], n: 0 }; at.v.push(row.v); at.n += Number(row.n); by.set(row.src, at); }
  const totals = { da: { value: 0, count: 0 }, contracts: { value: 0, count: 0 } };
  for (const src of ["da", "contracts"] as const) { const at = by.get(src); if (at) totals[src] = { value: Number(sumDecimalStrings(at.v)), count: at.n }; }
  return totals;
}
/** The largest record of each group and its channel (the „1 contract: 99%” tag, final breakdown §3.10). */
function largestOf(rows: readonly { stem: string; src: "da" | "contracts"; mx: string | null }[]): Map<string, { max: number; maxSrc: "da" | "contracts" }> {
  const out = new Map<string, { max: number; maxSrc: "da" | "contracts" }>();
  for (const row of rows) {
    const max = Number(row.mx ?? 0), at = out.get(row.stem);
    if (!at || max > at.max) out.set(row.stem, { max, maxSrc: row.src });
  }
  return out;
}

/** Paged clasament (table block WITHOUT an explicit topN): 10 rows/page. */
export const TABLE_PAGE_SIZE = 10;
export const TABLE_SORTS = ["name", "county", "value", "count", "percap"] as const;
export type TableSort = (typeof TABLE_SORTS)[number];
export interface TableOpts {
  page?: number;
  sort?: TableSort;
  dir?: "asc" | "desc";
  /** Server-only, a watch on a trend's group: the answer is computed on these members (TrendFixedMembers). */
  fixedMembers?: TrendFixedMembers;
  /** Server-only, a watch being activated on a trend's group: return its members (EngineResult.groupMembers). */
  freezeGroup?: boolean;
  /**
   * Server-only, part=network (network-facts.ts): a network's whole relation even where „Toți” on one channel or in a
   * period is answered from the records it bounds (relations.ts boundedNetwork).
   */
  networkWhole?: boolean;
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
  // A trend's same months read agg_entity_month, a kind or a size per entity agg_entity_kind_year, once a build has made them.
  const kinds = ctx.purchaseKind !== null || ctx.purchaseValueMin !== null || ctx.purchaseValueMax !== null ? await kindRollupReady(sql) : false;
  const plan = planRollup(ctx, need, { months: ctx.trendMonths ? await monthRollupReady(sql) : false, kinds });
  return "source" in plan ? plan : null;
}

/**
 * D2 (owner-D2-rollups): the per-inhabitant ranking groups its institutions on agg_entity_year when the planner answers
 * the selection there (the institutions' own rollup: years, channel, buyer county, kind, exclusions, a threshold on
 * institutions). Live it groups the union over the strict list's ids: 2,1 s nationally, 1,7 s on 2025, 1,4 s on one
 * county, 3,4 s with 50 records (warm, local, 30 Oct 2026). The same sums, counts, names and counties
 * (rollups.integration.test.ts); any other selection stays live.
 */
async function perCapitaPlanFor(sql: DbSql, spec: AskSpec, ctx: PredicateCtx): Promise<{ source: RollupSource; filters: RollupFilters } | null> {
  if (spec.block !== "table" || spec.measure !== "value_per_capita" || spec.dim !== "authority" || !(await rollupsReady(sql))) return null;
  const plan = planRollup(ctx, { by: "authority" });
  return "source" in plan && plan.source.table === "entity" ? plan : null;
}

/**
 * A trend's grouped input for trendPartition: per entity (or county) the sums
 * of the two years and each channel's records, value and days, from the
 * rollup the planner picked or from the live grouping of the slim union
 * (names and counties come from the profiles after). The answer and its
 * sources' drawer (a group missing from group-ids.ts) group the same way.
 * `members` (a watch's fixed group) groups only those, live on the id index
 * of their two years: a few thousand ids, never a pass over the rollups.
 */
function trendGroupedInput(s: DbSql, o: {
  rollup: { source: RollupSource; filters: RollupFilters } | null; days: boolean; ctx: PredicateCtx;
  dataset: "all" | "da" | "contracts"; dim: Dim; yearA: number; yearB: number; members?: readonly string[];
}): ReturnType<DbSql> {
  const rolled = o.rollup && !o.members ? rollupTrendGrouped(s, o.rollup, { dim: o.dim, yearA: o.yearA, yearB: o.yearB, days: o.days }) : null;
  if (rolled && "grouped" in rolled) return rolled.grouped;
  const key: ReturnType<DbSql> = o.dim === "county" ? s`d.county` : o.dim === "authority" ? s`d.authority_id` : s`d.supplier_id`;
  const va: ReturnType<DbSql> = s`coalesce(sum(d.closing_value) filter (where substr(d.finalization_date,1,4) = ${String(o.yearA)}), 0)`;
  const vb: ReturnType<DbSql> = s`coalesce(sum(d.closing_value) filter (where substr(d.finalization_date,1,4) = ${String(o.yearB)}), 0)`;
  const fixed: ReturnType<DbSql>[] = !o.members ? [] : o.dim === "county" ? [s`d.county = any(${s.array([...o.members])}::text[])`] : [
    s`${key} = any(${s.array([...o.members])}::bigint[])`,
    s`d.finalization_date >= ${String(Math.min(o.yearA, o.yearB))} and d.finalization_date < ${String(Math.max(o.yearA, o.yearB) + 1)}`,
  ];
  // The buyer's kind on its ids (D1, authority_id): the slim union, no names, on the id indexes.
  const selection = andAll(s, [...rowPredicates(o.ctx, { years: false }), trendYearsPredicate(s, o.yearA, o.yearB, o.ctx.trendMonths), ...fixed]);
  return s`
    select ${key} id, ${va} va, ${vb} vb, ${liveTrendChannels(s, o.dataset)}
    from ${txAggFragment(s, o.dataset, false, fullValueUnion(o.ctx))} d
    where ${selection} and ${key} is not null
    group by ${key}
  `;
}

/**
 * A trend's grouping with the firms' employees as an attribute of the grouped
 * firm, not a selection of its records (plan §4.7 P3a, under trend-2; trend
 * final §3.10): on a trend of firms the grouping counts every firm of the
 * selection, and the partition keeps the firms of the band (the same lists
 * and composition as the selection gave) and counts per group those left out
 * without a filing, and the selection they are part of. Elsewhere (the firms
 * of a trend of institutions or counties are the other side) and on a watch's
 * fixed members, the employees stay a selection of the records.
 */
function trendGrouping(s: DbSql, o: Parameters<typeof trendGroupedInput>[1]): { grouped: ReturnType<DbSql>; attribute: TrendAttribute | null } {
  const { ctx } = o;
  if (o.dim !== "supplier" || o.members || (ctx.minEmployees === null && ctx.maxEmployees === null))
    return { grouped: trendGroupedInput(s, o), attribute: null };
  const every: PredicateCtx = { ...ctx, minEmployees: null, maxEmployees: null };
  const rollup = o.rollup ? { ...o.rollup, filters: { ...o.rollup.filters, employees: null } } : null;
  return {
    grouped: trendGroupedInput(s, { ...o, ctx: every, rollup }),
    attribute: {
      keep: employeesCond(s, ctx.minEmployees, ctx.maxEmployees, s`k.id`),
      filed: s`k.id in (select ep.entity_id from marts.entity_profile ep where ep.role = 'supplier' and ep.employees is not null)`,
    },
  };
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
  if (dataset === "contracts") {
    caveats.push(
      "Sursă: DOAR contractele din proceduri. Valoarea unui contract câștigat în asociere e împărțită egal între firme. " +
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
      "„O singură ofertă”: numărul de oferte e cunoscut doar pentru contractele regăsite și în TED (confirmate). Contractele fără date de competiție NU apar aici — necunoscut nu înseamnă competitiv.",
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
  // F3: a kind the domain has no codes of is left out, said here and in the spec returned (resolvedSpec).
  if (spec.filters.purchaseKind && !kindApplies(spec.filters.purchaseKind, grounding))
    caveats.push(kindLeftOutNote(spec.filters.purchaseKind, grounding.cpv?.term ?? spec.filters.cpvTerm));
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
  if (spec.filters.seatCounty && !grounding.seatCounty?.canonical)
    return { error: `Nu recunosc județul „${spec.filters.seatCounty}”.`, caveats };
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

  // trend: the months both years count (months-window.ts), resolved at this
  // checkpoint before the first query. The spec keeps `auto`; the answer
  // returns the window it executed (`executed`), which its sources send back.
  let trendWindow: (MonthsWindow & { checkpoint: string | null }) | null = null;
  if (spec.block === "trend" && spec.trend?.months !== undefined) {
    const periods = await coveragePeriods(sql);
    const window = sameMonthsWindow(periods, dataset, yearTo ?? maxY, spec.trend.months);
    if ("error" in window) return { error: window.error, caveats };
    trendWindow = { ...window, checkpoint: periods?.checkpoint ?? null };
    if (partialMonths(window)) caveats.push(`Ambii ani se compară pe aceleași luni: ${monthsLabel(window)}.`);
  }
  // timeseries (F3, final timeseries §3.9): „Aceleași luni” cuts every year to the months complete in the
  // last one, resolved as the trend's (`auto` stays in the spec, the answer returns the window it ran).
  // Without it, a last year known incomplete gets the marker: the year before on the same months.
  let seriesWindow: (MonthsWindow & { checkpoint: string | null }) | null = null;
  let seriesRef: { year: number; to: number } | null = null;
  if (spec.block === "timeseries") {
    const last = yearTo ?? maxY, months = spec.timeseries?.months;
    const periods = months !== undefined || !spec.timeseries?.grain ? await coveragePeriods(sql) : null;
    if (months !== undefined) {
      const window = sameMonthsWindow(periods, dataset, last, months);
      if ("error" in window) return { error: window.error, caveats };
      seriesWindow = { ...window, checkpoint: periods?.checkpoint ?? null };
      if (partialMonths(window)) caveats.push(`Fiecare an e numărat pe aceleași luni: ${monthsLabel(window)}.`);
    } else if (!spec.timeseries?.grain && periods) {
      const cut = sameMonthsWindow(periods, dataset, last, "auto");
      // Two months at least: one month is no comparison (final §3.9); 2018 is no reference (DAs from April).
      if (!("error" in cut) && cut.to >= 2 && cut.to < 12 && last - 1 > 2018) seriesRef = { year: last, to: cut.to };
    }
  }

  // network (F4, final network §3.2): the year its groups are counted from, at most the last year every channel
  // has complete (a group from an incomplete year would count as gone the partners of its missing months).
  let networkReference: number | null = null, networkComplete: number | null = null;
  if (spec.block === "network") {
    const last = networkComplete = networkLastYear(await coveragePeriods(sql), maxY);
    networkReference = networkSince(spec, last);
    if (networkReference > last) return { error: networkSinceError(networkReference, last), caveats };
  }

  // Every condition of the question, written by lib/ask/predicates.ts for the
  // answer, its sources, the CSV, the captures and the displayed SQL alike.
  // The kind of institution is a list of ids, read once per marts build (authority-kind.ts, D1).
  const kindIds = await authorityKindIds(sql, spec.filters.authorityKind);
  // The optional mart columns (mart-columns.ts, probed once per process with the pool): the firm's seat (F4) and the
  // scatter's density layer. Before the seat column is filled, a firm's county is its SEAP county, said in the note.
  const columns = await martColumns(sql);
  const seat = columns.seat;
  if (firmCountyShown(spec)) caveats.push(seatNote(seat));
  const w: PredicateCtx = predicateContext(sql, spec, grounding, {
    dataset, yearFrom, yearTo, kindIds, trendMonths: partialMonths(trendWindow), seriesMonths: partialMonths(seriesWindow), seat,
  });
  const { authorityId, supplierId } = w;
  const compareId = w.comparison?.compareId ?? null;
  if (w.minEmployees !== null || w.maxEmployees !== null) {
    caveats.push(
      "Filtrul pe angajați folosește ultimul bilanț depus la Ministerul Finanțelor. " +
        "Furnizorii fără bilanț (PFA-uri, firme din străinătate, firme radiate) sunt excluși din rezultat.",
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
        error: `${grounding.admin.display ?? "Persoana"} reprezintă ${countWords(grounding.admin.nFirms, "firmă", "firme")}, dar niciuna nu apare ca furnizor în datele noastre.`,
        caveats,
      };
    }
    caveats.push(
      "Filtrul «conduse azi de» folosește reprezentanții legali din Registrul Comerțului (instantaneu lunar): " +
        "administratorul de AZI, nu neapărat cel de la momentul achiziției; administratorii nu sunt neapărat asociații/proprietarii.",
    );
    if (grounding.admin.nFirms > grounding.admin.supplierIds.length) {
      const n = grounding.admin.supplierIds.length;
      caveats.push(
        `${grounding.admin.display ?? "Persoana"} reprezintă ${countWords(grounding.admin.nFirms, "firmă", "firme")} la Registrul Comerțului; ` +
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

  // F3 (plan §4.2, table:employees-2): the employees of a ranking of firms are its row CÂȘTIGĂTORII, a
  // condition on the ranked firm after grouping (rankedBand): the list narrows to the band, the total and
  // „% din total” stay the whole selection's (wSel: the conditions of the records, without the band).
  // "Cine conduce?" by value runs this ranking with topN 1: its place 1 is the same firm.
  const firmsRanked = spec.block === "table" && spec.dim === "supplier";
  const rankedBand = firmsRanked && (w.minEmployees !== null || w.maxEmployees !== null)
    ? { min: w.minEmployees, max: w.maxEmployees } : null;
  // F5 (plan §4.2 P3a, final table §3.3–§3.7): the ranked winners narrow the list the same way: on firms „Firme noi”
  // (any sense) and „Principalul lor client public”, on institutions „O firmă ia peste jumătate” (winners.ts). On a
  // ranking of institutions or counties a firm's own year stays a selection of its records („de la [firme …]”).
  const rankedNew = firmsRanked ? w.newFirms : null;
  const rankedMain = firmsRanked && w.mainClient;
  const rankedDominant = spec.block === "table" && spec.dim === "authority" && w.dominantSupplier;
  const ranked = Boolean(rankedBand || rankedNew || rankedMain || rankedDominant);
  const wSel: PredicateCtx = ranked ? {
    ...w, winners: null,
    ...(rankedBand ? { minEmployees: null, maxEmployees: null } : {}),
    ...(firmsRanked ? { newFirms: null, mainClient: false } : {}),
    ...(rankedDominant ? { dominantSupplier: false } : {}),
  } : w;
  // „Înmatriculate” reads the register year the marts build fills (mart-columns.ts); before it, no firm has one.
  if (w.newFirms?.scope === "registry" && !columns.registeredYear) return { error: REGISTERED_YEAR_MISSING, caveats };

  // --- WHERE fragment over the transaction mart (da_/contract_, all parameterized):
  // the record conditions, then the record threshold counted over the same rows.
  const whereFrag = (opts?: { years?: boolean }): ReturnType<DbSql> => {
    const base = andAll(sql, rowPredicates(wSel, opts));
    return andAll(sql, [base, ...groupPredicates(wSel, txAggFragment(sql, dataset, false, fullValueUnion(wSel)) as unknown as ReturnType<DbSql>, base)]);
  };

  // aggregate fragments (see txAggFragment): slim (the kind is a list of
  // authority ids, D1); the named variant serves entity-grouped blocks
  const txtAggNames = txAggFragment(sql, dataset, true, fullValueUnion(w));
  const txtAgg = txAggFragment(sql, dataset, false, fullValueUnion(w));
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
  // Every condition of the records; the firms' size is an attribute of the firm (entityAttr, plan §2.5), apart.
  // Every condition of the records but a precise selection (population).
  const noKeyCondition =
    !w.county && w.cpvPrefixes.length === 0 && !w.kind &&
    !w.authorityId && !w.supplierId && w.uatSiruta === null &&
    !w.singleBidder && w.adminSupplierIds === null &&
    !w.purchaseKind && !w.procedure && w.purchaseValueMin === null && w.purchaseValueMax === null &&
    !w.firmSeat && !w.seatCounty &&
    w.yearFrom === null && w.yearTo === null &&
    w.monthFrom === null && w.monthTo === null && !w.seriesMonths && !spec.minimumRecords;
  const noRecordCondition = noKeyCondition && (!spec.population || nationalDaBound);
  // F5: the ranked winners narrow a ranking (keep below); none is answered by the bare national marts.
  const noWinners = !w.newFirms && !w.mainClient && !w.dominantSupplier;
  const unfiltered = noRecordCondition && w.minEmployees === null && w.maxEmployees === null && noWinners;
  // The other rollups combine both streams; agg_national retains src and can
  // also serve filter-free DA-only and contract-only totals without a scan.
  const bare = dataset === "all" && unfiltered;
  // The firms' size alone, over every year and both streams (plan §2.5, "calea rapidă pe atribute"):
  // a ranking of firms reads their own profiles, whose total_ron_split and n_das + n_contracts are each
  // firm's sum and count over the same records (0 differences on 163,158 firms, 26 Oct 2026; the
  // nightly validation checks the totals, apps/ingestion monitoring/validate.ts).
  // F5: so does a firm's own year, in the archive or the register (entity_profile.first_activity, registered_year).
  const firmSizeOnly = dataset === "all" && noRecordCondition && !spec.population && !unfiltered
    && !w.mainClient && !w.dominantSupplier && w.newFirms?.scope !== "buyer";
  // "Scoate din calcul" on the national ranking (plan §2.5, F4): entities of the ranked role left out and no
  // other condition, over every year and both streams. The precomputed ranking without their rows, the national
  // totals less their own sums (rankedWithout): any entity of the role, not only those of agg_top_entities.
  const rankedOut = spec.block === "table" && (spec.dim === "authority" || spec.dim === "supplier") && dataset === "all"
    && noKeyCondition && w.minEmployees === null && w.maxEmployees === null && noWinners ? sameRoleExclusions(spec.population, spec.dim) : null;
  const aggV = w.plafond === "none" && !nationalDaBound ? sql`v_all` : sql`v_plaf`;
  const aggN = w.plafond === "none" && !nationalDaBound ? sql`n_all` : sql`n_plaf`;

  // --- WHERE fragment over marts.entity_flags (risk-centric blocks)
  const efWhere = (role: "authority" | "supplier", minDas: number) => andAll(sql, profilePredicates(w, role, minDas));
  // The county beside a profile: an institution's own; a firm's seat, from its profile row (owner-seat-switch).
  const profileCounty = (s: DbSql, role: string) => profileCountyOf(s, role === "supplier" ? "supplier" : "authority", seat);

  /**
   * A breakdown on every channel (F3, final breakdown §3.6): the strip's shares are each channel's value and records in
   * the same selection with every channel, which a question on one channel reads from the same pass as its slices
   * (agg_months, or agg_cpv_year by channel); answered live, one channel reads that channel only and the strip keeps
   * the shares of the same question on every channel (AskPanel), as the flow's (S4 review: SELGROS on „Proceduri”
   * 4 → 65 ms with a second live grouping of every channel). None where the question keeps one channel (a procedure,
   * the single bidder: the strip's other options are disabled).
   */
  const breakdownShares = !spec.filters.procedure && !spec.filters.singleBidder;
  const breakdownEvery = (): PredicateCtx => dataset === "all" ? w
    : predicateContext(sql, { ...spec, dataset: "all" }, grounding, { dataset: "all", yearFrom, yearTo, kindIds, seat });

  // The band of a ranking of firms is applied after grouping (rankedBand): said under the ranking's text.
  const listWords = [
    ...(rankedBand ? [`doar firmele ${employeesWords(rankedBand.min ?? undefined, rankedBand.max ?? undefined)} (ultimul bilanț MF)`] : []),
    ...(rankedNew ? [`doar ${NEW_FIRMS_LIST[rankedNew.scope]} din ${rankedNew.since}`] : []),
    ...(rankedMain ? ["doar firmele al căror principal client public e instituția aleasă (cel puțin jumătate din valoare, toată arhiva)"] : []),
    ...(rankedDominant ? ["doar instituțiile la care cea mai mare firmă are cel puțin jumătate din valoare, din cel puțin 3 înregistrări"] : []),
  ];
  const displaySql = ranked
    ? `${buildDisplaySql(spec, wSel)}\n-- lista: ${listWords.join("; ")}; totalul și „% din total” sunt ale întregii selecții`
    // F4: P is read in the answer's transaction (case "compare"), after this text: its rule in words.
    : `${buildDisplaySql(spec, w)}${asksSharedPartners(spec, w) ? "\n-- doar clienții comuni: authority_id în instituțiile care au cumpărat de la ambele firme în această selecție (pre-pasul P)" : ""}`;
  // The map answers both lenses from the same rows (value and records per county): the strip switches without a query.
  // So does the breakdown's order by value or by records (F3, final breakdown §3.8).
  // F5: the map of the local administrations also per inhabitant (its third lens with a query text of its own).
  const displaySqlByMeasure = spec.block === "map" || spec.block === "breakdown"
    ? {
      value: buildDisplaySql({ ...spec, measure: "value" }, w), count: buildDisplaySql({ ...spec, measure: "count" }, w),
      ...(spec.block === "map" && localAdminMap(w) ? { value_per_capita: buildDisplaySql({ ...spec, measure: "value_per_capita" }, w) } : {}),
    }
    : undefined;
  // A trend answers every list in one statement (the group buttons switch without a query): the SQL of each list.
  // A watch on fixed members lists only its own.
  const displaySqlByList = spec.block === "trend" && !tableOpts.fixedMembers
    ? Object.fromEntries(TREND_LISTS.filter((list) => list !== "first" || spec.dim !== "county")
      .map((list) => [list, buildDisplaySql(trendListSpec(spec, list), w)])) as Partial<Record<TrendList, string>>
    : undefined;
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
  const rollup = isHistoricalProfile(spec) ? null : await rollupPlanFor(sql, spec, wSel);
  const perCapitaRollup = perCapita ? await perCapitaPlanFor(sql, spec, wSel) : null;
  // F5: the map of the local administrations reads the strict list and agg_map_year (map-facts.ts), probed with the pool.
  const localMap = spec.block === "map" && localAdminMap(w) ? await readPerCapitaPopulations(sql) : null;
  const localRollup = localMap ? await mapRollupReady(sql) : false;
  // A trend's group sources read their days from the rollup once a build has them (rollupDaysReady).
  const trendDays = spec.block === "trend" && rollup ? await rollupDaysReady(sql) : false;
  // The evolution's months, split and same months read agg_months once a build has made it (series-rollups.ts); so does
  // the largest record of a breakdown's divisions (its „1 contract: 99%” tag) when the rollups answer the breakdown.
  const seriesRollup = (spec.block === "timeseries" || spec.block === "breakdown") && await mixRollupReady(sql) ? monthsWhere(sql, w, "p") : null;
  // A total by the size of the purchase (the kit's ranges), a procedure or the single bidder, which agg_cpv_year does not
  // keep: agg_national_mix holds it to the leu (the same rows as „Din care”'s „Doar acestea ›”; S4 review: national,
  // under 10.000 lei in 2025, 2.4–3.3 s live over 8–10M buffers). A size typed in, months, an entity stay live.
  const statMix = spec.block === "stat" && !rollup && !unfiltered && await mixRollupReady(sql) ? mixWhere(sql, w, "p") : null;
  // A comparison's partners from agg_pair_year where its selection is a channel, a period and a buyer county (rollups.ts comparePairRows).
  const comparePairs = spec.block === "compare" && await rollupsReady(sql) && await pairIndexReady(sql);

  // The relations (network, sankey; relations.ts): the question's conditions on the centre's records, an old link's
  // record threshold, and the same question on every channel for the strip's shares (none where a procedure or a
  // single bidder is the channel itself, as the breakdown's).
  const relation = (): RelationQuery => ({
    ctx: w, dataset, focalRole, focalId: String(focalId),
    threshold: groupPredicates(w, txtAgg as unknown as ReturnType<DbSql>, andAll(sql, rowPredicates(w))),
    every: spec.filters.procedure || spec.filters.singleBidder ? null : dataset === "all" ? w
      : predicateContext(sql, { ...spec, dataset: "all" }, grounding, { dataset: "all", yearFrom, yearTo, kindIds, seat }),
  });
  // A verification says how far the data reach (its "Nu" and the incomplete last year).
  const factCoverage = spec.block === "fact_check" ? await coveragePeriods(sql) : null;

  // --- execute under guardrails
  // trend: a watch's group (TableOpts.freezeGroup, TableOpts.fixedMembers), set by its case.
  let frozenMembers: string[] | undefined;
  let movement: TrendGroupMovement | undefined;
  // F5: whether the rollups answer the selection a relation of the ranked winners is read on (winners.ts).
  const winnersRollups = asksWinners(w) ? await rollupsReady(sql) : false;
  const exec = async (): Promise<BlockData | { error: string }> => {
    return await sql.begin("read only", async (tx) => {
      await tx.unsafe(FORCE_CUSTOM_PLANS);
      await tx.unsafe(`set local statement_timeout = '${STATEMENT_TIMEOUT}'`);
      const s = tx as unknown as DbSql;
      // F5: the relation keys of the ranked winners, resolved once into lists before any query reads them.
      if (asksWinners(w)) await resolveWinners(s, w, { source: txtAgg as unknown as ReturnType<DbSql>, rollups: winnersRollups });

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
          const mixed = statMix && "where" in statMix ? statMix.where : null;
          if (dataset === "all") {
            const r = rollup ? (await rollupStat(s, rollup)).rows as { src: "da" | "contracts"; v: string; n: string }[] : mixed ? (await s`
              select p.src, coalesce(sum(p.v), 0) v, coalesce(sum(p.n), 0) n from marts.agg_national_mix p where ${mixed} group by p.src order by p.src
            `) as unknown as { src: "da" | "contracts"; v: string; n: string }[] : (await s`
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
          const r = rollup ? (await rollupStat(s, rollup)).rows : mixed ? (await s`
            select coalesce(sum(p.v), 0) v, coalesce(sum(p.n), 0) n from marts.agg_national_mix p where ${mixed}
          `) as unknown as { v: string; n: string }[] : (await s`
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
          const t = spec.timeseries ?? {};
          const grain = t.grain === "month" ? "month" as const : "year" as const, split = t.split ?? null;
          // The marker's months (January to the last complete month of the last year), per year in the same grouping.
          const refCut = seriesRef ? String(seriesRef.to).padStart(2, "0") : null;
          // Today's question (no option of F3): the same paths as before; the marker apart, from agg_months.
          if (grain === "year" && !split && !t.months && (bare || rollup || !refCut)) {
            const r = bare ? (await s`
              select y, ${aggV} v, ${aggN} n from marts.agg_years order by y limit 60
            `) as unknown as { y: string; v: string; n: string }[] : rollup ? (await rollupTimeseries(s, rollup)).rows : (await s`
              select substr(d.finalization_date, 1, 4) y,
                     coalesce(sum(d.closing_value), 0) v, count(*) n
              from ${txtAgg} d
              where ${whereFrag()}
              group by 1 order by 1
              limit 60
            `) as unknown as { y: string | null; v: string; n: string }[];
            const ref = refCut && seriesRollup && "where" in seriesRollup ? assembleSeries((await s`
              select p.y k, null::text part, 0 v, 0 n, coalesce(sum(p.v), 0) vm, coalesce(sum(p.n), 0) nm
              from marts.agg_months p
              where ${seriesRollup.where} and p.y in (${String(seriesRef!.year - 1)}, ${String(seriesRef!.year)}) and p.m <= ${refCut}
              group by 1
            `) as unknown as SeriesRow[], { grain, split: null, ref: seriesRef }).ref : undefined;
            return {
              block: "timeseries",
              series: r
                .filter((p) => /^\d{4}$/.test(p.y ?? ""))
                .map((p) => ({ year: Number(p.y), value: Number(p.v), count: Number(p.n) })),
              ...(ref ? { ref } : {}),
            };
          }
          // F3: by year or month, split by channel or CPV division, on the same months; agg_months where it answers.
          let rows: SeriesRow[];
          if (seriesRollup && "where" in seriesRollup) {
            const key = grain === "month" ? s`p.y || '-' || p.m` : s`p.y`;
            const part = split === "channel" ? s`p.src` : split === "domain" ? s`p.cpv2` : s`null::text`;
            const same = refCut ? s`, coalesce(sum(p.v) filter (where p.m <= ${refCut}), 0) vm, coalesce(sum(p.n) filter (where p.m <= ${refCut}), 0) nm` : s``;
            rows = (await s`
              select ${key} k, ${part} part, coalesce(sum(p.v), 0) v, sum(p.n) n ${same}
              from marts.agg_months p where ${seriesRollup.where}
              group by 1, 2 order by 1, 2 limit 4000
            `) as unknown as SeriesRow[];
          } else {
            const key = s`substr(d.finalization_date, 1, ${grain === "month" ? 7 : 4})`;
            const part = split === "channel" ? s`d.src` : split === "domain" ? s`substr(d.cpv_code, 1, 2)` : s`null::text`;
            const same = refCut
              ? s`, coalesce(sum(d.closing_value) filter (where substr(d.finalization_date, 6, 2) <= ${refCut}), 0) vm, count(*) filter (where substr(d.finalization_date, 6, 2) <= ${refCut}) nm`
              : s``;
            rows = (await s`
              select ${key} k, ${part} part, coalesce(sum(d.closing_value), 0) v, count(*) n ${same}
              from ${txtAgg} d
              where ${whereFrag()}
              group by 1, 2 order by 1, 2 limit 4000
            `) as unknown as SeriesRow[];
          }
          const assembled = assembleSeries(rows, { grain, split, ref: seriesRef });
          // The divisions' catalogue names, for the legend's (?) (the short name is the label).
          const names = assembled.parts?.some((p) => p.code) ? await cpvNamesFor(s, assembled.parts.flatMap((p) => p.code ? [p.code] : [])) : null;
          return {
            block: "timeseries",
            series: assembled.series,
            ...(grain === "month" ? { grain } : {}),
            ...(assembled.parts ? { parts: assembled.parts.map((p) => p.code && names?.get(p.code) ? { ...p, name: names.get(p.code)! } : p) } : {}),
            ...(seriesWindow ? { months: monthsOf(seriesWindow) } : {}),
            ...(assembled.ref ? { ref: assembled.ref } : {}),
          };
        }

        case "map": {
          // F5: „Primăriile și consiliile județene”, by the county each one administers (CJ Ilfov at Ilfov), with the
          // counties' population for the lens per inhabitant (map final §3.3, §3.8).
          if (localMap) {
            const rolled = localRollup ? mapRollupFilters(wSel, dataset) : null;
            const r = (await s`${localMapSql(s, { ctx: wSel, dataset, rolled, local: localMap })}`) as unknown as { c: string; v: string; n: string }[];
            return {
              block: "map",
              counties: r.map((p) => ({ county: p.c, value: Number(p.v), count: Number(p.n) })),
              unknown: { value: 0, count: 0 },
              local: mapLocal(localMap),
            };
          }
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
            // A firm's county is its seat, read from its profile for the rows shown (owner-seat-switch); an
            // institution's is the one agg_top_entities keeps.
            const r = (await s`
              select t.eid id, t.nm, ${dim === "supplier" ? ownCountySql(s, "supplier", seat) : s`t.county`} co, t.v, t.n
              from (select eid, nm, county, ${aggV} v, ${aggN} n from marts.agg_top_entities where role = ${dim} order by ${ord} limit ${topN}) t
              left join marts.entity_profile ep on ep.entity_id = t.eid and ep.role = ${dim}
              order by ${spec.measure === "count" ? s`t.n desc, t.eid` : s`t.v desc, t.eid`}
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
          // "Scoate din calcul" on the national ranking (rankedOut): the precomputed one without those rows, with the
          // totals of the rest; each id's own records counted live only outside the precomputed ranking.
          if (rankedOut && !paged && (spec.measure === "value" || spec.measure === "count") && (dim === "authority" || dim === "supplier")) {
            const own = dim === "authority" ? s`d.authority_id` : s`d.supplier_id`;
            const plain = andAll(sql, rowPredicates({ ...wSel, population: null }));
            const r = await rankedWithout(s, {
              dim, ids: rankedOut, measure: spec.measure, topN, seat,
              live: {
                own: async (ids) => (await s`
                  select ${own}::text id, coalesce(sum(d.closing_value), 0)::text v, count(*)::text n
                  from ${txtAgg} d where ${plain} and ${own} = any(${s.array([...ids])}::bigint[]) group by 1
                `) as unknown as { id: string; v: string; n: string }[],
                unassigned: async () => ((await s`
                  select coalesce(sum(d.closing_value), 0)::text v, count(*)::text n from ${txtAgg} d where ${plain} and ${own} is null
                `) as unknown as { v: string; n: string }[])[0]!,
              },
            });
            if (r) {
              const first = r[0];
              return {
                block: "table",
                rows: r.map((p) => ({ entityId: String(p.id), name: p.nm, county: p.co, value: Number(p.v), count: Number(p.n), population: null })),
                ...(first ? { totals: { value: Number(first.tv), count: Number(first.tn), entities: Number(first.te) } } : {}),
              };
            }
          }
          // Firms by their size alone (firmSizeOnly): their profiles, in the order and with the totals of the grouped records.
          const sizeSort = tableOpts.sort ?? (spec.measure === "count" ? "count" : "value");
          if (firmSizeOnly && dim === "supplier" && spec.measure !== "value_per_capita" && (sizeSort === "value" || sizeSort === "count")) {
            // The band narrows the list (rankedBand): the totals are every firm's, the band's apart (F3, table:employees-2).
            const every: ReturnType<DbSql> = s`ep.role = 'supplier' and ep.total_ron_split > 0`;
            // F5: a firm's own year, in the archive or the register, on the same profile row.
            const size = andAll(s, [every,
              ...(w.minEmployees !== null || w.maxEmployees !== null ? [employeesBounds(s, w.minEmployees, w.maxEmployees)] : []),
              ...(w.newFirms && w.newFirms.scope !== "buyer" ? [newFirmCond(s, w.newFirms.scope, w.newFirms.since, s`ep.entity_id`)] : [])]);
            const r = (await s`
              with sel as (select sum(ep.total_ron_split) tv, sum(ep.n_das + ep.n_contracts) tn, count(*) te from marts.entity_profile ep where ${every})
              select ep.entity_id id, coalesce(ep.name_display, '(fără nume)') nm, ${ownCountySql(s, "supplier", seat)} co,
                     ep.total_ron_split v, ep.n_das + ep.n_contracts n, sel.tv, sel.tn, sel.te,
                     sum(ep.total_ron_split) over () gv, sum(ep.n_das + ep.n_contracts) over () gn, count(*) over () ge
              from marts.entity_profile ep cross join sel
              where ${size}
              order by ${sizeSort === "count" ? s`ep.n_das + ep.n_contracts` : s`ep.total_ron_split`} ${tableOpts.sort ? dir : s`desc`}, ep.entity_id
              ${limitFrag}
            `) as unknown as BandRow[];
            return {
              block: "table",
              rows: r.map((p) => ({ entityId: String(p.id), name: p.nm, county: p.co, value: Number(p.v), count: Number(p.n), population: null })),
              ...(await pagedMeta(r.map((p) => ({ te: p.ge })), () => s`select count(*) t from marts.entity_profile ep where ${size}` as unknown as Promise<{ t: string }[]>)),
              ...bandTotals(r[0]),
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
            if (perCapitaRollup) {
              // D2: the institutions' rollup (perCapitaPlanFor), the live query's columns on agg_entity_year.
              const p = rollupRows(s, perCapitaRollup, "p");
              const sortBy = {
                name: s`max(p.nm)`, county: s`max(p.county)`, value: s`coalesce(sum(p.v), 0)`, count: s`sum(p.n)`,
                percap: s`coalesce(sum(p.v), 0) / max(rpl.population)`,
              }[tableOpts.sort ?? "percap"];
              const where = s`${p.where} and p.eid = any(${s.array(perCapita!.ids)}::bigint[])`;
              const count = () => s`
                select count(distinct p.eid) t from ${p.from} join ${populations} on rpl.entity_id = p.eid where ${where}
              ` as unknown as Promise<{ t: string }[]>;
              const r = (await s`
                select p.eid id, max(p.nm) nm, max(p.county) co, coalesce(sum(p.v), 0) v, sum(p.n) n, max(rpl.population) pop,
                       count(*) over () te
                from ${p.from}
                join ${populations} on rpl.entity_id = p.eid
                where ${where}
                group by p.eid
                order by ${sortBy} ${tableOpts.sort ? dir : s`desc`}, p.eid
                ${limitFrag}
              `) as unknown as { id: string; nm: string; co: string | null; v: string; n: string; pop: string; te: string }[];
              return {
                block: "table",
                rows: r.map((row) => ({
                  entityId: String(row.id), name: row.nm, county: row.co, value: Number(row.v), count: Number(row.n), population: Number(row.pop),
                })),
                ...(await pagedMeta(r, count)),
              };
            }
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
          // The band of a ranking of firms keeps its firms after grouping (rankedBand, F3): `keep` on the grouped id. So do
          // the ranked winners of F5: a firm's own year, and the lists winners.ts resolved (resolveWinners, above).
          const keep = ranked ? (id: ReturnType<DbSql>) => andAll(s, [
            ...(rankedBand ? [employeesCond(s, rankedBand.min, rankedBand.max, id)] : []),
            ...(rankedNew && rankedNew.scope !== "buyer" ? [newFirmCond(s, rankedNew.scope, rankedNew.since, id)] : []),
            ...(firmsRanked && w.winners?.suppliers ? [s`${id} = any(${s.array([...w.winners.suppliers])}::bigint[])` as ReturnType<DbSql>] : []),
            ...(rankedDominant && w.winners?.authorities ? [s`${id} = any(${s.array([...w.winners.authorities])}::bigint[])` as ReturnType<DbSql>] : []),
          ]) : null;
          const rolled = rollup ? await rollupTable(s, rollup, { ...rollupOpts, dim, seat, ...(keep ? { keep } : {}) }) : null;
          if (rolled && "rows" in rolled) {
            const first = rolled.rows[0];
            return {
              block: "table",
              rows: rolled.rows.map((p) => ({ entityId: String(p.id), name: p.nm, county: p.co, value: Number(p.v), count: Number(p.n), population: null })),
              ...(paged ? { total: rolled.total ?? 0, page, pageSize: TABLE_PAGE_SIZE } : {}),
              ...(first?.tv !== undefined ? { totals: { value: Number(first.tv), count: Number(first.tn), entities: Number(first.te) } } : {}),
              ...(first?.gv !== undefined ? { group: { value: Number(first.gv), count: Number(first.gn), entities: Number(first.ge) } } : {}),
            };
          }
          const sortKey = tableOpts.sort ?? (spec.measure === "count" ? "count" : "value");
          const count = () => (keep ? s`
            select count(*) t from (select ${idCol} id from ${txtAgg} d where ${whereFrag()} and ${idCol} is not null group by 1) g
            where ${keep(s`g.id`)}
          ` : s`
            select count(distinct ${idCol}) t from ${txtAgg} d
            where ${whereFrag()} and ${idCol} is not null
          `) as unknown as Promise<{ t: string }[]>;
          if (sortKey === "value" || sortKey === "count" || sortKey === "percap") {
            // Aggregate WITHOUT names (index-only over the slim union — names
            // would force a heap fetch per row, a full seq scan on big
            // counties), then attach display names for just the winners.
            const aggSort = sortKey === "count" ? s`n` : s`v`;
            if (keep) {
              // The selection grouped once: its totals over every firm, the band's over the firms kept.
              const r = (await s`
                with g as (
                  select ${idCol} id, coalesce(sum(d.closing_value), 0) v, count(*) n
                  from ${txtAgg} d
                  where ${whereFrag()} and ${idCol} is not null
                  group by ${idCol}
                ), topg as (
                  select g.id, g.v, g.n, sel.tv, sel.tn, sel.te,
                         sum(g.v) over () gv, sum(g.n) over () gn, count(*) over () ge
                  from g cross join (select coalesce(sum(v), 0) tv, coalesce(sum(n), 0) tn, count(*) te from g) sel
                  where ${keep(s`g.id`)}
                  order by ${aggSort} ${tableOpts.sort ? dir : s`desc`}, g.id
                  ${limitFrag}
                )
                select t.id, coalesce(max(ep.name_display), '(fără nume)') nm, max(${ownCountySql(s, dim, seat)}) co, t.v, t.n, t.tv, t.tn, t.te, t.gv, t.gn, t.ge
                from topg t
                left join marts.entity_profile ep on ep.entity_id = t.id and ep.role = ${dim}
                group by t.id, t.v, t.n, t.tv, t.tn, t.te, t.gv, t.gn, t.ge
                order by ${sortKey === "count" ? s`t.n` : s`t.v`} ${tableOpts.sort ? dir : s`desc`}, t.id
              `) as unknown as BandRow[];
              return {
                block: "table",
                rows: r.map((p) => ({ entityId: String(p.id), name: p.nm, county: p.co, value: Number(p.v), count: Number(p.n), population: null })),
                ...(await pagedMeta(r.map((p) => ({ te: p.ge })), count)),
                ...bandTotals(r[0]),
              };
            }
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
                     max(${ownCountySql(s, dim, seat)}) co, t.v, t.n, t.tv, t.tn, t.te
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
            county: ownCountySql(s, dim, seat),
            value: s`g.v`,
            count: s`g.n`,
            percap: s`g.v`,
          }[sortKey];
          // A band keeps its firms after grouping (rankedBand): the paged count is theirs.
          const r = (await s`
            with g as (
              select ${idCol} id, max(${nameCol}) nm,
                     coalesce(sum(d.closing_value), 0) v, count(*) n
              from ${txtAggNames} d
              where ${whereFrag()} and ${idCol} is not null
              group by ${idCol}
            )
            select g.id, g.nm, ${ownCountySql(s, dim, seat)} co, g.v, g.n, count(*) over () te
            from g
            left join marts.entity_profile ep on ep.entity_id = g.id and ep.role = ${dim}
            ${keep ? s`where ${keep(s`g.id`)}` : s``}
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
          // F4, „Doar clienții comuni” (plan §4.6): P first, on the selection without it; then every query of the
          // answer reads the shared clients' records only (PredicateCtx.shared, whereFrag), and the cards keep the
          // selection without P beside (`whole`).
          const pre = asksSharedPartners(spec, w) ? await sharedPartnersPrestep(s, { ...w, shared: null }, txtAgg as unknown as ReturnType<DbSql>) : null;
          w.shared = pre ? pre.ids : null;
          const where = whereFrag();
          // Partners, top partners and shared partners group the slim union and
          // name the shown partners from entity_profile after (rollups.ts).
          const partners = { source: txtAgg as unknown as ReturnType<DbSql>, where, focalRole, focalId: focalId!, compareId: compareId! };
          const src = dataset === "all" ? s`d.src` : s`${dataset}::text`;
          // The number of bids is published only for part of the contracts (mostly via TED): counted on contracts only.
          const contractRows = dataset === "da" ? null
            : s`(select c.authority_id, c.authority_name, c.supplier_id, c.supplier_name, c.county, c.cpv_code,
                        c.closing_value, c.finalization_date, c.is_single_bidder, 'contracts'::text src, c.contract_id,
                        c.procedure_type, c.contract_value_full
                 from marts.contract_transactions c)`;
          // Two institutions: their partners and their suppliers' seat from one grouping (rollups.ts compareInstitutionParties).
          const seatCols = seatOf(s, seat);
          const institutions = focalRole === "authority" ? compareInstitutionParties(s, partners, seatCols) : null;
          // Two passes over the two entities' records (rollups.ts compareRecordPass, comparePartnerPass), each read by
          // the queries of its kind: six reads of the records before (SELGROS and DEDEMAN on „Directe”: 2.05 s, 0.9 s so).
          const recordPass = compareRecordPass(s, partners, { src: src as unknown as ReturnType<DbSql>, singleBid: dataset !== "da", domains: COMPARE_DOMAINS });
          const partnerPass = comparePartnerPass(s, partners, {
            parties: !institutions, grouped: comparePairs ? comparePairRows(s, w, { focalRole, focalId: String(focalId!), compareId: String(compareId!) }) : null,
          });
          const [streams, parties, years, domains, top, shared, joint, profiles, risk] = await Promise.all([
            recordPass.then((r) => r.streams),
            institutions ? institutions.then((r) => r.parties) : partnerPass.then((r) => r.parties),
            recordPass.then((r) => r.years),
            recordPass.then((r) => r.domains),
            partnerPass.then((r) => r.top),
            partnerPass.then((r) => r.shared),
            // Firms only: contracts both won, with the public page key of each.
            focalRole === "supplier" && contractRows
              ? s`select k.ca_notice_contract_id::text nid, max(d.authority_name) authority, min(d.finalization_date) date,
                         sum(d.closing_value)::text value, count(*) over ()::int total
                  from ${contractRows} d join core.contracts k on k.id = d.contract_id
                  where ${where} and k.ca_notice_contract_id is not null
                  group by k.ca_notice_contract_id having count(distinct d.supplier_id) = 2
                  order by sum(d.closing_value) desc limit 5`
              : Promise.resolve([]),
            s`select ep.entity_id::text id, ep.first_activity, ep.last_activity, ep.employees, ep.employees_year, ep.net_turnover::text turnover,
                     ${ownCountySql(s, focalRole, seat)} county
              from marts.entity_profile ep where ep.role = ${focalRole} and ep.entity_id = any(${s.array(ids)}::bigint[])`,
            s`select entity_id::text id, cri, n_flags, flags from marts.entity_flags where role = ${focalRole} and entity_id = any(${s.array(ids)}::bigint[])`,
          ]) as unknown as [
            { id: string; src: string; value: string; n: number; single_bid: string; single_known: string; no_cpv: string }[],
            { id: string; n: number }[],
            { id: string; y: number; value: string; n: number }[],
            { id: string; g: string; value: string; groups: number }[],
            { id: string; other_id: string; name: string | null; value: string; n: number }[],
            { other_id: string; name: string | null; value_a: string; n_a: number; value_b: string; n_b: number; total: number }[],
            { nid: string; authority: string | null; date: string | null; value: string; total: number }[],
            { id: string; first_activity: string | null; last_activity: string | null; employees: number | null; employees_year: number | null; turnover: string | null; county: string | null }[],
            { id: string; cri: string | null; n_flags: number; flags: string[] | null }[],
          ];
          // F4 (plan §4.6 Motor, final compare §4): the cards' context rows, each its own small grouping.
          // - The value coded above a CPV domain (its division, group, class…), on the selection without the domain.
          const above = w.cpvPrefixes.length ? generalCodes(w.cpvPrefixes) : [];
          const wAbove: PredicateCtx = { ...w, cpvPrefixes: [], cpvExclude: [] };
          const aboveBase = andAll(s, rowPredicates(wAbove));
          const aboveWhere = andAll(s, [aboveBase, ...groupPredicates(wAbove, txtAgg as unknown as ReturnType<DbSql>, aboveBase), s`substr(d.cpv_code, 1, 8) = any(${s.array(above)}::text[])`]);
          // - An institution's suppliers by their seat against its county (firmSeatCond's classes: with its partners, above),
          //   and its distinct contracts.
          // - Between firms, with P: each one's value from the contracts both won, per institution.
          const [general, seats, distinct, jointBy] = await Promise.all([
            above.length
              ? s`select ${party}::text id, sum(d.closing_value)::text value from ${txtAgg} d where ${aboveWhere} group by 1`
              : Promise.resolve([]),
            institutions ? institutions.then((r) => r.seats) : Promise.resolve([]),
            focalRole === "authority" && contractRows
              ? s`select d.authority_id::text id, count(distinct d.contract_id)::int n from ${contractRows} d where ${where} group by 1`
              : Promise.resolve([]),
            pre && contractRows
              ? s`select d.supplier_id::text id, d.authority_id::text other, sum(d.closing_value)::text value, count(distinct d.contract_id)::int n
                  from ${contractRows} d where ${where} and d.contract_id in (
                    select d.contract_id from ${contractRows} d where ${where} group by d.contract_id having min(d.supplier_id) <> max(d.supplier_id))
                  group by 1, 2`
              : Promise.resolve([]),
          ]) as unknown as [
            { id: string; value: string }[],
            { id: string; cls: "same" | "other" | "abroad" | "unknown"; value: string }[],
            { id: string; n: number }[],
            { id: string; other: string; value: string; n: number }[],
          ];
          const cpvNames = await cpvNamesFor(s, [...new Set(domains.map((d) => d.g))]);
          const perCapita = focalRole === "authority" ? await readPerCapitaPopulations(s) : null;
          const populations = perCapita?.byEntity ?? null;
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
                // A firm's county is its seat (owner-seat-switch), read with its profile; an institution keeps its own.
                entityId: identity.id, name: identity.name, county: focalRole === "supplier" && seat ? profile?.county ?? null : identity.county, role: focalRole,
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
                years: years.filter((y) => y.id === identity.id).map((y) => ({ year: y.y, value: Number(y.value), count: y.n })).sort((a, b) => a.year - b.year),
                domains: domains.filter((d) => d.id === identity.id).sort((a, b) => Number(b.value) - Number(a.value))
                  .map((d) => ({ code: d.g, name: cpvNames.get(d.g) ?? null, value: Number(d.value) })),
                domainCount: domains.find((d) => d.id === identity.id)?.groups ?? 0,
                noCpvValue: Number(sumDecimalStrings(mine.map((r) => r.no_cpv))),
                active: profile ? { from: year(profile.first_activity), to: year(profile.last_activity) } : null,
                firm: focalRole === "supplier" && profile && (profile.employees !== null || profile.turnover !== null)
                  ? { employees: profile.employees, year: profile.employees_year, turnover: profile.turnover === null ? null : Number(profile.turnover) }
                  : null,
                ...(above.length ? { general: Number(general.find((g) => g.id === identity.id)?.value ?? 0) } : {}),
                ...(focalRole === "authority" ? { seats: Object.fromEntries((["same", "other", "abroad", "unknown"] as const)
                  .map((cls) => [cls, Number(sumDecimalStrings(seats.filter((r) => r.id === identity.id && r.cls === cls).map((r) => r.value)))])) as NonNullable<CompareEntity["seats"]> } : {}),
                ...(perCapita?.levels.get(identity.id) ? { populationLevel: perCapita.levels.get(identity.id)! } : {}),
                ...(pre ? { whole: pre.whole.get(identity.id) ?? { value: 0, count: 0, partners: 0 } } : {}),
                ...(pre && contractRows ? { joint: jointOf(jointBy.filter((r) => r.id === identity.id)) } : {}),
              };
            }).map((entity) => {
              // An institution's distinct contracts beside its records (final compare §4 "în asociere").
              const n = distinct.find((r) => r.id === entity.entityId)?.n;
              return n !== undefined && entity.streams ? { ...entity, streams: { ...entity.streams, contracts: { ...entity.streams.contracts, distinct: n } } } : entity;
            }),
            shared: {
              total: shared[0]?.total ?? 0,
              rows: shared.map((r) => {
                // With P, each firm's part from the contracts both won at this institution (hatched in its bar).
                const joint = (id: string) => pre && contractRows ? { joint: Number(jointBy.find((j) => j.id === id && j.other === r.other_id)?.value ?? 0) } : {};
                return { entityId: r.other_id, name: r.name ?? "?", a: { value: Number(r.value_a), count: r.n_a, ...joint(focalId!) }, b: { value: Number(r.value_b), count: r.n_b, ...joint(compareId!) } };
              }),
            },
            ...(joint.length ? { joint: { total: joint[0]!.total, rows: joint.map((j) => ({ nid: j.nid, authority: j.authority, date: j.date, value: Number(j.value) })) } } : {}),
          };
        }

        case "distribution": {
          // distribution-2 (F6a): the criteria against the group the ticks choose (lib/ask/distribution.ts).
          const distribution = await distributionData(s, { spec, role: focalRole, entityId: String(focalId), name: focalName, profileWhere: efWhere(focalRole, RISK_MIN_DAS) });
          if ("error" in distribution) return distribution;
          return { block: "distribution", distribution };
        }

        case "breakdown": {
          // With a CPV subject: break down inside that subtree, two digits
          // deeper than the subject's own prefix (so a breakdown of a group
          // yields its classes, of a class its categories, …, capped at the
          // full 8-digit code). Otherwise: top-level divisions (2-digit).
          const plen = w.cpvPrefixes.reduce((a, p) => Math.max(a, p.length), 0);
          const stemLen = plen === 0 ? 2 : Math.min(plen + 2, 8);
          type ByChannel = { stem: string; src: "da" | "contracts"; v: string; n: string };
          // The divisions from agg_months (F3): the slices, the largest record of each (the „1 contract: 99%” tag) and
          // every channel's shares in one pass over its ~250 thousand rows, one channel's slices kept here; agg_cpv_year
          // took a pass for the slices, another for one channel's shares and agg_months a third for the tag (S4 review:
          // the catalogue's breakdown 83 → 118 ms, one channel 40 → 90 ms).
          const months = stemLen === 2 && seriesRollup && "where" in seriesRollup
            ? (dataset === "all" ? seriesRollup : breakdownShares ? monthsWhere(sql, breakdownEvery(), "p") : seriesRollup) : null;
          const divisions = months && "where" in months ? (await s`
            select p.cpv2 stem, p.src, coalesce(sum(p.v), 0) v, sum(p.n) n, max(p.mx) mx
            from marts.agg_months p where ${months.where} and p.cpv2 is not null
            group by 1, 2
          `) as unknown as (ByChannel & { mx: string })[] : null;
          // Deeper, agg_cpv_year by stem and channel too, once: on one channel over every channel, the channel's rows kept.
          const everyPlan = divisions || !rollup || dataset === "all" || !breakdownShares ? null : await rollupPlanFor(s, { ...spec, dataset: "all" }, breakdownEvery());
          const rolled = divisions || !rollup ? null : dataset === "all" || everyPlan ? await rollupBreakdown(s, everyPlan ?? rollup, stemLen, "src") : await rollupBreakdown(s, rollup, stemLen);
          const rolledRows = rolled && "rows" in rolled ? rolled.rows : null;
          // Equal values come out by stem, as from the rollup. Live, by stem and channel (F3): the largest
          // record of each group and, on every channel, the channels' totals come from the same pass.
          const live = divisions || rolledRows ? null : (await s`
            select substr(d.cpv_code, 1, ${stemLen}) stem, ${dataset === "all" ? s`d.src` : s`${dataset}::text`} src,
                   coalesce(sum(d.closing_value), 0) v, count(*) n, max(d.closing_value) mx
            from ${txtAgg} d
            where ${whereFrag()} and d.cpv_code is not null
            group by 1, 2
          `) as unknown as (ByChannel & { mx: string })[];
          // Every channel by stem and channel, where a pass has them; the question's own channel of them.
          const bySrc: ByChannel[] | null = divisions ?? (rolledRows && (dataset === "all" || everyPlan) ? rolledRows as ByChannel[] : null);
          const own = bySrc && dataset !== "all" ? bySrc.filter((row) => row.src === dataset) : bySrc;
          const r = own ? breakdownStems(own) : rolledRows ?? breakdownStems(live!);
          const top = r.slice(0, 8);
          const rest = r.slice(8);
          // F3 (final breakdown §3.6–§3.10): every group of the level, for the kinds row, the order by records
          // and the „1 contract: 99%” tag; the largest record from agg_months on the divisions it answers.
          const base = r.slice(0, BREAKDOWN_BASE);
          const largest = live ? largestOf(live) : divisions ? largestOf(dataset === "all" ? divisions : divisions.filter((row) => row.src === dataset)) : null;
          const names = await cpvNamesFor(s, base.map((t) => t.stem));
          // The strip's shares (final §3.6): each channel in the same selection with every channel.
          const streams = !breakdownShares ? null : bySrc ? channelTotals(bySrc) : dataset === "all" && live ? channelTotals(live) : null;
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
            base: base.map((t) => ({
              code: t.stem, name: names.get(t.stem) ?? null, value: Number(t.v), count: Number(t.n),
              ...(largest?.get(t.stem) ?? {}),
            })),
            ...(streams ? { streams } : {}),
          };
        }

        case "scatter": {
          const role: Dim = spec.dim === "supplier" ? "supplier" : "authority";
          const r = (await s`
            (select ef.entity_id, ef.name_display, ${profileCounty(s, role)} county, ef.total_ron, ef.cri, ef.n_flags
             from marts.entity_flags ef
             where ${efWhere(role as "authority" | "supplier", RISK_MIN_DAS)} and ef.cri is not null
             order by ef.cri desc, ef.total_ron desc limit 200)
            union
            (select ef.entity_id, ef.name_display, ${profileCounty(s, role)} county, ef.total_ron, ef.cri, ef.n_flags
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

        // sankey-2 (plan §4.9, F4): the partners × domains of the selection, two CPV digits below the chosen domain,
        // the first 15 partners and 5 domains with their records and rests, the shared contracts (relations.ts).
        case "sankey": {
          if (!focalId) return { error: "Lipsește entitatea centrală." };
          const flow = await sankeyAnswer(s, { ...relation(), focalName, prefixes: w.cpvPrefixes });
          return flow ?? { error: emptyRelationError(focalName) };
        }

        // network-2 (plan §4.8, F4): the partners in four lists against the reference year (the groups of the whole
        // relation), each with its totals and first rows of every order, the facts of each partner (relations.ts).
        case "network": {
          if (!focalId) return { error: "Lipsește entitatea centrală." };
          // „Toți” on one channel or in a period reads the records it bounds; the whole relation follows (part=network).
          const list = networkList(spec), signals = spec.network?.signals === true;
          const bounded = !tableOpts.networkWhole && list === "all" && !signals
            && (dataset !== "all" || w.yearFrom !== null || w.yearTo !== null || w.monthFrom !== null || w.monthTo !== null);
          // A watch on a group (options.members network-group): its partners fixed at activation, never „Toți”.
          const fixed = tableOpts.fixedMembers, partnerRole = focalRole === "authority" ? "supplier" : "authority";
          if (fixed && (list === "all" || fixed.role !== partnerRole)) return { error: FIXED_GROUP_MISMATCH };
          const watch: NetworkWatch | undefined = fixed ? { fixed: { ids: fixed.ids, frozen: fixed.frozen, frozenAt: fixed.frozenAt } } : tableOpts.freezeGroup && list !== "all" ? { collect: true } : undefined;
          const net = await networkAnswer(s, { ...relation(), focalName, since: networkReference!, complete: networkComplete!, signals, list, bounded, ...(watch ? { watch } : {}) });
          if (watch?.members) frozenMembers = watch.members;
          if (watch?.movement) movement = watch.movement;
          if (!net) return { error: emptyRelationError(focalName) };
          // The firms' seat against the institution (final network §3.4): those nobody knows the seat of are in no list, said under the summary.
          const unknownSeat = focalRole === "authority" && (w.firmSeat === "same" || w.firmSeat === "other") ? await unknownSeatPartners(s, { ...relation(), list }) : 0;
          return unknownSeat ? { ...net, unknownSeat } : net;
        }

        case "entity_card": {
          const role = spec.dim === "supplier" ? ("supplier" as const) : ("authority" as const);
          const minDas = profileMinDas(spec.block);
          const order =
            (spec.rankBy ?? "risk") === "risk"
              ? s`ef.cri desc nulls last, ef.total_ron desc nulls last, ef.entity_id`
              : s`ef.total_ron desc nulls last, ef.entity_id`;
          const r = (await s`
            select ef.entity_id, ef.name_display, ${profileCounty(s, role)} county, ef.role, ef.n_das, ef.total_ron,
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
          // fact_check-2 (F6a): the three verdicts, the profile and the rows outside the sums (lib/ask/fact-check.ts).
          const fact = await factCheckData(s, {
            spec, ctx: w, dataset, agg: txtAgg as unknown as ReturnType<DbSql>, coverage: factCoverage,
            authority: { entityId: String(authorityId), name: grounding.authority?.nameDisplay ?? "?" },
            supplier: { entityId: String(supplierId), name: grounding.supplier?.nameDisplay ?? "?" },
          });
          return { block: "fact_check", fact };
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
          await s.unsafe(TREND_NO_JIT);
          // trend-2 (plan §4.7): the partition of the selection, grouped once by entity or county
          // (from a rollup when one answers it), with the first N of every group and the composition;
          // the chosen group is rowsTrend (every change without trend options, as before trend-2).
          const group = trendGroupOf(spec);
          const key: ReturnType<DbSql> = dim === "county" ? s`d.county` : dim === "authority" ? s`d.authority_id` : s`d.supplier_id`;
          // A record threshold is refused on a trend (population.ts), so the selection is the record conditions,
          // the buyer's kind on its ids (D1, authority_id): the facts then read no names.
          const selection = andAll(s, [...rowPredicates(w, { years: false }), trendYearsPredicate(s, yA, yB, w.trendMonths)]);
          // Names and counties come from entity_profile after the grouping, so the live query groups the slim union;
          // a trend of firms groups every firm and keeps those of its employees band (trendGrouping).
          const { grouped, attribute } = trendGrouping(s, { rollup, days: trendDays, ctx: w, dataset, dim, yearA: yA, yearB: yB });
          const first = dim === "county" ? null : { role: dim, yearB: yB };
          const fixed = tableOpts.fixedMembers;
          const part = trendMemberPart(group);
          if (fixed && (!part || fixed.role !== dim)) return { error: FIXED_GROUP_MISMATCH };
          // A watch on a group (plan §2.8): the live partition only counts the group for the note (no lists);
          // the answer is its fixed members' figures, grouped on their id index, in the group's order.
          const partition = await trendPartition(s, grouped, { group, topN: fixed ? 0 : topN, first, attribute });
          // The members of every group and their records per channel, kept for the source drawers (group-ids.ts).
          const stamp = fixed ? null : await trendCacheStamp(s);
          if (stamp) rememberTrendGroups(trendGroupKey(w, { stamp, dim, yearA: yA, yearB: yB }), trendGroupEntry(partition, { dim, group }));
          if (tableOpts.freezeGroup && part) frozenMembers = partition.members[part] ?? [];
          const own = fixed ? await trendMembersFigures(s,
            trendGroupedInput(s, { rollup: null, days: false, ctx: w, dataset, dim, yearA: yA, yearB: yB, members: fixed.ids }), { group, topN, first }) : null;
          if (own) movement = { part: part!, members: fixed!.ids.length, stayed: own.stayed, live: partition.composition[part!]?.count ?? 0 };
          const lists: [TrendList, TrendPartitionRow[]][] = own ? [[trendListOf(group), own.rows]] : Object.entries(partition.lists) as [TrendList, TrendPartitionRow[]][];
          // The facts and the profile of the shown entities only (≤ 6 × N ids), on the id indexes, each in its change year.
          const shown = dim === "county" ? [] : [...new Set(lists.flatMap(([, rows]) => rows.map((r) => r.id)))];
          const partnerRole = dim === "supplier" ? "authority" : "supplier";
          const facts = dim === "county" ? [] : await trendFactsRows(s, {
            source: factsSource(s, dataset, false, w.procedure !== null || w.purchaseValueMin !== null || w.purchaseValueMax !== null), where: selection, id: key,
            partner: dim === "supplier" ? s`d.authority_id` : s`d.supplier_id`, byYear: factsYears(lists.flatMap(([, rows]) => rows), yA, yB),
          });
          const profiles = dim === "county" ? new Map() : await trendProfiles(s, [
            { role: dim, ids: shown }, { role: partnerRole, ids: facts.flatMap((f) => f.partner ? [f.partner] : []) },
          ], seat);
          // trend-2: the county of an entity's row is its own (entity_profile, as on the rankings), not a buyer's;
          // a firm's is its seat (F4, owner-seat-switch).
          const toRow = (r: TrendPartitionRow): TrendRow => {
            if (dim === "county") return { entityId: null, name: r.id, county: null, valueA: Number(r.va), valueB: Number(r.vb) };
            const profile = profiles.get(`${dim}:${r.id}`);
            return { entityId: r.id, name: profile?.name ?? "(fără nume)", county: profile?.county ?? null, valueA: Number(r.va), valueB: Number(r.vb) };
          };
          const groups = Object.fromEntries(lists.map(([list, rows]) => [list, rows.map(toRow)])) as Partial<Record<TrendList, TrendRow[]>>;
          const rowFacts: Record<string, TrendRowFacts> = {};
          for (const row of Object.values(groups).flat())
            if (row.entityId && !rowFacts[row.entityId])
              rowFacts[row.entityId] = factsOfRow({ entityId: row.entityId, valueA: row.valueA, valueB: row.valueB }, { yearA: yA, yearB: yB },
                facts, profiles, { own: dim as "authority" | "supplier", partner: partnerRole });
          return {
            block: "trend",
            yearA: yA,
            yearB: yB,
            rowsTrend: groups[trendListOf(group)] ?? [],
            list: trendListOf(group),
            change: group.change,
            months: monthsOf(trendWindow),
            groups,
            // Fixed members: the group is every member identified now, with what they have in the two years.
            composition: own ? { [trendListOf(group)]: { count: fixed!.ids.length, valueA: own.totals.valueA, valueB: own.totals.valueB } } : partition.composition,
            noun: trendNoun(spec),
            ...(dim === "county" ? {} : { rowFacts }),
            ...(fixed ? { members: { list: trendListOf(group), frozen: fixed.frozen, frozenAt: fixed.frozenAt } } : {}),
            // The firms an employees band leaves out for want of a filing, per list ("Fără bilanț: N firme noi, nu intră").
            ...(partition.withoutFiling && !fixed ? { withoutFiling: partition.withoutFiling } : {}),
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
      // The same months of each year are judged as such (F3), as the trend's two years.
      const months = w.seriesMonths;
      const years = [...new Set(data.series.map((p) => p.year))];
      partial = months
        ? years.flatMap((year) => partialYears(periods, dataset, [year], { yearFrom: year, yearTo: year, monthFrom: months[0], monthTo: months[1] }))
        : partialYears(periods, dataset, years, w);
      const note = partialYearsCaveat(partial, "series");
      if (note) caveats.push(note);
    } else if (data.block === "compare") {
      // The side-by-side years hatch partly covered years like the series does.
      const years = [...new Set(data.entities.flatMap((e) => (e.years ?? []).map((y) => y.year)))].sort((a, b) => a - b);
      partial = partialYears(periods, dataset, years, w);
      const note = partialYearsCaveat(partial, "series");
      if (note) caveats.push(note);
    } else if (data.block === "trend") {
      // The same months of each year are judged as such, not the whole calendar year.
      const months = w.trendMonths;
      partial = months
        ? [data.yearA, data.yearB].flatMap((year) => partialYears(periods, dataset, [year], { yearFrom: year, yearTo: year, monthFrom: months[0], monthTo: months[1] }))
        : partialYears(periods, dataset, [data.yearA, data.yearB]);
      const note = partialYearsCaveat(partial, "comparison");
      if (note) caveats.push(note);
    } else {
      const from = w.yearFrom ?? minY, to = w.yearTo ?? maxY;
      const years = Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
      const note = partialYearsCaveat(partialYears(periods, dataset, years, w), "selection");
      if (note) caveats.push(note);
    }
  }
  // trend-2: an old link with 2018 still runs, with the note (trend final §3.2); the year picker starts at 2019.
  const note2018 = data.block === "trend" && (data.yearA === 2018 || data.yearB === 2018) ? TREND_2018_NOTE[dataset] : null;
  if (note2018) caveats.push(note2018);
  const ran = trendWindow ?? seriesWindow;
  const executed: ExecutedWindow | null = ran ? { months: [ran.from, ran.to], mode: ran.mode, checkpoint: ran.checkpoint } : null;
  return { data, displaySql, caveats, tookMs: Date.now() - started, ...(partial ? { partialYears: partial } : {}), ...(executed ? { executed } : {}),
    ...(seat ? {} : { seatColumn: false as const }), ...(spec.filters.uatSiruta && grounding.uat?.joined?.length ? { uatJoined: true as const } : {}),
    ...(frozenMembers ? { groupMembers: frozenMembers } : {}), ...(movement ? { movement } : {}), ...(displaySqlByMeasure ? { displaySqlByMeasure } : {}),
    ...(displaySqlByList ? { displaySqlByList } : {}) };
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
  /**
   * The drawer of a trend's group: its part, its members, and the selection it
   * is part of (records and value of both years, every group with the equal
   * ones); the group's own figures are sourceTotal and sourceValue.
   */
  group?: { part: TrendMemberPart; members: number; selection: { count: number; value: string } | null };
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
  /**
   * trend: the months the answer counted (its `executed.months`), sent by its
   * drawer and CSV. Another window at this checkpoint is a conflict (409), never
   * another list; without it the sources take the window of this checkpoint.
   * Never part of `scope`, which saved links and watches keep.
   */
  months?: MonthWindow;
  /**
   * Server-only, a watch on a trend's group: the sources are its fixed members'
   * records of the two years, never the live group's. Never accepted by evidenceOptions.
   */
  fixedMembers?: TrendFixedMembers;
}

export const DRILL_PAGE_SIZE = 10;
/** A trend group of at most this many records is listed from its members' id index, never a scan of the mart (runRows). */
export const GROUP_ID_INDEX_RECORDS = 250_000;
/**
 * A cohort of historical profiles with at least this many records takes its source totals from agg_entity_year and
 * its first page by value from da_tx_value_desc_idx (runRows, S5 PRE-sources); a smaller one is counted live on core,
 * on its entities' indexes. The walk of that index reads at most PROFILE_VALUE_WALK records for the page's keys.
 */
export const PROFILE_ROLLUP_RECORDS = 200_000;
export const PROFILE_VALUE_WALK = 200_000;
/** The most keys the value walk serves ((page + 1) × page size): a CSV's 100,000 rows too, within the walk's bound. */
const PROFILE_VALUE_KEYS = 100_000;
/** A county drawer of at most this many records reads them from the county indexes, not by the key (runRows). */
const FEW_IN_COUNTY = 2000;
/** The records of the institutions one firm dominates (F5) up to which their drawer reads them on the authority index. */
const FEW_WINNER_RECORDS = 200_000;
/** A list over which a search of only common words (no word narrows it, source-search.ts) is refused with its reason. */
const SEARCH_BROAD_RECORDS = 200_000;
/**
 * The time a search on a broad list may take for its count and page (S5 review): a text of common words over two
 * fields („s.r.l. bucuresti”: thousands of names, few records with both together) reads every candidate, 12–32 s
 * nationally, past the route's 20 s. Past it the drawer says what to add instead of a timeout.
 */
const SEARCH_BUDGET_MS = 6000;
export const commonWordsSearch = (search: string): string =>
  `„${search}”: cuvintele apar în prea multe nume pentru toată lista. Adaugă un cuvânt mai rar: un nume, un cod sau o localitate.`;
/** A search narrowed by its names that ran past the budget: on a busy server too, so never „too many names”. */
export const slowSearch = (search: string): string =>
  `„${search}”: căutarea pe toată lista a durat prea mult. Încearcă din nou sau adaugă un cuvânt mai rar.`;
/**
 * The reason a search on a broad list gives at its budget's end, or null when it keeps the route's limit (S5
 * review): no word narrows (`candidates` null), its words are too common; the names narrow it (`indexed`), it took
 * too long, said neutrally. A word read on every row (a DA code, a number: one record, 2–3 s warm, longer under
 * load) has no budget: its time is the scan's, not the names', and „too many names” would be false.
 */
export function searchBudgetReason(search: string, candidates: { indexed: boolean } | null): string | null {
  if (!candidates) return commonWordsSearch(search);
  return candidates.indexed ? slowSearch(search) : null;
}
/** A budgeted read past its budget, carrying the drawer's reason (withSearchBudget). */
export class SearchBudgetError extends Error {}
/** One read under the search's budget: its statement timeout is the budget's end, said with `reason`. */
export async function budgetedRead<T>(reason: string, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (e) {
    if (e instanceof Error && e.message.includes("statement timeout")) throw new SearchBudgetError(reason);
    throw e;
  }
}
/** The drawer's reason for a search past its budget; any other error (the route's own timeout too) stays one. */
export async function withSearchBudget<T>(work: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof SearchBudgetError) return { error: e.message };
    throw e;
  }
}
let profileLimits = { records: PROFILE_ROLLUP_RECORDS, walk: PROFILE_VALUE_WALK };
/** Tests only: a fixture's cohorts are a few records; null restores the limits. */
export function profileLimitsForTests(limits: { records: number; walk: number } | null): void {
  profileLimits = limits ?? { records: PROFILE_ROLLUP_RECORDS, walk: PROFILE_VALUE_WALK };
}
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
): Promise<DrillResult | { error: string; conflict?: true }> {
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
  if (spec.filters.seatCounty && !grounding.seatCounty?.canonical) {
    return { error: `Nu recunosc județul „${spec.filters.seatCounty}”.` };
  }
  if (
    (spec.filters.adminPersonKey || spec.filters.adminName) &&
    (!grounding.admin?.personKey || grounding.admin.supplierIds.length === 0)
  ) {
    return { error: "Nu am găsit firmele persoanei în date (filtrul «conduse azi de»)." };
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

  if ((scope.riskBucket || scope.criteria !== undefined) && spec.block !== "distribution") return { error: "Intervalul de risc se aplică distribuției." };
  if (profile && (scope.cpvPrefixes || scope.excludeCpvPrefixes || scope.years || scope.consortium || scope.singleBid))
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
  // network-2's group, read inside the drawer's snapshot (networkMembersList).
  let networkPartners: { pid: ReturnType<DbSql>; members: ReturnType<DbSql> } | null = null;
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
  // trend: the answer's months, by the same function at this checkpoint (sameMonthsWindow).
  // An evolution's same months (F3) are resolved as a trend's, and sent back the same way.
  let trendWindow: MonthsWindow = WHOLE_YEAR;
  if (spec.block === "trend" || spec.block === "timeseries") {
    const months = spec.block === "trend" ? spec.trend?.months : spec.timeseries?.months;
    if (months !== undefined) {
      const window = sameMonthsWindow(await coveragePeriods(sql), dataset, yearTo ?? maxY, months);
      if ("error" in window) return { error: window.error };
      trendWindow = window;
    }
    if (opts.months && (opts.months[0] !== trendWindow.from || opts.months[1] !== trendWindow.to)) return { error: DATA_CHANGED, conflict: true };
  } else if (opts.months) return { error: "Lunile comparate se aplică doar schimbării între doi ani și evoluției." };
  // The question's conditions, written for the sources as for the answer (predicates.ts).
  const kindIds = await authorityKindIds(sql, spec.filters.authorityKind);
  const valueIndex = !profile && spec.filters.purchaseValueMin != null && await valueKeysReady(sql);
  const ctx = predicateContext(sql, spec, grounding, {
    dataset, yearFrom, yearTo, kindIds, trendMonths: partialMonths(trendWindow), seriesMonths: partialMonths(trendWindow),
    seat: (await martColumns(sql)).seat,
  });
  // F5: the ranked winners' lists, read as the answer reads them (winners.ts), so a list's sources are its firms' records.
  if (!profile && ctx.newFirms?.scope === "registry" && !(await martColumns(sql)).registeredYear) return { error: REGISTERED_YEAR_MISSING };
  if (!profile && asksWinners(ctx))
    await resolveWinners(sql, ctx, { source: txAggFragment(sql, dataset, false, fullValueUnion(ctx)) as unknown as ReturnType<DbSql>, rollups: await rollupsReady(sql) });
  // The institutions one firm dominates are of the kind already (resolveWinners): the kind's condition on the records is
  // their own list, so the planner reads them on the authority indexes, not the whole county index for a kind's
  // thousands of ids next to a few (every year, warm: schools 2.9 s → 0.54 s, communes 5.4 s → 0.12 s; S5 review).
  if (ctx.kindIds && ctx.winners?.authorities) ctx.kindIds = ctx.winners.authorities;
  // F4, „Doar clienții comuni”: the answer's P, read the same way (compare-prestep.ts), so a card's records are its own.
  if (!profile && asksSharedPartners(spec, ctx)) {
    ctx.shared = (await sharedPartnersPrestep(sql, ctx, txAggFragment(sql, dataset, false, fullValueUnion(ctx)) as unknown as ReturnType<DbSql>)).ids;
    notes.push(`Doar clienții comuni: ${countWords(ctx.shared.length, "instituție", "instituții")} care au cumpărat de la ambele firme în selecția aleasă; sursele sunt înregistrările lor.`);
  }
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
    // distribution-2: the group's sources are its other members, as the answer counts them (lib/ask/distribution.ts).
    // An old link's bar (distribution-1: `riskBucket`, no ticks) keeps its population, the entity included (final §5).
    if (spec.block === "distribution" && focalId && !(scope.riskBucket && !spec.peers)) {
      const group = await distributionGroup(sql, spec, role, String(focalId));
      if (!group.resolution) return { error: "Entitatea are sub 10 achiziții directe: nu are un grup de comparație." };
      if (group.error) return { error: group.error };
      profileParts.push(...group.conditions);
    }
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
  if (scope.counties) selectionParts.push(sql`lower(unaccent(ef.county)) = any(${sql.array(scope.counties.map(fold))}::text[])`);
  if (scope.entityIds) selectionParts.push(sql`ef.entity_id = any(${sql.array([...scope.entityIds])}::bigint[])`);
  if (scope.excludeEntityIds) selectionParts.push(sql`not (ef.entity_id = any(${sql.array([...scope.excludeEntityIds])}::bigint[]))`);
  if (scope.riskBucket) selectionParts.push(sql`width_bucket(coalesce(ef.cri, 0), 0, 1.0000001, 10) = ${Math.round(scope.riskBucket.from * 10) + 1}`);
  if (scope.criteria !== undefined) selectionParts.push(sql`ef.n_flags = ${scope.criteria}`);
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
           null::boolean as is_single_bidder, null::text as procedure_type
    from marts.da_transactions
  )`;
  // The procedure declared in SEAP (F3, procedureCond): the contracts' only.
  const contractTx = sql`(
    select contract_id as ref_id, contract_no as da_code, finalization_date, authority_id, authority_name,
           supplier_id, supplier_name, county, cpv_code, cpv_name, closing_value,
           'contracts'::text as src, ca_notice_id, ted_pubnum, null::numeric as estimated_value_ron,
           false as value_suspect, null::text as state, n_winners, contract_value_full, is_single_bidder, procedure_type
    from marts.contract_transactions
  )`;
  const txt = profile ? sql`(
    select da.sicap_da_id as ref_id, da.da_code, to_char(da.finalization_date at time zone 'Europe/Bucharest', 'YYYY-MM-DD HH24:MI') as finalization_date,
           da.authority_entity_id as authority_id, a.name_display as authority_name,
           nullif(da.supplier_entity_id, da.authority_entity_id) as supplier_id, su.name_display as supplier_name,
           a.county, da.cpv_code, cpv.name_ro as cpv_name, da.closing_value,
           'da'::text as src, null::bigint as ca_notice_id, null::text as ted_pubnum,
           da.estimated_value_ron, false as value_suspect, da.state,
           null::integer as n_winners, null::numeric as contract_value_full, null::boolean as is_single_bidder, null::text as procedure_type
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
    // F3: the size is the whole purchase's, a kind the domain lacks is left out (as in the answer).
    if (conditions.purchaseValue?.note) notes.push(conditions.purchaseValue.note);
    // F4: the seat a condition selects, and where it comes from (as in the answer).
    if (spec.filters.firmSeat || spec.filters.seatCounty) notes.push(seatNote(ctx.seatColumn));
    if (spec.filters.purchaseKind && !ctx.purchaseKind) notes.push(kindLeftOutNote(spec.filters.purchaseKind, grounding.cpv?.term ?? spec.filters.cpvTerm));
    // F3's lower size on the direct acquisitions, again on da_tx_value_desc_idx's key with the DA ceiling (the same
    // records: a DA's size is its value, at most 2 mil. lei in every aggregate): few reach 1 mil. lei (213 in the
    // archive), so their range of the index finds them, where the drawer read a whole index of the period for them
    // (national, 2025: 1.4 s for the totals, 1.0 s for the page; S5 PRE-sources). On the union `src` is each branch's
    // constant, so the contracts keep their plans.
    if (dataset !== "contracts" && spec.filters.purchaseValueMin != null && valueIndex)
      parts.push(sql`(d.src <> 'da' or - d.closing_value between ${-DA_PLAFOND_RON}::numeric and ${-spec.filters.purchaseValueMin}::numeric)`);
    const isRelationship = spec.block === "network" || spec.block === "sankey";
    if (isRelationship) {
      if (!focalId) return { error: "Lipsește entitatea centrală." };
      // The answer repeats it beside its own conditions too (focalCol = focalId).
      parts.push(focalRole === "authority" ? sql`d.authority_id = ${focalId}` : sql`d.supplier_id = ${focalId}`);
    }
    // network-2 (F4): a group and „Cu semnale” select partners of the whole relation, the answer's own grouping
    // as a semi-join on the partners' ids (relations.ts), never a list of them.
    const networkGroup = spec.block === "network" ? networkList(spec) : "all";
    // A watch on a network's group: the records of the partners fixed at activation, never the live group's.
    const fixedPartners = spec.block === "network" ? opts.fixedMembers ?? null : null;
    if (fixedPartners && (networkGroup === "all" || fixedPartners.role !== (focalRole === "authority" ? "supplier" : "authority"))) return { error: FIXED_GROUP_MISMATCH };
    if (fixedPartners && focalId) {
      const last = networkLastYear(await coveragePeriods(sql), maxY);
      const since = networkSince(spec, last);
      parts.push(sql`${focalRole === "authority" ? sql`d.supplier_id` : sql`d.authority_id`} = any(${sql.array([...fixedPartners.ids])}::bigint[])`);
      notes.push(`${networkSourcesNote(networkGroup, since, false)} Partenerii sunt cei fixați la activarea urmăririi (${countWords(fixedPartners.frozen, "partener", "parteneri")}), nu grupa de acum.`);
    } else if (spec.block === "network" && focalId && (networkGroup !== "all" || spec.network?.signals)) {
      const last = networkLastYear(await coveragePeriods(sql), maxY);
      const since = networkSince(spec, last);
      if (since > last) return { error: networkSinceError(since, last) };
      const query = {
        ctx, dataset, focalRole: focalRole as "authority" | "supplier", focalId: String(focalId), group: networkGroup, since, signals: spec.network?.signals === true, every: null,
        threshold: groupPredicates(ctx, txAggFragment(sql, dataset, false, fullValueUnion(ctx)) as unknown as ReturnType<DbSql>, andAll(sql, rowPredicates(ctx))),
      };
      // The group's partners are read once in the drawer's snapshot (below), then their records by id; with a record
      // threshold, whose parties are counted over these conditions, the condition stays a semi-join.
      if (spec.minimumRecords) {
        const members = networkMembersCond(sql, query);
        if (members) parts.push(members);
      } else networkPartners = networkMembersList(sql, query);
      notes.push(networkSourcesNote(networkGroup, since, spec.network?.signals === true));
    }
    if (spec.block === "trend") {
      parts.push(trendYearsPredicate(sql, yearFrom ?? minY, yearTo ?? maxY, ctx.trendMonths, ctx));
      notes.push(`Schimbare între ${yearFrom ?? minY} și ${yearTo ?? maxY}: sursele includ numai cei doi ani; diferența este totalul final minus totalul inițial.`);
      if (ctx.trendMonths) notes.push(`Ambii ani se compară pe aceleași luni: ${monthsLabel(trendWindow)}; sursele includ numai aceste luni.`);
    }
    // rowPredicates already cut every year to them (seriesMonths): said as on the answer.
    if (ctx.seriesMonths) notes.push(`Fiecare an e numărat pe aceleași luni: ${monthsLabel(trendWindow)}; sursele includ numai aceste luni.`);
    if (spec.minimumRecords) {
      // Counted over the selection itself (rowPredicates): the rollups hold the same party list.
      const party = (spec.minimumRecords.role === "authority" ? sql`d.authority_id` : sql`d.supplier_id`) as unknown as ReturnType<DbSql>;
      const fromRollups = rollup && !isRelationship && spec.block !== "trend" ? rollupMinimumCond(sql, rollup, party) : null;
      parts.push(...(fromRollups ? [fromRollups, ...winnersPredicates(ctx)] : groupPredicates(ctx, txt as unknown as ReturnType<DbSql>, andAll(sql, parts))));
      if (conditions.minimumRecords?.note) notes.push(conditions.minimumRecords.note);
    } else parts.push(...winnersPredicates(ctx));
    if (valueWinner) {
      parts.push(spec.dim === "supplier" ? sql`d.supplier_id = ${valueWinner}` : sql`d.authority_id = ${valueWinner}`);
      notes.push("Sursele sunt limitate la entitatea cu cea mai mare valoare în selecția întrebării; filtrele din listă nu schimbă câștigătorul.");
    }
    // F5: a county of the local administrations' map holds the administrations of that county, wherever they sit
    // (CJ Ilfov at Ilfov, map final §3.3): the strict list's ids, as the answer groups them.
    if (scope.county && localAdminMap(ctx)) {
      const local = await readPerCapitaPopulations(sql);
      const ids = local.ids.filter((_, i) => fold(local.counties[i]!) === fold(scope.county!));
      parts.push(sql`d.authority_id = any(${sql.array(ids)}::bigint[])`);
    } else if (scope.county) {
      parts.push(sql`lower(unaccent(d.county)) = ${fold(scope.county)}`);
      // The same county on the column itself, so the county indexes bound the rows (a map's county, Cluj 2025: 10.5 s →
      // 1.2–1.3 s; by the firms' seat 7–9 s → 1.5 s, at load 20): the marts write the 42 canonical spellings only
      // (agg_cpv_year, 30 October 2026).
      const canonical = martsCounty(scope.county);
      if (canonical) parts.push(sql`d.county = ${canonical}`);
    }
    // Several counties: a group of a county trend (at most 42), in the drawer's words.
    if (scope.counties) parts.push(sql`lower(unaccent(d.county)) = any(${sql.array(scope.counties.map(fold))}::text[])`);
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
    // The local administrations' map places every record by its buyer (F5): none is off the map.
    if (spec.block === "map" && !localAdminMap(ctx)) parts.push(sql`d.county is not null`);
    if (spec.block === "timeseries") parts.push(sql`substr(d.finalization_date, 1, 4) ~ '^[0-9]{4}$'`);
    if (spec.block === "breakdown" || spec.block === "sankey") parts.push(sql`d.cpv_code is not null`);
    if (scope.entityIds || scope.excludeEntityIds) {
      const col = scope.role === "supplier" ? sql`d.supplier_id` : sql`d.authority_id`;
      if (scope.entityIds) parts.push(sql`${col} = any(${sql.array([...scope.entityIds])}::bigint[])`);
      if (scope.excludeEntityIds) parts.push(sql`not (${col} = any(${sql.array([...scope.excludeEntityIds])}::bigint[]))`);
    }
    if (scope.cpvPrefixes) parts.push(sql`d.cpv_code like any(${sql.array(scope.cpvPrefixes.map((p) => p + "%"))}::text[])`);
    // A record without a code is under none of the prefixes left out: the evolution's „Alte domenii” counts it (series.ts),
    // the breakdown and the flow keep only coded records (above).
    if (scope.excludeCpvPrefixes) parts.push(sql`not coalesce(d.cpv_code like any(${sql.array(scope.excludeCpvPrefixes.map((p) => p + "%"))}::text[]), false)`);
    if (scope.years) parts.push(sql`substr(d.finalization_date, 1, 4) = any(${sql.array(scope.years.map(String))}::text[])`);
    // fact_check-2: the contracts won in association, the open or restricted tenders with one known offer (the answer's lines).
    if (scope.consortium) parts.push(sql`d.n_winners > 1`);
    if (scope.singleBid) parts.push(sql`d.src = 'contracts' and d.is_single_bidder = true and d.procedure_type = any(${sql.array([...COMPETITION_PROCEDURES])}::text[])`);
    notes.push("Valoare înregistrată în achiziții, nu dovada plății. Achizițiile directe din acest rezultat au starea «Oferta acceptata». Valorile nule sau nepozitive nu intră în agregatul de achiziții.");
    if (dataset !== "contracts") notes.push("Achizițiile directe peste 2 milioane lei sunt excluse prin același plafon de plauzibilitate ca în răspuns.");
    if (dataset !== "da") notes.push(CONTRACT_CAP_CAVEAT);
    if (dataset !== "da") notes.push("Un contract cu mai mulți câștigători apare pe câte un rând pentru fiecare furnizor, cu valoarea împărțită egal. Suma folosește aceste cote; numărul de rânduri nu este numărul de contracte distincte. Detaliile și exportul păstrează valoarea integrală și numărul câștigătorilor.");
    if (spec.block === "table" || spec.block === "network" || spec.block === "trend") notes.push("Lista surselor acoperă întregul rezultat filtrat; limita de poziții din clasament sau diagramă nu limitează sursele.");
  }
  const baseWhere = parts.reduce((a, b) => sql`${a} and ${b}`);
  // trend: the sources of the group the answer lists (trendGroupSql): its members' records of the
  // two years. The members belong to the answer's selection, not to the drawer's scope: they come
  // from the answer's partition (group-ids.ts) or, when none is kept, from the same grouping, which
  // is kept for the next drawer. A row's own records ("Înregistrări →") check only that row's ids.
  const trendGroup = spec.block === "trend" && !profile ? trendGroupOf(spec) : null;
  const listed = trendGroup && !isEveryChange(trendGroup) ? trendGroup : null;
  const groupDim = spec.dim ?? "authority";
  // A watch's fixed members: a trend's group here, a network's above (its partners); nowhere else.
  const fixed = spec.block === "trend" ? opts.fixedMembers ?? null : null;
  if (opts.fixedMembers && spec.block !== "network" && (!listed || opts.fixedMembers.role !== groupDim)) return { error: FIXED_GROUP_MISMATCH };
  const yearA = yearFrom ?? minY, yearB = yearTo ?? maxY;
  // A row's own members ("Înregistrări →"): its entity ids, or on counties the county (or counties) the drawer
  // names; the drawer then lists that row, with no group header and no group note.
  const own = !listed ? null : groupDim !== "county" ? (scope.entityIds && scope.role === groupDim ? scope.entityIds : null)
    : scope.counties ?? (scope.county ? [scope.county] : null);
  // The two years as a range on the column, so the id indexes (id, finalization_date) bound the members' rows.
  const memberRange: ReturnType<DbSql> = sql`d.finalization_date >= ${String(Math.min(yearA, yearB))} and d.finalization_date < ${String(Math.max(yearA, yearB) + 1)}`;
  // „Toate” (every change, not a watch's group): the drawer lists the whole selection of the two years.
  const everyChange = trendGroup !== null && !listed && !fixed;
  const trendDays = (listed || everyChange) && rollup ? await rollupDaysReady(sql) : false;
  // The covering id indexes carry sicap_da_id (built nightly): a group's page then reads its keys index-only.
  const keyed = listed && groupDim !== "county" && dataset !== "contracts" ? await coverRefReady(sql) : false;
  const groupMembers = listed ? async (s: DbSql): Promise<{ members: Float64Array | readonly string[]; sources: TrendPartSources | null; selection: TrendPartSources | null }> => {
    // A watch's fixed members (a row's own ids among them): their records, counted, never the live group's.
    if (fixed) {
      if (!own) return { members: fixed.ids, sources: null, selection: null };
      const named = new Set(groupDim === "county" ? own.map(fold) : own);
      return { members: fixed.ids.filter((id) => named.has(groupDim === "county" ? fold(id) : id)), sources: null, selection: null };
    }
    const stamp = await trendCacheStamp(s);
    const key = stamp ? trendGroupKey(ctx, { stamp, dim: groupDim, yearA, yearB }) : null;
    let entry = key ? trendGroupsFor(key) : null;
    let kept = entry ? entryMembers(entry, listed) : null;
    if (own && groupDim === "county") {
      // A county row: the counties named that the group holds (names as the grouping writes them).
      const named = new Set(own.map(fold));
      if (kept) return { members: memberList(kept).filter((county) => named.has(fold(county))), sources: null, selection: null };
      const va: ReturnType<DbSql> = sql`coalesce(sum(d.closing_value) filter (where substr(d.finalization_date,1,4) = ${String(yearA)}), 0)`;
      const vb: ReturnType<DbSql> = sql`coalesce(sum(d.closing_value) filter (where substr(d.finalization_date,1,4) = ${String(yearB)}), 0)`;
      const { having } = trendGroupSql(sql, va, vb, listed);
      const where = andAll(sql, [...rowPredicates(ctx, { years: false }), trendYearsPredicate(sql, yearA, yearB, ctx.trendMonths),
        sql`lower(unaccent(d.county)) = any(${sql.array([...named])}::text[])`]);
      const rows = (await readEvidenceQuery(s`
        select d.county::text m from ${txAggFragment(sql, dataset, false, fullValueUnion(ctx))} d
        where ${where} group by d.county ${having ? sql`having ${having}` : sql``}
      `, opts.signal)) as unknown as { m: string }[];
      return { members: rows.map((r) => r.m), sources: null, selection: null };
    }
    if (own) {
      if (kept) return { members: own.filter((id) => hasMember(kept!, id)), sources: null, selection: null };
      // Only these ids, with the answer's conditions, on the id index of their two years.
      const role = groupDim as "authority" | "supplier";
      const id: ReturnType<DbSql> = role === "supplier" ? sql`d.supplier_id` : sql`d.authority_id`;
      const va: ReturnType<DbSql> = sql`coalesce(sum(d.closing_value) filter (where substr(d.finalization_date,1,4) = ${String(yearA)}), 0)`;
      const vb: ReturnType<DbSql> = sql`coalesce(sum(d.closing_value) filter (where substr(d.finalization_date,1,4) = ${String(yearB)}), 0)`;
      const { having } = trendGroupSql(sql, va, vb, listed, { id, role, yearB });
      const where = andAll(sql, [...rowPredicates(ctx, { years: false }), trendYearsPredicate(sql, yearA, yearB, ctx.trendMonths),
        sql`${id} = any(${sql.array([...own])}::bigint[])`, memberRange]);
      const rows = (await readEvidenceQuery(s`
        select ${id}::text m from ${txAggFragment(sql, dataset, false, fullValueUnion(ctx))} d
        where ${where} group by ${id} ${having ? sql`having ${having}` : sql``}
      `, opts.signal)) as unknown as { m: string }[];
      return { members: rows.map((r) => r.m), sources: null, selection: null };
    }
    if (!entry || !kept) {
      // Not kept (another process, an entry dropped, the marts rebuilt): the answer's grouping again, kept for the next drawer.
      const { grouped, attribute } = trendGrouping(s, { rollup, days: trendDays, ctx, dataset, dim: groupDim, yearA, yearB });
      const partition = await trendPartition(s, grouped, { group: listed, topN: 0, first: groupDim === "county" ? null : { role: groupDim, yearB }, attribute });
      entry = trendGroupEntry(partition, { dim: groupDim, group: listed });
      if (key) rememberTrendGroups(key, entry);
      kept = entryMembers(entry, listed) ?? [];
    }
    return { members: kept, sources: entry.sources[trendMemberPart(listed)!] ?? null, selection: entrySelection(entry) };
  } : null;
  // „Toate”: the selection's records per channel are those of the answer's partition (`sources.all`: with the firms'
  // employees, the band's, as the rows), kept with its groups, so its totals need no count over the union of the two
  // years (4.9M records, ~1.9 s nationally). Not kept (another process, an entry dropped), a selection without a
  // narrowing condition is grouped once on the rollups (~0.6 s) and kept for the next drawer; a narrower one counts as
  // before, its grouping costing more than its count (Cluj 2024 → 2025: 1.0 s against 0.45 s; the communes of
  // 2018 → 2019: 0.56–1.16 s against 0.42 s). A live grouping would cost what the count does, so then the count stays.
  const narrowed = ctx.cpvPrefixes.length > 0 || ctx.county !== null || ctx.kind !== null || ctx.authorityId !== null || ctx.supplierId !== null
    || ctx.uatSiruta !== null || ctx.minEmployees !== null || ctx.maxEmployees !== null || ctx.adminSupplierIds !== null || ctx.population !== null || ctx.singleBidder;
  const selectionSources = everyChange ? async (s: DbSql): Promise<TrendPartSources | null> => {
    const stamp = await trendCacheStamp(s);
    const key = stamp ? trendGroupKey(ctx, { stamp, dim: groupDim, yearA, yearB }) : null;
    let entry = key ? trendGroupsFor(key) : null;
    if (!entry && rollup && trendDays && !narrowed) {
      const { grouped, attribute } = trendGrouping(s, { rollup, days: trendDays, ctx, dataset, dim: groupDim, yearA, yearB });
      const partition = await trendPartition(s, grouped, { group: trendGroup!, topN: 0, first: groupDim === "county" ? null : { role: groupDim, yearB }, attribute });
      entry = trendGroupEntry(partition, { dim: groupDim, group: trendGroup! });
      if (key) rememberTrendGroups(key, entry);
    }
    return entry?.sources.all ?? null;
  } : null;
  const localParts: ReturnType<DbSql>[] = [sql`true`];
  if (opts.stream) localParts.push(sql`d.src = ${opts.stream}`);
  if (opts.state === "__unknown") localParts.push(sql`d.state is null`);
  else if (opts.state) localParts.push(sql`d.state = ${opts.state}`);
  const search = opts.search?.trim().slice(0, 200);
  // strpos treats percent/underscore literally and remains parameterized.
  const searchCond: ReturnType<DbSql> | null = search
    ? sql`strpos(lower(unaccent(concat_ws(' ', d.da_code, d.authority_name, d.supplier_name, d.cpv_name, d.cpv_code, d.county, d.ref_id::text))), ${fold(search)}) > 0` : null;
  const localOthers = localParts.reduce((a, b) => sql`${a} and ${b}`);
  if (searchCond) localParts.push(searchCond);
  const localBase = localParts.reduce((a, b) => sql`${a} and ${b}`);
  // „Caută în surse” on a broad selection (the country, a large group of a trend): the words' names first
  // (source-search.ts), read in the page's snapshot; today's condition (above) then checks only their records. A
  // selection its own indexes bound (a county, a domain, an entity, a kind, a row's records) and the historical
  // profiles keep today's scan, which their indexes already make short (Cluj 2024 → 2025: 1.0 s; 1.7 s names first).
  const words = search && !profile && !narrowed && !scope.county && !scope.counties && !scope.entityIds && !fixed && !own
    ? searchWords(search) : [];
  const keysForSearch = words.length > 0 && await yearKeysReady(sql);
  // The blocks whose source condition rollupSourceTotals adds itself.
  const totalsBlock = spec.block === "stat" || spec.block === "map" || spec.block === "breakdown" || spec.block === "timeseries" ? spec.block
    : spec.block === "table" && spec.dim === "county" ? "county" as const : spec.block === "table" && spec.dim === "supplier" ? "firms" as const
    : spec.block === "table" && spec.dim === "authority" ? "authorities" as const : null;
  const defaultSort = !profile && !grounding.authority?.entityId && !grounding.supplier?.entityId ? "source" : "value";
  const sortKey: DrillSort = opts.sort && Object.hasOwn(DRILL_SORTS, opts.sort) ? opts.sort : defaultSort;
  const sortFrag = { source: sql`d.ref_id`, value: sql`d.closing_value`, date: sql`d.finalization_date`, authority: sql`d.authority_name`, supplier: sql`d.supplier_name`, county: sql`d.county`, cpv: sql`d.cpv_name` }[sortKey];
  const dirFrag = sortKey === "source" ? opts.dir === "asc" ? sql`asc` : sql`desc`
    : opts.dir === "asc" ? sql`asc nulls last` : sql`desc nulls last`;
  const requestedPage = Number.isFinite(page) ? Math.max(0, Math.floor(page)) : 0;
  const pageSize = opts.limit && opts.limit > 0 ? Math.min(Math.floor(opts.limit), CSV_MAX_ROWS) : DRILL_PAGE_SIZE;
  // „Toate” in the default order (newest source first): the direct acquisitions' page walks the primary key back from
  // the last key of the two years (agg_da_year_keys, read in the page's snapshot), instead of reading the covering index
  // of every record of both years for its first keys (4.6M entries nationally: 2.5–3.2 s for any dimension or pair not
  // ending in the archive's last year; 0.09 s so, S5 PRE-trend). The bound holds every record of the two years, so the
  // page is the same; the totals never read it. Not the oldest first: a year's first key lies far below the bulk of its
  // records (2025's first is among 2020's), so a forward walk from it read millions of other years' rows (5.4 s, against
  // 3.05 s by the covering index).
  const keyBounded = everyChange && sortKey === "source" && opts.dir !== "asc" && dataset !== "contracts" && await yearKeysReady(sql);
  // A period of a selection otherwise whole or narrowed only by its firms' seat or size or the buyer county (a year's
  // national ranking, total or map, with or without entities left out; „În alt județ”, 2025) reads its direct
  // acquisitions the same way: the primary key back from the last key of its years, not from the archive's last record
  // (2025: 1.18M records of 2026 walked first, ~1 s) or through a covering index of every record of the period (a
  // year's national ranking: 2.8 s for its page; S5 PRE-sources). The bound only cuts the walk's start: every record of
  // those years lies inside it. Not with a hidden key (a size in a county, a firm abroad), which reads other indexes.
  const PERIOD_KEYED_FILTERS = ["yearFrom", "yearTo", "monthFrom", "monthTo", "county", "firmSeat", "seatCounty", "minEmployees", "maxEmployees", "dominantSupplier"];
  const periodKeyed = !keyBounded && !profile && !trendGroup && sortKey === "source" && opts.dir !== "asc" && dataset !== "contracts"
    && yearTo !== null && yearTo < maxY && !spec.minimumRecords && spec.filters.firmSeat !== "abroad"
    && Object.keys(spec.filters).every((key) => PERIOD_KEYED_FILTERS.includes(key))
    && (spec.population?.groups ?? []).every((g) => g.conditions.every((c) => (c.field === "authority" || c.field === "supplier") && c.op === "not_in"))
    && Object.keys(scope).every((key) => key === "role" || key === "county") && !(scope.county && localAdminMap(ctx))
    && await yearKeysReady(sql);
  // A named entity's page in an order of the covering id indexes' columns (below, anchoredBranches).
  const anchoredKeys = !profile && !trendGroup && !search && dataset !== "contracts" && (sortKey === "value" || sortKey === "date" || sortKey === "county")
    && (ctx.supplierId !== null || ctx.authorityId !== null || ctx.comparison !== null) && await coverRefReady(sql);
  // A large cohort of historical profiles (the risk cloud, a distribution's group of the whole country or of a county):
  // its totals are its entities' records in agg_entity_year and its page by value (the default) the keys walked from
  // da_tx_value_desc_idx, instead of counting and sorting its records on core (19.35M nationally: 20 s, the route's
  // limit, so the drawer failed). Without a local filter (a search, a channel, a state); probed before the snapshot.
  const profileRolled = profile && localParts.length === 1 && await rollupDaysReady(sql);
  const profileWalk = profileRolled && sortKey === "value" && opts.dir !== "asc" && await valueKeysReady(sql);

  // A search on a broad list that runs past its budget (SEARCH_BUDGET, below) says so, with what to add.
  return await withSearchBudget(() => sql.begin("isolation level repeatable read read only", async (tx) => {
    await tx.unsafe(FORCE_CUSTOM_PLANS);
    await tx.unsafe(`set local statement_timeout = '${opts.capture ? '15min' : STATEMENT_TIMEOUT}'`);
    // The production database uses SSD costs. Keep the same covering-index
    // choices in local source verification without changing database settings.
    await tx.unsafe("set local random_page_cost = 1.1");
    // A kind's ids (2,878–6,303 in `= any()`, D1) raise the cost estimates past
    // the JIT thresholds: compiling cost 0.4–0.6 s warm, and seconds on a new
    // connection, for a page of ten (communes 2019: 0.84 s with JIT, 0.39 s without).
    if (ctx.kind) await tx.unsafe("set local jit = off");
    const s = tx as unknown as DbSql;
    if (spec.block === "trend") await s.unsafe(TREND_NO_JIT);
    // The selection's period as a range on the column (it holds every record of it): the names' id indexes bound by it.
    const [periodLo, periodHi] = spec.block === "trend" ? [Math.min(yearA, yearB), Math.max(yearA, yearB)] : [yearFrom, yearTo];
    const searchRange: ReturnType<DbSql> | null = periodLo !== null && periodHi !== null
      ? sql`d.finalization_date >= ${String(periodLo)} and d.finalization_date < ${String(periodHi + 1)}` : null;
    const candidates = words.length ? searchCandidates(s, words, await searchLists(s, words),
      { daCodesPlain: keysForSearch && await daCodesPlain(s), range: searchRange }) : null;
    // Today's condition only on a candidate (CASE keeps that order: on a scanned channel, the contracts, the planner
    // would read it first, on every row).
    let localWhere = candidates
      ? sql`${localOthers} and ${candidates.cond} and (case when ${candidates.cond} then ${searchCond!} else false end)` : localBase;
    // A search read on every direct acquisition (a code, a number) keeps the page's scan: walking the key for its few
    // records read millions (a DA code: 9.2 s).
    const daRange = keyBounded && candidates?.indexed !== false ? await daYearKeyRange(s, [yearA, yearB])
      : periodKeyed && candidates?.indexed !== false
        ? await daYearKeyRange(s, Array.from({ length: yearTo! - (yearFrom ?? minY) + 1 }, (_, i) => (yearFrom ?? minY) + i)) : null;
    const group = groupMembers ? await groupMembers(s) : null;
    const members = group ? memberList(group.members) : null;
    // A row's own records ("Înregistrări →") are that row's: no group note (a watch says its fixed group).
    if (members && listed && (fixed || !own)) {
      const [one, many] = groupDim === "county" ? ["județ", "județe"] : groupDim === "supplier" ? ["firmă", "firme"] : ["instituție", "instituții"];
      // The part by its name, as the drawer's header and the watch say it (trendPartLabel, with the years compared).
      const label = `„${trendPartLabel(trendMemberPart(listed)!, { filters: { yearFrom: yearA, yearTo: yearB }, ...(spec.trend ? { trend: spec.trend } : {}) })}”`;
      notes.push(fixed
        ? `Sursele grupei fixate ${label}: ${countWords(members.length, one!, many!)} fixate la ${frozenDay(fixed.frozenAt)}, cu înregistrările lor din cei doi ani. Cele intrate în grupă după activare nu sunt urmărite.`
        : `Sursele grupei ${label}: ${countWords(members.length, one!, many!)}, cu înregistrările lor din cei doi ani, nu doar cele afișate.`);
    }
    // A network group's partners, once, then their records by id (the subquery planned inside the totals and the page
    // grouped the focal entity's whole relation twice).
    const partnerIds = networkPartners
      ? ((await readEvidenceQuery(s`select p.pid::text id from ${networkPartners.members} p`, opts.signal)) as unknown as { id: string }[]).map((r) => r.id) : null;
    const scopedWhere = partnerIds ? sql`${baseWhere} and ${networkPartners!.pid} = any(${sql.array(partnerIds)}::bigint[])` : baseWhere;
    const sourceWhere = !members ? scopedWhere : groupDim === "county"
      ? sql`${scopedWhere} and d.county = any(${sql.array(members)}::text[])`
      : sql`${scopedWhere} and ${groupDim === "supplier" ? sql`d.supplier_id` : sql`d.authority_id`} = any(${sql.array(members)}::bigint[]) and ${memberRange}`;
    // The page's own rows (never the totals'): on the direct acquisitions the two years' keys (keyBounded), a no-op on contracts.
    const pageWhere = daRange
      ? sql`${sourceWhere} and (d.src = 'contracts' or d.ref_id between ${daRange.k0}::bigint and ${daRange.k1}::bigint)` : sourceWhere;
    // A search read on every direct acquisition (a code, a number, only common words) finds few records or many: its
    // records' keys are read once, and when there are at most SEARCH_FEW_RECORDS the totals and the page read only them
    // by key (a DA code nationally: one scan, not two; 3.7 s → ~2 s). More, and the scan stops at the first ones past it.
    // The search's own reads (its keys, its count, its page) share SEARCH_BUDGET_MS on a broad list; the list's
    // figures keep the route's limit, and so does a search read on every row (searchBudgetReason). withSearchBudget
    // turns the budget's end into the drawer's reason.
    let searchDeadline: number | null = null;
    const budgetReason = words.length && !opts.capture ? searchBudgetReason(search!, candidates) : null;
    const budgeted = async <T,>(read: () => Promise<T>): Promise<T> => {
      if (budgetReason === null) return await read();
      searchDeadline ??= Date.now() + SEARCH_BUDGET_MS;
      await tx.unsafe(`set local statement_timeout = '${Math.max(500, searchDeadline - Date.now())}ms'`);
      try { return await budgetedRead(budgetReason, read); } finally { await tx.unsafe(`set local statement_timeout = '${STATEMENT_TIMEOUT}'`).catch(() => {}); }
    };
    if (words.length && !candidates?.indexed) {
      const keys = (await budgeted(() => readEvidenceQuery(s`
        select d.src, d.ref_id::text ref from ${txt} d where ${sourceWhere} and ${localWhere} limit ${SEARCH_FEW_RECORDS + 1}
      `, opts.signal))) as unknown as { src: "da" | "contracts"; ref: string }[];
      if (keys.length <= SEARCH_FEW_RECORDS) {
        const of = (src: "da" | "contracts") => sql.array([...new Set(keys.filter((k) => k.src === src).map((k) => k.ref))]);
        localWhere = sql`${localWhere} and ((d.src = 'da' and d.ref_id = any(${of("da")}::bigint[])) or (d.src = 'contracts' and d.ref_id = any(${of("contracts")}::bigint[])))`;
      }
    }
    // A group's page reads its members' rows on the id index. For a group of at most a few hundred
    // thousand records the planner would scan the whole mart instead (it counts each member as an
    // average entity: 3.9 s instead of 0.26 s for the 17,633 new firms of 2025), or walk the primary
    // key back through the newer years; so sequential scans are off for this transaction's remaining
    // reads (the record lookups of the page keep their indexes) and the order by reference hides the
    // key (`+ 0`, as the annual scan). Once the covering id indexes carry sicap_da_id (`keyed`), every
    // group reads that way, of any size: its direct acquisitions' first keys come from the index alone
    // (below). Before that build, a larger group keeps the planner's plans only for the default order of
    // the latest years, whose newest records come first on the primary key (~1–3 s for 2.45M records);
    // an older pair or another order would walk the key through millions of other records (37 s for
    // 2021 → 2022, 101 s ascending, 9.7 s by value, measured), so those read the members' index too.
    // A watch's fixed group (at most MONITORING_MEMBERS_MAX ids, its sources at most 200,000 records) reads the same way.
    const groupRecords = group?.sources ? group.sources.da.n + group.sources.contracts.n : null;
    const groupPage = Boolean(members && !own);
    const plannerPlans = groupPage && !keyed && (groupRecords === null || groupRecords > GROUP_ID_INDEX_RECORDS)
      && sortKey === "source" && opts.dir !== "asc" && yearB >= maxY - 1;
    const idIndex = groupPage && !plannerPlans || Boolean(fixed && members);
    if (idIndex) await tx.unsafe("set local enable_seqscan = off");
    // Without another selection, a group's totals are its records in the answer's grouping; „Toate”'s, the selection's.
    // With a search, those are the whole list's figures and only the found records are counted (below).
    const unscoped = Object.keys(scope).every((key) => key === "role");
    const groupSources = group?.sources ?? (unscoped && selectionSources ? await selectionSources(s) : null);
    const groupTotals = groupSources && unscoped
      ? groupSourceTotals(groupSources, { ...(opts.stream ? { stream: opts.stream } : {}), ...(opts.state ? { state: opts.state } : {}) }) : null;
    const rolledTotals = !groupTotals && rollup && totalsBlock && (localParts.length === 1 || search) && unscoped
      ? await rollupSourceTotals(s, rollup, totalsBlock) : null;
    // The cohort's own figures (count, records and value of its profiles), read once: the threshold below and the
    // reconciliation after the page.
    const cohortFigures = profile ? ((await readEvidenceQuery(s`select count(*) n, coalesce(sum(n_das), 0) records, coalesce(sum(total_ron), 0)::text v from ${cohort} selected_profiles`, opts.signal)) as unknown as { n: string; records: string; v: string }[])[0] : undefined;
    const cohortRolled = profileRolled && Number(cohortFigures?.records ?? 0) >= profileLimits.records;
    const profileTotals = cohortRolled ? await profileRollupTotals(s, cohort as unknown as ReturnType<DbSql>, role as "authority" | "supplier") : null;
    if (profileTotals) notes.push("Numărul și suma surselor vin din înregistrările profilurilor, grupate la ultima prelucrare a datelor; lista e citită din înregistrări.");
    const whole = groupTotals ?? (rolledTotals && "rows" in rolledTotals ? rolledTotals.rows : null) ?? profileTotals;
    // A search whose every word lists too many names („srl bucuresti”) narrows nothing: today's condition would be read
    // on every record of a broad list (a national trend's two years: 12–32 s, past the route's 20 s). Said at once,
    // with what to add, instead of a timeout (S5 review; a stored search text with a trigram index is PRECOMPUTE.md's).
    // A list whose size is not known yet (no rollup totals) keeps its search, within the budget below.
    const broad = whole ? whole.reduce((n, r) => n + Number(r.n), 0) > SEARCH_BROAD_RECORDS : false;
    if (words.length && !candidates && broad) return { error: commonWordsSearch(search!) };
    // With a search the list's figures and the found records are counted apart when the list's are known or the search
    // reads names first: the found ones over the candidates of its words, the list without reading the search on each
    // of its records (national 2024–2025: 10 s in one pass). A narrow selection keeps its one pass.
    const liveTotals = async (filter: typeof localWhere) => (await readEvidenceQuery(s`
      select d.state, count(*) n, coalesce(sum(d.closing_value), 0)::text v,
             count(*) filter (where ${filter}) fn,
             coalesce(sum(d.closing_value) filter (where ${filter}), 0)::text fv,
             min(d.finalization_date) date_from, max(d.finalization_date) date_to
      from ${txt} d where ${sourceWhere} group by d.state
    `, opts.signal)) as unknown as SourceTotalsRow[];
    const found = search && (whole || words.length) ? new Map(((await budgeted(() => readEvidenceQuery(s`
      select d.state, count(*) fn, coalesce(sum(d.closing_value), 0)::text fv
      from ${txt} d where ${sourceWhere} and ${localWhere} group by d.state
    `, opts.signal))) as unknown as { state: string | null; fn: string; fv: string }[]).map((r) => [r.state, r])) : null;
    const totals: SourceTotalsRow[] = found
      ? (whole ?? await liveTotals(sql`false`)).map((r) => ({ ...r, fn: found.get(r.state)?.fn ?? "0", fv: found.get(r.state)?.fv ?? "0" }))
      : whole ?? await liveTotals(localWhere);
    const sourceTotal = totals.reduce((n, r) => n + Number(r.n), 0);
    const sourceValue = sumDecimalStrings(totals.map((r) => r.v));
    const total = totals.reduce((n, r) => n + Number(r.fn), 0);
    const value = sumDecimalStrings(totals.map((r) => r.fv));
    if (opts.capture?.maxRows !== undefined && total > opts.capture.maxRows) {
      return { error:`Selecția are ${countWords(total, "înregistrare", "înregistrări")}; limita acestei verificări este ${opts.capture.maxRows.toLocaleString("ro-RO")}. Restrânge perioada, instituția sau domeniul. Nu am salvat un eșantion.` };
    }
    const p = Math.min(requestedPage, Math.max(0, Math.ceil(total / pageSize) - 1));
    const acceptedRows = totals.filter((r) => r.state === "Oferta acceptata");
    // The cohort's page by value from the walk: every key it needs, or none (the cohort ends before, or the walk
    // stopped first on a sparse cohort: then the page reads core as before). A walk expected to stop first is not
    // started: it reads (all records ÷ the cohort's) per key wanted, each checked against the cohort (the group of
    // Rusetu's 100,000 CSV rows: 1.6M records of 19.6M, about 1.2M checks, 20 s; its page of 10: 0.1 s).
    const wanted = (p + 1) * pageSize;
    const allDa = cohortRolled && profileWalk && wanted <= PROFILE_VALUE_KEYS ? await daRecordCount(s) : null;
    const walkLength = allDa === null ? null : wanted * allDa / Math.max(1, Number(cohortFigures?.records ?? 0));
    const valueKeys = walkLength !== null && walkLength * 1.5 <= profileLimits.walk
      ? await profileValueKeys(s, cohort as unknown as ReturnType<DbSql>, role as "authority" | "supplier", { limit: wanted, walk: profileLimits.walk, ceiling: DA_PLAFOND_RON }) : null;
    const keyedPage = valueKeys && valueKeys.length >= Math.min(wanted, total) ? valueKeys : null;
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
    // A trend group's members (not a row's own ids) bound each channel on their id index and the two
    // years instead (the annual scan extended to a group): each channel's first rows in the drawer's
    // order, then the same order over both, in any sort.
    const groupBranches = members && !own ? (dataset === "all" ? [daTx, contractTx] : [txt]) : null;
    const latestSelectedYear = scope.years?.length ? Math.max(...scope.years) : yearTo;
    // A kind of institution (D1) is a list of ids whose period the authority
    // indexes bound (periodRange, trendYearsPredicate): its narrow candidates
    // are read the same way, for one year or a span ending at least two years
    // before the archive's last (communes, 2019: 17 s by the key, 0.4 s so). A
    // longer span ending last year meets its newest records first by the key
    // (schools 2022–2025: 2.3 s by the key, 10 s by the authority index).
    const oneYear = scope.years?.length ? scope.years.length === 1 : yearFrom === yearTo;
    const kindScan = ctx.kind !== null && (oneYear || latestSelectedYear !== null && latestSelectedYear <= maxY - 2);
    // A kind on one channel ("achiziții directe" or contracts) reads only its
    // own stream (communes' direct acquisitions, 2019: 12.2 s by the key, 0.25 s
    // so). Without a kind or an id, one channel keeps the key: a recent year is
    // near its top (direct acquisitions, 2025: 0.76 s). The institutions one
    // firm dominates (F5) are such a list too: their contracts of the year come
    // from the authority index (2025: 1.07 s by the key; S5 PRE-sources).
    const annualScan = !profile && !groupBranches && sortKey === "source" && (dataset === "all" || ctx.kind !== null)
      && latestSelectedYear !== null && latestSelectedYear < maxY
      && Object.keys(spec.filters).every((key) => ["yearFrom", "yearTo", "monthFrom", "monthTo"].includes(key) || key === "authorityKind" && kindScan
        || key === "dominantSupplier")
      && Object.keys(scope).every((key) => ["years", "excludeCpvPrefixes"].includes(key));
    // Bounded by the two years' keys, the direct acquisitions walk their primary key (the key shown); otherwise hidden.
    const keysOf = (stream: typeof daTx, bounded = false) => sql`(select d.ref_id, d.src, d.supplier_id from ${stream} d where ${pageWhere} and ${localWhere}
       order by ${bounded ? sql`d.ref_id` : sql`(d.ref_id + 0)`} ${dirFrag}, d.supplier_id nulls first limit ${branchLimit})`;
    const annualKeys = !annualScan ? null
      : dataset === "da" ? sql`(${keysOf(daTx, daRange !== null)})` : dataset === "contracts" ? sql`(${keysOf(contractTx)})`
      : sql`(${keysOf(daTx, daRange !== null)} union all ${keysOf(contractTx)})`;
    // A purchase's size inside a county (F3): few of a county's direct acquisitions reach 1 mil. lei, so the
    // key's backward walk reads the whole mart before its ten rows (Buzău, 2025, ≥ 1 mil.: 15.8 s, at the
    // route's 20 s limit; a ranking of its firms 5.4 s). Hidden (`+ 0`), the county index bounds both
    // channels first: 0.10–0.16 s (Cluj 4.3 s instead of 15.6 s; other sizes in a county 0.1–0.2 s). Without
    // a county the key stays: nationally its matches come early (0.25–1.2 s; hidden 1.2–9.4 s). S4 tests.
    const sizeInCounty = (spec.filters.purchaseValueMin != null || spec.filters.purchaseValueMax != null)
      && Boolean(spec.filters.county || scope.county || scope.counties?.length);
    // A firm abroad (F4): the 764 foreign firms hold 27 direct acquisitions and 2,477 contracts, so the key's
    // backward walk read every direct acquisition for the page's ten rows (national: 10–24 s, at the route's 20 s
    // limit, so the drawer failed; directe alone 10 s; in Cluj over the limit). Hidden, on any channel layout, their
    // records come from the firm index (S4 verify).
    // A county with few records of the selection (firms of Tulcea selling in Satu Mare: 90), counted before the page:
    // the key's walk reads the county's records of every year for them (1.7–2.4 s); hidden, the county indexes bound
    // both channels (S5 PRE-sources). A dense selection keeps the key (the firms of Cluj in Cluj: 593,168, 86 ms).
    const fewInCounty = total <= FEW_IN_COUNTY && Boolean(spec.filters.county || scope.county) && !daRange;
    // The institutions one firm dominates (F5) over every year, or another span the annual scan does not read: a list of
    // ids, often a few institutions (hospitals: 1, 16 records; county councils: none), so the key's backward walk read
    // the whole mart for them (20–22 s, the route's limit; S5 review). Hidden, the authority index bounds both channels
    // (hospitals and county councils 0.07 s warm).
    const fewWinners = total <= FEW_WINNER_RECORDS && ctx.winners?.authorities != null && !daRange;
    const keyHidden = sizeInCounty || fewInCounty || fewWinners || spec.filters.firmSeat === "abroad";
    const keyOrder = keyHidden ? sql`(d.ref_id + 0)` : sql`d.ref_id`;
    const branchOrder = sortKey !== "source" ? sql`${sortFrag} ${dirFrag}, d.ref_id, d.supplier_id nulls first`
      : idIndex ? sql`(d.ref_id + 0) ${dirFrag}, d.supplier_id nulls first` : sql`d.ref_id ${dirFrag}, d.supplier_id nulls first`;
    // With the keys in the covering index, the direct acquisitions' first keys in the drawer's order come
    // from it alone (every condition and order of a group but a search or a name is on its columns), and only
    // those rows are read: 0.8 s for 2.18M records sorted by value, against 9.7 s (F2 review).
    // groupBranches: [direct acquisitions, contracts] on "all", the one channel otherwise (keyed is never on contracts).
    const branchRows = (branch: typeof txt, i: number): typeof txt => keyed && idIndex && i === 0 ? sql`(
      select * from ${branch} d where d.ref_id in (
        select d.ref_id from ${branch} d where ${sourceWhere} and ${localWhere} order by ${branchOrder} limit ${branchLimit}))`
      : sql`(select * from ${branch} d where ${sourceWhere} and ${localWhere} order by ${branchOrder} limit ${branchLimit})`;
    // A named entity's drawer (a firm, an institution, two compared firms or institutions) by value, date or county:
    // its direct acquisitions' first keys in that order come from the covering id index alone, and only those rows
    // are read, as a trend group's (`keyed`); the planner read every record's heap row to sort them (SELGROS and DEDEMAN
    // by value: 927,979 rows, 1.3–2.1 s warm, 19.6 s cold; S5 PRE-sources). The contracts keep their branch.
    const anchoredBranches = anchoredKeys && !groupBranches && !annualKeys ? (dataset === "all" ? [daTx, contractTx] : [txt]) : null;
    const anchoredRows = (branch: typeof txt, i: number): typeof txt => i === 0 ? sql`(
      select * from ${branch} d where d.ref_id in (
        select d.ref_id from ${branch} d where ${pageWhere} and ${localWhere} order by ${branchOrder} limit ${branchLimit}))`
      : sql`(select * from ${branch} d where ${pageWhere} and ${localWhere} order by ${branchOrder} limit ${branchLimit})`;
    const pageTxt = groupBranches ? sql`(${groupBranches.map(branchRows).reduce((a, b) => sql`${a} union all ${b}`)})`
      : anchoredBranches ? sql`(${anchoredBranches.map(anchoredRows).reduce((a, b) => sql`${a} union all ${b}`)})` : annualKeys ? sql`(
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
      (select * from ${daTx} d where ${pageWhere} and ${localWhere}
       order by ${keyOrder} ${dirFrag}, d.supplier_id nulls first limit ${branchLimit})
      union all
      (select * from ${contractTx} d where ${pageWhere} and ${localWhere}
       order by ${keyOrder} ${dirFrag}, d.supplier_id nulls first limit ${branchLimit})
    )` : !profile && sortKey === "source" && keyHidden ? sql`(
      select * from ${txt} d where ${pageWhere} and ${localWhere}
      order by ${keyOrder} ${dirFrag}, d.supplier_id nulls first limit ${branchLimit}
    )` : txt;
    if (opts.capture) await opts.capture.persist(s, s`
      select d.da_code, d.finalization_date, d.authority_id, d.authority_name,
             d.supplier_id, d.supplier_name, d.county, d.cpv_code, d.cpv_name, d.closing_value::text,
             d.src, d.ref_id, d.ca_notice_id, d.ted_pubnum, d.estimated_value_ron,
             d.value_suspect, d.state, d.n_winners, d.contract_value_full::text
      from ${txt} d where ${sourceWhere} and ${localWhere}
    `);
    const rows = (opts.capture ? [] : await budgeted(() => readEvidenceQuery(s`
      select d.da_code, d.finalization_date, d.authority_id, d.authority_name,
             d.supplier_id, d.supplier_name, d.county, d.cpv_code, d.cpv_name, d.closing_value::text,
             d.src, d.ref_id, d.ca_notice_id, d.ted_pubnum, d.estimated_value_ron,
             d.value_suspect, d.state, d.n_winners, d.contract_value_full::text,
             case when d.src='contracts' then (select c.title from core.contracts c where c.id=d.ref_id) else (select r.payload->>'directAcquisitionName' from core.direct_acquisitions a join raw.raw_documents r on r.id=a.raw_id where a.sicap_da_id=d.ref_id) end title
      from ${pageTxt} d where ${pageWhere} and ${localWhere} ${keyedPage ? sql`and d.ref_id = any(${sql.array(keyedPage)}::bigint[])` : sql``}
      order by ${sortFrag} ${dirFrag}, d.src, d.ref_id, d.supplier_id nulls first
      limit ${pageSize} offset ${p * pageSize}
    `, opts.signal))) as unknown as {
      title: string | null; da_code: string | null; finalization_date: string | null; authority_id: string | null; authority_name: string | null;
      supplier_id: string | null; supplier_name: string | null; county: string | null; cpv_code: string | null; cpv_name: string | null;
      closing_value: string; src: "da" | "contracts"; ref_id: string | null; ca_notice_id: string | null; ted_pubnum: string | null;
      estimated_value_ron: string | null; value_suspect: boolean | null; state: string | null; n_winners: number | null; contract_value_full: string | null;
    }[];
    if (idIndex) await tx.unsafe("set local enable_seqscan to default");
    let profiles: EvidenceProfile[] = [];
    let profileCount = 0;
    let profileReconciled: boolean | null = null;
    if (profile) {
      profileCount = Number(cohortFigures?.n ?? 0);
      const difference = sumDecimalStrings([cohortFigures?.v ?? "0", sourceValue.startsWith("-") ? sourceValue.slice(1) : `-${sourceValue}`]);
      profileReconciled = Number(cohortFigures?.records ?? 0) === sourceTotal && /^-?0(?:\.0+)?$/.test(difference);
      if (!profileReconciled) notes.push(profileTotals
        ? "Sursele nu coincid exact cu instantaneul agregat al profilurilor. Recalcularea agregatelor poate rămâne în urmă față de import."
        : "Sursele disponibile acum nu coincid exact cu instantaneul agregat al profilurilor. Recalcularea agregatelor poate rămâne în urmă față de import; totalul de mai sus este calculat direct din înregistrările disponibile.");
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
      // A group's drawer says both figures: the group's and the selection's (plan §2.5, §6.2).
      ...(group && listed && !own && members ? { group: {
        part: trendMemberPart(listed)!, members: members.length,
        selection: group.selection ? { count: group.selection.da.n + group.selection.contracts.n, value: sumDecimalStrings([group.selection.da.v, group.selection.contracts.v]) } : null,
      } } : {}),
    };
  }));
}

/** trendGroupSql as text for the shown SQL; every change (no options) keeps today's text. */
function trendGroupText(group: TrendGroup, yearB: number | string): { having: string | null; order: string } {
  const label = `  -- ${TREND_CHANGE_LABELS[group.change]}`;
  const first = group.firstOnly ? ` and prima_inregistrare = ${yearB}  -- prima dată în ${yearB}` : "";
  switch (group.change) {
    case "up": return group.order === "percent"
      ? { having: `inainte >= ${group.minBase} and dupa > inainte${label}, în procente`, order: "dupa / inainte" }
      : { having: `inainte > 0 and dupa > inainte${label}`, order: "dupa - inainte" };
    case "new": return { having: `inainte = 0 and dupa > 0${first}${first ? "" : label}`, order: "dupa" };
    case "down": return { having: `dupa > 0 and dupa < inainte${label}`, order: "inainte - dupa" };
    case "gone": return { having: `inainte > 0 and dupa = 0${label}`, order: "inainte" };
    case "all": return { having: null, order: "abs(dupa - inainte)" };
  }
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
    case "timeseries": {
      // F3: month by month, the split's part beside the bar (channel or CPV division).
      const key = spec.timeseries?.grain === "month" ? "luna" : "an";
      const part = spec.timeseries?.split === "channel" ? ", canal" : spec.timeseries?.split === "domain" ? ", diviziune_cpv" : "";
      return `select ${key}${part}, ${measure}\nfrom ${dtable}\nwhere ${where}\ngroup by ${key}${part} order by ${key};`;
    }
    case "map":
      // F5: the local administrations by the county each administers, per inhabitant of that county (map final §3.3, §3.8).
      if (w.kind === LOCAL_ADMIN_KIND)
        return `select judet_administrat, ${spec.measure === "value_per_capita" ? "sum(closing_value) / populatie_judet" : measure}\nfrom ${dtable}\n` +
          "join lista_stricta using (authority_id)  -- primării (inclusiv de sector) și consilii județene, fiecare în județul pe care îl administrează; populația județului: INS RPL 2021\n" +
          `where ${where}\ngroup by judet_administrat;`;
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
    case "distribution": {
      // distribution-2: the others of the group by number of criteria (lib/ask/distribution.ts).
      const p = spec.peers ?? {};
      const group = [
        ...(w.county ? [`unaccent(county) ilike '${fold(w.county)}'`] : []),
        ...(w.kind ? [`entity_id in (…)  -- doar ${KIND_LABEL[w.kind]}`] : []),
        ...(p.similar ? ["entity_id in (…)  -- același tip: populație apropiată ½–2× (RPL 2021) sau același tip de instituție"] : []),
        ...(p.activity ? ["n_das between ⌈n/2⌉ and 2n  -- activitate apropiată"] : []),
      ];
      return `select n_flags criterii, count(*)\nfrom marts.entity_flags\nwhere role = '${w.authorityId ? "authority" : "supplier"}' and n_das >= ${RISK_MIN_DAS}\n  and entity_id <> <entitatea>${group.map((c) => `\n  and ${c}`).join("")}\ngroup by 1;\n-- + criteriile entității și ale grupului, una câte una`;
    }
    case "breakdown":
      // The groups by value or by records (F3: the legend's headers order them); both are on every row.
      return `select categoria_cpv, sum(closing_value), count(*)\nfrom ${dtable}\nwhere ${where}\ngroup by categoria_cpv\norder by ${spec.measure === "count" ? 3 : 2} desc;`;
    case "scatter":
      return `select name_display, total_ron, cri, n_flags\nfrom marts.entity_flags\nwhere n_das >= ${RISK_MIN_DAS} and cri is not null;`;
    case "sankey":
      return `select partener, categoria_cpv, sum(closing_value)\nfrom ${dtable}\nwhere ${where}\ngroup by partener, categoria_cpv;`;
    case "network":
      return `select partener, sum(closing_value), count(*)\nfrom ${dtable}\nwhere ${where}\ngroup by partener\norder by 2 desc;`;
    case "entity_card":
      return `select *\nfrom marts.entity_flags\nwhere n_das >= ${ENTITY_CARD_MIN_DAS} ${w.kind ? `-- doar ${KIND_LABEL[w.kind]}` : ""}\norder by ${(spec.rankBy ?? "risk") === "risk" ? "cri" : "total_ron"} desc\nlimit 1;`;
    case "fact_check":
      // fact_check-2: the verdict counts these records, then what the sums leave out of the pair (lib/ask/fact-check.ts).
      return `select count(*), sum(closing_value)\nfrom ${dtable}\nwhere ${where};` +
        "\n-- în afara sumelor, aceeași pereche: achizițiile directe peste 2 mil. lei sau fără valoare pozitivă (da_transactions);" +
        "\n-- din core.contracts ⨝ core.awards ⨝ core.contract_winners: acordurile-cadru (plafoane), identitățile nesigure," +
        "\n-- contractele peste 1 mld. lei, fără valoare în lei și cele de tip neclar (contractKind, canonicalContract, @seap/db)";
    case "trend": {
      const { having, order } = trendGroupText(trendGroupOf(spec), w.yearTo ?? "ultimul_an");
      return (
        `select ${dimCol},\n  sum(closing_value) filter (where an = ${w.yearFrom ?? "primul_an"}) inainte,\n` +
        `  sum(closing_value) filter (where an = ${w.yearTo ?? "ultimul_an"}) dupa\n` +
        `from ${dtable}\nwhere ${where}\ngroup by ${dimCol}\n${having ? `having ${having}\n` : ""}order by ${order} desc\nlimit ${spec.topN ?? 10};` +
        `\n-- aceeași grupare dă compoziția (creșteri, noi, scăderi, nu mai apar, egale) și primele ${spec.topN ?? 10} din fiecare grupă`
      );
    }
  }
}

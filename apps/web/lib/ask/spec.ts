import { validatePopulation, unsupportedPopulationView, type MinimumRecords, type QueryPopulation } from "./population";
import { codeKinds, PURCHASE_KIND_WORDS } from "./purchase";
import { MAX_SERIES_MONTHS, seriesMonthsSpan } from "./series";

/**
 * The closed query-spec vocabulary for the "Întreabă" engine. The LLM never
 * writes SQL — it emits this spec, which is validated here and compiled by
 * `compile.ts` into parameterized SQL. Open-ended questions, closed renderers.
 */

export const BLOCKS = [
  "table",
  "stat",
  "timeseries",
  "map",
  "compare",
  "distribution",
  "breakdown",
  "scatter",
  "sankey",
  "network",
  "entity_card",
  "fact_check",
  "trend",
] as const;
export type Block = (typeof BLOCKS)[number];

export const DIMS = ["authority", "supplier", "county"] as const;
export type Dim = (typeof DIMS)[number];

export const MEASURES = ["value", "count", "value_per_capita"] as const;
export type Measure = (typeof MEASURES)[number];

/**
 * Data stream the query runs over:
 *  - "all" (default): DAs + contracts together. These two channels are
 *    DISJOINT (a direct acquisition is never also a contract), so summing them
 *    is honest — it matches the entity-profile totals.
 *  - "da": direct acquisitions only
 *  - "contracts": contracts awarded through procurement procedures
 *    (per-winner rows, consortium value split equally). This is not a
 *    guarantee of multiple bidders or publication above an EU threshold.
 * TED is NEVER a dataset here — it overlaps contracts (same award published
 * twice) and would double-count; it stays in its own labeled mart.
 */
export const DATASETS = ["all", "da", "contracts"] as const;
export type Dataset = (typeof DATASETS)[number];

export const RANK_BYS = ["risk", "value"] as const;
export type RankBy = (typeof RANK_BYS)[number];

export const AUTHORITY_KINDS = [
  "comuna",
  "oras_municipiu",
  "consiliu_judetean",
  "spital",
  "scoala",
] as const;
export type AuthorityKind = (typeof AUTHORITY_KINDS)[number];

/*
 * Keys a later stage of the per-question filters writes (plan §3). parseSpec
 * already reads their shape, so a rollback or an older tab never turns a newer
 * link, saved question or watch into an "invalid" one, and never runs it
 * without the condition: the engine refuses every key outside IMPLEMENTED_KEYS.
 */
/** The strict list of local administrations (F5), not a name pattern. */
export const LOCAL_ADMIN_KIND = "local_admin";
export type ParsedAuthorityKind = AuthorityKind | typeof LOCAL_ADMIN_KIND;
/** The kind matched by name patterns. local_admin has none; the engine refuses it before it reads a kind. */
export const namedKind = (kind: ParsedAuthorityKind | undefined): AuthorityKind | undefined =>
  kind === LOCAL_ADMIN_KIND ? undefined : kind;
export const PURCHASE_KINDS = ["produse", "servicii", "lucrari"] as const;
export const PROCEDURES = ["deschisa", "simplificata", "negociere_fara_publicare", "altele"] as const;
/** The firm's seat against the buyer's county on each row (same, other) or abroad. */
export const FIRM_SEATS = ["same", "other", "abroad"] as const;
export type FirmSeat = (typeof FIRM_SEATS)[number];
/**
 * "Firme noi" (F5, plan §3, final table §3.3): new for the named buyer (its first record with the firm), first in
 * the archive (entity_profile.first_activity) or registered in the trade register (entity_profile.registered_year).
 */
export const NEW_SCOPES = ["buyer", "archive", "registry"] as const;
export type NewScope = (typeof NEW_SCOPES)[number];
export const TREND_CHANGES = ["all", "up", "down", "new", "gone"] as const;
export type TrendChange = (typeof TREND_CHANGES)[number];
export const NETWORK_PARTNERS = ["new", "continuing", "gone"] as const;
export const SCATTER_FLAGS = ["da_split", "da_year_end", "da_rapid", "da_round", "da_concentration", "da_dependence"] as const;
/** First and last month (1–12) of a window repeated in each year. */
export type MonthWindow = readonly [number, number];
export interface TrendOptions {
  change?: TrendChange;
  months?: "auto" | "whole" | MonthWindow;
  order?: "lei" | "percent";
  minBase?: number;
  firstOnly?: true;
}
export interface TimeseriesOptions { grain?: "month"; split?: "channel" | "domain"; months?: "auto" | MonthWindow }
export interface NetworkOptions {
  partners?: (typeof NETWORK_PARTNERS)[number];
  since?: number;
  order?: "value" | "count" | "years";
  show?: 10 | 15 | 25 | 50;
  signals?: true;
}
export interface SankeyOptions { shown?: 6 | 10 | 15 }
/**
 * The map's lens beyond the measure (F5, plan §4.4, map final §3.7): „Firme din județ” (seat) and „Cota firmei”
 * (share). Display only: the answer brings every lens (the county facts, part `map`), the selection stays.
 */
export const MAP_LENSES = ["seat", "share"] as const;
export type MapLens = (typeof MAP_LENSES)[number];
export interface MapOptions { lens?: MapLens }
/** rankBy here, not the top-level one: old scatter links carry rankBy from "Cine conduce?" and ignore it. */
export interface ScatterOptions { flag?: (typeof SCATTER_FLAGS)[number]; rankBy?: RankBy }
export interface PeersOptions { similar?: true; activity?: true; domain?: true }

/** A type, not an interface: an AskSpec is then also a QuestionSpec (question-ui.ts), whose filters are a plain record. */
export type AskFilters = {
  /** Free-text subject ("lemne", "medicamente") — grounded to CPV server-side. */
  cpvTerm?: string;
  /** County name, Romanian, diacritics optional ("Botoșani", "cluj"). */
  county?: string;
  /** Restrict authorities by kind (name-pattern heuristic; local_admin is read ahead). */
  authorityKind?: ParsedAuthorityKind;
  /** Scope to a single named authority (resolved server-side). */
  authorityName?: string;
  /** Scope to a single named supplier (resolved server-side). */
  supplierName?: string;
  /**
   * Exact entity ids — deep links from evidence tables. Names are ambiguous
   * (eight "Comuna Dumbrăvița" exist); ids skip the grounding lottery. Not
   * offered to the LLM (it can't know internal ids).
   */
  authorityId?: number;
  supplierId?: number;
  /**
   * Month bounds (1–12), meaningful only with yearFrom/yearTo — deep links
   * from monthly evidence charts. Not offered to the LLM or the builder.
   */
  monthFrom?: number;
  monthTo?: number;
  /**
   * "Firme conduse de X": restrict suppliers to companies whose ONRC legal
   * representative matches. adminPersonKey = exact person (builder typeahead:
   * folded name|birth date|birth locality); adminName = free text (LLM path),
   * grounded server-side to the best-matching person.
   */
  adminPersonKey?: string;
  adminName?: string;
  /** Second entity for block=compare (same role as the focal entity). */
  compareWith?: string;
  /** Exact identity selected for the second comparison profile. */
  compareWithId?: number;
  /**
   * Scope to a locality (UAT): all buying authorities mapped to this SIRUTA
   * code (primărie, școli, spital…). Set by the builder's locality typeahead —
   * not offered to the LLM (it can't know SIRUTA codes).
   */
  uatSiruta?: number;
  /** Display label for the UAT ("com. Brăești (Buzău)") — pills/permalinks. */
  uatName?: string;
  /**
   * Only contracts where the tender had a single bidder (dataset "contracts"
   * only — the DA stream does not expose this bidder-count field). Bidder
   * counts exist for the TED-confirmed subset; unknown is not evidence of
   * multiple bidders.
   */
  singleBidder?: boolean;
  /**
   * Supplier size filter from MF bilanț employee counts (latest filing).
   * Suppliers without a filing (PFA, foreign, dissolved) are excluded when
   * either bound is set — compile adds the coverage caveat.
   */
  minEmployees?: number;
  maxEmployees?: number;
  yearFrom?: number;
  yearTo?: number;
  // Read ahead of the engine (plan §3, stages F3–F5).
  purchaseKind?: (typeof PURCHASE_KINDS)[number];
  procedure?: (typeof PROCEDURES)[number];
  /** Lei, on the value of the whole purchase. */
  purchaseValueMin?: number;
  purchaseValueMax?: number;
  firmSeat?: (typeof FIRM_SEATS)[number];
  /** The firm's own county, absolute. */
  seatCounty?: string;
  sharedPartners?: true;
  newSince?: number;
  newScope?: (typeof NEW_SCOPES)[number];
  mainClient?: true;
  dominantSupplier?: true;
};

export interface AskSpec {
  block: Block;
  /** Data stream (default "all"). */
  dataset?: Dataset;
  /** table/trend/entity_card/scatter: what each row/point is. */
  dim?: Dim;
  measure: Measure;
  /** table/trend only; capped at MAX_TOP_N. */
  topN?: number;
  /** entity_card: superlative axis (risk = CRI, value = spend). */
  rankBy?: RankBy;
  filters: AskFilters;
  /** Explicit transaction conditions, shared by every compatible view and source export. */
  population?: QueryPopulation;
  /** Accepted from older links and ignored: a comparison is always on the selection (24 Oct 2026). */
  comparisonMode?: "transactions" | "profiles";
  minimumRecords?: MinimumRecords;
  // Block options, read ahead of the engine (plan §3); each only on its own block.
  trend?: TrendOptions;
  timeseries?: TimeseriesOptions;
  network?: NetworkOptions;
  sankey?: SankeyOptions;
  scatter?: ScatterOptions;
  map?: MapOptions;
  /** distribution (then scatter, entity_card): the comparison group of a profile. */
  peers?: PeersOptions;
}

export const MAX_TOP_N = 50;

/** JSON Schema handed to the LLM as a forced tool — the single output contract. */
export const SPEC_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["block", "measure", "filters"],
  properties: {
    block: {
      type: "string",
      enum: [...BLOCKS],
      description:
        "table = clasament/top pe o dimensiune; stat = un singur număr total; timeseries = evoluție pe ani; map = valori pe județe (hartă); compare = două entități față în față; distribution = unde se situează o entitate în distribuția indicelui de risc; breakdown = compoziția cheltuielii pe categorii CPV; scatter = risc vs volum, cu outlieri; sankey = ce cumpără o entitate și de la cine (parteneri → domenii); network = partenerii unei entități (cu cine lucrează); entity_card = O SINGURĂ entitate-superlativ (cea mai riscantă / cea mai mare); fact_check = a cumpărat X de la Y? (Da/Nu cu dovezi); trend = schimbarea între doi ani, pe entități",
    },
    dataset: {
      type: "string",
      enum: [...DATASETS],
      description:
        "Sursa de date: 'all' = ambele canale, achiziții directe + contracte atribuite prin proceduri (IMPLICIT — canale disjuncte, sumă onestă); 'da' = DOAR achiziții directe — când omul spune explicit 'achiziții directe'/'sub prag'; 'contracts' = DOAR contracte atribuite prin proceduri — când întrebarea e despre licitații, proceduri, competiție, ofertanți. Pragul european de publicare în TED diferă de plafonul achiziției directe; canalul contracts nu garantează depășirea pragului european sau existența mai multor ofertanți.",
    },
    dim: {
      type: "string",
      enum: [...DIMS],
      description:
        "Pentru table/trend/entity_card/scatter: ce reprezintă fiecare rând (authority = autorități contractante, supplier = furnizori, county = județe).",
    },
    measure: {
      type: "string",
      enum: [...MEASURES],
      description:
        "value = suma cheltuită (lei); count = număr de achiziții; value_per_capita = lei pe cap de locuitor (doar pentru autorități-UAT).",
    },
    topN: { type: "integer", minimum: 1, maximum: MAX_TOP_N },
    rankBy: {
      type: "string",
      enum: [...RANK_BYS],
      description:
        "Doar pentru entity_card: risk = cea mai riscantă (indice de risc), value = cea mai mare cheltuială.",
    },
    filters: {
      type: "object",
      additionalProperties: false,
      properties: {
        cpvTerm: {
          type: "string",
          description:
            "Subiectul achiziției în limbaj natural, NEtradus în coduri (ex: 'lemn de foc', 'medicamente', 'asfaltare drumuri'). Serverul îl mapează la CPV.",
        },
        county: {
          type: "string",
          description:
            "Județul AUTORITĂȚII cumpărătoare, dacă întrebarea e limitată la unul.",
        },
        authorityKind: { type: "string", enum: [...AUTHORITY_KINDS] },
        authorityName: {
          type: "string",
          description:
            "Numele unei autorități anume (ex: 'Comuna Brăești'), dacă întrebarea e despre una singură.",
        },
        supplierName: {
          type: "string",
          description: "Numele unei firme anume, dacă întrebarea e despre una.",
        },
        singleBidder: {
          type: "boolean",
          description:
            "true = doar contracte atribuite prin proceduri cu UN SINGUR ofertant, unde numărul este cunoscut din TED. Forțează dataset='contracts'; acest număr nu este disponibil pentru achizițiile directe.",
        },
        compareWith: {
          type: "string",
          description:
            "Doar pentru block=compare: a doua entitate din comparație (același tip ca prima).",
        },
        minEmployees: {
          type: "integer",
          minimum: 0,
          description:
            "Doar furnizori cu CEL PUȚIN atâția angajați (din bilanțul MF, ultimul depus). Ex: 'firme mari' → 250.",
        },
        adminName: {
          type: "string",
          description:
            "Doar firmele conduse azi de această persoană (reprezentant legal/administrator la Registrul Comerțului). Ex: 'firmele lui Ion Popescu' → 'Ion Popescu'.",
        },
        maxEmployees: {
          type: "integer",
          minimum: 0,
          description:
            "Doar furnizori cu CEL MULT atâția angajați. Ex: 'firme cu sub 5 angajați' → 4, 'fără angajați' → 0.",
        },
        yearFrom: { type: "integer", minimum: 2000, maximum: 2100 },
        yearTo: { type: "integer", minimum: 2000, maximum: 2100 },
        // F3 (plan §3): the common selection.
        purchaseKind: {
          type: "string",
          enum: [...PURCHASE_KINDS],
          description: "Tipul achiziției, din codul CPV: lucrări (CPV 45), servicii (50–98), produse (03–44, 48). Doar când omul spune „lucrări”, „servicii” sau „produse” fără alt domeniu.",
        },
        procedure: {
          type: "string",
          enum: [...PROCEDURES],
          description: "Procedura declarată în SEAP, doar pentru contracte: licitație deschisă, procedură simplificată, negociere fără publicare, altele.",
        },
        purchaseValueMin: { type: "integer", minimum: 0, description: "Lei: doar achizițiile a căror valoare întreagă e cel puțin atât (ex: „peste 1 milion” → 1000000)." },
        purchaseValueMax: { type: "integer", minimum: 1, description: "Lei: doar achizițiile a căror valoare întreagă e sub atât." },
        // F4 (plan §3): the firm's seat, one column (ONRC, then SEAP; foreign apart), two keys that exclude each other.
        firmSeat: {
          type: "string",
          enum: [...FIRM_SEATS],
          description: "Sediul firmei față de județul instituției care cumpără, pe fiecare achiziție: same = în același județ („firme locale”), other = în alt județ, abroad = în străinătate. Nu împreună cu seatCounty.",
        },
        seatCounty: {
          type: "string",
          description: "Județul sediului firmei (nu al instituției), doar când rândurile sunt firme (dim=supplier la table, trend, entity_card, scatter). Ex: „firmele din Cluj care câștigă cel mai mult” → Cluj.",
        },
        // F4 (plan §4.6): a comparison of two firms at the institutions both sold to.
        sharedPartners: {
          type: "boolean",
          description: "Doar pentru block=compare cu două firme: true = numai instituțiile care au cumpărat de la amândouă („clienții comuni”, „aceiași clienți”).",
        },
      },
    },
  },
} as const;

export interface SpecError {
  error: string;
  /** The spec is well formed but carries a key this release does not apply. */
  newer?: true;
}

/** Blocks that require a focal entity (authorityName or supplierName). */
export const FOCAL_BLOCKS: Block[] = ["distribution", "sankey", "network"];

/** Shown where a link, a saved question or an API body is read by a page. */
export const NEWER_VERSION_LINK = "Legătura vine dintr-o versiune mai nouă a site-ului. Reîncarcă pagina.";
/** Watches and captures, which run later on whatever code is deployed. */
export const NEWER_VERSION_QUESTION = "Întrebarea vine dintr-o versiune mai nouă a site-ului.";

/** Paths applied by the engine of 4e90b00. A stage adds the paths it implements, in the release that implements them. */
export const IMPLEMENTED_KEYS: ReadonlySet<string> = new Set([
  "block", "dataset", "dim", "measure", "topN", "rankBy", "population", "comparisonMode", "minimumRecords",
  ...["cpvTerm", "county", "authorityKind", "authorityName", "supplierName", "authorityId", "supplierId", "monthFrom", "monthTo",
    "adminPersonKey", "adminName", "compareWith", "compareWithId", "uatSiruta", "uatName", "singleBidder", "minEmployees",
    "maxEmployees", "yearFrom", "yearTo"].map(key => `filters.${key}`),
  // F2: the trend's group, its months, its order (TREND_RULES below; compile.ts case "trend").
  ...["change", "months", "order", "minBase", "firstOnly"].map(key => `trend.${key}`),
  // F3: the common selection (SELECTION_RULES below; lib/ask/predicates.ts rowPredicates).
  ...["purchaseKind", "procedure", "purchaseValueMin", "purchaseValueMax"].map(key => `filters.${key}`),
  // F3: the evolution's months, split and same months (TIMESERIES_RULES below; compile.ts case "timeseries").
  ...["grain", "split", "months"].map(key => `timeseries.${key}`),
  // F4: the firm's seat, against the buyer's county or its own county (SEAT_RULES below; predicates.ts firmSeatCond, seatCountyCond).
  "filters.firmSeat", "filters.seatCounty",
  // F4: the network's groups, reference year, order, length and signals (NETWORK_RULES below; relations.ts), the flow's length.
  ...["partners", "since", "order", "show", "signals"].map(key => `network.${key}`), "sankey.shown",
  // F4: a comparison of two firms at their shared clients only (COMPARE_RULES below; compare-engine.ts sharedPartnersPrestep).
  "filters.sharedPartners",
  // F6a: the distribution's comparison group (PEERS_RULE below; lib/ask/distribution.ts). The main domain is phase 2.
  "peers.similar", "peers.activity",
  // F5: the ranked winners' new firms, main public client and the institutions one firm takes half of (WINNERS_RULES
  // below; lib/ask/winners.ts).
  ...["newSince", "newScope", "mainClient", "dominantSupplier"].map(key => `filters.${key}`),
  // F5: the map's local administrations (the strict list of the per-inhabitant ranking, MAP_RULES below; lib/ask/map-facts.ts)
  // and its lens beyond the measure („Firme din județ”, „Cota firmei”; display only).
  "filters.authorityKind=local_admin", "map.lens",
]);
/**
 * Paths parseSpec reads ahead of the engine (plan §3), with the stage that
 * implements each. "filters.authorityKind=local_admin" is a value of an
 * existing key. A watch's fixed group is not a spec path: a trend's and a
 * network's are applied (lib/monitoring-input.ts IMPLEMENTED_MEMBER_KINDS),
 * any other kind a newer release stored is refused there.
 */
export const READ_AHEAD_KEYS = {
  // Phase 2 of F6a (DECISIONS A3-main-cpv-div): marts.entity_flags.main_cpv_div is built; the row waits for it.
  "peers.domain": "F6a-2",
  "scatter.flag": "F6b", "scatter.rankBy": "F6b",
} as const satisfies Record<string, string>;

/** Options that belong to one block. On another block they cannot change the answer and are dropped. */
export const BLOCK_OPTION_KEYS = ["trend", "timeseries", "network", "sankey", "scatter", "map"] as const;
/** The profiles a comparison group (`peers`) can belong to; elsewhere it is refused. */
export const PEERS_BLOCKS: readonly Block[] = ["distribution", "scatter", "entity_card"];
export type OptionKey = (typeof BLOCK_OPTION_KEYS)[number] | "peers";
/** Whether a block's options or the comparison group can stay on a question of `block`. */
export const optionBelongs = (key: OptionKey, block: string): boolean =>
  key === "peers" ? PEERS_BLOCKS.includes(block as Block) : key === block;
const among = (values: readonly unknown[]) => (v: unknown) => values.includes(v);
const between = (min: number, max: number) => (v: unknown) => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
const isTrue = (v: unknown) => v === true;
const isMonthWindow = (v: unknown) =>
  Array.isArray(v) && v.length === 2 && v.every(between(1, 12)) && v[0] <= v[1];
/** The shape of each option; which options combine is the rule of the stage that implements them. */
const OPTION_SHAPES: Record<OptionKey, Record<string, (v: unknown) => boolean>> = {
  trend: { change: among(TREND_CHANGES), months: v => v === "auto" || v === "whole" || isMonthWindow(v),
    order: among(["lei", "percent"]), minBase: between(1_000, 1_000_000_000), firstOnly: isTrue },
  timeseries: { grain: among(["month"]), split: among(["channel", "domain"]), months: v => v === "auto" || isMonthWindow(v) },
  network: { partners: among(NETWORK_PARTNERS), since: between(2021, 2100), order: among(["value", "count", "years"]),
    show: among([10, 15, 25, 50]), signals: isTrue },
  sankey: { shown: among([6, 10, 15]) },
  scatter: { flag: among(SCATTER_FLAGS), rankBy: among(RANK_BYS) },
  map: { lens: among(MAP_LENSES) },
  peers: { similar: isTrue, activity: isTrue, domain: isTrue },
};

/** The spec paths present (block options and peers by sub-key), for the engine's refusal. Works on stored, unparsed specs. */
function specKeyPaths(spec: object): string[] {
  const paths: string[] = [];
  for (const [key, value] of Object.entries(spec)) {
    if (value === undefined) continue;
    const nested = key === "filters" || Object.hasOwn(OPTION_SHAPES, key);
    if (!nested || !value || typeof value !== "object" || Array.isArray(value)) { paths.push(key); continue; }
    for (const [sub, v] of Object.entries(value)) {
      if (v === undefined || v === null || key === "filters" && v === "") continue;
      paths.push(`${key}.${sub}`);
      if (key === "filters" && sub === "authorityKind" && v === LOCAL_ADMIN_KIND) paths.push(`filters.authorityKind=${LOCAL_ADMIN_KIND}`);
    }
  }
  return paths;
}
/** Present paths this release does not apply: parsed-ahead keys, and anything unknown in a stored spec. */
export function unimplementedSpecKeys(spec: unknown): string[] {
  if (!spec || typeof spec !== "object") return [];
  return specKeyPaths(spec).filter(path => !IMPLEMENTED_KEYS.has(path));
}

/**
 * Validate + normalize an untrusted spec (from LLM or a direct API caller):
 * the shape (parseSpec), then the rules of what this release can answer
 * (runnableError). A spec with keys read ahead of the engine passes; a reader
 * that is about to run it passes `refuseNewer` and gets that message instead
 * (before the rules, which a newer release may have changed).
 */
export function validateSpec(raw: unknown, opts: { refuseNewer?: string } = {}): AskSpec | SpecError {
  const spec = parseSpec(raw);
  if ("error" in spec) return spec;
  if (opts.refuseNewer && unimplementedSpecKeys(spec).length) return { error: opts.refuseNewer, newer: true };
  const error = runnableError(spec);
  return error ? { error } : spec;
}

/** The shape of a spec: lists, types, bounds. Includes the keys read ahead of the engine (plan §3). */
export function parseSpec(raw: unknown): AskSpec | SpecError {
  if (typeof raw !== "object" || raw === null)
    return { error: "spec must be an object" };
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).some(key => !["block", "dataset", "dim", "measure", "topN", "rankBy", "filters", "population", "comparisonMode", "minimumRecords", ...BLOCK_OPTION_KEYS, "peers"].includes(key)))
    return { error: "Câmp necunoscut în întrebare; condiția nu a fost ignorată." };
  const population = o["population"] === undefined ? undefined : validatePopulation(o["population"]);
  if (population && "error" in population) return population;
  if (o["comparisonMode"] !== undefined && o["comparisonMode"] !== "transactions" && o["comparisonMode"] !== "profiles") return { error:"Alege comparația de achiziții sau de profiluri istorice." };
  let minimumRecords: MinimumRecords | undefined;
  if (o["minimumRecords"] !== undefined) {
    const m = o["minimumRecords"] as Record<string, unknown> | null;
    if (!m || typeof m !== "object" || Array.isArray(m) || Object.keys(m).some(k => !["role", "count"].includes(k))
      || (m.role !== "authority" && m.role !== "supplier") || !Number.isSafeInteger(m.count) || Number(m.count) < 1 || Number(m.count) > 1000000)
      return { error:"Alege instituții sau firme și un minimum întreg între 1 și 1.000.000 de înregistrări." };
    minimumRecords = { role:m.role, count:Number(m.count) };
  }

  const block = o["block"];
  if (!BLOCKS.includes(block as Block))
    return { error: `block must be one of ${BLOCKS.join(", ")}` };

  let dataset: Dataset = "all";
  if (o["dataset"] !== undefined && o["dataset"] !== null) {
    if (!DATASETS.includes(o["dataset"] as Dataset))
      return { error: `dataset must be one of ${DATASETS.join(", ")}` };
    dataset = o["dataset"] as Dataset;
  }

  const measure = o["measure"];
  if (!MEASURES.includes(measure as Measure))
    return { error: `measure must be one of ${MEASURES.join(", ")}` };

  let dim: Dim | undefined;
  if (o["dim"] !== undefined && o["dim"] !== null) {
    if (!DIMS.includes(o["dim"] as Dim))
      return { error: `dim must be one of ${DIMS.join(", ")}` };
    dim = o["dim"] as Dim;
  }
  if ((block === "table" || block === "trend") && !dim) dim = "authority";
  if (
    (block === "entity_card" || block === "scatter") &&
    (!dim || dim === "county")
  ) {
    dim = "authority";
  }

  let topN: number | undefined;
  if (o["topN"] !== undefined && o["topN"] !== null) {
    const n = Number(o["topN"]);
    if (!Number.isFinite(n) || n < 1)
      return { error: "topN must be a positive integer" };
    topN = Math.min(Math.floor(n), MAX_TOP_N);
  }

  let rankBy: RankBy | undefined;
  if (
    o["rankBy"] !== undefined &&
    o["rankBy"] !== null &&
    RANK_BYS.includes(o["rankBy"] as RankBy)
  ) {
    rankBy = o["rankBy"] as RankBy;
  }

  const fRaw = (o["filters"] ?? {}) as Record<string, unknown>;
  if (typeof fRaw !== "object" || fRaw === null || Array.isArray(fRaw))
    return { error: "filters must be an object" };
  const stringFields = ["cpvTerm", "county", "authorityName", "supplierName", "compareWith", "uatName", "adminName", "adminPersonKey", "seatCounty"];
  const numberBounds:Record<string, [number, number]> = { authorityId:[1,Number.MAX_SAFE_INTEGER], supplierId:[1,Number.MAX_SAFE_INTEGER], compareWithId:[1,Number.MAX_SAFE_INTEGER], uatSiruta:[1,Number.MAX_SAFE_INTEGER], monthFrom:[1,12], monthTo:[1,12], yearFrom:[2000,2100], yearTo:[2000,2100], minEmployees:[0,1000000], maxEmployees:[0,1000000],
    purchaseValueMin:[0,Number.MAX_SAFE_INTEGER], purchaseValueMax:[0,Number.MAX_SAFE_INTEGER], newSince:[1990,2100] };
  const enumFields:Record<string, readonly string[]> = { purchaseKind:PURCHASE_KINDS, procedure:PROCEDURES, firmSeat:FIRM_SEATS, newScope:NEW_SCOPES };
  const trueFields = ["sharedPartners", "mainClient", "dominantSupplier"];
  for (const [key, value] of Object.entries(fRaw)) {
    if (![...stringFields, ...Object.keys(numberBounds), ...Object.keys(enumFields), ...trueFields, "singleBidder", "authorityKind"].includes(key)) return { error:`Filtru necunoscut: ${key}. Condiția nu a fost ignorată.` };
    if (value === undefined || value === null || value === "") continue;
    if (stringFields.includes(key) && (typeof value !== "string" || value.length > (key === "adminPersonKey" ? 300 : 200))) return { error:`Valoare invalidă pentru ${key}.` };
    const bounds = numberBounds[key];
    if (bounds && (!Number.isSafeInteger(Number(value)) || Number(value) < bounds[0] || Number(value) > bounds[1])) return { error:`Limită sau identificator invalid: ${key}.` };
    if (key === "authorityKind" && !AUTHORITY_KINDS.includes(value as AuthorityKind) && value !== LOCAL_ADMIN_KIND) return { error:"Tip de instituție necunoscut." };
    if (key === "singleBidder" && typeof value !== "boolean") return { error:"Filtrul de competiție trebuie să fie adevărat sau fals." };
    if (enumFields[key] && !enumFields[key].includes(value as string) || trueFields.includes(key) && value !== true) return { error:`Valoare invalidă pentru ${key}.` };
  }
  const filters: AskFilters = {};
  const str = (k: keyof AskFilters & string): string | undefined => {
    const v = fRaw[k];
    if (v === undefined || v === null || v === "") return undefined;
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t.length > 0 && t.length <= 200 ? t : undefined;
  };
  const cpvTerm = str("cpvTerm");
  if (cpvTerm) filters.cpvTerm = cpvTerm;
  const county = str("county");
  if (county) filters.county = county;
  const authorityName = str("authorityName");
  if (authorityName) filters.authorityName = authorityName;
  const supplierName = str("supplierName");
  if (supplierName) filters.supplierName = supplierName;
  const compareWith = str("compareWith");
  if (compareWith) filters.compareWith = compareWith;
  if (fRaw["uatSiruta"] !== undefined && fRaw["uatSiruta"] !== null) {
    const n = Number(fRaw["uatSiruta"]);
    if (Number.isFinite(n) && n > 0) filters.uatSiruta = Math.floor(n);
  }
  const uatName = str("uatName");
  if (filters.uatSiruta && uatName) filters.uatName = uatName;
  for (const k of ["authorityId", "supplierId", "compareWithId"] as const) {
    if (fRaw[k] !== undefined && fRaw[k] !== null) {
      const n = Number(fRaw[k]);
      if (Number.isFinite(n) && n > 0) filters[k] = Math.floor(n);
    }
  }
  const adminName = str("adminName");
  if (adminName) filters.adminName = adminName;
  if (typeof fRaw["adminPersonKey"] === "string") {
    const k = fRaw["adminPersonKey"].trim();
    if (k.length > 0 && k.length <= 300) filters.adminPersonKey = k;
  }
  for (const k of ["monthFrom", "monthTo"] as const) {
    if (fRaw[k] !== undefined && fRaw[k] !== null) {
      const n = Number(fRaw[k]);
      if (Number.isFinite(n) && n >= 1 && n <= 12) filters[k] = Math.floor(n);
    }
  }
  if (fRaw["singleBidder"] === true) {
    filters.singleBidder = true;
    // competition only exists on the contracts stream — switch, loudly (compile
    // adds the caveat)
    dataset = "contracts";
  }
  if (
    fRaw["authorityKind"] !== undefined &&
    fRaw["authorityKind"] !== null &&
    (AUTHORITY_KINDS.includes(fRaw["authorityKind"] as AuthorityKind) || fRaw["authorityKind"] === LOCAL_ADMIN_KIND)
  ) {
    filters.authorityKind = fRaw["authorityKind"] as ParsedAuthorityKind;
  }
  // Read ahead of the engine (plan §3); the loop above checked each value.
  const seatCounty = str("seatCounty");
  if (seatCounty) filters.seatCounty = seatCounty;
  if (typeof fRaw["purchaseKind"] === "string" && fRaw["purchaseKind"]) filters.purchaseKind = fRaw["purchaseKind"] as (typeof PURCHASE_KINDS)[number];
  if (typeof fRaw["procedure"] === "string" && fRaw["procedure"]) filters.procedure = fRaw["procedure"] as (typeof PROCEDURES)[number];
  if (typeof fRaw["firmSeat"] === "string" && fRaw["firmSeat"]) filters.firmSeat = fRaw["firmSeat"] as (typeof FIRM_SEATS)[number];
  if (typeof fRaw["newScope"] === "string" && fRaw["newScope"]) filters.newScope = fRaw["newScope"] as (typeof NEW_SCOPES)[number];
  for (const k of ["purchaseValueMin", "purchaseValueMax", "newSince"] as const)
    if (fRaw[k] !== undefined && fRaw[k] !== null && fRaw[k] !== "") filters[k] = Number(fRaw[k]);
  for (const k of ["sharedPartners", "mainClient", "dominantSupplier"] as const) if (fRaw[k] === true) filters[k] = true;
  // [min, max): the upper bound is not in the range (lib/ask/purchase.ts VALUE_RANGES), so it must be above the lower one.
  if (filters.purchaseValueMin !== undefined && filters.purchaseValueMax !== undefined && filters.purchaseValueMin >= filters.purchaseValueMax)
    return { error:"Limita de sus a mărimii trebuie să fie peste cea de jos; corectează limitele." };
  // A procedure is one of the contracts' (stat final §3.1): it brings their stream, loudly as the single
  // bidder does; on the direct acquisitions runnableError refuses it (SELECTION_RULES).
  if (filters.procedure && dataset !== "da") dataset = "contracts";
  for (const k of ["yearFrom", "yearTo"] as const) {
    const v = fRaw[k];
    if (v === undefined || v === null) continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 2000 && n <= 2100)
      filters[k] = Math.floor(n);
  }
  for (const k of ["minEmployees", "maxEmployees"] as const) {
    const v = fRaw[k];
    if (v === undefined || v === null) continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0 && n <= 1_000_000)
      filters[k] = Math.floor(n);
  }
  if (
    filters.minEmployees !== undefined &&
    filters.maxEmployees !== undefined &&
    filters.minEmployees > filters.maxEmployees
  ) {
    return { error:"Numărul minim de angajați depășește maximul; corectează limitele." };
  }
  if (filters.yearFrom && filters.yearTo && filters.yearFrom > filters.yearTo) {
    return { error:"Anul de început depășește anul de sfârșit; corectează perioada." };
  }

  const options: Pick<AskSpec, OptionKey> = {};
  for (const key of [...BLOCK_OPTION_KEYS, "peers"] as const) {
    const value = o[key];
    if (value === undefined || value === null) continue;
    // A link built before retarget (filters/retarget.ts) keeps working: another
    // block's options cannot change this answer, so dropping them hides no condition.
    if (!optionBelongs(key, block as string)) {
      if (key === "peers") return { error:"Grupul de comparație nu se aplică acestei întrebări." };
      continue;
    }
    if (typeof value !== "object" || Array.isArray(value)) return { error:`Valoare invalidă pentru ${key}.` };
    const kept: Record<string, unknown> = {};
    for (const [sub, v] of Object.entries(value)) {
      if (v === undefined) continue;
      // Own keys only: "toString" or "__proto__" in a link must not resolve to Object.prototype.
      const valid = Object.hasOwn(OPTION_SHAPES[key], sub) ? OPTION_SHAPES[key][sub] : undefined;
      if (!valid) return { error:"Câmp necunoscut în întrebare; condiția nu a fost ignorată." };
      if (!valid(v)) return { error:`Valoare invalidă pentru ${key}.${sub}.` };
      kept[sub] = Array.isArray(v) ? [...v] : v;
    }
    (options as Record<string, unknown>)[key] = kept;
  }

  const spec: AskSpec = {
    block: block as Block,
    measure: block === "entity_card" && rankBy === "value" ? "value" : measure as Measure,
    filters,
  };
  if (dataset !== "all") spec.dataset = dataset;
  if (dim) spec.dim = dim;
  if (topN) spec.topN = topN;
  if (rankBy) spec.rankBy = rankBy;
  if (population) spec.population = population;
  if (minimumRecords) spec.minimumRecords = minimumRecords;
  if (o["comparisonMode"] !== undefined) spec.comparisonMode = o["comparisonMode"] as "transactions" | "profiles";
  return Object.assign(spec, options);
}

/** The base of the order in percent when the spec names none (trend final §3.9: from 1 mil. lei in year A). */
export const DEFAULT_TREND_MIN_BASE = 1_000_000;
/**
 * The rules of the trend's options (plan §3, trend final §6.1): the order and
 * its base only on growths, the base only for the order in percent, the first
 * year only on the new ones of a ranking of entities. FilterDef.validate of
 * lib/ask/filters/defs/trend.ts; runnableError runs every one.
 */
export const TREND_RULES: Readonly<Record<"order" | "minBase" | "firstOnly", (spec: AskSpec) => string | null>> = {
  order: (spec) => spec.trend?.order !== undefined && spec.trend.change !== "up"
    ? "Ordonarea se alege doar la creșteri. Alege «Creșteri» sau scoate ordonarea." : null,
  minBase: (spec) => spec.trend?.minBase !== undefined && spec.trend.order !== "percent"
    ? "Pragul „cel puțin … lei” se aplică doar ordonării în procente." : null,
  firstOnly: (spec) => spec.trend?.firstOnly && (spec.trend.change !== "new" || spec.dim === "county")
    ? "„Prima dată” se aplică doar firmelor sau instituțiilor noi." : null,
};

/**
 * The rules of the evolution's options (plan §3, final timeseries §3.7–§3.9):
 * month by month needs its years, at most 36 months; the same months cut whole
 * years (not months, nor a series with month bounds); the split by channel is
 * of every purchase, by domain of more than one domain. FilterDef.validate of
 * lib/ask/filters/defs/timeseries.ts; runnableError runs every one.
 */
export const TIMESERIES_RULES: Readonly<Record<"grain" | "months" | "split", (spec: AskSpec) => string | null>> = {
  // The same months first: a refusal names the option to remove (transition.ts settle blames what changes the error),
  // never the period that month by month also needs.
  months: (spec) => spec.timeseries?.months !== undefined
    && (spec.timeseries.grain === "month" || spec.filters.monthFrom !== undefined || spec.filters.monthTo !== undefined)
    ? "„Aceleași luni” taie anii întregi, an de an. Scoate lunile din perioadă sau alege „An de an”." : null,
  split: (spec) => spec.timeseries?.split === "channel" && (spec.dataset ?? "all") !== "all"
    ? "„Directe / proceduri” împarte toate achizițiile. Alege „Toate achizițiile” sau „Total”."
    : spec.timeseries?.split === "domain" && (spec.filters.cpvTerm || spec.filters.purchaseKind === "lucrari")
      ? "„Domenii” nu împarte un singur domeniu. Scoate domeniul sau alege „Total”." : null,
  grain: (spec) => {
    if (spec.timeseries?.grain !== "month") return null;
    const span = seriesMonthsSpan(spec.filters);
    if (span === null) return `„Lună de lună” cere perioada: alege cel mult ${MAX_SERIES_MONTHS} de luni.`;
    return span > MAX_SERIES_MONTHS ? `„Lună de lună” arată cel mult ${MAX_SERIES_MONTHS} de luni. Alege o perioadă mai scurtă sau „An de an”.` : null;
  },
};

/** The DA analysis ceiling of the engine (lib/ask/predicates.ts DA_PLAFOND_RON; spec.test.ts checks they agree). */
export const DA_CEILING_RON = 2_000_000;
/**
 * The rules of the common selection (plan §3, F3): a procedure is a contract's
 * (it brings the contracts' stream; the direct acquisitions have none), and a
 * direct acquisition is counted up to the analysis ceiling, so a size above it
 * cannot hold one. The kind and the domain combine (kit §5.3): a CPV code
 * says its kinds here, so a kind it has no codes of is refused (the builder
 * shows it disabled, and a new code drops it with a note); words are matched
 * on the server, where an empty intersection leaves the kind out with a note
 * (predicateContext, resolvedSpec). FilterDef.validate of lib/ask/filters/defs/selection.ts and ranking.ts.
 */
export const SELECTION_RULES: Readonly<Record<"purchaseKind" | "procedure" | "purchaseValue", (spec: AskSpec) => string | null>> = {
  purchaseKind: (spec) => {
    const kind = spec.filters.purchaseKind, reached = codeKinds(spec.filters.cpvTerm);
    if (!kind || !reached || reached.has(kind)) return null;
    return `CPV ${String(spec.filters.cpvTerm).trim()} nu are coduri de ${PURCHASE_KIND_WORDS[kind].noun}. Alege alt tip sau „Orice”.`;
  },
  procedure: (spec) => spec.filters.procedure && spec.dataset !== "contracts"
    ? "Procedura se alege doar la contractele din proceduri. Alege „Contractele din proceduri” sau scoate procedura." : null,
  purchaseValue: (spec) => spec.dataset === "da" && spec.filters.purchaseValueMin !== undefined && spec.filters.purchaseValueMin > DA_CEILING_RON
    ? "Achizițiile directe se numără până la 2 mil. lei. Alege o limită mai mică sau și contractele." : null,
};

/** The questions whose subject are firms, where a firm's own county (seatCounty) is offered (plan §3, kit §7). */
export const SEAT_COUNTY_BLOCKS: readonly Block[] = ["table", "trend", "entity_card", "scatter"];
/**
 * The rules of the firm's seat (plan §2.5, §3, F4; kit §5.4, §7): one column,
 * two keys. firmSeat is the seat against the buyer's county on each record
 * (same, other) or abroad; seatCounty the firm's own county, where firms are
 * the subject. They exclude each other. A foreign firm has no MF filing, so
 * "abroad" excludes a size; a profile has no record to compare (the county of
 * a firm profile is its seat: seatCounty there). FilterDef.validate of
 * lib/ask/filters/defs/seat.ts; runnableError runs both.
 */
/**
 * „Primăriile și consiliile județene” (F5, plan §3, map final §3.3): the strict list of the per-inhabitant ranking
 * (lib/ask/per-capita.ts), each in the county it administers, compared county by county on the map only (the table
 * per inhabitant keeps its own measure). A county, a town hall or one institution would leave one county or a part
 * of it: the counties are the answer.
 */
export const LOCAL_ADMIN_ONLY_MAP = "„Primăriile și consiliile județene” se compară doar pe hartă. Alege alt tip de instituții.";
export const LOCAL_ADMIN_PLACE = "„Primăriile și consiliile județene” se compară pe toată țara. Scoate județul, localitatea sau instituția.";
export const MAP_RULES: Readonly<Record<"localAdmin", (spec: AskSpec) => string | null>> = {
  localAdmin: (spec) => {
    if (spec.filters.authorityKind !== LOCAL_ADMIN_KIND) return null;
    if (spec.block !== "map") return LOCAL_ADMIN_ONLY_MAP;
    const f = spec.filters;
    if (f.county || f.uatSiruta || f.authorityId || f.authorityName) return LOCAL_ADMIN_PLACE;
    return null;
  },
};

export const SEAT_RULES: Readonly<Record<"firmSeat" | "seatCounty", (spec: AskSpec) => string | null>> = {
  firmSeat: (spec) => {
    const seat = spec.filters.firmSeat;
    if (!seat) return null;
    if (spec.filters.seatCounty) return "Sediul firmei e ales de două ori. Păstrează un singur sediu.";
    if (seat === "abroad" && (spec.filters.minEmployees !== undefined || spec.filters.maxEmployees !== undefined || spec.filters.newScope === "registry"))
      return "Firmele străine nu au bilanț și nici număr la Registrul Comerțului. Scoate angajații sau alege alt sediu.";
    return null;
  },
  seatCounty: (spec) => {
    if (!spec.filters.seatCounty) return null;
    if (spec.dim !== "supplier" || !SEAT_COUNTY_BLOCKS.includes(spec.block))
      return "Județul sediului se alege doar când întrebarea e despre firme. Alege „firme” sau scoate sediul.";
    // On firm profiles the county is the seat too (countyIsFirmSeat): two of them would be two seats.
    if (spec.filters.county && (spec.block === "scatter" || spec.block === "entity_card" && spec.rankBy !== "value"))
      return "Sediul firmei e ales de două ori. Păstrează un singur județ.";
    return null;
  },
};

/** The archive's own first year is inflated by its start (final table §3.3): a firm new for a buyer or in the archive is from 2020. */
export const NEW_ARCHIVE_FROM = 2020;
/** A buyer the question names: one institution, or a town hall with all its identities (uatSiruta). */
export const namedBuyer = (filters: AskFilters): boolean =>
  Boolean(filters.authorityId || filters.authorityName || filters.uatSiruta);
/** The rankings whose firms are the subject: a ranking of firms, and "Cine conduce?" by value, which runs it. */
const firmRanking = (spec: AskSpec) => spec.dim === "supplier" && (spec.block === "table" || spec.block === "entity_card" && spec.rankBy === "value");
/** The rankings with "Firme noi": firms (a group, CÂȘTIGĂTORII) or, on institutions and counties, their sellers ("de la [firme …]"). */
const rankedBlock = (spec: AskSpec) => spec.block === "table" || spec.block === "entity_card" && spec.rankBy === "value";

/**
 * The rules of the ranked winners' conditions (plan §3, §4.2, F5; final table
 * §3.3, §3.6, §3.7, §4): "Firme noi" names its sense and its year together, on
 * a ranking (and "Cine conduce?" by value); new for the buyer needs a named
 * buyer and firms as the subject; the archive's own senses start in 2020, and
 * no sense starts after the period. „Principalul lor client public” is a
 * ranking of firms of one named buyer; „O firmă ia peste jumătate” a ranking of
 * institutions. A foreign firm has no trade register number (SEAT_RULES).
 * FilterDef.validate of lib/ask/filters/defs/winners.ts; runnableError runs each.
 */
export const WINNERS_RULES: Readonly<Record<"newSince" | "mainClient" | "dominantSupplier", (spec: AskSpec) => string | null>> = {
  newSince: (spec) => {
    const { newSince: since, newScope: scope } = spec.filters;
    if (since === undefined && scope === undefined) return null;
    if (since === undefined || scope === undefined) return "„Firme noi” cere sensul și anul. Alege-le din fereastră.";
    if (!rankedBlock(spec)) return "„Firme noi” se alege doar la clasamente. Alege „Cine câștigă?” sau scoate condiția.";
    if (scope === "buyer" && !(firmRanking(spec) && namedBuyer(spec.filters)))
      return "„Furnizori noi” cere o instituție aleasă și firmele ca subiect. Alege instituția sau alt sens.";
    if (scope !== "registry" && since < NEW_ARCHIVE_FROM) return `„Firme noi” în acest sens începe din ${NEW_ARCHIVE_FROM}. Alege alt an.`;
    if (spec.filters.yearTo !== undefined && since > spec.filters.yearTo) return "Anul din „Firme noi” e după sfârșitul perioadei. Alege un an din perioadă.";
    return null;
  },
  mainClient: (spec) => spec.filters.mainClient && !(spec.block === "table" && spec.dim === "supplier" && namedBuyer(spec.filters))
    ? "„Principalul lor client public” cere un clasament de firme și o instituție aleasă." : null,
  dominantSupplier: (spec) => spec.filters.dominantSupplier && !(spec.block === "table" && spec.dim === "authority")
    ? "„O firmă ia peste jumătate” se alege doar la clasamentul instituțiilor." : null,
};

/**
 * The rules of the network's options (plan §3, §4.8, F4; final network §3.2):
 * a group is of the whole relation against its reference year, so it takes no
 * period (the builder keeps the period's first year as the reference). The
 * reference year itself is checked against the archive by the engine (the
 * last year every channel has complete, network-shared.ts networkLastYear).
 * FilterDef.validate of lib/ask/filters/defs/network.ts; runnableError runs it.
 */
export const NETWORK_RULES: Readonly<Record<"partners", (spec: AskSpec) => string | null>> = {
  partners: (spec) => spec.network?.partners && [spec.filters.yearFrom, spec.filters.yearTo, spec.filters.monthFrom, spec.filters.monthTo].some((v) => v !== undefined)
    ? "Grupele privesc toată relația, fără perioadă. Alege „Toți” sau scoate perioada." : null,
};

/**
 * The rules of the comparison's options (plan §3, §4.6, F4; final compare
 * §3.4): „Doar clienții comuni” is a comparison of two firms, where the
 * institutions both sold to are known; between two institutions the shared
 * suppliers stay the answer's own section. FilterDef.validate of
 * lib/ask/filters/defs/compare.ts; runnableError runs it.
 */
export const COMPARE_RULES: Readonly<Record<"sharedPartners", (spec: AskSpec) => string | null>> = {
  sharedPartners: (spec) => spec.filters.sharedPartners
    && (spec.block !== "compare" || spec.filters.authorityId !== undefined || Boolean(spec.filters.authorityName) || !(spec.filters.supplierId || spec.filters.supplierName))
    ? "„Doar clienții comuni” există doar la compararea a două firme." : null,
};

/**
 * The comparison group's rule (plan §3, final distribution §7.1): only on the
 * distribution (the cloud and "Cine conduce?" read it ahead, F6b–c), "același
 * tip" only of an institution, the main domain only of a firm.
 * FilterDef.validate of lib/ask/filters/defs/profile.ts; runnableError runs it.
 */
export function peersRule(spec: AskSpec): string | null {
  const p = spec.peers;
  if (!p || !Object.keys(p).length) return null;
  if (spec.block !== "distribution") return "Grupul de comparație se alege doar la „Unde se situează?”. Scoate-l sau alege această întrebare.";
  const firm = !(spec.filters.authorityId || spec.filters.authorityName) && Boolean(spec.filters.supplierId || spec.filters.supplierName);
  if (p.similar && firm) return "„Același tip” se aplică doar instituțiilor; la firme, alege județul sau activitatea apropiată.";
  if (p.domain && !firm) return "„Același domeniu principal” se aplică doar firmelor.";
  return null;
}

/** What this release can answer, on a parsed spec. Null when it can run. */
export function runnableError(spec: AskSpec): string | null {
  const { block, dim, measure, filters } = spec;
  // per-capita only makes sense ranked/scoped over authorities
  if (
    measure === "value_per_capita" &&
    block === "table" &&
    dim !== "authority"
  ) {
    return "value_per_capita requires dim=authority";
  }

  // block-specific requirements
  const focal =
    filters.authorityId ??
    filters.authorityName ??
    filters.supplierId ??
    filters.supplierName;
  if (FOCAL_BLOCKS.includes(block as Block) && !focal) {
    return `block=${String(block)} requires filters.authorityName or filters.supplierName`;
  }
  if (
    block === "compare" &&
    (!focal || !(filters.compareWithId || filters.compareWith))
  ) {
    return "block=compare requires a focal entity (authorityName/supplierName) and compareWith";
  }
  if (
    block === "fact_check" &&
    (!(filters.authorityName || filters.authorityId) ||
      !(filters.supplierName || filters.supplierId))
  ) {
    return "block=fact_check requires both authorityName and supplierName";
  }
  if (block === "trend" && (filters.monthFrom !== undefined || filters.monthTo !== undefined))
    return "Schimbarea compară doi ani întregi. Elimină explicit lunile sau alege evoluția în timp; filtrele nu au fost eliminate.";
  for (const rule of [...Object.values(TREND_RULES), ...Object.values(SELECTION_RULES), ...Object.values(TIMESERIES_RULES), ...Object.values(SEAT_RULES), ...Object.values(NETWORK_RULES), ...Object.values(COMPARE_RULES), ...Object.values(WINNERS_RULES), ...Object.values(MAP_RULES)]) {
    const error = rule(spec);
    if (error) return error;
  }
  const peers = peersRule(spec);
  if (peers) return peers;
  // Degenerate rankings: the row dimension pinned to a single value by a filter
  // would produce a one-row "clasament". (dim defaults to authority downstream.)
  if (block === "table" || block === "trend" || block === "scatter") {
    const effDim = dim ?? "authority";
    if (effDim === "county" && (filters.county || filters.uatSiruta)) {
      return "Clasamentul e deja pe județe — scoate județul/localitatea sau alege altă dimensiune.";
    }
    if (
      effDim === "authority" &&
      (filters.authorityName || filters.authorityId)
    ) {
      return "Ai filtrat pe o singură autoritate — pentru un clasament alege dimensiunea furnizori/județe, sau folosește «un total» / «fișă entitate».";
    }
    if (effDim === "supplier" && (filters.supplierName || filters.supplierId)) {
      return "Ai filtrat pe o singură firmă — pentru un clasament alege dimensiunea autorități/județe, sau folosește «un total» / «fișă entitate».";
    }
  }

  return unsupportedPopulationView(spec);
}

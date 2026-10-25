import { validatePopulation, unsupportedPopulationView, type MinimumRecords, type QueryPopulation } from "./population";

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
export const NEW_SCOPES = ["buyer", "archive", "registry"] as const;
export const TREND_CHANGES = ["all", "up", "down", "new", "gone"] as const;
export const NETWORK_PARTNERS = ["new", "continuing", "gone"] as const;
export const SCATTER_FLAGS = ["da_split", "da_year_end", "da_rapid", "da_round", "da_concentration", "da_dependence"] as const;
/** First and last month (1–12) of a window repeated in each year. */
export type MonthWindow = readonly [number, number];
export interface TrendOptions {
  change?: (typeof TREND_CHANGES)[number];
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
        "table = clasament/top pe o dimensiune; stat = un singur număr total; timeseries = evoluție pe ani; map = valori pe județe (hartă); compare = două entități față în față; distribution = unde se situează o entitate în distribuția indicelui de risc; breakdown = compoziția cheltuielii pe categorii CPV; scatter = risc vs volum, cu outlieri; sankey = fluxul banilor unei entități (parteneri → categorii); network = rețeaua de parteneri a unei entități; entity_card = O SINGURĂ entitate-superlativ (cea mai riscantă / cea mai mare); fact_check = a cumpărat X de la Y? (Da/Nu cu dovezi); trend = schimbarea între doi ani, pe entități",
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
]);
/**
 * Paths parseSpec reads ahead of the engine (plan §3), with the stage that
 * implements each. "filters.authorityKind=local_admin" is a value of an
 * existing key; "options.members" belongs to a watch, not to the spec.
 */
export const READ_AHEAD_KEYS = {
  "trend.change": "F2", "trend.months": "F2", "trend.order": "F2", "trend.minBase": "F2", "trend.firstOnly": "F2",
  "options.members": "F2",
  "timeseries.grain": "F3", "timeseries.split": "F3", "timeseries.months": "F3",
  "filters.purchaseKind": "F3", "filters.procedure": "F3", "filters.purchaseValueMin": "F3", "filters.purchaseValueMax": "F3",
  "filters.firmSeat": "F4", "filters.seatCounty": "F4", "filters.sharedPartners": "F4", "sankey.shown": "F4",
  "network.partners": "F4", "network.since": "F4", "network.order": "F4", "network.show": "F4", "network.signals": "F4",
  "filters.newSince": "F5", "filters.newScope": "F5", "filters.mainClient": "F5", "filters.dominantSupplier": "F5",
  "filters.authorityKind=local_admin": "F5",
  "peers.similar": "F6a", "peers.activity": "F6a", "peers.domain": "F6a",
  "scatter.flag": "F6b", "scatter.rankBy": "F6b",
} as const satisfies Record<string, string>;

/** Options that belong to one block. On another block they cannot change the answer and are dropped. */
export const BLOCK_OPTION_KEYS = ["trend", "timeseries", "network", "sankey", "scatter"] as const;
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
  if (filters.purchaseValueMin !== undefined && filters.purchaseValueMax !== undefined && filters.purchaseValueMin > filters.purchaseValueMax)
    return { error:"Valoarea minimă depășește maximul; corectează limitele." };
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

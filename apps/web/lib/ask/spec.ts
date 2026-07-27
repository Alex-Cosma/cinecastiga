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
 *  - "da": direct acquisitions only, below threshold (20,8M rows)
 *  - "contracts": awarded contracts from competitive procedures, above
 *    threshold (per-winner rows, consortium value split equally)
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

export interface AskFilters {
  /** Free-text subject ("lemne", "medicamente") — grounded to CPV server-side. */
  cpvTerm?: string;
  /** County name, Romanian, diacritics optional ("Botoșani", "cluj"). */
  county?: string;
  /** Restrict authorities by kind (name-pattern heuristic). */
  authorityKind?: AuthorityKind;
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
   * only — DAs have no competition by definition). Competition data exists for
   * the TED-confirmed subset; unknown ≠ competitive.
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
}

export interface AskSpec {
  block: Block;
  /** Data stream (default "da"). */
  dataset?: Dataset;
  /** table/trend/entity_card/scatter: what each row/point is. */
  dim?: Dim;
  measure: Measure;
  /** table/trend only; capped at MAX_TOP_N. */
  topN?: number;
  /** entity_card: superlative axis (risk = CRI, value = spend). */
  rankBy?: RankBy;
  filters: AskFilters;
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
        "Sursa de date: 'all' = ambele canale, achiziții directe + contracte (IMPLICIT — canale disjuncte, sumă onestă); 'da' = DOAR achiziții directe (sub prag) — când omul spune explicit 'achiziții directe'/'sub prag'; 'contracts' = DOAR contracte din licitații/proceduri (peste prag) — când întrebarea e despre licitații, proceduri, competiție, ofertanți.",
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
          description: "Județul AUTORITĂȚII cumpărătoare, dacă întrebarea e limitată la unul.",
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
            "true = doar contracte cu UN SINGUR ofertant la licitație ('fără competiție'). Forțează dataset='contracts' — achizițiile directe nu au ofertanți.",
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
            "Doar firmele conduse de această persoană (reprezentant legal/administrator la Registrul Comerțului). Ex: 'firmele lui Ion Popescu' → 'Ion Popescu'.",
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
}

/** Blocks that require a focal entity (authorityName or supplierName). */
export const FOCAL_BLOCKS: Block[] = ["distribution", "sankey", "network"];

/** Validate + normalize an untrusted spec (from LLM or a direct API caller). */
export function validateSpec(raw: unknown): AskSpec | SpecError {
  if (typeof raw !== "object" || raw === null) return { error: "spec must be an object" };
  const o = raw as Record<string, unknown>;

  const block = o["block"];
  if (!BLOCKS.includes(block as Block)) return { error: `block must be one of ${BLOCKS.join(", ")}` };

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
    if (!DIMS.includes(o["dim"] as Dim)) return { error: `dim must be one of ${DIMS.join(", ")}` };
    dim = o["dim"] as Dim;
  }
  if ((block === "table" || block === "trend") && !dim) dim = "authority";
  if ((block === "entity_card" || block === "scatter") && (!dim || dim === "county")) {
    dim = "authority";
  }

  let topN: number | undefined;
  if (o["topN"] !== undefined && o["topN"] !== null) {
    const n = Number(o["topN"]);
    if (!Number.isFinite(n) || n < 1) return { error: "topN must be a positive integer" };
    topN = Math.min(Math.floor(n), MAX_TOP_N);
  }

  let rankBy: RankBy | undefined;
  if (o["rankBy"] !== undefined && o["rankBy"] !== null && RANK_BYS.includes(o["rankBy"] as RankBy)) {
    rankBy = o["rankBy"] as RankBy;
  }

  const fRaw = (o["filters"] ?? {}) as Record<string, unknown>;
  if (typeof fRaw !== "object" || fRaw === null) return { error: "filters must be an object" };
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
  for (const k of ["authorityId", "supplierId"] as const) {
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
    AUTHORITY_KINDS.includes(fRaw["authorityKind"] as AuthorityKind)
  ) {
    filters.authorityKind = fRaw["authorityKind"] as AuthorityKind;
  }
  for (const k of ["yearFrom", "yearTo"] as const) {
    const v = fRaw[k];
    if (v === undefined || v === null) continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 2000 && n <= 2100) filters[k] = Math.floor(n);
  }
  for (const k of ["minEmployees", "maxEmployees"] as const) {
    const v = fRaw[k];
    if (v === undefined || v === null) continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0 && n <= 1_000_000) filters[k] = Math.floor(n);
  }
  if (
    filters.minEmployees !== undefined &&
    filters.maxEmployees !== undefined &&
    filters.minEmployees > filters.maxEmployees
  ) {
    const t = filters.minEmployees;
    filters.minEmployees = filters.maxEmployees;
    filters.maxEmployees = t;
  }
  if (filters.yearFrom && filters.yearTo && filters.yearFrom > filters.yearTo) {
    const t = filters.yearFrom;
    filters.yearFrom = filters.yearTo;
    filters.yearTo = t;
  }

  // per-capita only makes sense ranked/scoped over authorities
  if (measure === "value_per_capita" && block === "table" && dim !== "authority") {
    return { error: "value_per_capita requires dim=authority" };
  }

  // block-specific requirements
  const focal = filters.authorityName ?? filters.supplierName;
  if (FOCAL_BLOCKS.includes(block as Block) && !focal) {
    return {
      error: `block=${String(block)} requires filters.authorityName or filters.supplierName`,
    };
  }
  if (block === "compare" && (!focal || !filters.compareWith)) {
    return {
      error: "block=compare requires a focal entity (authorityName/supplierName) and compareWith",
    };
  }
  if (block === "fact_check" && (!filters.authorityName || !filters.supplierName)) {
    return { error: "block=fact_check requires both authorityName and supplierName" };
  }
  // The map IS a by-county breakdown — a county/locality filter is contradictory.
  if (block === "map" && (filters.county || filters.uatSiruta)) {
    return {
      error:
        "Harta e deja o împărțire pe județe — scoate județul/localitatea sau alege alt tip de răspuns.",
    };
  }
  // Degenerate rankings: the row dimension pinned to a single value by a filter
  // would produce a one-row "clasament". (dim defaults to authority downstream.)
  if (block === "table" || block === "trend" || block === "scatter") {
    const effDim = dim ?? "authority";
    if (effDim === "county" && (filters.county || filters.uatSiruta)) {
      return {
        error:
          "Clasamentul e deja pe județe — scoate județul/localitatea sau alege altă dimensiune.",
      };
    }
    if (effDim === "authority" && (filters.authorityName || filters.authorityId)) {
      return {
        error:
          "Ai filtrat pe o singură autoritate — pentru un clasament alege dimensiunea furnizori/județe, sau folosește «un total» / «fișă entitate».",
      };
    }
    if (effDim === "supplier" && (filters.supplierName || filters.supplierId)) {
      return {
        error:
          "Ai filtrat pe o singură firmă — pentru un clasament alege dimensiunea autorități/județe, sau folosește «un total» / «fișă entitate».",
      };
    }
  }

  const spec: AskSpec = { block: block as Block, measure: measure as Measure, filters };
  if (dataset !== "all") spec.dataset = dataset;
  if (dim) spec.dim = dim;
  if (topN) spec.topN = topN;
  if (rankBy) spec.rankBy = rankBy;
  return spec;
}

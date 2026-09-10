import {
  bigint,
  boolean,
  jsonb,
  index,
  integer,
  numeric,
  pgSchema,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";

/**
 * Gold layer: precomputed aggregates over `core`, rebuilt by the marts job
 * (truncate + recompute — marts-layer DEC-001). Written only by the ingestion
 * batch build, read by the web app. All money columns are `numeric` RON
 * (DEC-003); time grain is calendar year + overall (DEC-004).
 */
export const martsSchema = pgSchema("marts");

/** Headline counts + spend, per stream, per year (year NULL = overall). */
export const nationalStats = martsSchema.table(
  "national_stats",
  {
    /** 'notice' | 'award' | 'da' */
    kind: text("kind").notNull(),
    /** Calendar year (Europe/Bucharest); NULL row = all-time total. */
    year: integer("year"),
    n: integer("n").notNull(),
    totalRon: numeric("total_ron"),
  },
  // year is nullable (NULL = all-time), so it can't sit in a PK. The build
  // truncates + recomputes and emits exactly one row per (kind, year), so a
  // plain index suffices for lookups (no uniqueness enforcement needed).
  (t) => [index("national_stats_kind_year_idx").on(t.kind, t.year)],
);

/**
 * Spend by acquisition type (Furnizare/Servicii/Lucrari) per stream — the cut
 * the user's 2020 build used (contractsTotalSpendingByType). NULL type = unknown.
 */
export const spendByType = martsSchema.table(
  "spend_by_type",
  {
    /** 'award' | 'da' */
    kind: text("kind").notNull(),
    acquisitionType: text("acquisition_type"),
    n: integer("n").notNull(),
    totalRon: numeric("total_ron"),
  },
  (t) => [index("spend_by_type_idx").on(t.kind, t.acquisitionType)],
);

/** Spend by CPV division (2-digit), per stream. Treemap source. */
export const spendByCpv = martsSchema.table(
  "spend_by_cpv",
  {
    division: text("division").notNull(),
    nameRo: text("name_ro"),
    /** 'contract' | 'da' */
    kind: text("kind").notNull(),
    n: integer("n").notNull(),
    totalRon: numeric("total_ron"),
  },
  (t) => [
    primaryKey({ columns: [t.division, t.kind] }),
    index("spend_by_cpv_total_idx").on(t.totalRon),
  ],
);

/**
 * Full CPV hierarchy with rolled-up spend per node — the drill-down treemap
 * source. `level` 1 = division (2-digit root, parent NULL) → 5 = category.
 * Query `where parent_code is null` for the top ring, then by `parent_code` to
 * drill. Populated from the 2020 dump's nested nationalCpvDataSimplified; the
 * live build derives it from core CPV rollups (TODO).
 */
export const cpvTree = martsSchema.table(
  "cpv_tree",
  {
    code: text("code").primaryKey(),
    parentCode: text("parent_code"),
    level: integer("level").notNull(),
    nameRo: text("name_ro"),
    totalRon: numeric("total_ron"),
    nChildren: integer("n_children").notNull().default(0),
  },
  (t) => [
    index("cpv_tree_parent_idx").on(t.parentCode),
    index("cpv_tree_level_total_idx").on(t.level, t.totalRon),
  ],
);

/**
 * Spend by Romanian county, per role — the choropleth source. Authority-side
 * shows where public money is contracted from; supplier-side where it is won.
 * County is the denormalized `entity_profile.county` (diacritic-free SICAP form).
 */
export const spendByCounty = martsSchema.table(
  "spend_by_county",
  {
    county: text("county").notNull(),
    /** 'supplier' | 'authority' */
    role: text("role").notNull(),
    n: integer("n").notNull(),
    totalRon: numeric("total_ron"),
  },
  (t) => [primaryKey({ columns: [t.county, t.role] })],
);

/**
 * Per-entity aggregate, one row per (entity, role). An entity can be both a
 * supplier and an authority → two rows. Consortia (DEC-006): supplier totals
 * carry both `total_ron_full` (each member credited the whole contract) and
 * `total_ron_split` (contract_value / winner-count). For authorities the two
 * are equal (a buyer pays the full amount).
 */
export const entityProfile = martsSchema.table(
  "entity_profile",
  {
    entityId: bigint("entity_id", { mode: "bigint" }).notNull(),
    /** 'supplier' | 'authority' */
    role: text("role").notNull(),
    // Denormalized from core.entities so the web reads marts only (CQRS-lite —
    // no request-time join into core). Filled by the marts build.
    nameDisplay: text("name_display"),
    county: text("county"),
    /** Denormalized from core.entities so profiles can badge foreign suppliers. */
    countryCode: text("country_code"),
    isForeign: boolean("is_foreign").notNull().default(false),
    /** Matched UAT (SIRUTA code) + its 2021 population — for per-capita normalization.
     *  Only set for authorities that resolve to a commune/city/municipality. */
    uatSiruta: integer("uat_siruta"),
    population: integer("population"),
    nContracts: integer("n_contracts").notNull().default(0),
    nDas: integer("n_das").notNull().default(0),
    totalRonFull: numeric("total_ron_full"),
    /** Equal-split attribution — an ASSUMPTION (SICAP gives no per-member split). */
    totalRonSplit: numeric("total_ron_split"),
    firstActivity: text("first_activity"),
    lastActivity: text("last_activity"),
    /** MF bilanț (reference.company_financials): latest filing with an employee
     *  count, joined by cui_canonical at build time. Suppliers only; null =
     *  no filing (PFA, foreign, dissolved) — an informative absence. */
    employees: integer("employees"),
    employeesYear: integer("employees_year"),
    netTurnover: numeric("net_turnover"),
  },
  (t) => [
    primaryKey({ columns: [t.entityId, t.role] }),
    index("entity_profile_role_full_idx").on(t.role, t.totalRonFull),
  ],
);

/** Top counterparties per entity (suppliers↔authorities). Ranked, capped. */
export const entityTopPartners = martsSchema.table(
  "entity_top_partners",
  {
    entityId: bigint("entity_id", { mode: "bigint" }).notNull(),
    /** Role of `entity_id` in the relationship: 'supplier' | 'authority'. */
    role: text("role").notNull(),
    partnerEntityId: bigint("partner_entity_id", { mode: "bigint" }).notNull(),
    rank: integer("rank").notNull(),
    n: integer("n").notNull(),
    totalRon: numeric("total_ron"),
  },
  (t) => [
    primaryKey({ columns: [t.entityId, t.role, t.partnerEntityId] }),
    index("entity_top_partners_lookup_idx").on(t.entityId, t.role, t.rank),
  ],
);

/** Leaderboards: top entities per role by full-credit spend. */
export const topEntities = martsSchema.table(
  "top_entities",
  {
    /** 'supplier' | 'authority' */
    role: text("role").notNull(),
    rank: integer("rank").notNull(),
    entityId: bigint("entity_id", { mode: "bigint" }).notNull(),
    totalRonFull: numeric("total_ron_full"),
    nContracts: integer("n_contracts").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.role, t.rank] })],
);

/**
 * Supplier concentration per contracting authority — a core watchdog signal.
 * Share math uses split attribution (reconciles to actual spend). HHI is the
 * Herfindahl index (sum of squared supplier shares, 0–1; 1 = single supplier).
 */
export const authorityConcentration = martsSchema.table(
  "authority_concentration",
  {
    authorityEntityId: bigint("authority_entity_id", {
      mode: "bigint",
    }).primaryKey(),
    distinctSuppliers: integer("distinct_suppliers").notNull(),
    topSupplierPct: numeric("top_supplier_pct"),
    hhi: numeric("hhi"),
    totalRon: numeric("total_ron"),
  },
  (t) => [index("authority_concentration_hhi_idx").on(t.hhi)],
);

/**
 * Per-entity red-flag summary (red-flags Phase 4). One row per (entity, role).
 * `cri` is the binary Corruption Risk Index — share of *applicable* flags
 * triggered for that role (DEC-003). `flags` carries the triggered codes +
 * evidence for display. Denormalized name/county so the web reads marts only.
 */
export const entityFlags = martsSchema.table(
  "entity_flags",
  {
    entityId: bigint("entity_id", { mode: "bigint" }).notNull(),
    /** 'supplier' | 'authority' */
    role: text("role").notNull(),
    nameDisplay: text("name_display"),
    cuiCanonical: text("cui_canonical"),
    county: text("county"),
    nDas: integer("n_das").notNull().default(0),
    totalRon: numeric("total_ron"),
    /** 0–1 binary CRI. */
    cri: numeric("cri"),
    /** Distinct flag types triggered. */
    nFlags: integer("n_flags").notNull().default(0),
    /** [{ code, severity, evidence }] for the triggered flags. */
    flags: jsonb("flags"),
  },
  (t) => [
    primaryKey({ columns: [t.entityId, t.role] }),
    index("entity_flags_role_cri_idx").on(t.role, t.cri),
  ],
);

/**
 * Browsable red-flag instances for the /semnale explorer (red-flags Phase 4).
 * Entity- and pair-level flags plus the most severe per-DA examples, denormalized
 * with names/county and sortable by severity/value.
 */
export const flagInstances = martsSchema.table(
  "flag_instances",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey(),
    flagCode: text("flag_code").notNull(),
    subjectType: text("subject_type").notNull(),
    entityId: bigint("entity_id", { mode: "bigint" }),
    entityName: text("entity_name"),
    entityCounty: text("entity_county"),
    partnerId: bigint("partner_id", { mode: "bigint" }),
    partnerName: text("partner_name"),
    severity: numeric("severity"),
    totalRon: numeric("total_ron"),
    period: text("period"),
    evidence: jsonb("evidence"),
  },
  (t) => [
    index("flag_instances_code_sev_idx").on(t.flagCode, t.severity),
    index("flag_instances_entity_idx").on(t.entityId),
  ],
);

/**
 * Per-DA read model for the investigative profile (red-flags Phase 5+). One row
 * per direct acquisition, denormalized with both party names + CPV + the timing
 * gap + which per-DA flags fired, plus `sicap_da_id` for the e-licitatie deep
 * link. Indexed by authority and by supplier so a single entity's transactions
 * are a fast, bounded marts read (no request-time core scan). ~4.78M rows.
 */
export const daTransactions = martsSchema.table(
  "da_transactions",
  {
    sicapDaId: bigint("sicap_da_id", { mode: "bigint" }).primaryKey(),
    daCode: text("da_code"),
    authorityId: bigint("authority_id", { mode: "bigint" }),
    authorityName: text("authority_name"),
    supplierId: bigint("supplier_id", { mode: "bigint" }),
    supplierName: text("supplier_name"),
    county: text("county"),
    cpvCode: text("cpv_code"),
    cpvName: text("cpv_name"),
    acquisitionType: text("acquisition_type"),
    estimatedValueRon: numeric("estimated_value_ron"),
    closingValue: numeric("closing_value"),
    publicationDate: text("publication_date"),
    finalizationDate: text("finalization_date"),
    /** finalization − publication, minutes (null if a date is missing). */
    gapMinutes: integer("gap_minutes"),
    /** Per-DA flag codes that fired (da_rapid / da_round). */
    daFlags: text("da_flags").array(),
    /** Recorded value is implausible (>2M cap, or ≥100× the estimate) — almost
     *  always a data-entry typo (unit price with a thousands separator). Row
     *  counts; its VALUE is excluded from sums and warned about in the UI. */
    valueSuspect: boolean("value_suspect").notNull().default(false),
  },
  (t) => [
    index("da_tx_authority_idx").on(t.authorityId, t.finalizationDate),
    index("da_tx_supplier_idx").on(t.supplierId, t.finalizationDate),
    index("da_tx_authority_value_idx").on(t.authorityId, t.closingValue),
  ],
);

/**
 * TED (above-EU-threshold) award read model — the LABELED, NO-BLEND surfacing of
 * TED into the app. One row per TED lot-award, denormalized. `label` tags each
 * award as `also-in-seap` (a crosswalk primary link into an e-licitatie contract
 * exists — the same procurement published to both) or `ted-only` (no SICAP twin
 * found; the above-threshold awards, often foreign-won, that e-licitatie's
 * contract layer lacks). CRITICAL: this is a SEPARATE surface — TED value is
 * NEVER summed into the e-licitatie spend marts (national_stats etc.), so the
 * same award can never be double-counted. The app presents TED as its own view
 * and can borrow TED-only signals (single-bidder, eu-funded) onto matched awards.
 */
export const tedAwards = martsSchema.table(
  "ted_awards",
  {
    tedLotResultId: bigint("ted_lot_result_id", { mode: "bigint" }).primaryKey(),
    tedNoticeId: bigint("ted_notice_id", { mode: "bigint" }),
    publicationNumber: text("publication_number"),
    buyerEntityId: bigint("buyer_entity_id", { mode: "bigint" }),
    buyerName: text("buyer_name"),
    buyerCounty: text("buyer_county"),
    /** Winner display names (consortium → many). */
    winnerNames: text("winner_names").array(),
    winnerEntityIds: bigint("winner_entity_ids", { mode: "bigint" }).array(),
    /** ISO-2 countries of the winners. */
    winnerCountries: text("winner_countries").array(),
    /** Any winner non-Romanian — the foreign-won filter. */
    isForeign: boolean("is_foreign").notNull().default(false),
    cpvCode: text("cpv_code"),
    cpvName: text("cpv_name"),
    contractNature: text("contract_nature"),
    title: text("title"),
    awardedValue: numeric("awarded_value"),
    currency: text("currency"),
    awardDate: text("award_date"),
    publicationDate: text("publication_date"),
    procedureType: text("procedure_type"),
    tendersReceived: integer("tenders_received"),
    isSingleBidder: boolean("is_single_bidder"),
    euFunded: boolean("eu_funded"),
    /** 'also-in-seap' | 'ted-only'. */
    label: text("label").notNull(),
    /** The primary crosswalk contract (also-in-seap only). */
    matchedContractId: bigint("matched_contract_id", { mode: "bigint" }),
    matchScore: numeric("match_score"),
  },
  (t) => [
    index("ted_awards_label_idx").on(t.label),
    index("ted_awards_foreign_idx").on(t.isForeign),
    index("ted_awards_buyer_idx").on(t.buyerEntityId),
    index("ted_awards_cpv_idx").on(t.cpvCode),
    index("ted_awards_value_idx").on(t.awardedValue),
    // /supra-prag default + date sort: "desc nulls last" cannot walk the asc index backwards
    index("ted_awards_value_desc_idx").on(t.awardedValue.desc().nullsLast()),
    index("ted_awards_date_desc_idx").on(t.awardDate.desc().nullsLast()),
    index("ted_awards_single_bidder_idx").on(t.isSingleBidder),
  ],
);

/**
 * TED-scoped headline counts. Deliberately a SEPARATE table (not folded into
 * national_stats) so TED figures are never accidentally summed with e-licitatie
 * spend. One row per (metric, dimension) — e.g. metric='label' dim='ted-only',
 * metric='country' dim='DE'. `total_ron` is TED awarded value, TED-only.
 */
export const tedStats = martsSchema.table(
  "ted_stats",
  {
    /** 'total' | 'label' | 'country' | 'single_bidder' | 'year'. */
    metric: text("metric").notNull(),
    /** The bucket within the metric ('all', 'also-in-seap', 'DE', '2024', …). */
    dimension: text("dimension").notNull(),
    n: integer("n").notNull(),
    totalRon: numeric("total_ron"),
  },
  (t) => [primaryKey({ columns: [t.metric, t.dimension] })],
);

/**
 * Competition data inherited by e-licitatie contracts from their TED twin via
 * the award_links crosswalk — CONFIRMED tier only (is_primary, score ≥ 0.9,
 * human-validated 2026-07-24). e-licitatie itself publishes no bidder counts
 * (its lowest=highest offer fields are degenerate); this is the only honest
 * source of `tenders_received` for above-threshold contracts. DAs never get
 * one — below threshold, never on TED.
 */
export const contractCompetition = martsSchema.table(
  "contract_competition",
  {
    contractId: bigint("contract_id", { mode: "bigint" }).primaryKey(),
    caNoticeId: bigint("ca_notice_id", { mode: "bigint" }),
    /** The TED lot the data came from (best-scoring primary link). */
    tedLotResultId: bigint("ted_lot_result_id", { mode: "bigint" }),
    matchScore: numeric("match_score"),
    tendersReceived: integer("tenders_received"),
    isSingleBidder: boolean("is_single_bidder"),
  },
  (t) => [index("contract_competition_single_idx").on(t.isSingleBidder)],
);

/**
 * Above-threshold transaction mart: one row per (contract, winner) from the
 * e-licitatie award stream — the contracts twin of `da_transactions`, sharing
 * its column names so the ask engine can switch tables (`spec.dataset`).
 * Consortium contracts appear once per winner with `closing_value` = the
 * contract value split equally (anti-double-count); `contract_value_full` keeps
 * the whole amount. Competition columns inherited from the CONFIRMED TED
 * crosswalk tier (marts.contract_competition) — null = unknown, NOT competitive.
 */
export const contractTransactions = martsSchema.table(
  "contract_transactions",
  {
    contractId: bigint("contract_id", { mode: "bigint" }).notNull(),
    supplierId: bigint("supplier_id", { mode: "bigint" }).notNull(),
    contractNo: text("contract_no"),
    caNoticeId: bigint("ca_notice_id", { mode: "bigint" }),
    noticeNo: text("notice_no"),
    authorityId: bigint("authority_id", { mode: "bigint" }),
    authorityName: text("authority_name"),
    supplierName: text("supplier_name"),
    /** Authority (buyer) county — same semantics as da_transactions.county. */
    county: text("county"),
    cpvCode: text("cpv_code"),
    cpvName: text("cpv_name"),
    procedureType: text("procedure_type"),
    acquisitionType: text("acquisition_type"),
    /** Winner's share: contract value / n_winners (equal consortium split). */
    closingValue: numeric("closing_value"),
    contractValueFull: numeric("contract_value_full"),
    nWinners: integer("n_winners").notNull().default(1),
    /** 'YYYY-MM-DD' (text, matches da_transactions.finalization_date shape). */
    finalizationDate: text("finalization_date"),
    tendersReceived: integer("tenders_received"),
    isSingleBidder: boolean("is_single_bidder"),
    /** Confirmed TED twin exists (award_links primary, score ≥ 0.9). */
    alsoInTed: boolean("also_in_ted").notNull().default(false),
    /** TED publication number of the confirmed twin — outbound link building. */
    tedPubnum: text("ted_pubnum"),
  },
  (t) => [
    primaryKey({ columns: [t.contractId, t.supplierId] }),
    index("ctx_authority_idx").on(t.authorityId, t.finalizationDate),
    index("ctx_supplier_idx").on(t.supplierId, t.finalizationDate),
    index("ctx_single_idx").on(t.isSingleBidder),
  ],
);

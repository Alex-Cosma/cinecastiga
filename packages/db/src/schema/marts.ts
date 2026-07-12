import {
  bigint,
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
    nContracts: integer("n_contracts").notNull().default(0),
    nDas: integer("n_das").notNull().default(0),
    totalRonFull: numeric("total_ron_full"),
    /** Equal-split attribution — an ASSUMPTION (SICAP gives no per-member split). */
    totalRonSplit: numeric("total_ron_split"),
    firstActivity: text("first_activity"),
    lastActivity: text("last_activity"),
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

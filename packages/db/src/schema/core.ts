import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const coreSchema = pgSchema("core");

/**
 * Durable per-source ingestion cursors. A crashed or banned run resumes
 * from its watermark instead of silently truncating history.
 */
export const ingestionWatermarks = coreSchema.table("ingestion_watermarks", {
  /** Source + endpoint identifier, e.g. 'elicitatie:tenders'. */
  source: text("source").primaryKey(),
  /** Opaque cursor: last page, last external id, or ISO date — fetcher-defined. */
  cursor: text("cursor").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * One row per scrape run: the reconciliation record that makes silent
 * ingestion gaps visible. `deviation` = reportedTotal - fetchedCount;
 * reportedTotal is null when the source count wasn't trustworthy
 * (searchTooLong) — a run with null reportedTotal is itself a signal.
 */
export const scrapeRuns = coreSchema.table(
  "scrape_runs",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    /** Same key convention as watermarks, e.g. 'elicitatie:tenders'. */
    source: text("source").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    windowStart: timestamp("window_start", { withTimezone: true }),
    windowEnd: timestamp("window_end", { withTimezone: true }),
    /** running | completed | failed */
    status: text("status").notNull(),
    reportedTotal: integer("reported_total"),
    fetchedCount: integer("fetched_count").notNull().default(0),
    insertedCount: integer("inserted_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    pagesFetched: integer("pages_fetched").notNull().default(0),
    deviation: integer("deviation"),
    error: text("error"),
  },
  (t) => [index("scrape_runs_source_started_idx").on(t.source, t.startedAt)],
);

// ─────────────────────────────────────────────────────────────────────────
// Normalization (raw → core). All tables below are DERIVED and fully
// rebuildable by replaying transforms over raw.raw_documents (task DEC-004).
// ─────────────────────────────────────────────────────────────────────────

/**
 * Canonical organization (contracting authority and/or supplier — role is
 * per source-record, not per entity). Merge keys: `cui_canonical` (tier 2,
 * checksum-validated) and rows in `entity_sicap_ids` (tier 1). Fuzzy name
 * matches are suggestions only (`entity_name_suggestions`), never auto-merged.
 */
export const entities = coreSchema.table(
  "entities",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    /** Canonical CUI: RO stripped, leading zeros trimmed. Null if never seen a valid one. */
    cuiCanonical: text("cui_canonical"),
    /** Whether `cui_canonical` passed the mod-11 checksum. Only valid CUIs merge. */
    cuiValid: boolean("cui_valid").notNull().default(false),
    /** Best display name (prefers officialName from the richest source). */
    nameDisplay: text("name_display").notNull(),
    /** Diacritic-folded, legal-form-stripped name for trigram matching. */
    nameNormalized: text("name_normalized").notNull(),
    /** Legal form token split off the name (SRL, SA, PFA, RA…), if any. */
    legalForm: text("legal_form"),
    /** County / NUTS from the richest source (award contract winner address). */
    county: text("county"),
    nutsCode: text("nuts_code"),
    /** ISO country of the entity ('RO','DE','IT',…). Null when unknown. */
    countryCode: text("country_code"),
    /**
     * A non-Romanian supplier (typically an above-threshold/TED winner). These
     * have no RO CUI to merge on, so they're deduped via `foreign_id_norm` +
     * country (tier 2b) and flagged here so the app can surface/filter them.
     */
    isForeign: boolean("is_foreign").notNull().default(false),
    /** Foreign registration / VAT id as seen (audit trail). */
    foreignIdRaw: text("foreign_id_raw"),
    /** Normalized foreign id (upper, alnum-only) — the tier-2b merge key with country. */
    foreignIdNorm: text("foreign_id_norm"),
    /** Raw CUI strings seen (audit trail for the canonicalization). */
    cuiRawVariants: text("cui_raw_variants").array(),
    firstSeen: timestamp("first_seen", { withTimezone: true }),
    lastSeen: timestamp("last_seen", { withTimezone: true }),
  },
  (t) => [
    // One entity per valid canonical CUI. Invalid/absent CUIs are not a merge
    // key, so they are excluded from the uniqueness constraint.
    uniqueIndex("entities_cui_canonical_uq")
      .on(t.cuiCanonical)
      .where(sql`${t.cuiValid} = true`),
    // Tier-2b merge key: one row per (country, foreign id) for foreign suppliers
    // that lack a valid RO CUI. Substantive-id validation happens in resolution.
    uniqueIndex("entities_foreign_id_uq")
      .on(t.countryCode, t.foreignIdNorm)
      .where(
        sql`${t.cuiValid} = false and ${t.foreignIdNorm} is not null and ${t.countryCode} is not null`,
      ),
    index("entities_is_foreign_idx").on(t.isForeign),
    index("entities_name_norm_trgm_idx").using(
      "gin",
      sql`${t.nameNormalized} gin_trgm_ops`,
    ),
  ],
);

/**
 * Tier-1 resolution keys: SICAP's own numeric ids. `namespace` distinguishes
 * the supplier-id and authority-id spaces (a state entity that both buys and
 * sells has one id in each — they are different namespaces, same entity).
 */
export const entitySicapIds = coreSchema.table(
  "entity_sicap_ids",
  {
    entityId: bigint("entity_id", { mode: "bigint" })
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    /** 'supplier' | 'authority' | 'winner' */
    namespace: text("namespace").notNull(),
    sicapId: integer("sicap_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.namespace, t.sicapId] }),
    index("entity_sicap_ids_entity_idx").on(t.entityId),
  ],
);

/** Fuzzy name-match review queue (tier 3). Suggestions only — never auto-merged. */
export const entityNameSuggestions = coreSchema.table(
  "entity_name_suggestions",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    entityA: bigint("entity_a", { mode: "bigint" })
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    entityB: bigint("entity_b", { mode: "bigint" })
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    score: real("score").notNull(),
    evidence: jsonb("evidence"),
    /** open | merged | rejected */
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("entity_name_suggestions_pair_uq").on(t.entityA, t.entityB),
    index("entity_name_suggestions_status_idx").on(t.status),
  ],
);

/** Official EU CPV 2008 catalog (seeded from the vendored XML→JSON asset, DEC-005). */
export const cpvCodes = coreSchema.table(
  "cpv_codes",
  {
    /** Full code WITH check digit: 'NNNNNNNN-D' (SICAP localeKey form). */
    code: text("code").primaryKey(),
    nameRo: text("name_ro").notNull(),
    nameEn: text("name_en"),
    /** Constant 'Rev.2' for the CPV 2008 vocabulary. */
    revision: text("revision").notNull(),
    /** First 2 digits — division, for rollups. */
    division: text("division").notNull(),
  },
  (t) => [index("cpv_codes_division_idx").on(t.division)],
);

/** SICAP-internal cpv id → CPV code. Only needed where a payload omits localeKey. */
export const sicapCpvIds = coreSchema.table("sicap_cpv_ids", {
  sicapId: integer("sicap_id").primaryKey(),
  code: text("code")
    .notNull()
    .references(() => cpvCodes.code),
});

/** Non-standard unit → canonical unit + multiplier. Grown from observed data (DEC-002). */
export const unitMap = coreSchema.table("unit_map", {
  /** Canonicalized raw unit text (lowercased, diacritic-folded, trimmed). */
  rawPattern: text("raw_pattern").primaryKey(),
  canonicalUnit: text("canonical_unit").notNull(),
  factor: numeric("factor").notNull(),
});

/**
 * Participation/tender notices. List-level fields only — v2/eForms detail is a
 * deferred follow-up, so tender core is intentionally shallow for now.
 */
export const notices = coreSchema.table(
  "notices",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    /** Provenance: raw doc that last populated this row (not unique). */
    rawId: bigint("raw_id", { mode: "bigint" }).notNull(),
    /** SICAP cNoticeId — natural key, idempotent under replay. */
    cNoticeId: bigint("c_notice_id", { mode: "bigint" }).notNull(),
    noticeNo: text("notice_no"),
    sysNoticeTypeId: integer("sys_notice_type_id"),
    sysNoticeVersionId: integer("sys_notice_version_id"),
    authorityEntityId: bigint("authority_entity_id", {
      mode: "bigint",
    }).references(() => entities.id),
    cpvCode: text("cpv_code").references(() => cpvCodes.code),
    cpvValid: boolean("cpv_valid"),
    cpvRaw: text("cpv_raw"),
    estimatedValueRon: numeric("estimated_value_ron"),
    /** Furnizare | Servicii | Lucrari (sysAcquisitionContractType). */
    acquisitionType: text("acquisition_type"),
    state: text("state"),
    stateDate: timestamp("state_date", { withTimezone: true }),
    isOnline: boolean("is_online"),
    procedureType: text("procedure_type"),
    hasLots: boolean("has_lots"),
  },
  (t) => [
    uniqueIndex("notices_c_notice_id_uq").on(t.cNoticeId),
    index("notices_authority_idx").on(t.authorityEntityId),
    index("notices_cpv_idx").on(t.cpvCode),
    index("notices_state_date_idx").on(t.stateDate),
  ],
);

/** Award (contract-award) notices. */
export const awards = coreSchema.table(
  "awards",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    /** Provenance: raw doc that last populated this row (not unique). */
    rawId: bigint("raw_id", { mode: "bigint" }).notNull(),
    /** SICAP caNoticeId — natural key; contracts link back via this. */
    caNoticeId: bigint("ca_notice_id", { mode: "bigint" }).notNull(),
    noticeNo: text("notice_no"),
    sysNoticeTypeId: integer("sys_notice_type_id"),
    sysNoticeVersionId: integer("sys_notice_version_id"),
    authorityEntityId: bigint("authority_entity_id", {
      mode: "bigint",
    }).references(() => entities.id),
    cpvCode: text("cpv_code").references(() => cpvCodes.code),
    cpvValid: boolean("cpv_valid"),
    cpvRaw: text("cpv_raw"),
    estimatedValueRon: numeric("estimated_value_ron"),
    ronContractValue: numeric("ron_contract_value"),
    lowestOfferValue: numeric("lowest_offer_value"),
    highestOfferValue: numeric("highest_offer_value"),
    /** Furnizare | Servicii | Lucrari (sysAcquisitionContractType). */
    acquisitionType: text("acquisition_type"),
    /**
     * Procedure that produced the award (sysProcedureType label), e.g.
     * "Licitatie deschisa", "Negociere fara publicare prealabila". Drives the
     * award procedure-avoidance / single-bid red flags.
     */
    procedureType: text("procedure_type"),
    state: text("state"),
    stateDate: timestamp("state_date", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("awards_ca_notice_id_uq").on(t.caNoticeId),
    index("awards_authority_idx").on(t.authorityEntityId),
    index("awards_cpv_idx").on(t.cpvCode),
  ],
);

/** One row per awarded contract (caNoticeContractId). Winners are M:N below. */
export const contracts = coreSchema.table(
  "contracts",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    /** Provenance: raw doc that last populated this row (not unique). */
    rawId: bigint("raw_id", { mode: "bigint" }).notNull(),
    /** SICAP caNoticeContractId — natural key, idempotent under replay. */
    caNoticeContractId: bigint("ca_notice_contract_id", {
      mode: "bigint",
    }).notNull(),
    caNoticeId: bigint("ca_notice_id", { mode: "bigint" }),
    contractNo: text("contract_no"),
    contractDate: timestamp("contract_date", { withTimezone: true }),
    contractValue: numeric("contract_value"),
    currency: text("currency"),
    cpvCode: text("cpv_code").references(() => cpvCodes.code),
    title: text("title"),
    lotsCaption: text("lots_caption"),
  },
  (t) => [
    uniqueIndex("contracts_ca_notice_contract_id_uq").on(t.caNoticeContractId),
    index("contracts_ca_notice_idx").on(t.caNoticeId),
  ],
);

/** Contract ↔ winning entity (M:N — consortia / joint bids are real). */
export const contractWinners = coreSchema.table(
  "contract_winners",
  {
    contractId: bigint("contract_id", { mode: "bigint" })
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    entityId: bigint("entity_id", { mode: "bigint" })
      .notNull()
      .references(() => entities.id),
  },
  (t) => [
    primaryKey({ columns: [t.contractId, t.entityId] }),
    index("contract_winners_entity_idx").on(t.entityId),
  ],
);

/** Direct acquisitions (achiziții directe) — the firehose. */
export const directAcquisitions = coreSchema.table(
  "direct_acquisitions",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    /** Provenance: raw doc that last populated this row (not unique — list AND
     * detail describe the same DA and both upsert here by sicap_da_id). NULL for
     * rows imported outside the scrape pipeline (e.g. the 2020 dump backfill). */
    rawId: bigint("raw_id", { mode: "bigint" }),
    /** uniqueIdentificationCode, e.g. 'DA40761319'. */
    daCode: text("da_code"),
    /** SICAP directAcquisitionId — natural key merging list + detail. */
    sicapDaId: bigint("sicap_da_id", { mode: "bigint" }).notNull(),
    authorityEntityId: bigint("authority_entity_id", {
      mode: "bigint",
    }).references(() => entities.id),
    supplierEntityId: bigint("supplier_entity_id", {
      mode: "bigint",
    }).references(() => entities.id),
    cpvCode: text("cpv_code").references(() => cpvCodes.code),
    cpvValid: boolean("cpv_valid"),
    cpvRaw: text("cpv_raw"),
    estimatedValueRon: numeric("estimated_value_ron"),
    closingValue: numeric("closing_value"),
    /** Furnizare | Servicii | Lucrari (sysAcquisitionContractType, from detail). */
    acquisitionType: text("acquisition_type"),
    publicationDate: timestamp("publication_date", { withTimezone: true }),
    finalizationDate: timestamp("finalization_date", { withTimezone: true }),
    state: text("state"),
  },
  (t) => [
    uniqueIndex("direct_acquisitions_sicap_da_id_uq").on(t.sicapDaId),
    index("direct_acquisitions_authority_idx").on(t.authorityEntityId),
    index("direct_acquisitions_supplier_idx").on(t.supplierEntityId),
    index("direct_acquisitions_cpv_idx").on(t.cpvCode),
    index("direct_acquisitions_finalization_idx").on(t.finalizationDate),
  ],
);

/** DA line items — where the non-standard units live (DEC-002). */
export const daItems = coreSchema.table(
  "da_items",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    daId: bigint("da_id", { mode: "bigint" })
      .notNull()
      .references(() => directAcquisitions.id, { onDelete: "cascade" }),
    /** SICAP directAcquisitionItemID — natural key, idempotent under replay. */
    sicapItemId: bigint("sicap_item_id", { mode: "bigint" }).notNull(),
    cpvCode: text("cpv_code").references(() => cpvCodes.code),
    catalogItemName: text("catalog_item_name"),
    quantity: numeric("quantity"),
    unitRaw: text("unit_raw"),
    unitCanonical: text("unit_canonical"),
    unitFactor: numeric("unit_factor"),
    unitPrice: numeric("unit_price"),
    closingPrice: numeric("closing_price"),
  },
  (t) => [
    uniqueIndex("da_items_sicap_item_id_uq").on(t.sicapItemId),
    index("da_items_da_idx").on(t.daId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// TED (Tenders Electronic Daily) — above-EU-threshold contract-award notices,
// eForms UBL (RO coverage 2023+). A PARALLEL source to the e-licitatie award
// pipeline: buyer + winner entities resolve by CUI into the SAME core.entities,
// so a TED award and its e-licitatie twin share entity rows and reconcile on
// buyer-CUI + winner-CUI + value + date + CPV. Natural key: TED
// publication-number (e.g. '63449-2026'). Fully rebuildable by replaying the
// `ted-eforms:v1` transform over raw.raw_documents.
// ─────────────────────────────────────────────────────────────────────────

/** One row per TED contract-award notice (eForms CAN). */
export const tedNotices = coreSchema.table(
  "ted_notices",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    /** Provenance: raw doc that last populated this row (not unique). */
    rawId: bigint("raw_id", { mode: "bigint" }).notNull(),
    /** TED publication-number, zero-trimmed 'NNNN-YYYY' — natural key. */
    publicationNumber: text("publication_number").notNull(),
    /** OJS notice id as published, e.g. '00063449-2026'. */
    ojsNoticeId: text("ojs_notice_id"),
    /** NoticeTypeCode (listName=result), e.g. 'can-standard'. */
    noticeType: text("notice_type"),
    /** EU directive the notice runs under, e.g. '32014L0024'. */
    regulatoryDomain: text("regulatory_domain"),
    /** SICAP ContractFolderID (UUID) — the future exact TED↔SICAP join key. */
    contractFolderId: text("contract_folder_id"),
    /** eForms notice UUID (cbc:ID schemeName=notice-id). */
    noticeUuid: text("notice_uuid"),
    /** ProcedureCode, e.g. 'open' | 'neg-w-call' | 'restricted'. */
    procedureType: text("procedure_type"),
    buyerEntityId: bigint("buyer_entity_id", {
      mode: "bigint",
    }).references(() => entities.id),
    /** PartyTypeCode (buyer-legal-type), e.g. 'body-pl-ra'. */
    buyerLegalType: text("buyer_legal_type"),
    /** ActivityTypeCode (authority-activity), e.g. 'health'. */
    buyerActivity: text("buyer_activity"),
    cpvCode: text("cpv_code").references(() => cpvCodes.code),
    cpvValid: boolean("cpv_valid"),
    cpvRaw: text("cpv_raw"),
    /** ProcurementTypeCode (contract-nature): 'supplies'|'services'|'works'. */
    contractNature: text("contract_nature"),
    title: text("title"),
    estimatedValueRon: numeric("estimated_value_ron"),
    currency: text("currency"),
    /** Notice-level awarded/framework total (OverallMaximum/Approximate). */
    awardedValueTotal: numeric("awarded_value_total"),
    /** Any lot funded by an EU programme (FundingProgramCode != no-eu-funds). */
    euFunded: boolean("eu_funded"),
    lotCount: integer("lot_count"),
    publicationDate: timestamp("publication_date", { withTimezone: true }),
    issueDate: timestamp("issue_date", { withTimezone: true }),
    /** Best-effort award date; the '2000-01-01' eForms sentinel is dropped. */
    awardDate: timestamp("award_date", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("ted_notices_publication_number_uq").on(t.publicationNumber),
    index("ted_notices_buyer_idx").on(t.buyerEntityId),
    index("ted_notices_cpv_idx").on(t.cpvCode),
    index("ted_notices_publication_date_idx").on(t.publicationDate),
    index("ted_notices_contract_folder_idx").on(t.contractFolderId),
  ],
);

/**
 * Per-lot award result within a TED notice. This is the grain the single-bidder
 * red flag and the reconciliation join operate on (one buyer, one winner set,
 * one value, one CPV per lot).
 */
export const tedLotResults = coreSchema.table(
  "ted_lot_results",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tedNoticeId: bigint("ted_notice_id", { mode: "bigint" })
      .notNull()
      .references(() => tedNotices.id, { onDelete: "cascade" }),
    /** eForms lot id within the notice, e.g. 'LOT-0003'. */
    lotId: text("lot_id").notNull(),
    /** eForms result id, e.g. 'RES-0003'. */
    resultId: text("result_id"),
    cpvCode: text("cpv_code").references(() => cpvCodes.code),
    cpvValid: boolean("cpv_valid"),
    cpvRaw: text("cpv_raw"),
    contractNature: text("contract_nature"),
    title: text("title"),
    estimatedValueRon: numeric("estimated_value_ron"),
    awardedValue: numeric("awarded_value"),
    currency: text("currency"),
    /** Number of tenders received for the lot (received-submission-type=tenders). */
    tendersReceived: integer("tenders_received"),
    /** tendersReceived == 1 — the single-bid competition red flag. */
    isSingleBidder: boolean("is_single_bidder"),
    /** TenderResultCode (winner-selection-status), e.g. 'selec-w'. */
    winnerSelectionStatus: text("winner_selection_status"),
    /** SettledContract IssueDate — the effective award/contract date. */
    contractDate: timestamp("contract_date", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("ted_lot_results_notice_lot_uq").on(t.tedNoticeId, t.lotId),
    index("ted_lot_results_notice_idx").on(t.tedNoticeId),
    index("ted_lot_results_cpv_idx").on(t.cpvCode),
    index("ted_lot_results_single_bidder_idx").on(t.isSingleBidder),
  ],
);

/** Lot ↔ winning entity (M:N — consortia / joint bids are real). */
export const tedLotWinners = coreSchema.table(
  "ted_lot_winners",
  {
    lotResultId: bigint("lot_result_id", { mode: "bigint" })
      .notNull()
      .references(() => tedLotResults.id, { onDelete: "cascade" }),
    entityId: bigint("entity_id", { mode: "bigint" })
      .notNull()
      .references(() => entities.id),
  },
  (t) => [
    primaryKey({ columns: [t.lotResultId, t.entityId] }),
    index("ted_lot_winners_entity_idx").on(t.entityId),
  ],
);

/**
 * Reconciliation crosswalk (#3): TED lot-award ↔ e-licitatie contract-award that
 * describe the SAME real-world procurement. SICAP is the eSender to TED, so most
 * above-threshold awards appear in both. Entities already unify by CUI (shared
 * core.entities), so the match anchors on buyer + winner entity ids, then value,
 * date and CPV disambiguate. Fully derived (truncate + rebuild); a TED lot may
 * have several candidate contracts — kept as ranked rows, best pickable per lot.
 */
export const awardLinks = coreSchema.table(
  "award_links",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tedLotResultId: bigint("ted_lot_result_id", { mode: "bigint" })
      .notNull()
      .references(() => tedLotResults.id, { onDelete: "cascade" }),
    contractId: bigint("contract_id", { mode: "bigint" })
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    /** Denormalized parents for cheap querying. */
    tedNoticeId: bigint("ted_notice_id", { mode: "bigint" }),
    caNoticeId: bigint("ca_notice_id", { mode: "bigint" }),
    /** 0–1 confidence; higher = tighter value/date/CPV agreement. */
    matchScore: real("match_score").notNull(),
    /**
     * The single best contract for this TED lot (highest score, tie-broken by
     * closest date). Frameworks produce many candidate contracts per TED award;
     * the primary row is the clean 1:1 twin for dedup / unified spend.
     */
    isPrimary: boolean("is_primary").notNull().default(false),
    /** How it matched, e.g. 'buyer+winner+value+date+cpv'. */
    matchMethod: text("match_method").notNull(),
    valueDiffPct: numeric("value_diff_pct"),
    dateDiffDays: integer("date_diff_days"),
    evidence: jsonb("evidence"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("award_links_pair_uq").on(t.tedLotResultId, t.contractId),
    index("award_links_ted_lot_idx").on(t.tedLotResultId),
    index("award_links_contract_idx").on(t.contractId),
    index("award_links_score_idx").on(t.matchScore),
    // The clean 1:1 crosswalk = primary rows only.
    index("award_links_primary_idx")
      .on(t.tedLotResultId)
      .where(sql`${t.isPrimary} = true`),
  ],
);

/**
 * Per-record parse failures (DEC-004). Pipeline continues; core stays clean;
 * this is the queryable worklist of what's breaking.
 */
export const quarantine = coreSchema.table(
  "quarantine",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    rawId: bigint("raw_id", { mode: "bigint" }).notNull(),
    endpointVersion: text("endpoint_version").notNull(),
    zodError: text("zod_error").notNull(),
    payloadExcerpt: jsonb("payload_excerpt"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("quarantine_endpoint_idx").on(t.endpointVersion)],
);

/**
 * Per-transform high-water cursor over raw_documents.id. Incremental runs
 * resume here; a full rebuild resets to 0 and truncates fact tables.
 */
export const normalizeWatermarks = coreSchema.table("normalize_watermarks", {
  /** endpoint_version processed by this transform, e.g. 'da-detail:v1'. */
  transform: text("transform").primaryKey(),
  lastRawId: bigint("last_raw_id", { mode: "bigint" })
    .notNull()
    .default(sql`0`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Red-flag store (red-flags DEC-005). One row per (subject, flag_code) — subject
 * is polymorphic: 'da' → direct_acquisitions.id; 'authority'/'supplier' →
 * entities.id; 'pair' → subject_id = authority entity, partner_id = supplier
 * entity. `triggered` is the binary CRI signal; `severity` (0–1) is for sorting
 * and detail only. `evidence` carries the numbers behind the flag. Recomputed by
 * truncate + rebuild from core, stamped with `methodology_version`.
 */
export const flags = coreSchema.table(
  "flags",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    /** 'da' | 'authority' | 'supplier' | 'pair' */
    subjectType: text("subject_type").notNull(),
    subjectId: bigint("subject_id", { mode: "bigint" }).notNull(),
    /** Supplier entity for 'pair' flags; NULL otherwise. */
    partnerId: bigint("partner_id", { mode: "bigint" }),
    /** 'da_split' | 'da_concentration' | 'da_dependence' | 'da_rapid' | … */
    flagCode: text("flag_code").notNull(),
    /** Calendar year or 'all'; NULL when not period-scoped. */
    period: text("period"),
    triggered: boolean("triggered").notNull(),
    severity: real("severity"),
    evidence: jsonb("evidence"),
    methodologyVersion: text("methodology_version").notNull(),
  },
  (t) => [
    index("flags_subject_idx").on(t.subjectType, t.subjectId),
    index("flags_code_idx").on(t.flagCode, t.triggered),
    index("flags_severity_idx").on(t.flagCode, t.severity),
  ],
);

/**
 * Date-aware thresholds (red-flags DEC-006). Legal + statistical cutoffs keyed by
 * a name and a validity window, so a rule reads the value applicable to each
 * transaction's date. DA ceilings changed over the years — never hardcode.
 */
export const riskThresholds = coreSchema.table(
  "risk_thresholds",
  {
    /** e.g. 'da_ceiling_goods_services' | 'da_ceiling_works' | 'da_rapid_hours'. */
    key: text("key").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    /** NULL = open-ended (still in force). */
    validTo: timestamp("valid_to", { withTimezone: true }),
    valueNum: numeric("value_num").notNull(),
    note: text("note"),
  },
  (t) => [primaryKey({ columns: [t.key, t.validFrom] })],
);

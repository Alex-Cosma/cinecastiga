/**
 * Canonical domain types for seap-analytics.
 *
 * These model the normalized (core) layer, not the raw SICAP payloads —
 * raw responses are archived as-is in raw.raw_documents and parsed into
 * these shapes by the ingestion normalize step. Fields are intentionally
 * minimal; they grow as normalization work (project Phase 3+) firms up
 * what SICAP actually provides per era.
 */

/** Where a record was fetched from. */
export type SourceSystem = "elicitatie" | "datagov";

/** SICAP notice families we ingest. */
export type NoticeType =
  | "tender" // anunț de participare
  | "tender_simplified" // anunț de participare simplificat
  | "award" // anunț de atribuire
  | "contract"
  | "direct_acquisition"; // achiziție directă

/** Contracting authority or supplier, deduplicated. CUI is the canonical key when present. */
export interface Entity {
  id: string;
  /** Romanian fiscal code — canonical resolution key. Null when unresolvable. */
  cui: string | null;
  canonicalName: string;
  kind: "authority" | "supplier";
  county: string | null;
}

/** A name/CUI variant observed in source data, linked to its canonical entity. */
export interface EntityAlias {
  entityId: string;
  rawName: string;
  rawCui: string | null;
  source: SourceSystem;
  /** 0..1 — how confident the resolution is. 1 = exact CUI match. */
  confidence: number;
}

/** Tender/procedure header. */
export interface Procedure {
  id: string;
  source: SourceSystem;
  externalId: string;
  noticeType: NoticeType;
  title: string;
  authorityId: string;
  cpvCode: string | null;
  estimatedValueRon: number | null;
  publishedAt: Date;
}

/** Award outcome linked to a procedure. */
export interface Award {
  id: string;
  procedureId: string;
  supplierId: string;
  valueRon: number;
  bidCount: number | null;
  awardedAt: Date;
}

/** Signed contract linked to an award. */
export interface Contract {
  id: string;
  awardId: string;
  valueRon: number;
  signedAt: Date;
}

/** Direct purchase — the high-volume firehose. Deliberately NOT a Procedure. */
export interface DirectAcquisition {
  id: string;
  source: SourceSystem;
  externalId: string;
  authorityId: string;
  supplierId: string;
  description: string;
  cpvCode: string | null;
  valueRon: number;
  /** Non-standardized unit as published ("Bucată", "100 Bucăți", "Litru", ...). */
  quantity: number | null;
  unitRaw: string | null;
  concludedAt: Date;
}

/** Red-flag indicator types (curated suite, ~10-15 total; grows in project Phase 8). */
export type RedFlagType =
  | "single_bid"
  | "supplier_concentration"
  | "price_anomaly"
  | "threshold_splitting"
  | "short_deadline"
  | "amendment_inflation";

/**
 * A computed statistical indicator. Never a verdict — always aggregated
 * across multiple tenders/time windows, always with sample size.
 */
export interface RedFlag {
  id: string;
  flagType: RedFlagType;
  severity: "info" | "elevated" | "high";
  entityId: string | null;
  procedureId: string | null;
  /** Number of underlying records the indicator aggregates over. */
  sampleSize: number;
  details: Record<string, unknown>;
  computedAt: Date;
}

/**
 * Types for the unofficial e-licitatie.ro (SEAP/SICAP) api-pub surface.
 * Shapes live-verified 2026-07-12 — see task RESEARCH.md §1 for provenance.
 */

/** Calendar date string YYYY-MM-DD, interpreted by SEAP as Europe/Bucharest. */
export type IsoDate = string;

/**
 * Standard list envelope. `total` is truthful ONLY when searchTooLong is
 * false/absent — when true, the result set exceeded the server's ~2000-record
 * window and `total` caps at 2000 (treat as data loss, slice narrower).
 */
export interface ListEnvelope<T> {
  total: number;
  items: T[];
  searchTooLong?: boolean;
}

/** SEAP sysNoticeTypeId constants (verified against live API, June 2026 era). */
export const NOTICE_TYPE_IDS = {
  /** Anunțuri de participare: CN, SCN(simplificat), RFQ, PC, DC, LR */
  participation: [2, 17, 7, 6, 12, 19],
  /** Anunțuri de atribuire: CAN, SCAN, PCAN, RFQAN, DCAN, LRAN */
  award: [3, 13, 18, 16, 8, 20],
} as const;

export interface NoticeListRequest {
  sysNoticeTypeIds: readonly number[];
  startPublicationDate: IsoDate;
  endPublicationDate: IsoDate;
  pageIndex: number;
  pageSize: number;
}

/** Notice list item — fields we page/reconcile on; rest passes through. */
export interface NoticeListItem {
  caNoticeId: number;
  noticeNo: string;
  sysNoticeTypeId: number;
  sysNoticeState?: { id: number; text: string };
  noticeStateDate?: string;
  contractingAuthorityNameAndFN?: string;
  contractTitle?: string;
  cpvCode?: string;
  ronContractValue?: number | null;
  publicationDate?: string;
  [key: string]: unknown;
}

export interface NoticeContractsRequest {
  caNoticeId: number;
  skip: number;
  take: number;
}

export interface NoticeContractItem {
  caNoticeContractId?: number;
  contractId?: number;
  caNoticeId?: number;
  contractNo?: string;
  contractDate?: string;
  contractValue?: number | null;
  winner?: {
    name?: string;
    fiscalNumber?: string;
    [key: string]: unknown;
  };
  winners?: unknown[];
  [key: string]: unknown;
}

/**
 * DA list request. NOTE: only finalizationDate filters WORK on this endpoint —
 * publicationDateStart/End exist in old request bodies but are silently ignored
 * by the server (live-verified). They are deliberately not representable here.
 */
export interface DirectAcquisitionListRequest {
  finalizationDateStart: IsoDate;
  finalizationDateEnd: IsoDate;
  pageIndex: number;
  pageSize: number;
  cpvCategoryId?: number | null;
  cpvCodeId?: number | null;
  sysDirectAcquisitionStateId?: number | null;
  contractingAuthorityId?: number | null;
  supplierId?: number | null;
}

export interface DirectAcquisitionListItem {
  directAcquisitionId: number;
  uniqueIdentificationCode?: string;
  directAcquisitionName?: string;
  sysDirectAcquisitionState?: { id: number; text: string };
  cpvCode?: string;
  publicationDate?: string;
  finalizationDate?: string;
  supplier?: string;
  contractingAuthority?: string;
  estimatedValueRon?: number | null;
  closingValue?: number | null;
  isOpenForCorrection?: boolean;
  isOpenForContractCorrection?: boolean;
  [key: string]: unknown;
}

export interface CpvSearchItem {
  id: number;
  text?: string;
  [key: string]: unknown;
}

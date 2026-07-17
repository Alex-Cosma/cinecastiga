/**
 * TED (Tenders Electronic Daily) types. Field names use eForms/TED hyphenated
 * keys (e.g. "publication-number"), so notices are typed loosely and read via
 * helpers. The canonical raw record we archive is the full eForms XML.
 */

export interface TedLinks {
  xml?: Record<string, string>;
  pdf?: Record<string, string>;
  pdfs?: Record<string, string>;
  html?: Record<string, string>;
}

export type TedNoticeSummary = Record<string, unknown> & {
  "publication-number"?: string;
  "notice-type"?: string;
  "publication-date"?: string;
  "buyer-name"?: Record<string, string[]>;
  links?: TedLinks;
};

export interface TedSearchResponse {
  notices: TedNoticeSummary[];
  /** Total matching the query (may exceed what pagination can reach). */
  totalNoticeCount?: number;
  iterationNextToken?: string;
}

/** The TED publication number, e.g. "495315-2026" — our external id + join anchor. */
export function tedPublicationNumber(n: TedNoticeSummary): string | undefined {
  const p = n["publication-number"];
  return typeof p === "string" ? p : undefined;
}

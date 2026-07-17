import type { TedClient } from "./client.js";
import type { TedSearchResponse } from "./types.js";

/** Notice XML host (distinct from the Search API host). */
const TED_NOTICE_BASE = "https://ted.europa.eu";

export interface TedSearchRequest {
  /** Expert query, e.g. `buyer-country="ROU" AND notice-type="can-standard"`. */
  query: string;
  /** Convenience field names OR eForms BT-codes. Defaults to the essentials. */
  fields?: string[];
  page?: number;
  limit?: number;
  scope?: "ALL" | "LATEST" | "ACTIVE";
}

const DEFAULT_FIELDS = [
  "publication-number",
  "notice-type",
  "publication-date",
  "buyer-name",
  "links",
];

/**
 * Search TED notices (POST /v3/notices/search, no auth). One page at a time;
 * `totalNoticeCount` drives pagination. Note TED caps the reachable result
 * window, so callers should scope by a date window narrow enough to stay under it.
 */
export async function searchTedNotices(
  client: TedClient,
  req: TedSearchRequest,
): Promise<TedSearchResponse> {
  const body = {
    query: req.query,
    fields: req.fields ?? DEFAULT_FIELDS,
    page: req.page ?? 1,
    limit: req.limit ?? 100,
    scope: req.scope ?? "ALL",
  };
  const r = await client.http.postJson<TedSearchResponse>(
    "/v3/notices/search",
    body,
  );
  return r.data;
}

/**
 * Fetch a notice's full eForms XML — the canonical, complete record we archive
 * to raw. Absolute URL (ted.europa.eu, not the API host). `en` locale returns
 * the multilingual (MUL) document.
 */
export async function fetchTedNoticeXml(
  client: TedClient,
  publicationNumber: string,
): Promise<string> {
  const url = `${TED_NOTICE_BASE}/en/notice/${publicationNumber}/xml`;
  const r = await client.http.getText(url, {
    headers: { accept: "application/xml,text/xml,*/*" },
  });
  return r.data;
}

/** Build the standard "all notices of a type for a country in a date window" query. */
export function tedCountryWindowQuery(opts: {
  country: string; // ISO-3, e.g. "ROU"
  noticeType: string; // e.g. "can-standard"
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}): string {
  const d = (s: string) => s.replaceAll("-", ""); // TED wants YYYYMMDD
  // TED's expert query accepts SORT BY <field> [DESC] — a bare "ASC" is rejected.
  return (
    `buyer-country="${opts.country}" AND notice-type="${opts.noticeType}" ` +
    `AND publication-date>=${d(opts.start)} AND publication-date<=${d(opts.end)} ` +
    `SORT BY publication-date DESC`
  );
}

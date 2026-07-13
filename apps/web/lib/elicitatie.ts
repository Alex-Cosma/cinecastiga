/**
 * Deep links to the official e-licitatie.ro (SICAP) pages — the "proof" layer.
 * Every figure on the site should be one click from its source record. URL
 * patterns confirmed from live e-licitatie.ro pages (2026-07). Centralized here
 * so they are trivial to adjust if SICAP changes routing.
 */
const SICAP = "https://e-licitatie.ro";

/** Direct acquisition detail page (by directAcquisitionId = our sicap_da_id). */
export const daUrl = (sicapDaId: string | number): string =>
  `${SICAP}/pub/direct-acquisition/view/${sicapDaId}`;

/** DA award notice. */
export const daAwardUrl = (id: string | number): string =>
  `${SICAP}/pub/direct-acquisition/award-notice/view/${id}`;

/** Contract (tender) notice. */
export const noticeUrl = (cNoticeId: string | number): string =>
  `${SICAP}/pub/notices/c-notice/v2/view/${cNoticeId}`;

/** Contract award notice. */
export const awardUrl = (caNoticeId: string | number): string =>
  `${SICAP}/pub/notices/ca-notices/view-c/${caNoticeId}`;

/** SICAP participants search (no stable per-entity page). */
export const participantsUrl = (): string => `${SICAP}/pub/participants`;

/**
 * External company registries by CUI — for verifying an entity beyond the
 * procurement record (ownership, admins, financials). Best-effort search URLs.
 */
export const registryLinks = (cui: string): { label: string; url: string }[] => {
  const c = cui.replace(/^RO/i, "").trim();
  return [
    { label: "ANAF", url: `https://mfinante.gov.ro/apps/agent/persoana_juridica_cauta.jsp` },
    { label: "termene.ro", url: `https://termene.ro/cauta?q=${encodeURIComponent(c)}` },
    { label: "listafirme.ro", url: `https://www.listafirme.ro/cauta.asp?q=${encodeURIComponent(c)}` },
  ];
};

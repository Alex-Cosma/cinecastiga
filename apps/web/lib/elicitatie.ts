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
 * procurement record (ownership, admins, financials). Each link lands on the
 * firm identified by its CUI: ANAF's info-cod-fiscal page prefills via ?cod=,
 * termene.ro serves /firma/<cui>, listafirme firm pages are /<name-slug>-<cui>/
 * (the trailing CUI is the identity; the slug is built from our display name).
 */
export const registryLinks = (
  cui: string,
  name?: string | null,
): { label: string; url: string }[] => {
  const c = cui.replace(/^RO/i, "").trim();
  const slug = (name ?? "firma")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return [
    { label: "ANAF", url: `https://mfinante.gov.ro/apps/infocodfiscal.html?cod=${encodeURIComponent(c)}` },
    { label: "termene.ro", url: `https://termene.ro/firma/${encodeURIComponent(c)}` },
    { label: "listafirme.ro", url: `https://www.listafirme.ro/${slug}-${encodeURIComponent(c)}/` },
  ];
};

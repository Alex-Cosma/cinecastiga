import type { ElicitatieClient } from "./client.js";
import type { FetchResult } from "../http-client.js";
import type {
  DirectAcquisitionListItem,
  DirectAcquisitionListRequest,
  ListEnvelope,
} from "./types.js";

/**
 * List direct acquisitions. ONLY finalizationDate filters work here —
 * publicationDateStart/End are silently ignored by the server (live-verified
 * 2026-07-12), which is why the request type doesn't allow them.
 * Day granularity: time components are silently dropped.
 */
export function listDirectAcquisitions(
  client: ElicitatieClient,
  req: DirectAcquisitionListRequest,
): Promise<FetchResult<ListEnvelope<DirectAcquisitionListItem>>> {
  return client.http.postJson(
    "/api-pub/DirectAcquisitionCommon/GetDirectAcquisitionList/",
    {
      pageSize: req.pageSize,
      pageIndex: req.pageIndex,
      showOngoingDa: false,
      cookieContext: null,
      finalizationDateStart: req.finalizationDateStart,
      finalizationDateEnd: req.finalizationDateEnd,
      cpvCategoryId: req.cpvCategoryId ?? null,
      cpvCodeId: req.cpvCodeId ?? null,
      sysDirectAcquisitionStateId: req.sysDirectAcquisitionStateId ?? null,
      contractingAuthorityId: req.contractingAuthorityId ?? null,
      supplierId: req.supplierId ?? null,
    },
  );
}

/** Full DA detail — contains correction flags and (pre-redaction) contact PII. */
export function getDirectAcquisitionDetail(
  client: ElicitatieClient,
  directAcquisitionId: number,
): Promise<FetchResult<Record<string, unknown>>> {
  return client.http.getJson(
    `/api-pub/PublicDirectAcquisition/getView/${directAcquisitionId}`,
  );
}

/** Cheap hover-summary variant. */
export function getDirectAcquisitionQuickView(
  client: ElicitatieClient,
  directAcquisitionId: number,
): Promise<FetchResult<Record<string, unknown>>> {
  return client.http.getJson(
    `/api-pub/DirectAcquisitionCommon/getQuickView/${directAcquisitionId}`,
  );
}

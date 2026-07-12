import type { ElicitatieClient } from "./client.js";
import type { FetchResult } from "../http-client.js";
import {
  NOTICE_TYPE_IDS,
  type ListEnvelope,
  type NoticeContractItem,
  type NoticeListItem,
  type NoticeListRequest,
} from "./types.js";

const PARTICIPATION_SET = new Set<number>(NOTICE_TYPE_IDS.participation);

/** Full request body SEAP expects — unknown fields are silently ignored, so send the canonical set. */
function buildNoticeListBody(req: NoticeListRequest) {
  return {
    sysNoticeTypeIds: req.sysNoticeTypeIds,
    sortProperties: [],
    pageSize: req.pageSize,
    pageIndex: req.pageIndex,
    startPublicationDate: req.startPublicationDate,
    endPublicationDate: req.endPublicationDate,
    sysNoticeStateId: null,
    contractingAuthorityId: null,
    winnerId: null,
    cPVCategoryId: null,
    cPVId: null,
    sysAcquisitionContractTypeId: null,
    sysContractAssigmentTypeId: null,
    assignedUserId: null,
  };
}

/**
 * List notices. Endpoint split (live bundle): GetCNoticeList = participation
 * notices, GetCANoticeList = award notices. Mixing families in one call is
 * not supported — all requested type ids must belong to one family.
 */
export function listNotices(
  client: ElicitatieClient,
  req: NoticeListRequest,
): Promise<FetchResult<ListEnvelope<NoticeListItem>>> {
  const participation = req.sysNoticeTypeIds.every((id) =>
    PARTICIPATION_SET.has(id),
  );
  const award = req.sysNoticeTypeIds.every((id) => !PARTICIPATION_SET.has(id));
  if (!participation && !award) {
    throw new Error(
      "sysNoticeTypeIds mixes participation and award families — one endpoint per family",
    );
  }
  const path = participation
    ? "/api-pub/NoticeCommon/GetCNoticeList/"
    : "/api-pub/NoticeCommon/GetCANoticeList/";
  return client.http.postJson(path, buildNoticeListBody(req));
}

/** Notice detail — huge nested object; archived raw (post-redaction), parsed later. */
export function getNoticeDetail(
  client: ElicitatieClient,
  caNoticeId: number,
): Promise<FetchResult<Record<string, unknown>>> {
  return client.http.getJson(`/api-pub/C_PUBLIC_CANotice/get/${caNoticeId}`);
}

/** Winners/contracts for an award notice. skip/take pagination, take ≤ 200. */
export function getNoticeContracts(
  client: ElicitatieClient,
  req: { caNoticeId: number; skip: number; take: number },
): Promise<FetchResult<ListEnvelope<NoticeContractItem>>> {
  return client.http.postJson("/api-pub/C_PUBLIC_CANotice/GetCANoticeContracts", {
    caNoticeId: req.caNoticeId,
    contractNo: null,
    winnerTitle: null,
    winnerFiscalNumber: null,
    contractDate: { from: null, to: null },
    contractValue: { from: null, to: null },
    contractMinOffer: { from: null, to: null },
    contractMaxOffer: { from: null, to: null },
    contractTitle: null,
    lots: null,
    sortOrder: [],
    sysContractFrameworkType: {},
    skip: req.skip,
    take: req.take,
  });
}

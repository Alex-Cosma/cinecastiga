import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createElicitatieClient } from "../src/elicitatie/client.js";
import {
  getNoticeContracts,
  getNoticeDetail,
  listNotices,
} from "../src/elicitatie/notices.js";
import {
  getDirectAcquisitionDetail,
  listDirectAcquisitions,
} from "../src/elicitatie/direct-acquisitions.js";
import { searchCpvs } from "../src/elicitatie/cpv.js";
import { NOTICE_TYPE_IDS } from "../src/elicitatie/types.js";

interface Seen {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: unknown;
}

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise((resolve) => server!.close(resolve));
    server = undefined;
  }
});

function startRecordingServer(
  respond: (seen: Seen) => unknown,
): Promise<{ baseUrl: string; requests: Seen[] }> {
  const requests: Seen[] = [];
  server = createServer((req, res) => {
    let chunks = "";
    req.on("data", (c) => (chunks += c));
    req.on("end", () => {
      const seen: Seen = {
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body: chunks ? JSON.parse(chunks) : undefined,
      };
      requests.push(seen);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(respond(seen)));
    });
  });
  return new Promise((resolve) => {
    server!.listen(0, "127.0.0.1", () => {
      const { port } = server!.address() as AddressInfo;
      resolve({ baseUrl: `http://127.0.0.1:${port}`, requests });
    });
  });
}

function makeClient(baseUrl: string) {
  return createElicitatieClient({
    baseUrl,
    userAgent: "seap-analytics-test/0.1 (contact: contact@example.test)",
    minDelayMs: 0,
    maxConcurrency: 3,
  });
}

const ENVELOPE = { total: 1, items: [{ caNoticeId: 42 }], searchTooLong: false };

describe("elicitatie clients", () => {
  it("routes participation vs award families to the correct endpoints", async () => {
    const { baseUrl, requests } = await startRecordingServer(() => ENVELOPE);
    const client = makeClient(baseUrl);

    await listNotices(client, {
      sysNoticeTypeIds: NOTICE_TYPE_IDS.participation,
      startPublicationDate: "2026-07-01",
      endPublicationDate: "2026-07-11",
      pageIndex: 0,
      pageSize: 100,
    });
    await listNotices(client, {
      sysNoticeTypeIds: NOTICE_TYPE_IDS.award,
      startPublicationDate: "2026-07-01",
      endPublicationDate: "2026-07-11",
      pageIndex: 0,
      pageSize: 100,
    });

    expect(requests[0]!.url).toBe("/api-pub/NoticeCommon/GetCNoticeList/");
    expect(requests[1]!.url).toBe("/api-pub/NoticeCommon/GetCANoticeList/");
    expect(requests[0]!.method).toBe("POST");

    const body = requests[0]!.body as Record<string, unknown>;
    expect(body["sysNoticeTypeIds"]).toEqual([2, 17, 7, 6, 12, 19]);
    expect(body["startPublicationDate"]).toBe("2026-07-01");
    expect(body["endPublicationDate"]).toBe("2026-07-11");
    expect(body["pageSize"]).toBe(100);
    // canonical body fields present (unknown fields are silently ignored server-side,
    // so the canonical set must be sent verbatim)
    expect(body).toHaveProperty("sysNoticeStateId", null);
    expect(body).toHaveProperty("cPVId", null);
  });

  it("rejects mixed notice families", async () => {
    const { baseUrl } = await startRecordingServer(() => ENVELOPE);
    const client = makeClient(baseUrl);
    expect(() =>
      listNotices(client, {
        sysNoticeTypeIds: [2, 3],
        startPublicationDate: "2026-07-01",
        endPublicationDate: "2026-07-02",
        pageIndex: 0,
        pageSize: 100,
      }),
    ).toThrow(/mixes participation and award/);
  });

  it("sends Referer + UA on every request", async () => {
    const { baseUrl, requests } = await startRecordingServer(() => ENVELOPE);
    const client = makeClient(baseUrl);

    await getNoticeDetail(client, 42);
    await listDirectAcquisitions(client, {
      finalizationDateStart: "2026-07-01",
      finalizationDateEnd: "2026-07-01",
      pageIndex: 0,
      pageSize: 100,
    });

    for (const req of requests) {
      expect(req.headers.referer).toContain("https://e-licitatie.ro/pub/");
      expect(req.headers["user-agent"]).toContain("seap-analytics");
    }
    expect(requests[0]!.url).toBe("/api-pub/C_PUBLIC_CANotice/get/42");
  });

  it("DA list sends only finalizationDate filters and canonical body", async () => {
    const { baseUrl, requests } = await startRecordingServer(() => ENVELOPE);
    const client = makeClient(baseUrl);

    await listDirectAcquisitions(client, {
      finalizationDateStart: "2026-07-01",
      finalizationDateEnd: "2026-07-01",
      pageIndex: 2,
      pageSize: 500,
      cpvCategoryId: 6,
    });

    expect(requests[0]!.url).toBe(
      "/api-pub/DirectAcquisitionCommon/GetDirectAcquisitionList/",
    );
    const body = requests[0]!.body as Record<string, unknown>;
    expect(body["finalizationDateStart"]).toBe("2026-07-01");
    expect(body["cpvCategoryId"]).toBe(6);
    expect(body["showOngoingDa"]).toBe(false);
    expect(body).not.toHaveProperty("publicationDateStart");
    expect(body).not.toHaveProperty("publicationDateEnd");
  });

  it("passes searchTooLong through verbatim", async () => {
    const { baseUrl } = await startRecordingServer(() => ({
      total: 2000,
      items: [],
      searchTooLong: true,
    }));
    const client = makeClient(baseUrl);

    const result = await listDirectAcquisitions(client, {
      finalizationDateStart: "2026-07-01",
      finalizationDateEnd: "2026-07-01",
      pageIndex: 20,
      pageSize: 100,
    });
    expect(result.data.searchTooLong).toBe(true);
    expect(result.data.total).toBe(2000);
    expect(result.data.items).toEqual([]);
  });

  it("notice contracts uses skip/take", async () => {
    const { baseUrl, requests } = await startRecordingServer(() => ({
      total: 0,
      items: [],
    }));
    const client = makeClient(baseUrl);

    await getNoticeContracts(client, { caNoticeId: 99, skip: 200, take: 200 });

    expect(requests[0]!.url).toBe(
      "/api-pub/C_PUBLIC_CANotice/GetCANoticeContracts",
    );
    const body = requests[0]!.body as Record<string, unknown>;
    expect(body["caNoticeId"]).toBe(99);
    expect(body["skip"]).toBe(200);
    expect(body["take"]).toBe(200);
    expect(body).not.toHaveProperty("pageIndex");
  });

  it("DA detail + cpv search hit expected GET paths", async () => {
    const { baseUrl, requests } = await startRecordingServer((seen) =>
      seen.url.includes("searchCpvs")
        ? { total: 1, items: [{ id: 123, text: "30197643-5" }] }
        : { directAcquisitionID: 7 },
    );
    const client = makeClient(baseUrl);

    await getDirectAcquisitionDetail(client, 7);
    const cpvs = await searchCpvs(client, { pageIndex: 0, pageSize: 100 });

    expect(requests[0]!.url).toBe("/api-pub/PublicDirectAcquisition/getView/7");
    expect(requests[1]!.url).toContain("/api-pub/ComboPub/searchCpvs?");
    expect(cpvs.items[0]!.id).toBe(123);
  });
});

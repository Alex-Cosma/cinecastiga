import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createElicitatieClient } from "@seap/scraper-clients";
import type { CpvCatalog } from "../src/scrape/elicitatie/cpv-catalog.js";
import {
  resolveLeafSlices,
  sliceKey,
} from "../src/scrape/elicitatie/da-slicer.js";

let server: Server | undefined;
afterEach(async () => {
  if (server) {
    await new Promise((resolve) => server!.close(resolve));
    server = undefined;
  }
});

/** overflowKeys: slice keys that report searchTooLong. */
function startProbeServer(overflowKeys: Set<string>): Promise<string> {
  server = createServer((req, res) => {
    let chunks = "";
    req.on("data", (c) => (chunks += c));
    req.on("end", () => {
      const body = JSON.parse(chunks) as {
        cpvCategoryId: number | null;
        cpvCodeId: number | null;
      };
      const key =
        body.cpvCodeId !== null
          ? `c${body.cpvCategoryId}:k${body.cpvCodeId}`
          : body.cpvCategoryId !== null
            ? `c${body.cpvCategoryId}`
            : "d";
      const overflow = overflowKeys.has(key);
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          total: overflow ? 2000 : 50,
          items: [{ directAcquisitionId: 1 }],
          searchTooLong: overflow,
        }),
      );
    });
  });
  return new Promise((resolve) => {
    server!.listen(0, "127.0.0.1", () => {
      const { port } = server!.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

const fakeCatalog: CpvCatalog = {
  categories: async () => [1, 2, 3],
  codesFor: async (categoryId) => [categoryId * 100 + 1, categoryId * 100 + 2],
};

function makeClient(baseUrl: string) {
  return createElicitatieClient({
    baseUrl,
    userAgent: "test",
    minDelayMs: 0,
    maxRetries: 0,
  });
}

describe("resolveLeafSlices", () => {
  it("quiet day → single unsliced slice", async () => {
    const baseUrl = await startProbeServer(new Set());
    const slices = await resolveLeafSlices(
      makeClient(baseUrl),
      fakeCatalog,
      "2026-07-05",
    );
    expect(slices).toEqual([{ day: "2026-07-05" }]);
  });

  it("overflow day → category fan-out", async () => {
    const baseUrl = await startProbeServer(new Set(["d"]));
    const slices = await resolveLeafSlices(
      makeClient(baseUrl),
      fakeCatalog,
      "2026-07-01",
    );
    expect(slices.map(sliceKey)).toEqual(["c1", "c2", "c3"]);
  });

  it("overflowing category → code fan-out for that category only", async () => {
    const baseUrl = await startProbeServer(new Set(["d", "c2"]));
    const slices = await resolveLeafSlices(
      makeClient(baseUrl),
      fakeCatalog,
      "2026-07-01",
    );
    expect(slices.map(sliceKey)).toEqual([
      "c1",
      "c2:k201",
      "c2:k202",
      "c3",
    ]);
  });

  it("sliceKey is stable for cursor storage", () => {
    expect(sliceKey({ day: "2026-07-01" })).toBe("d");
    expect(sliceKey({ day: "2026-07-01", cpvCategoryId: 6 })).toBe("c6");
    expect(
      sliceKey({ day: "2026-07-01", cpvCategoryId: 6, cpvCodeId: 12345 }),
    ).toBe("c6:k12345");
  });
});

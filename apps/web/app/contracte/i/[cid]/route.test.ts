import { beforeEach, describe, expect, it, vi } from "vitest";

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@seap/db", () => ({ createDb: () => ({ sql }) }));

import { GET } from "./route";

describe("contract internal-id redirect", () => {
  beforeEach(() => sql.mockReset());

  it.each([
    ["https://0.0.0.0:3000", "https://cinecastiga.ro"],
    ["http://localhost:3113", "http://localhost:3113"],
  ])("preserves the browser origin when the server sees %s", async (serverOrigin, browserOrigin) => {
    sql.mockResolvedValue([{ nid: "108121282" }]);
    const response = await GET(new Request(`${serverOrigin}/contracte/i/3900187`), {
      params: Promise.resolve({ cid: "3900187" }),
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/contracte/108121282");
    expect(new URL(response.headers.get("location")!, browserOrigin).href)
      .toBe(`${browserOrigin}/contracte/108121282`);
    expect(sql.mock.calls[0][1]).toBe("3900187");
  });

  it("rejects invalid ids before querying", async () => {
    const response = await GET(new Request("http://localhost:3000/contracte/i/invalid"), {
      params: Promise.resolve({ cid: "invalid" }),
    });
    expect(response.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns 404 without redirecting when the contract is absent", async () => {
    sql.mockResolvedValue([]);
    const response = await GET(new Request("http://localhost:3000/contracte/i/999"), {
      params: Promise.resolve({ cid: "999" }),
    });
    expect(response.status).toBe(404);
    expect(response.headers.has("location")).toBe(false);
  });
});

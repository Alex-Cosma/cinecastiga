import { beforeEach, expect, it, vi } from "vitest";

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@seap/db", () => ({ createDb: () => ({ sql }) }));
import { GET } from "./route";

beforeEach(() => { sql.mockReset(); });
const request = (code: string) => new Request(`http://localhost/api/cpv/label?code=${encodeURIComponent(code)}`);

it.each(["45", "45000000", "45000000-7"])("resolves the same catalogue node for %s", async (code) => {
  sql.mockResolvedValue([{ name_ro: "Lucrări de construcţii" }]);
  expect(await (await GET(request(code))).json()).toEqual({ name: "Lucrări de construcţii" });
  // Exact padded node; a missing parent must never be named after its first child.
  expect(sql.mock.calls[0]?.slice(1)).toEqual(["45000000", "45000000-%"]);
});

it("keeps an unknown code distinct from a catalogue match", async () => {
  sql.mockResolvedValue([]);
  expect(await (await GET(request("99"))).json()).toEqual({ name: null });
});

it("rejects free text and wildcard patterns before querying", async () => {
  for (const code of ["iluminat", "45%", "45-7", ""]) expect((await GET(request(code))).status).toBe(400);
  expect(sql).not.toHaveBeenCalled();
});

it("does not expose or cache database errors", async () => {
  sql.mockRejectedValue(new Error("private database details"));
  const response = await GET(request("45"));
  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: "Denumirea domeniului nu poate fi încărcată acum." });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// Plan §2.8: a trend's sources and CSV send the months the answer counted; when the data
// moved `auto` since, both routes answer 409 instead of another list.
const { runRows } = vi.hoisted(() => ({ runRows: vi.fn() }));
vi.mock("@seap/db", async (original) => ({ ...await original<typeof import("@seap/db")>(), createDb: () => ({ sql: {} }) }));
vi.mock("../../../../lib/ask/compile", async (original) => ({ ...await original<typeof import("../../../../lib/ask/compile")>(), runRows }));
vi.mock("../../../../lib/ask/ground", () => ({ ground: async () => ({}) }));
import { POST as rows } from "./route";
import { POST as csv } from "./csv/route";
import { DATA_CHANGED } from "../../../../lib/ask/compile";

const spec = { block: "trend", dim: "supplier", measure: "value", filters: { yearFrom: 2025, yearTo: 2026 }, trend: { change: "up", months: "auto" } };
const post = (body: unknown) => new Request("http://localhost/api/ask/rows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => runRows.mockReset());

describe("the sources of a trend whose months moved", () => {
  it.each([["/api/ask/rows", rows], ["/api/ask/rows/csv", csv]] as const)("%s answers 409 and passes the executed months to the engine", async (_route, handler) => {
    runRows.mockResolvedValue({ error: DATA_CHANGED, conflict: true });
    const response = await handler(post({ spec, months: [1, 5] }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: DATA_CHANGED });
    expect(runRows.mock.calls[0]![4]).toMatchObject({ months: [1, 5] });
  });

  it.each([[[5, 1]], [[0, 5]], [[1, 5, 7]], ["auto"]])("refuses malformed months %j before the engine", async (months) => {
    const response = await rows(post({ spec, months }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "Lunile comparate sunt invalide." });
    expect(runRows).not.toHaveBeenCalled();
  });
});

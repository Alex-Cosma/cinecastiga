import { beforeEach, describe, expect, it, vi } from "vitest";

// F0a: a spec carrying a key this release reads but does not apply is refused
// with 422 on every route that runs one, before grounding or any query.
const { sql } = vi.hoisted(() => ({ sql: Object.assign(vi.fn(async () => { throw new Error("the database was queried"); }), {
  begin: vi.fn(async () => { throw new Error("the database was queried"); }),
  array: vi.fn(), unsafe: vi.fn(async () => { throw new Error("the database was queried"); }),
}) }));
vi.mock("@seap/db", async (original) => ({ ...await original<typeof import("@seap/db")>(), createDb: () => ({ sql }) }));
// Vitest has no "@/" alias here: the route's modules, by their relative paths.
vi.mock("@/lib/ask/spec", () => import("../../../lib/ask/spec"));
vi.mock("@/lib/ask/question-ui", () => import("../../../lib/ask/question-ui"));
vi.mock("@/lib/ask/ground", () => import("../../../lib/ask/ground"));
vi.mock("@/lib/ask/compile", () => import("../../../lib/ask/compile"));
vi.mock("@/lib/ask/pills", () => import("../../../lib/ask/pills"));
vi.mock("@/lib/ask/llm", () => import("../../../lib/ask/llm"));
vi.mock("@/lib/ask/resolved-spec", () => import("../../../lib/ask/resolved-spec"));
vi.mock("@/lib/devlog", () => import("../../../lib/devlog"));
vi.mock("@/lib/ask/features", () => import("../../../lib/ask/features"));
import { POST as ask } from "./route";
import { POST as rows } from "./rows/route";
import { POST as csv } from "./rows/csv/route";
import { NEWER_VERSION_LINK } from "../../../lib/ask/spec";

beforeEach(() => { sql.mockClear(); sql.begin.mockClear(); });
const post = (body: unknown) => new Request("http://localhost/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const newer = { block: "timeseries", measure: "value", filters: { yearFrom: 2024, yearTo: 2025 }, timeseries: { grain: "month" } };
// The bound selections replace the spec they were sent with; the refusal comes first.
const peer = { version: "peer-evidence-2", checkpointId: "00000000-0000-0000-0000-000000000000" };
const connection = { version: "connection-evidence-1", checkpointId: "00000000-0000-0000-0000-000000000000", pairs: [] };

describe("routes that run a spec", () => {
  it.each([
    ["/api/ask", ask, {}],
    ["/api/ask/rows", rows, {}],
    ["/api/ask/rows with a comparison selection", rows, { peer }],
    ["/api/ask/rows with a relationship selection", rows, { connection }],
    ["/api/ask/rows/csv", csv, {}],
    ["/api/ask/rows/csv with a comparison selection", csv, { peer }],
    ["/api/ask/rows/csv with a relationship selection", csv, { connection }],
  ] as const)("%s answers 422 with the newer-version message", async (_route, handler, extra) => {
    const response = await handler(post({ spec: newer, ...extra }));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ ok: false, error: NEWER_VERSION_LINK });
    expect(sql).not.toHaveBeenCalled();
    expect(sql.begin).not.toHaveBeenCalled();
  });

  it("keeps an unknown key an invalid question, as before", async () => {
    const response = await ask(post({ spec: { ...newer, timeseries: undefined, future: 1 } }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "Câmp necunoscut în întrebare; condiția nu a fost ignorată." });
  });
});

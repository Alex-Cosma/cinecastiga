import { describe, expect, it, vi } from "vitest";

// TB-screen (plan §2.3 variants, owner-R-facts-all-lists): a trend's answer carries every list, so its
// group buttons switch on the screen; the route sends the pills and the SQL of each list with it.
const { runSpec } = vi.hoisted(() => ({ runSpec: vi.fn() }));
vi.mock("@seap/db", async (original) => ({ ...await original<typeof import("@seap/db")>(), createDb: () => ({ sql: {} }) }));
vi.mock("@/lib/ask/spec", () => import("../../../lib/ask/spec"));
vi.mock("@/lib/ask/question-ui", () => import("../../../lib/ask/question-ui"));
vi.mock("@/lib/ask/ground", () => ({ ground: async () => ({}) }));
vi.mock("@/lib/ask/compile", async () => ({ ...await import("../../../lib/ask/compile"), runSpec }));
vi.mock("@/lib/ask/pills", () => import("../../../lib/ask/pills"));
vi.mock("@/lib/ask/trend-shared", () => import("../../../lib/ask/trend-shared"));
vi.mock("@/lib/ask/llm", () => import("../../../lib/ask/llm"));
vi.mock("@/lib/ask/resolved-spec", () => import("../../../lib/ask/resolved-spec"));
vi.mock("@/lib/devlog", () => import("../../../lib/devlog"));
vi.mock("@/lib/ask/features", () => import("../../../lib/ask/features"));
import { POST as ask } from "./route";

const post = (body: unknown) => new Request("http://localhost/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const spec = { block: "trend", dim: "supplier", measure: "value", topN: 10, filters: { yearFrom: 2024, yearTo: 2025 }, trend: { change: "up", months: "auto" } };
const result = (byList?: Record<string, string>) => ({
  data: { block: "trend", yearA: 2024, yearB: 2025, rowsTrend: [] }, displaySql: "having up", caveats: [], tookMs: 1,
  executed: { months: [1, 5], mode: "auto", checkpoint: null }, ...(byList ? { displaySqlByList: byList } : {}),
});

describe("the variants of a trend's answer", () => {
  it("give each list its pills (in the answer's months) and its SQL, while the spec keeps its group", async () => {
    runSpec.mockResolvedValue(result({ all: "having all", up: "having up", new: "having new", first: "having first" }));
    const body = await (await ask(post({ spec }))).json();
    expect(Object.keys(body.variants.trend)).toEqual(["all", "up", "new", "first"]);
    expect(body.variants.trend.new.displaySql).toBe("having new");
    expect(body.variants.trend.new.pills).toContain("noi față de 2024");
    expect(body.variants.trend.new.pills).toContain("aceleași luni: ian.–mai");
    expect(body.variants.trend.first.pills).toContain("prima dată în 2025");
    expect(body.variants.trend.up.pills).toEqual(body.pills);
    expect(body.variants.measure).toBeUndefined();
    expect(body.spec.trend).toEqual({ change: "up", months: "auto" });
  });

  it("are absent when the engine lists one group (a watch's fixed members)", async () => {
    runSpec.mockResolvedValue(result());
    expect((await (await ask(post({ spec }))).json()).variants).toBeUndefined();
  });
});

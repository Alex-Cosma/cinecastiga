import { afterEach, describe, expect, it, vi } from "vitest";

// Audit Q1F7 (5 Nov 2026): a failed query's Postgres text stays in the server log; the visitor reads the route's sentence.
const { sql, failure } = vi.hoisted(() => {
  const failure: { current: Error } = { current: new Error("unset") };
  const fail = async () => { throw failure.current; };
  return { failure, sql: Object.assign(vi.fn(fail), { begin: vi.fn(fail), array: vi.fn(), unsafe: vi.fn(fail) }) };
});
vi.mock("@seap/db", async (original) => ({ ...await original<typeof import("@seap/db")>(), createDb: () => ({ sql }) }));
// Vitest has no "@/" alias here: the route's modules, by their relative paths.
vi.mock("@/lib/ask/spec", () => import("../../../lib/ask/spec"));
vi.mock("@/lib/ask/question-ui", () => import("../../../lib/ask/question-ui"));
vi.mock("@/lib/ask/ground", () => import("../../../lib/ask/ground"));
vi.mock("@/lib/ask/compile", () => import("../../../lib/ask/compile"));
vi.mock("@/lib/ask/pills", () => import("../../../lib/ask/pills"));
vi.mock("@/lib/ask/trend-shared", () => import("../../../lib/ask/trend-shared"));
vi.mock("@/lib/ask/llm", () => import("../../../lib/ask/llm"));
vi.mock("@/lib/ask/resolved-spec", () => import("../../../lib/ask/resolved-spec"));
vi.mock("@/lib/devlog", () => import("../../../lib/devlog"));
vi.mock("@/lib/ask/features", () => import("../../../lib/ask/features"));
vi.mock("@/lib/ask/facets", () => import("../../../lib/ask/facets"));
vi.mock("@/lib/ask/facet-parts", () => import("../../../lib/ask/facet-parts"));
vi.mock("@/lib/ask/answer-facts", () => import("../../../lib/ask/answer-facts"));
vi.mock("@/lib/ask/compare-engine", () => import("../../../lib/ask/compare-engine"));
vi.mock("@/lib/ask/network-facts", () => import("../../../lib/ask/network-facts"));
import { POST as ask } from "./route";
import { POST as rows } from "./rows/route";
import { POST as csv } from "./rows/csv/route";
import { ANSWER_ERROR } from "../../../lib/ask/answer-text";

const post = (body: unknown) => new Request("http://localhost/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const spec = { block: "stat", measure: "value", filters: {} };
const pgError = () => Object.assign(new Error('relation "marts.secret_table" does not exist'), { code: "42P01" });
const timeoutError = () => Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });

afterEach(() => vi.restoreAllMocks());

describe("Ask routes after a failed query", () => {
  it.each([
    ["/api/ask", ask, ANSWER_ERROR],
    ["/api/ask/rows", rows, "Sursele nu au putut fi încărcate. Încearcă din nou."],
    ["/api/ask/rows/csv", csv, "Exportul nu a putut fi generat. Încearcă din nou."],
  ] as const)("%s answers 500 with its sentence and logs the database text", async (route, handler, sentence) => {
    failure.current = pgError();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handler(post({ spec }));
    expect(response.status).toBe(500);
    const body = await response.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe(sentence);
    expect(JSON.stringify(body)).not.toMatch(/relation|secret_table|42P01/);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('relation "marts.secret_table" does not exist'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining(`[${route.slice(1)}]`));
  });

  it("keeps the Ask answer's spec beside the sentence", async () => {
    failure.current = pgError();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const body = await (await ask(post({ spec }))).json() as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["error", "ok", "question", "spec"]);
    expect(body.question).toBeNull();
  });

  it.each([
    ["/api/ask", ask, 200, "Interogarea a depășit limita de timp (20s)."],
    ["/api/ask/rows", rows, 500, "Lista completă a depășit 20 de secunde."],
    ["/api/ask/rows/csv", csv, 200, "Exportul a depășit limita de timp (20s)."],
  ] as const)("%s keeps its timeout sentence and status", async (_route, handler, status, start) => {
    failure.current = timeoutError();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await handler(post({ spec }));
    expect(response.status).toBe(status);
    const body = await response.json() as { error: string };
    expect(body.error.startsWith(start)).toBe(true);
    expect(body.error).not.toContain("canceling statement");
  });
});

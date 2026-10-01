import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/coverage", () => ({ getCoverage: vi.fn() }));
vi.mock("@/lib/processing-freshness", () => ({ getProcessingFreshness: vi.fn() }));
import { getCoverage } from "@/lib/coverage";
import { getProcessingFreshness } from "@/lib/processing-freshness";
import { GET } from "./route";

beforeEach(() => vi.resetAllMocks());
it("exposes only public periods, not collector diagnostics or raw inventory payloads", async () => {
  vi.mocked(getCoverage).mockResolvedValue({ observations: [{ dataset: "da", calculated_at: "2026-09-30T12:00:00Z", observation: { available: "12", date_from: "2020-01-01", date_to: "2026-07-31", missing_date: "0", missing_cpv: "0" } }], collections: [{ source: "internal-diagnostic" }] as never, years: [], normalized: [] });
  vi.mocked(getProcessingFreshness).mockResolvedValue({ dataAt: "2026-09-30T12:00:00Z", riskAt: "2026-09-27T12:00:00Z" });
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ sources: [{ dataset: "da", from: "2020-01-01", to: "2026-07-31", inventoriedAt: "2026-09-30T12:00:00Z" }], dataAt: "2026-09-30T12:00:00Z", riskAt: "2026-09-27T12:00:00Z" });
});
it("keeps an unconfirmed inventory distinct from a failed read", async () => {
  vi.mocked(getCoverage).mockResolvedValue(null);
  vi.mocked(getProcessingFreshness).mockResolvedValue(null);
  expect(await (await GET()).json()).toEqual({ sources: [], dataAt: null, riskAt: null });
});
it("returns a retryable failure without leaking database details", async () => {
  vi.mocked(getCoverage).mockRejectedValue(new Error("private database diagnostic"));
  vi.mocked(getProcessingFreshness).mockResolvedValue(null);
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "Perioadele disponibile nu pot fi citite acum." });
});

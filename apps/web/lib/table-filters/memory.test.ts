import { describe, expect, it } from "vitest";
import { filterRows, memoryFacet, type Readers } from "./memory";
import type { TableColumns } from "./types";

interface Row { id: string; stream: string; outcome: string; at: string; ms: number | null; proxies: string[] }
const rows: Row[] = [
  { id: "1", stream: "da", outcome: "success", at: "2026-11-04T08:00:00Z", ms: 900, proxies: ["p1"] },
  { id: "2", stream: "da", outcome: "failed", at: "2026-11-04T09:00:00Z", ms: 30_000, proxies: ["p2"] },
  { id: "3", stream: "ted", outcome: "success", at: "2026-10-30T10:00:00Z", ms: null, proxies: ["p1", "p2"] },
];
const columns: TableColumns = [
  { key: "flux", kind: "options", label: "Cererea", chip: "", param: "flux", labels: { da: "Achiziții directe", ted: "TED" } },
  { key: "rezultat", kind: "options", label: "Rezultat", chip: "", param: "rezultat" },
  { key: "ora", kind: "dates", label: "Ora", chip: "", param: "ora" },
  { key: "durata", kind: "range", label: "Durată", chip: "", param: "durata" },
  { key: "proxy", kind: "pick", label: "Proxy", chip: "proxy", param: "proxy" },
];
const readers: Readers<Row> = { flux: (r) => r.stream, rezultat: (r) => r.outcome, ora: (r) => r.at, durata: (r) => r.ms, proxy: (r) => r.proxies };

describe("column filters in memory", () => {
  it("keeps the rows every active filter meets", () => {
    expect(filterRows(readers, rows, { flux: { kind: "options", values: ["da"] } }).map((r) => r.id)).toEqual(["1", "2"]);
    expect(filterRows(readers, rows, { ora: { kind: "dates", years: [], from: "2026-11", to: null } }).map((r) => r.id)).toEqual(["1", "2"]);
    expect(filterRows(readers, rows, { durata: { kind: "range", min: 1000, max: null } }).map((r) => r.id)).toEqual(["2"]);
    expect(filterRows(readers, rows, { proxy: { kind: "pick", values: ["p2"] } }).map((r) => r.id)).toEqual(["2", "3"]);
  });

  it("counts a funnel under the other filters, its own left out, the chosen first", () => {
    const state = { flux: { kind: "options" as const, values: ["ted"] }, rezultat: { kind: "options" as const, values: ["success"] } };
    expect(memoryFacet(columns, readers, rows, "flux", state)).toEqual({ kind: "options", more: false,
      options: [{ value: "ted", label: "TED", n: 1 }, { value: "da", label: "Achiziții directe", n: 1 }] });
    const proxies = memoryFacet(columns, readers, rows, "proxy", {}, { term: "p2" });
    expect(proxies.kind === "pick" && proxies.options).toEqual([{ value: "p2", label: "p2", n: 2 }]);
    expect(memoryFacet(columns, readers, rows, "ora", {})).toEqual({ kind: "dates", undated: 0, months: [{ month: "2026-10", n: 1 }, { month: "2026-11", n: 2 }] });
    const durations = memoryFacet(columns, readers, rows, "durata", {});
    expect(durations.kind === "range" && [durations.min, durations.max, durations.bins.reduce((n, b) => n + b.n, 0)]).toEqual([900, 30_000, 2]);
  });
});

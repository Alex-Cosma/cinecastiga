import { describe, expect, it } from "vitest";
import { connectionEvidenceSpec, validateConnectionEvidence, type ConnectionEvidenceSelection } from "./connection-evidence-shared";
import { validateCaptureRequest } from "./evidence-capture-input";

const a = { id: "101", identity: "a".repeat(64) }, b = { id: "102", identity: "b".repeat(64) }, c = { id: "103", identity: "c".repeat(64) };
const selection: ConnectionEvidenceSelection = { version: "connection-evidence-1", checkpointId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", dataset: "all", yearFrom: 2024, yearTo: 2025,
  pairs: [{ authority: a, supplier: b }, { authority: c, supplier: b }] };
describe("documented connection evidence boundary", () => {
  it("preserves exact OR pairs and period without creating a cross product", () => {
    expect(validateConnectionEvidence(selection)).toEqual(selection);
    const spec = connectionEvidenceSpec(selection);
    expect(spec.filters).toEqual({ supplierId: 102, yearFrom: 2024, yearTo: 2025 });
    expect(spec.population).toEqual({ operator: "or", groups: [
      { operator: "and", conditions: [{ field: "authority", op: "in", values: ["101"] }, { field: "supplier", op: "in", values: ["102"] }] },
      { operator: "and", conditions: [{ field: "authority", op: "in", values: ["103"] }, { field: "supplier", op: "in", values: ["102"] }] },
    ] });
  });
  it("pushes both direct endpoints or the common buyer into indexed source filters", () => {
    expect(connectionEvidenceSpec({...selection,pairs:[selection.pairs[0]!]}).filters)
      .toEqual({authorityId:101,supplierId:102,yearFrom:2024,yearTo:2025});
    const path=connectionEvidenceSpec({...selection,pairs:[{authority:a,supplier:b},{authority:a,supplier:c}]});
    expect(path.filters).toEqual({authorityId:101,yearFrom:2024,yearTo:2025});
    expect(path.population?.groups.map(group=>group.conditions)).toEqual([
      [{field:"authority",op:"in",values:["101"]},{field:"supplier",op:"in",values:["102"]}],
      [{field:"authority",op:"in",values:["101"]},{field:"supplier",op:"in",values:["103"]}],
    ]);
  });
  it("rejects duplicate, unrelated, self and inconsistent intermediate pairs", () => {
    for (const pairs of [[], [...selection.pairs, selection.pairs[0]], [selection.pairs[0], selection.pairs[0]],
      [selection.pairs[0], { authority: c, supplier: { id: "104", identity: "d".repeat(64) } }],
      [{ authority: a, supplier: a }], [selection.pairs[0], { authority: c, supplier: { ...b, identity: "d".repeat(64) } }]])
      expect(validateConnectionEvidence({ ...selection, pairs })).toHaveProperty("error");
    expect(validateConnectionEvidence({ ...selection, yearFrom: 2026 })).toHaveProperty("error");
    expect(validateConnectionEvidence({ ...selection, checkpointId: "latest" })).toHaveProperty("error");
  });
  it("rebuilds the capture spec and strips browser names, titles and monetary assertions", () => {
    const result = validateCaptureRequest("query", null, { block: "stat", filters: {} }, {
      connection: { ...selection, title: "Forged", totalExact: "999", pairs: selection.pairs.map(p => ({ ...p, authority: { ...p.authority, name: "Forged" } })) },
      title: "False conclusion", valueRon: "999", evidenceOptions: { search: " test ", stream: "contracts" },
    });
    expect(result).toEqual({ kind: "query", refId: null, spec: connectionEvidenceSpec(selection), connection: selection, options: { search: "test", stream: "contracts" } });
  });
});

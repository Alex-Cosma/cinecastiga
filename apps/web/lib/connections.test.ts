import { describe, expect, it } from "vitest";
import { assertConnectionIdentity, connectionIdentity, parseConnectionInput } from "./connections";
import { connectionPairSpec, type ConnectionEntity } from "./connections-shared";

const parse = (extra = "") => parseConnectionInput(new URLSearchParams(`entityId=123&role=authority${extra}`));
describe("connection scope and identity", () => {
  it("defaults to both disjoint streams and keeps explicit narrow filters", () => {
    expect(parse()).toEqual({ entityId: "123", role: "authority", dataset: "all", search: "", page: 1 });
    expect(parse("&dataset=contracts&yearFrom=2024&yearTo=2025&search=%20spații%20&page=2&excludeEntityId=45"))
      .toMatchObject({ dataset: "contracts", yearFrom: 2024, yearTo: 2025, search: "spații", page: 2, excludeEntityId: "45" });
  });
  it("fails closed on unsupported, ambiguous or malformed filters", () => {
    for (const extra of ["&dataset=ted", "&yearFrom=2025&yearTo=2024", "&yearFrom=no", "&yearTo=2100", "&page=0", "&page=-1",
      "&supplierId=24", "&dataset=all&dataset=da", "&identity=anything", "&checkpointId=123", "&excludeEntityId=0", "&partnerId=0", "&partnerId=9007199254740992", "&search="+"x".repeat(151)]) expect(() => parse(extra)).toThrow();
    expect(() => parseConnectionInput(new URLSearchParams("entityId=9007199254740992&role=authority"))).toThrow();
  });
  it("builds the original pair source selection without top-N or count semantics", () => {
    expect(connectionPairSpec({ id: "123", name: "Authority" }, { id: "456", name: "Supplier" }, { dataset: "contracts", yearFrom: 2024 }))
      .toEqual({ block: "stat", measure: "value", dataset: "contracts", filters: { authorityId: 123, authorityName: "Authority", supplierId: 456, supplierName: "Supplier", yearFrom: 2024 } });
  });
  it("keeps legal-identity renames stable, binds ID reuse and rejects unknown receipts", () => {
    const row = { id: "123", cui: "456", foreign: null, sicap: ["supplier:2"], fallback: "name-before" };
    const identity = connectionIdentity(row);
    expect(connectionIdentity({ ...row, fallback: "name-after" })).toBe(identity);
    expect(connectionIdentity({ ...row, cui: "789" })).not.toBe(identity);
    expect(connectionIdentity({ ...row, id: "456" })).not.toBe(identity);
    expect(connectionIdentity({ ...row, cui: null, sicap: ["b", "a"] })).toBe(connectionIdentity({ ...row, cui: null, sicap: ["a", "b"] }));
    expect(() => assertConnectionIdentity({ identity } as ConnectionEntity, "0".repeat(64))).toThrow(/Identitatea/);
  });
});

import { describe, expect, it } from "vitest";
import { REPAIRS, assertMockSignature } from "../src/scripts/repair-da-test-fixtures.js";
import { contentHash } from "../src/scrape/hash.js";

describe("bounded DA fixture repair guards", () => {
  const repair = REPAIRS[0];
  const mock = { id:BigInt(repair.mock),externalId:`da:${repair.id}`,contentHash:repair.mockHash,
    payload:{directAcquisitionID:repair.id,closingValue:222,isOpenForCorrection:true} };
  it("recognizes exactly the four audited fixture fingerprints", () => {
    expect(REPAIRS).toHaveLength(4);
    for (const r of REPAIRS) expect(() => assertMockSignature(r,{id:BigInt(r.mock),externalId:`da:${r.id}`,contentHash:r.mockHash,
      payload:{directAcquisitionID:r.id,closingValue:222,isOpenForCorrection:true}})).not.toThrow();
  });
  it("refuses a different raw identity even when its payload matches", () => {
    expect(() => assertMockSignature(repair,{...mock,id:1n})).toThrow("identity");
    expect(() => assertMockSignature(repair,{...mock,externalId:"da:1"})).toThrow("identity");
  });
  it("refuses changed payloads, even if their newly computed hash is supplied", () => {
    for (const payload of [{...mock.payload,closingValue:223},{...mock.payload,state:8},{...mock.payload,isOpenForCorrection:false}]) {
      expect(() => assertMockSignature(repair,{...mock,payload,contentHash:contentHash(payload)})).toThrow("hash");
    }
  });
  it("refuses forged payloads behind an unchanged stored hash", () => {
    expect(() => assertMockSignature(repair,{...mock,payload:{...mock.payload,directAcquisitionID:1}})).toThrow("hash");
  });
});

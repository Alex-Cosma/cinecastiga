import { describe, expect, it } from "vitest";
import type { DaTx } from "@/lib/marts";
import { consortiumGroups, contractKindLabel, republishedContractKeys, txRowKey } from "./tx-rows";

const row = (over: Partial<DaTx>): DaTx => ({
  src: "contract", sicapDaId: "1", daCode: "16732", partnerId: "10", partnerName: "ALLIANCE", county: null,
  cpvCode: null, cpvName: "Diverse medicamente", estimatedValueRon: null, closingValue: 34022764.8,
  finalizationDate: "2025-08-01", daFlags: [], procedureType: null, caNoticeId: "215",
  singleBidder: null, natId: "107767548", valueSuspect: false, nWinners: 3, contractValueFull: 102068294.4,
  consortiumOthers: [], financialKind: "framework", ...over,
});

describe("entity table rows", () => {
  it("marks the same contract published under two award notices", () => {
    const rows = [row({}), row({ sicapDaId: "2", caNoticeId: "222", natId: "108110285" }), row({ sicapDaId: "3", daCode: "99", caNoticeId: "300" })];
    expect([...republishedContractKeys(rows)]).toEqual([txRowKey(rows[0]!, 0), txRowKey(rows[1]!, 1)]);
  });

  it("does not mark consortium members of one contract, different values or direct acquisitions", () => {
    const members = [row({ partnerId: "10" }), row({ partnerId: "11" }), row({ partnerId: "12" })];
    expect(republishedContractKeys(members).size).toBe(0);
    expect(republishedContractKeys([row({}), row({ sicapDaId: "2", caNoticeId: "222", closingValue: 1 })]).size).toBe(0);
    expect(republishedContractKeys([row({ src: "da" }), row({ src: "da", sicapDaId: "2", caNoticeId: "222" })]).size).toBe(0);
    // Two records under the same notice are not called a republication.
    expect(republishedContractKeys([row({}), row({ sicapDaId: "2" })]).size).toBe(0);
  });

  it("labels framework ceilings and addenda without claiming how totals treat them", () => {
    expect(contractKindLabel("framework")?.text).toBe("plafon acord-cadru");
    expect(contractKindLabel("framework")?.title).toContain("nu valoarea comenzilor efective");
    expect(contractKindLabel("amendment")?.text).toBe("act adițional");
    expect(contractKindLabel("contract")).toBeNull();
    expect(contractKindLabel(null)).toBeNull();
  });

  it("groups the member records of one consortium contract that are neighbours, nothing else", () => {
    const members = [row({ partnerId: "10" }), row({ partnerId: "11" }), row({ partnerId: "12" })];
    const single = row({ sicapDaId: "9", nWinners: 1, partnerId: "20" });
    const da = row({ src: "da", sicapDaId: "7", nWinners: null });
    const groups = consortiumGroups([single, ...members, da, da]);
    expect(groups.map((g) => g.length)).toEqual([1, 3, 1, 1]);
    // The first member takes the remaining bani of the split: still one contract.
    expect(consortiumGroups([row({ closingValue: 34022764.81 }), row({ partnerId: "11" })]).map((g) => g.length)).toEqual([2]);
    // A member with its own published value stays its own row.
    expect(consortiumGroups([row({}), row({ partnerId: "11", closingValue: 5 })]).map((g) => g.length)).toEqual([1, 1]);
    // Another contract right after is another group.
    expect(consortiumGroups([row({}), row({ sicapDaId: "2", partnerId: "11" })]).map((g) => g.length)).toEqual([1, 1]);
  });
});

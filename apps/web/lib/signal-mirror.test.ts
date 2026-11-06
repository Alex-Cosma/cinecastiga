import { describe, expect, it } from "vitest";
import { aboveCeiling, datesWords, dayWords, decemberRecords, nearCeiling, partnerShare, ratioWords, repeatedAmounts, splitGroup, splitSummary, topPartners, yearEnd } from "./signal-mirror";
import { splitPartnerRecords } from "./signal-evidence";

const rec = (date: string, value: number, refId = date + value) => ({ date, value, valueExact: String(value), refId });

// Comuna Ibănești and Remico Comprest, as production stored them on 5 November 2026.
const nomcris = splitGroup({ id: "62179707", partnerId: "1", partnerName: "NOMCRIS CONSTRUCT", period: "2022",
  evidence: { type: "da_ceiling_works", year: 2022, count: 3, total: 1340606.79, ceiling: 450200, cpv_class: "4523" },
  records: [rec("2022-07-25", 449900), rec("2022-07-25", 443806.79), rec("2022-07-25", 446900)] });
const flamengo = splitGroup({ id: "62179710", partnerId: "2", partnerName: "SC FLAMENGO CONSULTING SRL", period: "2021",
  evidence: { type: "da_ceiling_goods_services", year: 2021, count: 3, total: 159600, ceiling: 135060, cpv_class: "7941" },
  records: [rec("2021-11-03", 41600), rec("2021-11-03", 35000), rec("2021-11-03", 83000)] });

describe("the mirror of «Adunate, trec de plafon»", () => {
  it("sums a group against its ceiling, each purchase under it, the same day said once", () => {
    expect(nomcris.ratio).toBeCloseTo(2.978, 3);
    expect(ratioWords(nomcris.ratio)).toBe("3,0×");
    expect(nomcris.counted).toBe(true);
    expect(nomcris.works).toBe(true);
    expect(nomcris.items.every((it) => it.ofCeiling < 1)).toBe(true);
    expect(nomcris.dates).toBe("toate în aceeași zi: 25 iulie 2022");
  });

  it("leaves a group at 1,2× or under out of the score", () => {
    expect(ratioWords(flamengo.ratio)).toBe("1,2×");
    expect(flamengo.counted).toBe(false);
  });

  it("leaves recurring medical supply out of the score whatever its multiple", () => {
    const medical = splitGroup({ id: "3", partnerId: null, partnerName: null, period: "2024",
      evidence: { year: 2024, count: 4, total: 900000, ceiling: 270120, cpv_class: "3314" }, records: [] });
    expect(medical.recurring).toBe("medical");
    expect(medical.counted).toBe(false);
  });

  it("says how many purchases, groups and which years, and that each was under its ceiling", () => {
    const s = splitSummary([nomcris, flamengo]);
    expect(s).toMatchObject({ groups: 2, counted: 1, acquisitions: 6, allUnder: true, years: { from: "2021", to: "2022" } });
    expect(s.largest).toEqual({ value: 449900, ceiling: 450200 });
  });
});

describe("dates in words", () => {
  it("names one day, one month, one year's months, or the whole span", () => {
    expect(dayWords("2022-07-25")).toBe("25 iulie 2022");
    expect(datesWords(["2022-07-25"])).toBe("25 iulie 2022");
    expect(datesWords(["2024-07-17", "2024-07-30"])).toBe("toate în iulie 2024");
    expect(datesWords(["2022-03-28", "2022-12-16", "2022-04-16"])).toBe("din martie până în decembrie");
    expect(datesWords(["2018-11-14", "2026-07-24"])).toBe("din 14 noiembrie 2018 până în 24 iulie 2026");
    expect(datesWords([null, "x"])).toBeNull();
  });
});

describe("the mirror of «Multe sume imediat sub plafon»", () => {
  const sums = [135000, 135000, 135000, 135000, 133812].map((v, i) => nearCeiling({ id: String(i), partnerId: i < 2 ? "9" : String(i), partnerName: i < 2 ? "NOMIS 2003 S.R.L." : `F${i}`, period: "2021",
    evidence: { closing: v, ceiling: 135060 }, records: [rec("2021-05-01", v)] }));

  it("measures how close each purchase stopped to its ceiling", () => {
    expect(sums[0]!.gap).toBe(60);
    expect(sums[0]!.ofCeiling).toBeCloseTo(0.99956, 5);
  });

  it("finds the sums repeated to the leu and the firms with several", () => {
    expect(repeatedAmounts(sums)).toEqual([{ value: 135000, ceiling: 135060, n: 4 }]);
    expect(topPartners(sums)).toEqual([{ id: "9", name: "NOMIS 2003 S.R.L.", n: 2 }]);
  });
});

describe("the mirror of «Declarate directe, peste plafon»", () => {
  it("measures the crossing by the value the rule used", () => {
    expect(aboveCeiling({ id: "1", partnerId: null, partnerName: "FRENAUTO", period: "2026", evidence: { basis: "final", closing: 990600, ceiling: 900400 }, records: [] }))
      .toMatchObject({ value: 990600, over: 90200, basis: "final" });
    expect(aboveCeiling({ id: "2", partnerId: null, partnerName: null, period: "2022", evidence: { basis: "estimate", estimate: 218487.39, closing: 200000, ceiling: 135060 }, records: [] }))
      .toMatchObject({ value: 218487.39, basis: "estimate" });
  });
});

describe("the mirror of «Mulți bani contractați în decembrie»", () => {
  it("puts December against the year and the reference of its kind", () => {
    const y = yearEnd({ id: "1", partnerId: null, partnerName: null, period: "2020", evidence: { year: 2020, total: 1139363.99, december: 704800.01, december_pct: 0.6186, peer_p95: 0.3974 }, records: [] });
    expect(y).toMatchObject({ year: "2020", share: 0.6186, reference: 0.3974 });
    expect(decemberRecords([{ date: "2020-12-03" }, { date: "2020-11-30" }], "2020")).toEqual([{ date: "2020-12-03" }]);
  });
});

describe("the partner signals", () => {
  it("reads a dependence's two faces: the client's share for the firm and the firm's for the client", () => {
    expect(partnerShare("da_dependence", { total: 284662.8, authorities: 3, top_authority: 2143962, top_authority_pct: 0.9564, authority_share: 0.0121, top_authority_count: 8 }))
      .toMatchObject({ partnerId: "2143962", share: 0.9564, reverse: 0.0121, partners: 3, count: 8, adjusted: null });
  });

  it("keeps a concentration's share without its largest purchase", () => {
    expect(partnerShare("da_concentration", { top_supplier: 1990986, top_supplier_pct: 0.9417, adjusted_pct: 0.9303, suppliers: 6 }))
      .toMatchObject({ partnerId: "1990986", adjusted: 0.9303, reverse: null, partners: 6 });
  });

  it("makes the main partner's acquisitions the sources and sets the rest aside (owner, 6 November 2026)", () => {
    const rows = [{ authorityId: "2143962", supplierId: "2097990" }, { authorityId: "2132267", supplierId: "2097990" }, { authorityId: "2143962", supplierId: "2097990" }];
    const split = splitPartnerRecords("da_dependence", { top_authority: 2143962 }, null, rows);
    expect(split.partnerId).toBe("2143962");
    expect(split.mine).toHaveLength(2);
    expect(split.aside).toEqual([{ authorityId: "2132267", supplierId: "2097990" }]);
    expect(splitPartnerRecords("da_concentration", {}, "77", [{ authorityId: "1", supplierId: "77" }, { authorityId: "1", supplierId: "78" }]).aside).toHaveLength(1);
    expect(splitPartnerRecords("da_dependence", {}, null, rows).aside).toEqual([]);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dec, extractTedNotice, tenderCount } from "../src/normalize/ted.js";
import { extractF03Notice } from "../src/normalize/ted-fforms.js";

const amount = (value: string, currency = "RON") => `<cbc:PayableAmount currencyID="${currency}">${value}</cbc:PayableAmount>`;
const tender = (id = "TEN-1", value = "123.45", currency = "RON") => `<efac:LotTender><cbc:ID>${id}</cbc:ID><cac:LegalMonetaryTotal>${amount(value, currency)}</cac:LegalMonetaryTotal><efac:TenderingParty><cbc:ID>TPA-1</cbc:ID></efac:TenderingParty></efac:LotTender>`;
const ref = (id = "TEN-1") => `<efac:LotTender><cbc:ID>${id}</cbc:ID></efac:LotTender>`;
const statistic = (n: string) => `<efac:ReceivedSubmissionsStatistics><efbc:StatisticsCode>tenders</efbc:StatisticsCode><efbc:StatisticsNumeric>${n}</efbc:StatisticsNumeric></efac:ReceivedSubmissionsStatistics>`;
const result = (content: string, lot = "LOT-1", id = "RES-1") => `<efac:LotResult><cbc:ID>${id}</cbc:ID><cbc:TenderResultCode>selec-w</cbc:TenderResultCode><efac:TenderLot><cbc:ID>${lot}</cbc:ID></efac:TenderLot>${content}</efac:LotResult>`;
const notice = (content: string) => `<ContractAwardNotice><ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent><efext:EformsExtension><efac:Publication><efbc:NoticePublicationID>100-2026</efbc:NoticePublicationID></efac:Publication><efac:NoticeResult>${content}<efac:TenderingParty><cbc:ID>TPA-1</cbc:ID><efac:Tenderer><cbc:ID>ORG-1</cbc:ID></efac:Tenderer><efac:Tenderer><cbc:ID>ORG-2</cbc:ID></efac:Tenderer></efac:TenderingParty></efac:NoticeResult></efext:EformsExtension></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions></ContractAwardNotice>`;
const lot = (content: string) => extractTedNotice(notice(content)).lots[0]!;

describe("TED source amounts and cardinality", () => {
  it("preserves the real 298320-2026 multi-reference structure without inventing a total", () => {
    const xml = readFileSync(new URL("./fixtures/ted-298320-2026.xml", import.meta.url), "utf8");
    const parsed = extractTedNotice(xml);
    expect(parsed.publicationNumber).toBe("298320-2026");
    expect(parsed.amountReplaySafe).toBe(false);
    expect(parsed.lots).toHaveLength(1);
    const l = parsed.lots[0]!;
    expect(l.lotId).toBe("LOT-0023");
    expect(l.amountKind).toBe("multiple_tenders");
    expect(l.awarded).toBeNull();
    expect(l.amountDetails.tenders).toHaveLength(3);
    expect(l.amountDetails.missingTenderIds).toEqual([]);
    expect(l.amountDetails.amounts.filter((a) => a.kind === "payable").map((a) => a.value).sort())
      .toEqual(["4785076670", "4789619555", "4808930250"]);
    expect(l.amountDetails.amounts.find((a) => a.kind === "framework_ceiling")?.value).toBe("4808930250");
    expect(l.winnerOrgIds.length).toBeGreaterThan(0);
    expect(l.contractDate).not.toBeNull();
    expect(l.amountDetails.matchEligible).toBe(false);
  });
  it("keeps exact large decimal values, including zero, without floating point conversion", () => {
    expect(dec("9007199254740993.12345678901234567890")).toBe("9007199254740993.12345678901234567890");
    expect(dec("0.00")).toBe("0.00");
    expect(dec("Infinity")).toBeNull();
    expect(dec("1e309")).toBeNull();
    expect(lot(tender("TEN-1", "0.00", "EUR") + result(ref())).awarded).toBe("0.00");
    expect(lot(tender("TEN-1", "0.00", "EUR") + result(ref())).currency).toBe("EUR");
  });
  it("does not classify lower/upper tender values as a contract award", () => {
    const l = lot(result('<cbc:LowerTenderAmount currencyID="EUR">10</cbc:LowerTenderAmount><cbc:HigherTenderAmount currencyID="EUR">20</cbc:HigherTenderAmount>'));
    expect(l.amountKind).toBe("tender_range");
    expect(l.awarded).toBeNull();
    expect(l.amountDetails.amounts.map((a) => [a.kind, a.value, a.currency])).toEqual([
      ["tender_lower", "10", "EUR"], ["tender_upper", "20", "EUR"],
    ]);
  });
  it("keeps framework ceiling separate even when a payable field exists", () => {
    const l = lot(tender() + result(ref() + '<efac:FrameworkAgreementValues><cbc:MaximumValueAmount currencyID="RON">999</cbc:MaximumValueAmount></efac:FrameworkAgreementValues>'));
    expect(l.amountKind).toBe("framework_offer");
    expect(l.awarded).toBeNull();
    expect(l.amountDetails.amounts).toHaveLength(2);
    expect(l.amountDetails.matchEligible).toBe(false);
  });
  it("deduplicates repeated references and preserves consortium winners", () => {
    const l = lot(tender() + result(ref() + ref() + statistic("1")));
    expect(l.amountKind).toBe("payable");
    expect(l.amountDetails.amounts).toHaveLength(1);
    expect(l.winnerOrgIds).toEqual(["ORG-1", "ORG-2"]);
    expect(l.tendersReceived).toBe(1);
    expect(l.amountDetails.matchEligible).toBe(true);
  });
  it("withholds matching for a tender reused across lots and retains its references", () => {
    const lots = extractTedNotice(notice(tender() + result(ref()) + result(ref(), "LOT-2", "RES-2"))).lots;
    expect(lots).toHaveLength(2);
    expect(lots.every((l) => l.amountDetails.tenders[0]?.sharedAcrossLots && !l.amountDetails.matchEligible)).toBe(true);
  });
  it("retains multiple results of one lot without violating its stable identity or guessing bidder count", () => {
    const l = lot(tender() + tender("TEN-2", "999", "EUR") + result(ref() + statistic("1")) + result(ref("TEN-2") + statistic("2"), "LOT-1", "RES-2"));
    expect(l.amountDetails.resultIds).toEqual(["RES-1", "RES-2"]);
    expect(l.amountDetails.amounts.map((a) => a.currency)).toEqual(["RON", "EUR"]);
    expect(l.amountKind).toBe("multiple_tenders");
    expect(l.tendersReceived).toBeNull();
  });
  it("reports dangling tender references and does not promote a range fallback", () => {
    const l = lot(result(ref("MISSING") + '<cbc:LowerTenderAmount currencyID="RON">777</cbc:LowerTenderAmount>'));
    expect(l.amountDetails.missingTenderIds).toEqual(["MISSING"]);
    expect(l.awarded).toBeNull();
    expect(l.winnerOrgIds).toEqual([]);
  });
  it("handles multiple tender references on a settled contract", () => {
    const sc = `<efac:SettledContract><cbc:IssueDate>2026-06-01Z</cbc:IssueDate>${ref()}${ref("TEN-2")}</efac:SettledContract>`;
    const l = lot(tender() + tender("TEN-2") + sc + result(ref() + ref("TEN-2")));
    expect(l.contractDate?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(l.amountDetails.tenders.every((t) => t.contractDates[0] === "2026-06-01")).toBe(true);
  });
  it("keeps missing/conflicting/invalid statistics unknown rather than multi-bid", () => {
    for (const values of [[], [undefined], ["1", "2"], ["-1"], ["1.5"], [""], ["1", undefined], ["2147483648"]]) {
      expect(tenderCount(values)).toBeNull();
    }
    expect(tenderCount(["0"])).toBe(0);
    expect(tenderCount(["1", "1"])).toBe(1);
    expect(lot(tender() + result(ref() + statistic("1") + statistic("2"))).tendersReceived).toBeNull();
  });
});

describe("strict eForms amount-only replay proof", () => {
  const safeXml = () => notice(tender().replace("</cbc:ID>", "</cbc:ID><cbc:RankCode>1</cbc:RankCode>")
    + `<efac:SettledContract><cbc:IssueDate>2026-06-01Z</cbc:IssueDate>${ref()}</efac:SettledContract>`
    + result(ref() + statistic("1")))
    .replace("<efac:NoticeResult>", `<efac:Organizations>${["ORG-1", "ORG-2"].map((id) =>
      `<efac:Organization><efac:Company><cac:PartyIdentification><cbc:ID>${id}</cbc:ID></cac:PartyIdentification></efac:Company></efac:Organization>`).join("")}</efac:Organizations><efac:NoticeResult>`);
  it("permits a single ranked selected tender with an unchanged consortium", () => {
    const n = extractTedNotice(safeXml());
    expect(n.amountReplaySafe).toBe(true);
    expect(n.lots[0]!.winnerOrgIds).toEqual(["ORG-1", "ORG-2"]);
  });
  it("falls back for rank zero, absent rank and absent or non-winning selection status", () => {
    for (const xml of [safeXml().replace("<cbc:RankCode>1</cbc:RankCode>", "<cbc:RankCode>0</cbc:RankCode>"),
      safeXml().replace("<cbc:RankCode>1</cbc:RankCode>", ""),
      safeXml().replace("<cbc:TenderResultCode>selec-w</cbc:TenderResultCode>", ""),
      safeXml().replace("selec-w", "clos-nw")]) expect(extractTedNotice(xml).amountReplaySafe).toBe(false);
  });
  it("falls back for duplicate result references, tender IDs and unknown winner organizations", () => {
    expect(extractTedNotice(safeXml().replace(result(ref() + statistic("1")), result(ref() + ref() + statistic("1")))).amountReplaySafe).toBe(false);
    expect(extractTedNotice(safeXml().replace("</efac:NoticeResult>", `${tender()}</efac:NoticeResult>`)).amountReplaySafe).toBe(false);
    expect(extractTedNotice(safeXml().replace("<cbc:ID>ORG-1</cbc:ID></efac:Tenderer>", "<cbc:ID>UNKNOWN</cbc:ID></efac:Tenderer>")).amountReplaySafe).toBe(false);
  });
  it("falls back for several references or repeated settled contracts, even at identical dates", () => {
    expect(extractTedNotice(safeXml().replace(`2026-06-01Z</cbc:IssueDate>${ref()}`, `2026-06-01Z</cbc:IssueDate>${ref()}${ref("TEN-2")}`)).amountReplaySafe).toBe(false);
    expect(extractTedNotice(safeXml().replace("</efac:NoticeResult>", `<efac:SettledContract><cbc:IssueDate>2026-06-01Z</cbc:IssueDate>${ref()}</efac:SettledContract></efac:NoticeResult>`)).amountReplaySafe).toBe(false);
  });
});

describe("legacy TED amount provenance", () => {
  const f03 = (values: string, count = "1") => `<TED_EXPORT DOC_ID="1-2020"><FORM_SECTION><F03_2014 CATEGORY="ORIGINAL"><AWARD_CONTRACT ITEM="1"><AWARDED_CONTRACT><TENDERS><NB_TENDERS_RECEIVED>${count}</NB_TENDERS_RECEIVED></TENDERS><VALUES>${values}</VALUES></AWARDED_CONTRACT></AWARD_CONTRACT></F03_2014></FORM_SECTION></TED_EXPORT>`;
  it("preserves an actual legacy contract value and its original currency", () => {
    const l = extractF03Notice(f03('<VAL_TOTAL CURRENCY="EUR">9007199254740993.51</VAL_TOTAL>')).lots[0]!;
    expect(l.awarded).toBe("9007199254740993.51");
    expect(l.currency).toBe("EUR");
    expect(l.amountKind).toBe("contract_value");
  });
  it("keeps legacy ranges separate and missing currency unknown", () => {
    const l = extractF03Notice(f03('<VAL_RANGE_TOTAL><LOW>0</LOW><HIGH>100</HIGH></VAL_RANGE_TOTAL>', "-2")).lots[0]!;
    expect(l.awarded).toBeNull();
    expect(l.currency).toBeNull();
    expect(l.amountKind).toBe("tender_range");
    expect(l.amountDetails.amounts.map((a) => a.value)).toEqual(["0", "100"]);
    expect(l.tendersReceived).toBeNull();
  });
});

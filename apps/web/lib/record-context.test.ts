import { describe, expect, it } from "vitest";
import { calendarDay, inSlicingWindow, pickCnscDocument, tedNoticeUrl, tedPublicationNumber, type ClassifiedDocument } from "./record-context";

describe("tedPublicationNumber", () => {
  it("keeps TED's own form, zero padding included", () => {
    expect(tedPublicationNumber("157568-2026")).toBe("157568-2026");
    expect(tedPublicationNumber(" 030917-2022 ")).toBe("030917-2022");
  });
  it("converts SICAP's OJ S form to the publication number", () => {
    expect(tedPublicationNumber("2020/S 190-458412")).toBe("458412-2020");
    expect(tedPublicationNumber("2019/S 001-001318")).toBe("001318-2019");
  });
  it("drops anything else", () => {
    expect(tedPublicationNumber(null)).toBeNull();
    expect(tedPublicationNumber("")).toBeNull();
    expect(tedPublicationNumber("CN1023087")).toBeNull();
    expect(tedPublicationNumber("1067/S 190-458412")).toBeNull();
    expect(tedPublicationNumber("458412-9995")).toBeNull();
    expect(tedPublicationNumber("2020/S 190-458412; 2020/S 191-1")).toBeNull();
  });
  it("builds the URL the contract page and exports use", () => {
    expect(tedNoticeUrl("2020/S 190-458412")).toBe("https://ted.europa.eu/en/notice/-/detail/458412-2020");
    expect(tedNoticeUrl("x")).toBeNull();
  });
});

describe("calendarDay", () => {
  it("reads ISO and Romanian dates, nothing else", () => {
    expect(calendarDay("2025-10-01T10:20:30")).toBe("2025-10-01");
    expect(calendarDay("01.10.2025 10:20")).toBe("2025-10-01");
    expect(calendarDay("ieri")).toBeNull();
    expect(calendarDay(null)).toBeNull();
  });
});

describe("pickCnscDocument", () => {
  const doc = (id: string, filename: string, categories: string[], publishedAt: string | null = null, sourceType: string | null = null): ClassifiedDocument =>
    ({ id, filename, categories, publishedAt, sourceType });
  it("returns null without a complaint document", () => {
    expect(pickCnscDocument([doc("a", "caiet de sarcini.pdf", ["specifications"])])).toBeNull();
  });
  it("prefers a file naming CNSC over an earlier plain complaint", () => {
    const r = pickCnscDocument([
      doc("a", "contestatie scan_semnat.pdf.p7s", ["complaints"], "2025-01-01"),
      doc("b", "contestatie decizie cnsc_semnat.pdf.p7s", ["complaints"], "2025-03-01"),
      doc("c", "clarificare.pdf", ["clarifications"]),
    ]);
    expect(r).toEqual({ documentId: "b", filename: "contestatie decizie cnsc_semnat.pdf.p7s", date: "2025-03-01", mentionsCnsc: true, complaints: 2 });
  });
  it("reads SEAP's type and an archive's categories, and orders by date", () => {
    expect(pickCnscDocument([doc("x", "scan 4.pdf", ["unknown", "complaints"], null, "Decizie CNSC")])?.mentionsCnsc).toBe(true);
    const r = pickCnscDocument([doc("late", "contestatie 2.pdf", ["complaints"], "02.03.2025"), doc("early", "contestatie 1.pdf", ["complaints"], "01.02.2025")]);
    expect(r).toMatchObject({ documentId: "early", mentionsCnsc: false, date: "2025-02-01" });
  });
});

describe("inSlicingWindow", () => {
  const window = { cpvClass: "5080", acquisitionType: "da_ceiling_goods_services", from: "2020-10-30", to: "2020-11-06", ceiling: 135060 };
  const da = { cpvCode: "50800000-3", acquisitionType: null, day: "2020-10-30", value: 131000, valueSuspect: false };
  it("accepts a purchase of the window", () => {
    expect(inSlicingWindow(da, window)).toBe(true);
    expect(inSlicingWindow({ ...da, day: "2020-11-06", acquisitionType: "Servicii" }, window)).toBe(true);
  });
  it("rejects another class, type, day, an implausible or above-ceiling value", () => {
    expect(inSlicingWindow({ ...da, cpvCode: "50700000-2" }, window)).toBe(false);
    expect(inSlicingWindow({ ...da, acquisitionType: "Lucrari" }, window)).toBe(false);
    expect(inSlicingWindow({ ...da, day: "2020-11-07" }, window)).toBe(false);
    expect(inSlicingWindow({ ...da, valueSuspect: true }, window)).toBe(false);
    expect(inSlicingWindow({ ...da, valueSuspect: null }, window)).toBe(false);
    expect(inSlicingWindow({ ...da, value: 135060 }, window)).toBe(false);
    expect(inSlicingWindow({ ...da, value: 0 }, window)).toBe(false);
  });
});

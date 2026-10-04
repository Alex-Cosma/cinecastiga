import { describe, expect, it } from "vitest";
import { financialDecimal, financialSpecCodes, onrcDate } from "./parsers.js";

describe("ONRC date formats", () => {
  it("recovers timestamps without moving the calendar date", () => {
    expect(onrcDate(" 29/02/2000 23:59:59 ")).toEqual({ value: "2000-02-29", format: "date_time" });
    expect(onrcDate("29/02/2000").value).toBe("2000-02-29");
    expect(onrcDate("01/01/1899").value).toBe("1899-01-01"); // Review, not invented correction.
  });
  it.each(["29/02/1900", "31/04/1990", "00/01/1990", "01/13/1990", "01/01/0000",
    "01/01/1990 24:00:00", "01/01/1990 00:60:00", "01/01/1990 00:00:60", "1990-01-01",
    "01/01/1990junk", "01/01/1990 00:00:00Z"])("rejects malformed date %s", (s) => {
    expect(onrcDate(s)).toEqual({ value: null, format: "invalid" });
  });
  it("distinguishes a missing date from a malformed one", () => {
    expect(onrcDate(" ").format).toBe("empty");
    expect(onrcDate(undefined).value).toBeNull();
  });
});

describe("MF spec mapping", () => {
  it.each([18, 20, 22, 24, 25, 27, 29, 31, 32, 36])("uses the category's explicit I%s code", (i) => {
    expect(financialSpecCodes(`Profit net;i${i}\nPierdere neta;i${i + 1}`)).toEqual({
      profit_net: `I${i}`, loss_net: `I${i + 1}`,
    });
  });
  it("retains legacy labels and whitespace", () => {
    expect(financialSpecCodes("\ufeffProfitul net;i18\r\nPierdere  neta;i19")).toEqual({ profit_net: "I18", loss_net: "I19" });
  });
  it("does not infer net profit or employees from unrelated categories", () => {
    expect(financialSpecCodes("Profit net din activitati intrerupte;i20\nPROFITUL SAU PIERDEREA;i18\nProfit tehnic;i19")).toEqual({});
  });
  it("fails rather than silently selecting an ambiguous indicator", () => {
    expect(() => financialSpecCodes("Profit net;i18\nProfitul net;i24")).toThrow("Ambiguous");
  });
  it("keeps profit extraction independent of historical revenue label layouts", () => {
    expect(financialSpecCodes("VENITURI TOTALE, din care:;i21\nProfit net;i24").profit_net).toBe("I24");
    expect(financialSpecCodes("Venituri totale - prevederi anuale;i37\nVenituri totale - la 31.12;i38\nProfit net;i24").profit_net).toBe("I24");
  });
  it("keeps exact large amounts, and zero distinct from missing", () => {
    expect(financialDecimal("9007199254740993.12")).toBe("9007199254740993.12");
    expect(financialDecimal("0")).toBe("0");
    expect(financialDecimal(" ")).toBeNull();
    expect(() => financialDecimal("NaN")).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { breakdownLead, countWords, entityNoun, fileSlug, formatChange, formatDecimal, formatShare, isHumanError, rankingRest, rankingShare, shouldAutoRun } from "./answer-text";

describe("Romanian counts", () => {
  it("agrees in number and adds 'de' from 20 on", () => {
    expect(countWords(1, "înregistrare", "înregistrări")).toBe("1 înregistrare");
    expect(countWords(0, "înregistrare", "înregistrări")).toBe("0 înregistrări");
    expect(countWords(14, "înregistrare", "înregistrări")).toBe("14 înregistrări");
    expect(countWords(19, "înregistrare", "înregistrări")).toBe("19 înregistrări");
    expect(countWords(20, "înregistrare", "înregistrări")).toBe("20 de înregistrări");
    expect(countWords(36, "înregistrare", "înregistrări")).toBe("36 de înregistrări");
    expect(countWords(101, "înregistrare", "înregistrări")).toBe("101 înregistrări");
    expect(countWords(1190, "înregistrare", "înregistrări")).toBe("1.190 de înregistrări");
    expect(countWords(1, "rezultat afișat", "rezultate afișate")).toBe("1 rezultat afișat");
    expect(entityNoun("supplier", 468)).toBe("468 de firme");
    expect(entityNoun("authority", 1)).toBe("1 instituție");
    expect(entityNoun("county", 3)).toBe("3 județe");
  });
});

describe("Romanian numbers", () => {
  it("uses a decimal comma", () => {
    expect(formatShare(0.403)).toBe("40,3%");
    expect(formatShare(0.4)).toBe("40,0%");
    expect(formatShare(0.0004)).toBe("sub 0,1%");
    expect(formatShare(0)).toBe("0,0%");
    expect(formatDecimal(0.4, 2)).toBe("0,40");
    expect(formatChange(12.4)).toBe("+12%");
    expect(formatChange(-8)).toBe("−8%");
  });
});

describe("the answer starts with its conclusion", () => {
  it("opens a breakdown with the total and its unit", () => {
    expect(breakdownLead([{ value: 18_686_762, count: 6 }, { value: 20_000_000, count: 7 }], { value: 1_113_238, count: 1 }))
      .toBe("În total: 39,8 mil. lei în 14 înregistrări · valoare înregistrată, nu plăți");
    expect(breakdownLead([], { value: 0, count: 0 })).toBeNull();
  });

  it("adds the rest of a ranking only when the totals reconcile", () => {
    const rows = [{ value: 600, count: 6 }, { value: 300, count: 3 }];
    expect(rankingRest(rows, { value: 1000, count: 12, entities: 5 })).toEqual({ entities: 3, value: 100, count: 3, share: 0.1 });
    expect(rankingRest(rows, undefined)).toBeNull();
    expect(rankingRest(rows, { value: 900, count: 9, entities: 2 })).toBeNull();
    expect(rankingRest(rows, { value: 800, count: 9, entities: 4 })).toBeNull();
    expect(rankingShare(250, { value: 1000, count: 1, entities: 1 })).toBe(0.25);
    expect(rankingShare(250, undefined)).toBeNull();
  });
});

describe("auto-run decision", () => {
  it("answers one understood reading at once and waits when there are choices", () => {
    expect(shouldAutoRun({ spec: { block: "table" }, sentence: "Cine câștigă contractele…?" })).toBe(true);
    expect(shouldAutoRun({ spec: null, sentence: null })).toBe(false);
    expect(shouldAutoRun({ spec: { block: "table" }, sentence: null })).toBe(false);
    expect(shouldAutoRun(null)).toBe(false);
  });
});

describe("errors", () => {
  it("keeps explanations for people visible and technical text behind details", () => {
    expect(isHumanError(200, "Nu am putut asocia sigur nicio autoritate contractantă cu localitatea „X”.")).toBe(true);
    expect(isHumanError(500, "Eroare la execuție: could not connect to server")).toBe(false);
    expect(isHumanError(200, "Eroare la execuție: timeout")).toBe(false);
    expect(isHumanError(400, "dataset must be one of all, da, contracts")).toBe(false);
    expect(isHumanError(200, undefined)).toBe(false);
  });
});

describe("export file name", () => {
  it("follows the answer title", () => {
    expect(fileSlug("Ce cumpără primăria Municipiului Vaslui în domeniul „asfaltare”, în 2025?")).toBe("ce-cumpara-primaria-municipiului-vaslui-in-domeniul-asfaltare-in-2025");
    expect(fileSlug("???")).toBe("intreaba-rezultat");
  });
});

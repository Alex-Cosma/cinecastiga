import { describe, expect, it } from "vitest";
import { validateSpec } from "../ask/spec";
import { autoMonthsUnresolved, sameMonthsWindow, type CoveragePeriods } from "../ask/months-window";
import { memoryVocabulary } from "./memory-vocabulary";
import { RulesInterpreter } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { lensNotApplied, resultFor, type SpecContext } from "./to-spec";
import { sentenceScopeProblems } from "./scope-check";
import { intentCacheKey } from "./server";

/*
 * The interpreter's lenses (plan §2.7, F2): phrases read after the block is
 * chosen, never stealing a cue's words; each collision has a precedence test.
 */
const NOW = new Date("2026-10-22T12:00:00Z");
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
// The archive as coveragePeriods reads it: both channels complete until 31 May 2026.
const PERIODS: CoveragePeriods = {
  da: { from: "2018-04-02", to: "2026-06-30", completeUntil: "2026-05-31" },
  contracts: { from: "2000-01-06", to: "2026-06-30", completeUntil: "2026-05-31" },
  checkpoint: "checkpoint-12",
};
const CONTEXT: SpecContext = { periods: PERIODS, year: 2026 };
async function ask(q: string, context: SpecContext = CONTEXT) {
  const i = await interpreter.interpret(q, { now: NOW });
  return { i, r: resultFor(i, context) };
}

describe("trend lenses: the group, the order, the months", () => {
  it("«au crescut» stays the trend cue; the lens reads the same words for the group", async () => {
    const { i, r } = await ask("Ce firme au crescut cel mai mult între 2024 și 2025?");
    expect(i.intent).toBe("trend");
    expect(i.leftover).toEqual([]);
    expect(r.spec).toMatchObject({ block: "trend", dim: "supplier", filters: { yearFrom: 2024, yearTo: 2025 }, trend: { change: "up" } });
    expect(r.sentence).toBe("Ce firme au cea mai mare creștere a valorii câștigate între 2024 și 2025?");
  });
  it("one year is a trend only with a group in words: «Ce firme au crescut în 2025?» compares 2025 with 2024", async () => {
    const { r } = await ask("Ce firme au crescut în 2025?");
    expect(r.spec).toMatchObject({ block: "trend", filters: { yearFrom: 2024, yearTo: 2025 }, trend: { change: "up" } });
    expect(r.interpretation.notes).toContain("Am comparat 2025 cu anul dinainte.");
  });
  it("«Cum au evoluat … în 2025?» stays an evolution", async () => {
    expect((await ask("Cum au evoluat achizițiile din județul Cluj în 2025?")).r.spec).toMatchObject({ block: "timeseries", filters: { county: "Cluj", yearFrom: 2025 } });
    expect((await ask("cum au evoluat achizitiile de lemne de foc ale comunelor din vaslui")).r.spec?.block).toBe("timeseries");
  });
  it("«firme noi au apărut»: the new ones, every word understood", async () => {
    const { i, r } = await ask("ce firme noi au apărut în 2025");
    expect(i.leftover).toEqual([]);
    expect(i.subjects).toEqual([]);
    expect(r.spec).toMatchObject({ block: "trend", dim: "supplier", filters: { yearFrom: 2024, yearTo: 2025 }, trend: { change: "new" } });
    expect(r.sentence).toBe("Ce firme noi apar în achizițiile din 2025, față de 2024?");
  });
  it("«în 2025 față de 2024» is the period of a change, not a comparison of two entities", async () => {
    const { i, r } = await ask("Ce firme noi apar în 2025 față de 2024?");
    expect(i.period).toMatchObject({ yearFrom: 2024, yearTo: 2025 });
    expect(i.intent).not.toBe("compare");
    expect(r.interpretation.notes.join(" ")).not.toMatch(/comparație/);
    expect(r.spec).toMatchObject({ block: "trend", trend: { change: "new" }, filters: { yearFrom: 2024, yearTo: 2025 } });
  });
  it("«nu mai câștigă» without years: the gone ones of the latest complete year", async () => {
    const { i, r } = await ask("Ce firme nu mai câștigă în județul Cluj?");
    expect(i.leftover).toEqual([]);
    expect(r.spec).toMatchObject({ block: "trend", dim: "supplier", filters: { county: "Cluj", yearFrom: 2024, yearTo: 2025 }, trend: { change: "gone" } });
    expect(r.interpretation.notes).toContain("Am comparat 2025 cu 2024: ultimul an încheiat cu cel dinainte.");
    expect(r.sentence).toBe("Ce firme din 2024 nu mai apar în achizițiile de la instituțiile din județul Cluj din 2025?");
  });
  it("without the archive's periods and a year, the interpreter asks for the years instead of guessing", async () => {
    const { r } = await ask("Ce firme nu mai câștigă în județul Cluj?", {});
    expect(r.spec).toBeNull();
    expect(r.problem).toBe("Spune ce ani compari, de exemplu „între 2024 și 2025”.");
  });
  it("«de câte ori» is the order in percent on a trend and stays the number of records elsewhere", async () => {
    const trend = await ask("Ce firme au crescut de câte ori între 2024 și 2025?");
    expect(trend.r.spec).toMatchObject({ block: "trend", measure: "value", trend: { change: "up", order: "percent", minBase: 1_000_000 } });
    expect(trend.r.sentence).toBe("Ce firme au cea mai mare creștere în procente a valorii câștigate între 2024 și 2025?");
    const table = await ask("de câte ori au câștigat firmele contracte în județul Cluj în 2025");
    expect(table.r.spec).toMatchObject({ block: "table", measure: "count" });
    expect(table.r.interpretation.notes.join(" ")).not.toMatch(/nu se aplică/);
  });
  it("the order in percent is of growths only: with a decrease it is said and not applied", async () => {
    const { r } = await ask("Ce firme au scăzut procentual între 2024 și 2025?");
    expect(r.spec).toMatchObject({ block: "trend", trend: { change: "down" } });
    expect(r.spec?.trend).not.toHaveProperty("order");
    expect(r.interpretation.notes).toContain(lensNotApplied("procentual"));
  });
  it("two groups that exclude each other are said, and every change is shown", async () => {
    const { r } = await ask("Ce firme au crescut sau au scăzut între 2024 și 2025?");
    expect(r.spec).toMatchObject({ block: "trend", trend: { change: "all" } });
    expect(r.interpretation.notes).toContain("„au crescut” și „au scăzut” nu merg împreună; nu le-am aplicat.");
  });
  it("«prima dată» keeps the new ones whose first record is in the later year", async () => {
    const { r } = await ask("Ce firme au apărut pentru prima dată în 2025?");
    expect(r.spec).toMatchObject({ block: "trend", trend: { change: "new", firstOnly: true }, filters: { yearFrom: 2024, yearTo: 2025 } });
    expect(r.sentence).toBe("Ce firme apar pentru prima dată în achizițiile din 2025, față de 2024?");
  });
  it("«aceleași luni», and a later year the archive does not hold whole, compare the same months", async () => {
    const said = await ask("Ce firme au crescut între 2024 și 2025 pe aceleași luni?");
    expect(said.r.spec).toMatchObject({ trend: { change: "up", months: "auto" } });
    expect(said.r.sentence).toBe("Ce firme au cea mai mare creștere a valorii câștigate între 2024 și 2025, pe aceleași luni?");
    const open = await ask("Ce firme au crescut între 2025 și 2026?");
    expect(open.r.spec).toMatchObject({ trend: { change: "up", months: "auto" }, filters: { yearFrom: 2025, yearTo: 2026 } });
    expect(open.r.interpretation.notes).toContain("2026 nu e încă încheiat: am comparat aceleași luni din ambii ani (ian.–mai).");
    // Without the "complet până la" days the window is unknown: still `auto`, which the run refuses
    // (autoMonthsUnresolved) instead of comparing a part of 2026 with the whole of 2025 (plan §2.6).
    const periods = { ...PERIODS, da: { ...PERIODS.da, completeUntil: null } };
    const unknown = await ask("Ce firme au crescut între 2025 și 2026?", { periods, year: 2026 });
    expect(unknown.r.spec?.trend).toEqual({ change: "up", months: "auto" });
    expect(unknown.r.sentence).toBe("Ce firme au cea mai mare creștere a valorii câștigate între 2025 și 2026, pe aceleași luni?");
    expect(sameMonthsWindow(periods, "all", 2026, "auto")).toEqual({ error: autoMonthsUnresolved(2026) });
  });
  it("a new trend writes the plan's defaults (plan §2.6): the growths and `auto`; a complete year needs no months in words", async () => {
    const { r } = await ask("Ce firme au câștigat cel mai mult între 2024 și 2025 pe ani?");
    expect(r.spec).toMatchObject({ block: "trend", trend: { change: "up", months: "auto" }, filters: { yearFrom: 2024, yearTo: 2025 } });
    expect(r.sentence).toBe("Ce firme au cea mai mare creștere a valorii câștigate între 2024 și 2025?");
    expect(r.interpretation.notes.join(" ")).not.toMatch(/aceleași luni/);
    // Words of every change keep „Toate”.
    expect((await ask("cum s-au schimbat achizițiile firmelor între 2022 și 2024")).r.spec?.trend).toEqual({ change: "all", months: "auto" });
  });
  it("a lens of another question is said, never applied silently", async () => {
    const table = await ask("Ce firme noi câștigă contracte în județul Cluj în 2025?");
    expect(table.r.spec).toMatchObject({ block: "table", dim: "supplier" });
    expect(table.r.interpretation.notes).toContain(lensNotApplied("firme noi"));
    const series = await ask("Cum au evoluat achizițiile din județul Cluj pe aceleași luni?");
    expect(series.r.spec?.block).toBe("timeseries");
    expect(series.r.interpretation.notes).toContain(lensNotApplied("pe aceleași luni"));
  });
  it("reads phrases, never single words: «noi» the pronoun and «nu mai mult de» are no group", async () => {
    const us = await ask("cine câștigă la noi în județul Cluj");
    expect(us.i.lenses).toEqual([]);
    const most = await ask("firme cu nu mai mult de 10 angajați din județul Cluj");
    expect(most.i.lenses).toEqual([]);
    expect((await ask("ce firme au ieșit din tipar în județul Cluj")).i.lenses).toEqual([]);
  });
  it("institutions: the new buyers of the archive's latest complete year", async () => {
    const { r } = await ask("Ce instituții noi au apărut în județul Cluj?");
    expect(r.spec).toMatchObject({ block: "trend", dim: "authority", filters: { county: "Cluj", yearFrom: 2024, yearTo: 2025 }, trend: { change: "new" } });
    expect(r.sentence).toBe("Ce instituții noi din județul Cluj apar în achizițiile din 2025, față de 2024?");
  });
});

describe("winners are never a trend group (precedence, plan §2.7)", () => {
  it.each([
    "Ce firme au ieșit câștigătoare în 2025?",
    "Cine a ieșit câștigător la licitațiile din județul Cluj în 2025?",
    "Ce firme au ieșit pe primul loc în județul Cluj în 2025?",
  ])("%s", async (q) => {
    const { i, r } = await ask(q);
    expect(i.lenses.filter((l) => l.path === "trend.change")).toEqual([]);
    expect(r.spec?.block).toBe("table");
    expect(r.spec?.filters).toMatchObject({ yearFrom: 2025, yearTo: 2025 });
  });
  it("«au ieșit câștigătoare între 2024 și 2025» stays the winners of both years, not the gone ones", async () => {
    expect((await ask("Ce firme au ieșit câștigătoare între 2024 și 2025?")).r.spec?.block).toBe("table");
  });
  it("«au apărut cel mai des» counts the records: a ranking, not the new ones", async () => {
    const { i, r } = await ask("Ce firme au apărut cel mai des în contractele din județul Cluj în 2025?");
    expect(i.lenses.filter((l) => l.path === "trend.change")).toEqual([]);
    expect(r.spec).toMatchObject({ block: "table", dim: "supplier", measure: "count" });
  });
  it("«au ieșit din piață» is still the gone ones", async () => {
    const { r } = await ask("Ce firme au ieșit din piață în 2025?");
    expect(r.spec).toMatchObject({ block: "trend", trend: { change: "gone" }, filters: { yearFrom: 2024, yearTo: 2025 } });
  });
});

describe("«în Y față de X» is two years only where each year is its own figure", () => {
  it("a total keeps the year asked about, with the note, never both years summed", async () => {
    const { r } = await ask("Cât s-a cheltuit în județul Cluj în 2025 față de 2024?");
    expect(r.spec).toMatchObject({ block: "stat", filters: { county: "Cluj", yearFrom: 2025, yearTo: 2025 } });
    expect(r.interpretation.notes).toContain("Am folosit prima perioadă din întrebare; „2024” nu a fost aplicată.");
  });
  it("a ranking keeps the year asked about", async () => {
    const { r } = await ask("Ce firme au câștigat în județul Cluj în 2025 față de 2024?");
    expect(r.spec).toMatchObject({ block: "table", filters: { yearFrom: 2025, yearTo: 2025 } });
    expect(r.interpretation.notes).toContain("Am folosit prima perioadă din întrebare; „2024” nu a fost aplicată.");
  });
  it("a trend and an evolution keep both years", async () => {
    expect((await ask("Ce firme noi apar în 2025 față de 2024?")).r.spec?.filters).toMatchObject({ yearFrom: 2024, yearTo: 2025 });
    expect((await ask("Cum au evoluat achizițiile din județul Cluj în 2025 față de 2024?")).r.spec)
      .toMatchObject({ block: "timeseries", filters: { yearFrom: 2024, yearTo: 2025 } });
  });
});

describe("every trend spec says its own scope", () => {
  it.each([
    "Ce firme au crescut cel mai mult între 2024 și 2025?", "Ce firme au crescut în 2025?", "ce firme noi au apărut în 2025",
    "Ce firme noi apar în 2025 față de 2024?", "Ce firme nu mai câștigă în județul Cluj?", "Ce firme au crescut de câte ori între 2024 și 2025?",
    "Ce firme au scăzut procentual între 2024 și 2025?", "Ce firme au apărut pentru prima dată în 2025?", "Ce firme au crescut între 2025 și 2026?",
    "Ce firme au crescut între 2024 și 2025 pe aceleași luni?", "Ce instituții noi au apărut în județul Cluj?", "cum s-au schimbat achizițiile firmelor între 2022 și 2024",
  ])("%s", async (q) => {
    const { r } = await ask(q);
    const emitted = [...(r.spec && r.sentence ? [{ spec: r.spec, sentence: r.sentence }] : []), ...r.alternatives];
    expect(emitted.length).toBeGreaterThan(0);
    for (const { spec, sentence } of emitted) {
      expect(validateSpec(spec), sentence).not.toHaveProperty("error");
      expect(sentenceScopeProblems(spec, sentence, { periods: PERIODS }), sentence).toEqual([]);
    }
  });
  it("finds a sentence that does not say the group or the months", () => {
    const spec = { block: "trend" as const, measure: "value" as const, dim: "supplier" as const, filters: { yearFrom: 2024, yearTo: 2025 }, trend: { change: "new" as const, months: "auto" as const } };
    expect(sentenceScopeProblems(spec, "Ce firme au cea mai mare schimbare a valorii contractelor între 2024 și 2025?"))
      .toEqual(["trend group new not in sentence", "same months not in sentence"]);
  });
});

describe("the interpreter's cache key", () => {
  it("follows the archive: a refresh that closes a year or moves a complete day is another key the same day", () => {
    const key = intentCacheKey("Ce firme au crescut?", "2026-10-22", PERIODS);
    expect(intentCacheKey("ce firme au CRESCUT?", "2026-10-22", PERIODS)).toBe(key);
    expect(intentCacheKey("Ce firme au crescut?", "2026-10-23", PERIODS)).not.toBe(key);
    expect(intentCacheKey("Ce firme au crescut?", "2026-10-22", { ...PERIODS, checkpoint: "checkpoint-13" })).not.toBe(key);
    expect(intentCacheKey("Ce firme au crescut?", "2026-10-22", { ...PERIODS, contracts: { ...PERIODS.contracts, completeUntil: "2026-06-30" } })).not.toBe(key);
    expect(intentCacheKey("Ce firme au crescut?", "2026-10-22", null)).not.toBe(key);
  });
});

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
    expect(r.sentence).toBe("Ce firme au cea mai mare creștere între 2024 și 2025?");
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
    expect(r.sentence).toBe("Ce firme noi apar în 2025, față de 2024?");
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
    expect(r.sentence).toBe("Ce firme din 2024 nu mai apar în achizițiile făcute de instituțiile publice din județul Cluj în 2025?");
  });
  it("without the archive's periods and a year, the interpreter asks for the years instead of guessing", async () => {
    const { r } = await ask("Ce firme nu mai câștigă în județul Cluj?", {});
    expect(r.spec).toBeNull();
    expect(r.problem).toBe("Spune ce ani compari, de exemplu „între 2024 și 2025”.");
  });
  it("«de câte ori» is the order in percent on a trend and stays the number of records elsewhere", async () => {
    const trend = await ask("Ce firme au crescut de câte ori între 2024 și 2025?");
    expect(trend.r.spec).toMatchObject({ block: "trend", measure: "value", trend: { change: "up", order: "percent", minBase: 1_000_000 } });
    // The order and its base are the presentation line's words, after the period (title.ts).
    expect(trend.r.sentence).toBe("Ce firme au cea mai mare creștere între 2024 și 2025, după creșterea în procente, dintre firmele cu cel puțin 1 mil. lei în 2024?");
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
    expect(r.sentence).toBe("Ce firme noi apar prima dată în 2025, față de 2024?");
  });
  it("«aceleași luni», and a later year the archive does not hold whole, compare the same months", async () => {
    const said = await ask("Ce firme au crescut între 2024 și 2025 pe aceleași luni?");
    expect(said.r.spec).toMatchObject({ trend: { change: "up", months: "auto" } });
    // Asked in words on whole years: the rule, without months.
    expect(said.r.sentence).toBe("Ce firme au cea mai mare creștere între 2024 și 2025, pe aceleași luni?");
    const open = await ask("Ce firme au crescut între 2025 și 2026?");
    expect(open.r.spec).toMatchObject({ trend: { change: "up", months: "auto" }, filters: { yearFrom: 2025, yearTo: 2026 } });
    expect(open.r.interpretation.notes).toContain("2026 nu e încă încheiat: am comparat aceleași luni din ambii ani (ian.–mai).");
    expect(open.r.sentence).toBe("Ce firme au cea mai mare creștere între 2025 și 2026, pe aceleași luni: ian.–mai?");
    // Without the "complet până la" days the window is unknown: still `auto`, which the run refuses
    // (autoMonthsUnresolved) instead of comparing a part of 2026 with the whole of 2025 (plan §2.6).
    const periods = { ...PERIODS, da: { ...PERIODS.da, completeUntil: null } };
    const unknown = await ask("Ce firme au crescut între 2025 și 2026?", { periods, year: 2026 });
    expect(unknown.r.spec?.trend).toEqual({ change: "up", months: "auto" });
    expect(unknown.r.sentence).toBe("Ce firme au cea mai mare creștere între 2025 și 2026, pe aceleași luni?");
    expect(sameMonthsWindow(periods, "all", 2026, "auto")).toEqual({ error: autoMonthsUnresolved(2026) });
  });
  it("a new trend writes the plan's defaults (plan §2.6): the growths and `auto`; a complete year needs no months in words", async () => {
    const { r } = await ask("Ce firme au câștigat cel mai mult între 2024 și 2025 pe ani?");
    expect(r.spec).toMatchObject({ block: "trend", trend: { change: "up", months: "auto" }, filters: { yearFrom: 2024, yearTo: 2025 } });
    expect(r.sentence).toBe("Ce firme au cea mai mare creștere între 2024 și 2025?");
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
  it("«lună de lună» draws an evolution's months where its period fits them, and says so where it does not (S4 review)", async () => {
    const months = await ask("Cum au evoluat achizițiile din județul Cluj lună de lună în 2025?");
    expect(months.r.spec).toMatchObject({ block: "timeseries", timeseries: { grain: "month" }, filters: { county: "Cluj", yearFrom: 2025, yearTo: 2025 } });
    const all = await ask("Cum au evoluat achizițiile din județul Cluj pe luni?");
    expect(all.r.spec?.timeseries?.grain).toBeUndefined();
    expect(all.r.interpretation.notes).toContain(lensNotApplied("pe luni"));
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
    expect(r.sentence).toBe("Ce instituții publice noi din județul Cluj apar în 2025, față de 2024?");
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

describe("comparison lenses (F4, plan §2.7, final compare §3.4)", () => {
  it("«clienții comuni» between two firms is „Doar clienții comuni”, said in the sentence", async () => {
    const { r } = await ask("compara constructii erbasu cu elbi energy projects la clientii comuni");
    expect(r.spec).toMatchObject({ block: "compare", filters: { supplierId: 9000001, compareWithId: 9000003, sharedPartners: true } });
    expect(r.sentence).toBe("Compară CONSTRUCTII ERBASU S.A. cu ELBI ENERGY PROJECTS SRL la toate achizițiile, în toți anii, doar la clienții comuni.");
  });
  it("between two institutions it does not exist: a note says so, the comparison stays", async () => {
    const { r } = await ask("compara primaria Buzau cu primaria Braila la clientii comuni");
    expect(r.spec).toMatchObject({ block: "compare", filters: { authorityId: 2144364, compareWithId: 3000001 } });
    expect(r.spec?.filters.sharedPartners).toBeUndefined();
    expect(r.interpretation.notes).toContain(lensNotApplied("clientii comuni"));
  });
  it("between two firms a kind of institution is their clients', kept (final compare §3.5)", async () => {
    const { r } = await ask("compara constructii erbasu cu elbi energy projects la spitale");
    expect(r.spec).toMatchObject({ block: "compare", filters: { supplierId: 9000001, compareWithId: 9000003, authorityKind: "spital" } });
    expect(r.sentence).toBe("Compară CONSTRUCTII ERBASU S.A. cu ELBI ENERGY PROJECTS SRL la toate achizițiile făcute de spitalele, în toți anii.");
  });
  it("between two firms a place after the second name is their clients' county, not part of the name (S4 leftover)", async () => {
    for (const q of ["compara constructii erbasu cu elbi energy projects din buzau", "compara constructii erbasu cu elbi energy projects la spitalele din buzau"]) {
      const { i, r } = await ask(q);
      expect([i.intent, i.leftover], q).toEqual(["compare", []]);
      expect(r.spec, q).toMatchObject({ block: "compare", filters: { supplierId: 9000001, compareWithId: 9000003, county: "Buzău" } });
    }
    expect((await ask("compara constructii erbasu cu elbi energy projects din buzau")).r.sentence)
      .toBe("Compară CONSTRUCTII ERBASU S.A. cu ELBI ENERGY PROJECTS SRL la toate achizițiile făcute de instituțiile publice din județul Buzău, în toți anii.");
  });
});

describe("the network and the flow in words (S5, plan §2.7 „rețea”; an S4 leftover)", () => {
  it("«cu cine lucrează X» is X's network, a town hall its institution; a group, its order and «cu semnale» are its lenses", async () => {
    const all = await ask("cu cine lucreaza primaria buzau");
    expect(all.i.intent).toBe("network");
    expect(all.r.spec).toEqual({ block: "network", measure: "value", filters: { authorityName: "MUNICIPIUL BUZAU", authorityId: 2144364 }, network: { show: 15 } });
    expect(all.r.sentence).toBe("Cu cine lucrează MUNICIPIUL BUZAU, în toți anii?");
    // A group counts from the last complete year (the archive's periods), or from the year said.
    const fresh = await ask("cu ce firme a inceput sa lucreze primaria buzau");
    expect(fresh.r.spec?.network).toEqual({ show: 15, partners: "new", since: 2025 });
    expect(fresh.r.sentence).toBe("Cu cine a început să lucreze MUNICIPIUL BUZAU din 2025?");
    expect((await ask("cu ce firme a inceput sa lucreze primaria buzau din 2023")).r.spec?.network).toEqual({ show: 15, partners: "new", since: 2023 });
    // „nu mai lucrează” is the network's group here, not a trend; „mai lucrează” its continuing partners.
    const gone = await ask("cu cine nu mai lucreaza primaria buzau in 2023-2024");
    expect([gone.i.intent, gone.r.spec?.network, gone.r.spec?.filters.yearFrom]).toEqual(["network", { show: 15, partners: "gone", since: 2023 }, undefined]);
    expect(gone.r.interpretation.notes).toContain("Am păstrat doar anul de început: 2023.");
    expect((await ask("cu cine mai lucreaza primaria buzau")).r.spec?.network?.partners).toBe("continuing");
    // „cu semnale” is the network's lens, never the risk cloud (the collision table of plan §2.7).
    expect((await ask("cu cine lucreaza primaria buzau cu semnale")).r.spec).toMatchObject({ block: "network", network: { signals: true } });
    expect((await ask("partenerii primariei buzau de ani de zile")).r.spec).toMatchObject({ block: "network", network: { order: "years" } });
    // A period on „Toți” stays the period.
    expect((await ask("cu cine lucreaza primaria buzau in 2024")).r.spec).toMatchObject({ block: "network", filters: { yearFrom: 2024, yearTo: 2024 } });
  });
  it("asks which institution when two registry identities carry the town hall's name (never a guess)", async () => {
    const twice = new RulesInterpreter(memoryVocabulary({ ...FIXTURE, authorities: [...FIXTURE.authorities, { id: 2144399, name: "Municipiul Buzau", county: "Buzau", total: 1_000 }] }));
    const r = resultFor(await twice.interpret("cu cine lucreaza primaria buzau", { now: NOW }), CONTEXT);
    expect(r.spec).toBeNull();
    expect(r.alternatives.map((a) => [a.spec.block, a.spec.filters.authorityId])).toEqual([["network", 2144364], ["network", 2144399]]);
  });
  it("asks for the centre when none is named; «ce cumpără X și de la cine» is X's flow", async () => {
    const none = await ask("cu cine lucreaza");
    expect([none.r.spec, none.r.problem]).toEqual([null, "Spune a cui rețea vrei să o vezi, de exemplu „Cu cine lucrează primăria Buzău?”."]);
    const flow = await ask("ce cumpara primaria buzau si de la cine");
    expect([flow.i.intent, flow.r.spec]).toEqual(["flow", { block: "sankey", measure: "value", filters: { authorityName: "MUNICIPIUL BUZAU", authorityId: 2144364 } }]);
    expect(flow.r.sentence).toBe("Ce cumpără MUNICIPIUL BUZAU și de la cine, în toți anii?");
    // Elsewhere the words keep their questions: a trend's „nu mai câștigă”, „cine lucrează la …” a ranking.
    expect((await ask("ce firme nu mai castiga in cluj")).r.spec?.block).toBe("trend");
    expect((await ask("cine lucreaza la primaria buzau")).r.spec?.block).toBe("table");
    for (const q of ["cu cine lucreaza primaria buzau", "cu ce firme a inceput sa lucreze primaria buzau", "ce cumpara primaria buzau si de la cine"]) {
      const { r } = await ask(q);
      expect(sentenceScopeProblems(r.spec!, r.sentence!), q).toEqual([]);
    }
  });
});

describe("the selection's filters in words: the kind, the size, the firm's seat (S5, plan §2.7 „tip”, „mărime”, „sediu”)", () => {
  it("«lucrări», «servicii», «produse» alone are the purchase kind, said in the sentence", async () => {
    const works = await ask("ce firme castiga lucrari in buzau");
    expect(works.i.leftover).toEqual([]);
    expect(works.r.spec).toMatchObject({ block: "table", dim: "supplier", filters: { county: "Buzău", purchaseKind: "lucrari" } });
    expect(works.r.sentence).toBe("Ce firme câștigă achizițiile de lucrări făcute de instituțiile publice din județul Buzău, în toți anii?");
    expect((await ask("servicii in cluj")).r.spec?.filters.purchaseKind).toBe("servicii");
    expect((await ask("cat au cheltuit spitalele pe produse in 2025")).r.spec).toMatchObject({ block: "stat", filters: { authorityKind: "spital", purchaseKind: "produse" } });
    // Beside a real subject the word is the subject's ("lucrări de asfaltare"): no kind.
    expect((await ask("lucrari de asfaltare in buzau")).r.spec?.filters).toEqual({ cpvTerm: "asfaltare", county: "Buzău" });
  });
  it("a kind the question cannot run says why (a national ranking's goods, two kinds at once), never silently", async () => {
    const goods = await ask("ce firme castiga produse");
    expect(goods.r.spec?.filters.purchaseKind).toBeUndefined();
    expect(goods.r.interpretation.notes.join(" ")).toMatch(/^„produse” nu se aplică aici: Pe toată țara, pe instituții sau firme, cere un calcul pregătit noaptea/);
    // Works are an index range: offered nationally (S4r-national-kind).
    expect((await ask("ce firme castiga lucrari")).r.spec?.filters.purchaseKind).toBe("lucrari");
    const both = await ask("cine castiga lucrari si servicii in cluj");
    expect(both.r.spec?.filters.purchaseKind).toBeUndefined();
    expect(both.r.interpretation.notes).toContain("„lucrari” și „servicii” nu merg împreună; nu le-am aplicat.");
  });
  it("«peste N lei» is the size of each purchase, with the chip's words; a total asked by place says it", async () => {
    const { i, r } = await ask("contractele de peste 1 milion de lei din cluj");
    expect(i.leftover).toEqual([]);
    expect(r.spec).toMatchObject({ block: "stat", filters: { county: "Cluj", purchaseValueMin: 1_000_000 } });
    expect(r.sentence).toBe("Cât valorează achizițiile făcute de instituțiile publice din județul Cluj, în toți anii, doar cele de peste 1 mil. lei?");
    expect((await ask("ce firme castiga contracte de peste 1,5 milioane de lei in cluj")).r.spec?.filters.purchaseValueMin).toBe(1_500_000);
    expect((await ask("contracte de peste 500.000 de lei in cluj")).r.spec?.filters.purchaseValueMin).toBe(500_000);
    expect((await ask("achizitii sub 10.000 lei in cluj")).r.spec).toMatchObject({ block: "stat", filters: { county: "Cluj", purchaseValueMax: 10_000 } });
    const range = await ask("contracte de peste 1 milion si sub 5 milioane de lei in cluj");
    expect(range.r.spec?.filters).toMatchObject({ purchaseValueMin: 1_000_000, purchaseValueMax: 5_000_000 });
  });
  it("an amount is never a year or a fiscal code, and needs lei or a magnitude", async () => {
    const { i, r } = await ask("contracte de peste 2000 de lei in cluj in 2024");
    expect(i.period).toMatchObject({ yearFrom: 2024, yearTo: 2024 });
    expect(r.spec?.filters).toMatchObject({ purchaseValueMin: 2000, yearFrom: 2024 });
    expect((await ask("contracte peste 1000000 lei in cluj")).r.spec?.filters).toEqual({ county: "Cluj", purchaseValueMin: 1_000_000 });
    // "sub 5 angajați" stays the firms' size.
    expect((await ask("ce firme cu sub 5 angajati castiga in cluj")).r.spec?.filters).toMatchObject({ county: "Cluj", maxEmployees: 4 });
  });
  it("an entity's total is not a purchase's size: «au cheltuit peste …», «câștigă peste …» are not read", async () => {
    const spent = await ask("ce primarii din cluj au cheltuit peste 10 milioane de lei");
    expect(spent.r.spec?.filters.purchaseValueMin).toBeUndefined();
    expect(spent.i.leftover).toEqual(expect.arrayContaining(["peste"]));
  });
  it("a size the question cannot run says why: over the direct acquisitions' ceiling, a national ranking per firm", async () => {
    const da = await ask("cine castiga achizitiile directe de peste 3 milioane de lei in cluj");
    expect(da.r.spec?.filters.purchaseValueMin).toBeUndefined();
    expect(da.r.interpretation.notes).toContain("„de peste 3 mil. lei” nu se aplică aici: Achizițiile directe se numără până la 2 mil. lei. Alege o limită mai mică sau și contractele.");
    const national = await ask("ce firme castiga contracte de peste 1,5 milioane de lei in 2025");
    expect(national.r.spec?.filters.purchaseValueMin).toBeUndefined();
    expect(national.r.interpretation.notes.join(" ")).toMatch(/^„de peste 1,5 mil\. lei” nu se aplică aici: Pe toată țara/);
  });
  it("the firm's seat against the buyer's county: «străine», «din alte județe», «locale»", async () => {
    const abroad = await ask("ce firme straine castiga in cluj");
    expect(abroad.i.leftover).toEqual([]);
    expect(abroad.r.spec).toMatchObject({ block: "table", dim: "supplier", filters: { county: "Cluj", firmSeat: "abroad" } });
    expect(abroad.r.sentence).toBe("Ce firme cu sediul în străinătate câștigă achizițiile făcute de instituțiile publice din județul Cluj, în toți anii?");
    expect((await ask("firme din alte judete care castiga in buzau")).r.spec?.filters).toEqual({ county: "Buzău", firmSeat: "other" });
    expect((await ask("ce firme din afara judetului castiga la spitalul judetean buzau")).r.spec?.filters.firmSeat).toBe("other");
    expect((await ask("firmele locale din buzau")).r.spec?.filters).toEqual({ county: "Buzău", firmSeat: "same" });
    expect((await ask("ce firme din judet castiga la primaria buzau")).r.spec?.filters.firmSeat).toBe("same");
    // On institutions it is „de la [firme cu sediul …]” (S4r-from-seat).
    const buyers = await ask("ce institutii din cluj cumpara de la firme straine");
    expect(buyers.r.spec).toMatchObject({ block: "table", dim: "authority", filters: { county: "Cluj", firmSeat: "abroad" } });
    expect(buyers.r.sentence).toContain("de la firme cu sediul în străinătate");
  });
  it("every sentence says the kind, the size and the seat its spec runs (scope-check)", async () => {
    for (const q of ["ce firme castiga lucrari in buzau", "servicii in cluj", "contractele de peste 1 milion de lei din cluj", "achizitii sub 10.000 lei in cluj",
      "contracte de peste 1 milion si sub 5 milioane de lei in cluj", "ce firme straine castiga in cluj", "firme din alte judete care castiga in buzau", "firmele locale din buzau"]) {
      const { r } = await ask(q);
      expect(sentenceScopeProblems(r.spec!, r.sentence!), q).toEqual([]);
    }
    // And a sentence that leaves one out is caught.
    const spec = validateSpec({ block: "stat", measure: "value", filters: { purchaseKind: "lucrari", purchaseValueMin: 1_000_000 } });
    if ("error" in spec) throw new Error(spec.error);
    expect(sentenceScopeProblems(spec, "Cât valorează achizițiile?"))
      .toEqual(expect.arrayContaining(["kind lucrari not in sentence", 'size "de peste 1 mil. lei" not in sentence']));
  });
  it("«firme din județul Cluj» stays the buyers' place (R9), and a question without the seat says it does not apply", async () => {
    const cluj = await ask("ce firme din judetul cluj castiga");
    expect(cluj.r.spec?.filters).toEqual({ county: "Cluj" });
    const total = await ask("cat au castigat firmele straine in 2025");
    expect(total.r.spec?.filters.firmSeat).toBeUndefined();
    expect(total.r.interpretation.notes).toContain(lensNotApplied("firmele straine"));
  });
});

import { describe, expect, it } from "vitest";
import { memoryVocabulary, type MemoryFixture } from "./memory-vocabulary";
import { RulesInterpreter } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { resultFor } from "./to-spec";
import { applyInterpretation } from "../topic-search/interpretation";
import { parseTopicScope } from "../topic-search/shared";

/**
 * The questions the re-judging of the /cauta probe left open (10 November 2026): evolutions, the buyers of a firm,
 * comparisons of two town halls, institutions by their abbreviation, places with their article, a place not named.
 */
const NOW = new Date("2026-11-10T10:00:00Z");
const fx: MemoryFixture = {
  ...FIXTURE,
  authorities: [
    ...FIXTURE.authorities,
    { id: 7000001, name: "INSPECTORATUL SCOLAR JUDETEAN CLUJ", county: "Cluj", total: 40_000_000 },
    { id: 7000002, name: "INSPECTORATUL SCOLAR AL JUD IASI", county: "Iasi", total: 30_000_000 },
    { id: 7000003, name: "Municipiul Cluj-Napoca", county: "Cluj", total: 4_000_000_000 },
    { id: 7000004, name: "MUNICIPIUL CLUJ-NAPOCA", county: "Cluj", total: 5_000_000 },
    { id: 7000005, name: "Municipiul Timisoara", county: "Timis", total: 3_400_000_000 },
    { id: 7000006, name: "Direcția Generală de Administrare Monumente și Promovare Turistică a Județului Hunedoara", county: "Hunedoara", total: 9_000_000 },
    { id: 7000007, name: "Directia Generala de Asistenta Sociala si Protectia Copilului Sector 2", county: "Bucuresti", total: 360_000_000 },
  ],
  suppliers: [
    // one „Strabag” exactly (the shared fixture has two: „STRABAG SRL” and „SC STRABAG SRL”, which stay a choice)
    ...FIXTURE.suppliers.filter((e) => e.id !== 9000007),
    { id: 9100001, name: "SIEPCOFAR", county: "Bucuresti", total: 700_000_000 },
    { id: 9100002, name: "STRABAG CONSTRUCT", county: "Bucuresti", total: 50_000_000 },
    { id: 9100003, name: "E.ON ENERGIE ROMANIA", county: "Mures", total: 2_000_000_000 },
  ],
};
const interpreter = new RulesInterpreter(memoryVocabulary(fx));
const read = (q: string) => interpreter.interpret(q, { now: NOW });
const page = async (q: string) => {
  const scope = parseTopicScope(new URLSearchParams(`q=${encodeURIComponent(q)}`));
  return applyInterpretation(scope, resultFor(await read(q)), null, NOW);
};

describe("open items of the /cauta probe (re-judging, 10 November 2026)", () => {
  it("answers an evolution with the value of each year", async () => {
    const i = await read("cheltuieli cu medicamente in fiecare an");
    expect(i.intent).toBe("trend");
    expect(i.leftover).toEqual([]);
    const t = await page("cum au evoluat achizitiile de medicamente");
    expect(t.answer?.top).toMatchObject({ kind: "years", spec: { block: "timeseries", filters: { cpvTerm: "medicamente" } } });
    // one year has no evolution beside its total: the firms instead
    expect((await page("cum au evoluat achizitiile de medicamente in 2024")).answer?.top?.kind).not.toBe("years");
  });

  it("answers who buys from a firm with the institutions, and one firm at one institution by year", async () => {
    const buyers = await page("cine cumpara de la Siepcofar");
    expect(buyers.answer?.top).toMatchObject({ kind: "authorities", spec: { block: "table", dim: "authority", filters: { supplierName: "SIEPCOFAR" } } });
    // a firm sold „de la” beside a subject is kept
    const both = await read("cine cumpara medicamente de la Siepcofar");
    expect(both.supplier?.name).toBe("SIEPCOFAR");
    expect(both.leftover).toEqual([]);
    const pair = await page("cat a castigat firma Siepcofar de la CNAIR");
    expect(pair.answer?.top?.kind).toBe("years");
    // the word that marks a firm is not searched as part of its name
    expect(pair.applied.q).toBe("Siepcofar");
  });

  it("counts the one firm named exactly when several carry the name, and says so", async () => {
    const t = await page("cat a castigat Strabag in 2023");
    expect(t.answer?.total.spec.filters).toMatchObject({ supplierName: "STRABAG SRL", yearFrom: 2023, yearTo: 2023 });
    expect(t.answer?.top?.kind).toBe("authorities");
    expect(t.notes.join(" ")).toMatch(/Am socotit doar „STRABAG SRL”.*„Strabag” în nume; cele cu achiziții în selecție sunt în lista de nume/);
    expect(t.applied).toMatchObject({ q: "Strabag", from: "2023", to: "2023" });
    // beside an institution, firms carrying the name are a choice, never dropped from the question
    const beside = resultFor(await read("ce a cumparat CNAIR de la Strabag"));
    expect(beside.spec).toBeNull();
    expect(beside.interpretation.entityAlternatives.map((e) => e.name)).toContain("STRABAG SRL");
    // two firms named exactly the same are never one of them
    const two = new RulesInterpreter(memoryVocabulary(FIXTURE));
    const scope = parseTopicScope(new URLSearchParams("q=cat+a+castigat+Strabag+in+2023"));
    expect(applyInterpretation(scope, resultFor(await two.interpret(scope.q, { now: NOW })), null, NOW).answer).toBeNull();
  });

  it("compares two town halls, one of them written twice in the registry", async () => {
    const t = await page("compara primaria Cluj-Napoca cu primaria Timisoara");
    expect(t.answer?.total.spec).toMatchObject({ block: "compare", filters: { authorityId: 7000003, compareWithId: 7000005 } });
    expect(t.answer?.top).toBeNull();
    expect(t.notes.join(" ")).toMatch(/apare de 2 ori/);
  });

  it("keeps a firm's name whole when it holds a subject's word and capitals („E.ON Energie Romania”)", async () => {
    const i = await read("E.ON Energie Romania");
    expect(i.supplier?.name).toBe("E.ON ENERGIE ROMANIA");
    expect(i.subjects).toEqual([]);
  });

  it("reads institutions by their abbreviation, in every shape the registry writes them", async () => {
    expect((await read("ISJ Cluj")).authority?.name).toBe("INSPECTORATUL SCOLAR JUDETEAN CLUJ");
    expect((await read("ISJ Iasi")).authority?.name).toBe("INSPECTORATUL SCOLAR AL JUD IASI");
    // the institution's own city after its name is not a second place
    const sector = await read("dgaspc sector 2 bucuresti");
    expect(sector.authority?.id).toBe(7000007);
    expect(sector.place).toBeNull();
    // „mai” is the ministry only typed in capitals; „caș” is cheese
    expect((await read("cel mai mare contract")).authority).toBeNull();
    expect((await read("cas pentru scoli")).authority).toBeNull();
  });

  it("reads a county or a municipality with its article or in the genitive", async () => {
    expect((await read("iluminat in Clujul")).place).toMatchObject({ kind: "county", county: "Cluj" });
    expect((await read("achizitiile Clujului")).place).toMatchObject({ kind: "county", county: "Cluj" });
    expect((await read("iluminat Bucurestiul")).place).toMatchObject({ county: "București" });
    expect((await read("iluminat in Sibiului")).place).toMatchObject({ county: "Sibiu" });
    expect((await read("iluminat in Craiovei")).place).toMatchObject({ kind: "locality", name: "Municipiul Craiova" });
  });

  it("asks which place when the words do not name it", async () => {
    const own = await page("cat cheltuie primaria la noi");
    expect(own.notes.join(" ")).toMatch(/„la noi”: nu știm ce localitate/);
    // never answered for the whole country instead, with or without a subject
    expect((await page("care firma ia toate contractele in judetul meu")).question).toBeNull();
    const mine = await page("iluminat in comuna mea");
    expect(mine.answer).toBeNull();
    expect(mine.notes.join(" ")).toMatch(/nu știm ce localitate/);
    // „mai puțin Bucureștiul” leaves a place out, which cannot be done: said, never applied
    const less = await read("medicamente mai putin Bucurestiul");
    expect(less.place).toBeNull();
    expect(less.notes.join(" ")).toMatch(/nu putem scoate un loc/);
    expect((await page("comuna mea")).notes.join(" ")).toMatch(/nu știm ce localitate/);
    expect((await page("primaria")).notes.join(" ")).toMatch(/Scrie localitatea/);
  });

  it("says what it cannot tell apart and reads the years people write", async () => {
    expect((await page("spitale noi")).notes.join(" ")).toMatch(/nu putem deosebi instituțiile noi/);
    const winter = await read("deszapezire iarna 2024");
    expect(winter.period).toMatchObject({ yearFrom: 2024, yearTo: 2024 });
    expect(winter.notes.join(" ")).toMatch(/„iarna 2024”: am folosit tot anul 2024/);
    expect((await read("catering '22")).period).toMatchObject({ yearFrom: 2022, yearTo: 2022 });
    // words that are only part of one long name are a choice, not that institution
    const part = await read("promovare turistica");
    expect(part.authority).toBeNull();
    expect(part.entityAlternatives.map((e) => e.id)).toEqual([7000006]);
  });

  it("answers the largest records, and searches a subject's names without the closest names", async () => {
    const t = await page("cel mai mare contract de iluminat");
    expect(t.answer?.top).toMatchObject({ kind: "records", spec: { block: "stat", filters: { cpvTerm: "iluminat" } } });
    expect(t.applied).toMatchObject({ q: "iluminat", order: "value", names: "exact" });
    // the whole country without a narrower selection is no short answer (every record sorted)
    expect((await page("cele mai mari contracte")).answer?.top?.kind).not.toBe("records");
    expect((await page("cea mai mare achizitie directa")).answer).toBeNull();
    const direct = await page("cea mai mare achizitie directa in Buzau");
    expect(direct.answer?.top?.kind).toBe("records");
    expect(direct.question?.sentence).toMatch(/^Care sunt cele mai mari achiziții directe/);
    // a firm's name beside a subject keeps its closest names
    expect((await page("apa nova")).applied.names).toBeUndefined();
  });
});

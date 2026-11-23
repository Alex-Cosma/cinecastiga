import { describe, expect, it } from "vitest";
import { memoryVocabulary } from "./memory-vocabulary";
import { RulesInterpreter } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { resultFor } from "./to-spec";

/*
 * Search probe, 23 November 2026 (five readers, 309 questions): a negation read as its opposite, the months and the
 * time since the pandemic dropped or cut short.
 */
const NOW = new Date("2026-11-23T12:00:00Z");
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
const read = async (q: string) => {
  const i = await interpreter.interpret(q, { now: NOW });
  return { i, r: resultFor(i) };
};

describe("negations", () => {
  it("reads «fără achiziții directe» as the contracts from procedures, «fără licitație» as the direct ones", async () => {
    for (const q of ["achizitiile spitalelor din judetul Buzau fara achizitii directe 2023", "iluminat fara directe", "iluminat nu prin achizitii directe", "iluminat in afara de achizitiile directe"]) {
      const { i } = await read(q);
      expect([q, i.dataset, i.leftover]).toEqual([q, "contracts", []]);
    }
    expect((await read("iluminat fara licitatie")).i.dataset).toBe("da");
    expect((await read("achizitii directe iluminat")).i.dataset).toBe("da");
  });
  it("reads the adverb «direct» as the direct acquisitions, never as a subject", async () => {
    for (const q of ["care spitale cumpara cel mai mult direct fara licitatie", "cel mai scump contract atribuit direct anul trecut", "ce a cumparat direct primaria din Ramnicu Sarat"]) {
      const { i } = await read(q);
      expect([q, i.dataset, i.subjects.map((s) => s.label)]).toEqual([q, "da", []]);
    }
  });
  it("does not apply a subject the words leave out, and says so", async () => {
    const { i } = await read("iluminat in judetul Buzau fara medicamente");
    expect(i.subjects.map((s) => s.label)).toEqual(["iluminat"]);
    expect(i.notes).toContain("„fara medicamente”: nu putem scoate un subiect din căutare; nu l-am aplicat.");
    expect(i.leftover).toEqual([]);
  });
  it("keeps the place left out as it was: not applied, with its note", async () => {
    const { i } = await read("medicamente fara Bucuresti");
    expect(i.place).toBeNull();
    expect(i.notes.join(" ")).toContain("nu putem scoate un loc din căutare");
  });
});

describe("periods", () => {
  it("reads the time since the pandemic to today, and the time after it", async () => {
    const since = await read("achizitii de medicamente de la pandemie incoace");
    expect(since.i.period).toMatchObject({ yearFrom: 2020 });
    expect(since.i.period?.yearTo).toBeUndefined();
    expect(since.i.notes).toContain("„de la pandemie încoace”: am folosit anii 2020–2026.");
    expect((await read("iluminat din pandemie pana acum")).i.period).toMatchObject({ yearFrom: 2020 });
    const after = await read("iluminat dupa pandemie");
    expect(after.i.period).toMatchObject({ yearFrom: 2022 });
    expect(after.i.period?.yearTo).toBeUndefined();
    expect(after.i.notes).toContain("„după pandemie”: am folosit anii 2022–2026.");
    const during = await read("iluminat in pandemie");
    expect(during.i.period).toMatchObject({ yearFrom: 2020, yearTo: 2021 });
    expect((await read("iluminat din 2020 pana acum")).i.period).toMatchObject({ yearFrom: 2020 });
  });
  it("reads the months said with a year and applies them in Întreabă", async () => {
    const dec = await read("ce au cumparat spitalele in decembrie 2024");
    expect(dec.i.period).toMatchObject({ yearFrom: 2024, yearTo: 2024, monthFrom: 12, monthTo: 12 });
    expect(dec.r.spec?.filters).toMatchObject({ yearFrom: 2024, yearTo: 2024, monthFrom: 12, monthTo: 12 });
    expect(dec.r.interpretation.notes.join(" ")).not.toMatch(/tot anul/);
    expect(dec.r.sentence).toBe("Ce cumpără spitalele din toată țara, în dec. 2024?");
    for (const q of ["iluminat ianuarie-martie 2024", "iluminat intre ianuarie si martie 2024", "iluminat din ianuarie pana in martie 2024"])
      expect([q, (await read(q)).r.spec?.filters]).toEqual([q, expect.objectContaining({ yearFrom: 2024, yearTo: 2024, monthFrom: 1, monthTo: 3 })]);
    expect((await read("iluminat din noiembrie 2024 pana in februarie 2025")).r.spec?.filters).toMatchObject({ yearFrom: 2024, yearTo: 2025, monthFrom: 11, monthTo: 2 });
    // a year alone, and „cel mai mare … 2024”, are no month
    expect((await read("cel mai mare contract de iluminat din 2024")).i.period?.monthFrom).toBeUndefined();
  });
  it("reads the months before today against the date in București", async () => {
    expect((await read("iluminat luna asta")).r.spec?.filters).toMatchObject({ yearFrom: 2026, yearTo: 2026, monthFrom: 11, monthTo: 11 });
    expect((await read("iluminat luna trecuta")).r.spec?.filters).toMatchObject({ yearFrom: 2026, yearTo: 2026, monthFrom: 10, monthTo: 10 });
    expect((await read("iluminat in ultimele 3 luni")).r.spec?.filters).toMatchObject({ yearFrom: 2026, yearTo: 2026, monthFrom: 9, monthTo: 11 });
    const january = new RulesInterpreter(memoryVocabulary(FIXTURE));
    const early = await january.interpret("iluminat in ultimele 6 luni", { now: new Date("2026-02-10T12:00:00Z") });
    expect(early.period).toMatchObject({ yearFrom: 2025, yearTo: 2026, monthFrom: 9, monthTo: 2 });
    expect((await january.interpret("iluminat luna trecuta", { now: new Date("2026-01-10T12:00:00Z") })).period).toMatchObject({ yearFrom: 2025, yearTo: 2025, monthFrom: 12, monthTo: 12 });
    // the last twelve months stay the last year, whole
    expect((await read("iluminat in ultimele 12 luni")).i.period?.monthFrom).toBeUndefined();
  });
  it("keeps whole years where the question takes no months, and says so", async () => {
    const change = await read("ce firme au crescut la iluminat in decembrie 2025 fata de 2024");
    expect(change.r.spec?.filters.monthFrom).toBeUndefined();
    expect(change.r.interpretation.notes.join(" ")).toMatch(/„decembrie 2025”: am folosit/);
  });
  it("reads a month without a year as the latest one that has begun (months-alone.test.ts)", async () => {
    const { i } = await read("iluminat in decembrie");
    expect([i.period?.yearFrom, i.period?.monthFrom, i.period?.monthTo]).toEqual([2025, 12, 12]);
    expect(i.notes).toContain("„decembrie”: am folosit decembrie 2025.");
  });
});

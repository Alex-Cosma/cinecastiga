import { describe, expect, it } from "vitest";
import { memoryVocabulary } from "./memory-vocabulary";
import { RulesInterpreter } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { resultFor } from "./to-spec";

/*
 * Owner, 23 November 2026: a month said without its year and „ultima lună” were understood and not applied. The month
 * is the latest one that has begun; „ultima lună” is the month in course, as „ultimele N luni” keeps it.
 */
const NOW = new Date("2026-11-23T12:00:00Z");
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
const read = async (q: string, now = NOW) => {
  const i = await interpreter.interpret(q, { now });
  return { i, r: resultFor(i) };
};
const months = (p: { yearFrom?: number; yearTo?: number; monthFrom?: number; monthTo?: number } | null | undefined) => p && [p.yearFrom, p.monthFrom, p.yearTo, p.monthTo];

describe("a month without a year", () => {
  it("is the latest such month that has begun, and says so", async () => {
    for (const [q, y, m, name] of [["iluminat in martie", 2026, 3, "martie"], ["iluminat in luna noiembrie", 2026, 11, "noiembrie"],
      ["iluminat din decembrie", 2025, 12, "decembrie"], ["iluminat luna mai", 2026, 5, "mai"]] as const) {
      const { i, r } = await read(q);
      expect([q, months(i.period)]).toEqual([q, [y, m, y, m]]);
      expect(i.notes).toContain(`„${name}”: am folosit ${name} ${y}.`);
      expect([q, i.leftover, i.subjects.map((s) => s.label)]).toEqual([q, [], ["iluminat"]]);
      expect([r.spec?.filters.yearFrom, r.spec?.filters.monthFrom, r.spec?.filters.monthTo]).toEqual([y, m, m]);
    }
  });
  it("in January reads last year's months", async () => {
    const { i } = await read("iluminat in martie", new Date("2027-01-10T12:00:00Z"));
    expect(months(i.period)).toEqual([2026, 3, 2026, 3]);
  });
  it("takes the year said elsewhere in the question, without a note of its own", async () => {
    const { i } = await read("iluminat 2024 in luna martie");
    expect(months(i.period)).toEqual([2024, 3, 2024, 3]);
    expect(i.notes.join(" ")).not.toContain("am folosit martie");
  });
  it("does not read a month of this year that has not begun", async () => {
    const { i } = await read("iluminat 2026 in decembrie");
    expect(months(i.period)).toEqual([2026, undefined, 2026, undefined]);
    expect(i.notes).toContain("Perioada „decembrie 2026” nu are încă date; am folosit tot anul 2026.");
  });
  it("keeps the first period when the question has a range of years", async () => {
    const { i } = await read("iluminat 2022-2024 in martie");
    expect(months(i.period)).toEqual([2022, undefined, 2024, undefined]);
    expect(i.notes).toContain("Am folosit prima perioadă din întrebare; „in martie” nu a fost aplicată.");
  });
  it("leaves «cel mai mare» and a day's month to the other readings", async () => {
    expect((await read("cel mai mare contract de iluminat")).i.period).toBeNull();
    expect((await read("comuna 1 decembrie iluminat")).i.period).toBeNull();
  });
});

describe("«ultima lună»", () => {
  it("is the month in course, and says so", async () => {
    for (const q of ["iluminat in ultima luna", "ce a cumparat primaria Buzau in ultima luna", "iluminat ultima luna"]) {
      const { i } = await read(q);
      expect([q, months(i.period)]).toEqual([q, [2026, 11, 2026, 11]]);
      expect(i.notes).toContain("„ultima lună”: am folosit luna în curs, noiembrie 2026.");
    }
  });
  it("leaves «luna trecută» and «ultimele 3 luni» as they were", async () => {
    expect(months((await read("iluminat luna trecuta")).i.period)).toEqual([2026, 10, 2026, 10]);
    expect(months((await read("iluminat in ultimele 3 luni")).i.period)).toEqual([2026, 9, 2026, 11]);
  });
});

describe("weeks, quarters, the month to come", () => {
  it("are understood and not applied", async () => {
    expect((await read("iluminat trimestrul 1")).i.notes.join(" ")).toContain("săptămânile și trimestrele nu sunt încă un filtru");
    const { i } = await read("iluminat luna viitoare");
    expect(i.period).toBeNull();
    expect(i.notes).toContain("Perioada „luna viitoare” nu are încă date; nu am aplicat-o.");
  });
});

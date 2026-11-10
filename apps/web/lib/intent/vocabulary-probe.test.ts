import { describe, expect, it } from "vitest";
import { memoryVocabulary, type MemoryFixture } from "./memory-vocabulary";
import { RulesInterpreter } from "./rules";
import { FIXTURE } from "./rules.fixture";

/**
 * The /cauta probe of 10 November 2026 (854 questions by five testers): words that named no domain, or a wrong one,
 * with the vocabulary of migration 0101 on top of the shared fixture.
 */
const NOW = new Date("2026-11-10T10:00:00Z");
const fx: MemoryFixture = {
  ...FIXTURE,
  catalog: [
    ...FIXTURE.catalog,
    { code: "45321000-3", name: "Lucrări de izolare termică" },
    { code: "34350000-5", name: "Pneuri pentru sarcină mică şi mare" },
    { code: "48444000-2", name: "Sistem de contabilitate" },
    { code: "79211000-6", name: "Servicii de contabilitate" },
    { code: "35111000-5", name: "Echipament de stingere a incendiilor" },
    { code: "42416100-6", name: "Ascensoare" },
    { code: "50750000-7", name: "Servicii de întreţinere a ascensoarelor" },
    { code: "85100000-0", name: "Servicii de sănătate" },
    { code: "32323500-8", name: "Sistem video de supraveghere" },
    { code: "79320000-3", name: "Servicii de sondaje de opinie" },
  ],
  synonyms: [
    ...FIXTURE.synonyms,
    { term: "anvelopare", prefix: "45321000" },
    { term: "anvelope", prefix: "34350000" },
    { term: "contabilitate", prefix: "79211000" },
    { term: "psi", prefix: "35111000" },
    { term: "lifturi", prefix: "42416100" },
    { term: "lifturi", prefix: "50750000" },
    { term: "mentenanta lifturi", prefix: "50750000" },
    // migration 0102
    { term: "servicii medicale", prefix: "85100000" },
    { term: "camere de supraveghere", prefix: "32323500" },
    { term: "sondaje de opinie", prefix: "79320000" },
  ],
};
const interpreter = new RulesInterpreter(memoryVocabulary(fx));
const subjects = async (q: string) => (await interpreter.interpret(q, { now: NOW })).subjects.map((s) => s.term);

describe("vocabulary from the /cauta probe (migration 0101)", () => {
  it("names the domain people mean, not a near or narrow catalogue word", async () => {
    // tyres, never thermal insulation
    expect(await subjects("anvelope")).toEqual(["anvelope"]);
    expect(await subjects("anvelopare")).toEqual(["anvelopare"]);
    // accounting services, not the accounting software
    expect(await subjects("contabilitate")).toEqual(["contabilitate"]);
    // fire safety, not the psychiatric hospitals that carry the letters in their name
    expect(await subjects("cine castiga pe psi")).toEqual(["psi"]);
    // maintenance of lifts is its own phrase; lifts alone are both
    expect(await subjects("mentenanta lifturi")).toEqual(["mentenanta lifturi"]);
    expect(await subjects("lifturi")).toEqual(["lifturi"]);
  });

  it("reads the second list as whole phrases (migration 0102)", async () => {
    // health services, not medical waste
    expect(await subjects("servicii medicale")).toEqual(["servicii medicale"]);
    expect(await subjects("camere de supraveghere")).toEqual(["camere de supraveghere"]);
    expect(await subjects("sondaje de opinie")).toEqual(["sondaje de opinie"]);
  });
});

import { describe, expect, it } from "vitest";
import { memoryVocabulary } from "./memory-vocabulary";
import { RulesInterpreter } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { resultFor } from "./to-spec";
import { applyInterpretation } from "../topic-search/interpretation";
import { parseTopicScope } from "../topic-search/shared";

/** Times, regions and shapes from the /cauta probe of 10 November 2026 (T4). */
const NOW = new Date("2026-11-10T10:00:00Z");
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
const read = (q: string) => interpreter.interpret(q, { now: NOW });
const years = async (q: string) => { const i = await read(q); return i.period ? [i.period.yearFrom, i.period.yearTo] : null; };

describe("periods, regions and places people write (owner probe, 10 November 2026)", () => {
  it("reads „din 2024” as that year, and only „încoace”, „începând cu” as an open range", async () => {
    expect(await years("laptopuri din 2024")).toEqual([2024, 2024]);
    expect(await years("laptopuri din 2024 incoace")).toEqual([2024, undefined]);
    expect(await years("laptopuri incepand cu 2024")).toEqual([2024, undefined]);
    expect(await years("laptopuri din 2021 pana in 2023")).toEqual([2021, 2023]);
  });

  it("reads the periods people say, whole years, with a note when approximate", async () => {
    expect(await years("iluminat in ultimul an")).toEqual([2025, 2026]);
    expect(await years("iluminat de 3 ani incoace")).toEqual([2024, 2026]);
    expect(await years("iluminat din anul trecut incoace")).toEqual([2025, 2026]);
    expect(await years("iluminat de la inceputul anului")).toEqual([2026, 2026]);
    const pandemic = await read("medicamente in timpul pandemiei");
    expect(pandemic.period).toMatchObject({ yearFrom: 2020, yearTo: 2021 });
    expect(pandemic.notes.join(" ")).toMatch(/pandemia/);
    expect(pandemic.leftover).toEqual([]);
    const winter = await read("deszapezire iarna trecuta");
    expect(winter.period).toMatchObject({ yearFrom: 2025, yearTo: 2026 });
    const march = await read("iluminat in martie 2025");
    // the month is read (23 November 2026), and /cauta searches inside it (owner, the same day)
    expect(march.period).toMatchObject({ yearFrom: 2025, yearTo: 2025, monthFrom: 3, monthTo: 3 });
    expect(applyInterpretation(parseTopicScope(new URLSearchParams("q=iluminat in martie 2025")), resultFor(march)).applied).toMatchObject({ q: "iluminat", from: "2025-03", to: "2025-03" });
    // a month without a year is the latest one that has begun, and said (owner, 23 November 2026; it was understood
    // and never applied); „cel mai mare” is no May
    const alone = await read("iluminat in martie");
    expect(alone.period).toMatchObject({ yearFrom: 2026, yearTo: 2026, monthFrom: 3, monthTo: 3 });
    expect(alone.leftover).toEqual([]);
    expect(alone.notes).toContain("„martie”: am folosit martie 2026.");
    expect((await read("cel mai mare contract de iluminat")).notes.join(" ")).not.toMatch(/lunile/);
  });

  it("says a region cannot be applied instead of dropping it", async () => {
    const i = await read("iluminat in Moldova");
    expect(i.place).toBeNull();
    expect(i.leftover).toEqual([]);
    expect(i.notes.join(" ")).toMatch(/o regiune nu se poate aplica/);
    // a region's word inside a firm's name is no region
    expect((await read("Enel Energie Muntenia")).notes.join(" ")).not.toMatch(/regiune/);
  });

  it("reads a county's plate code after the county word", async () => {
    const i = await read("iluminat jud. CJ");
    expect(i.place).toMatchObject({ kind: "county", county: "Cluj" });
    expect(i.authorityKind).toBeNull();
  });

  it("orders the acquisitions by value for „cel mai mare contract”, and the titles' head says so", async () => {
    const q = "cel mai mare contract de iluminat";
    const scope = parseTopicScope(new URLSearchParams(`q=${encodeURIComponent(q)}`));
    const t = applyInterpretation(scope, resultFor(await read(q)), null, NOW);
    expect(t.applied.order).toBe("value");
    // no note: the titles' own head says „cele mai mari valori întâi” (owner, 17 November 2026)
    expect(t.notes.join(" ")).not.toMatch(/ordonate după valoare/);
    // a person's own order wins
    const own = parseTopicScope(new URLSearchParams(`q=${encodeURIComponent(q)}&ordine=data`));
    expect(applyInterpretation(own, resultFor(await read(q)), null, NOW).applied.order).toBeUndefined();
  });
});

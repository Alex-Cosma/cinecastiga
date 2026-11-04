import { describe, expect, it } from "vitest";
import { memoryVocabulary } from "./memory-vocabulary";
import { RulesInterpreter } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { LENS_PHRASES } from "./lens-phrases";
import { resultFor, type SpecContext } from "./to-spec";

/*
 * The risk cloud's signal in words (F6b; rf-2026.18): the risk score's criteria named on the cloud become its
 * signal — „chiar sub plafon”, „peste plafon”, „peste plafonul cumulat” — and „finalizare rapidă”, no longer a
 * criterion (owner decision, 1 November 2026), sets none.
 */
const NOW = new Date("2026-10-22T12:00:00Z");
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
const CONTEXT: SpecContext = {
  periods: {
    da: { from: "2018-04-02", to: "2026-06-30", completeUntil: "2026-05-31" },
    contracts: { from: "2000-01-06", to: "2026-06-30", completeUntil: "2026-05-31" },
    checkpoint: "checkpoint-12",
  },
  year: 2026,
};
async function cloud(q: string) {
  const i = await interpreter.interpret(q, { now: NOW });
  return resultFor(i, CONTEXT).spec;
}

describe("the risk cloud's signal in words (rf-2026.18)", () => {
  it("names the score's criteria: just under the ceiling, above it, repeated over a cumulated ceiling", async () => {
    expect(await cloud("ce primării din județul Buzău ies din tipar cu achiziții chiar sub plafon")).toMatchObject({ block: "scatter", scatter: { flag: "da_round" } });
    expect(await cloud("ce instituții ies din tipar, cu achiziții aproape de prag")).toMatchObject({ block: "scatter", scatter: { flag: "da_round" } });
    expect(await cloud("ce firme ies din tipar cu achiziții peste plafon")).toMatchObject({ block: "scatter", dim: "supplier", scatter: { flag: "da_above_ceiling" } });
    // „Peste plafonul cumulat” is the repeated acquisitions' (da_split), never „Peste plafon”.
    expect(await cloud("ce instituții ies din tipar, cu achiziții peste plafonul cumulat")).toMatchObject({ block: "scatter", scatter: { flag: "da_split" } });
  });

  it("understands the names of 4 November 2026, as the site writes them", async () => {
    expect(await cloud("ce instituții ies din tipar cu achiziții adunate, trec de plafon")).toMatchObject({ block: "scatter", scatter: { flag: "da_split" } });
    expect(await cloud("ce instituții ies din tipar cu achiziții prea des chiar sub plafon")).toMatchObject({ block: "scatter", scatter: { flag: "da_round" } });
    expect(await cloud("ce firme ies din tipar cu achiziții directe, deși trec de plafon")).toMatchObject({ block: "scatter", dim: "supplier", scatter: { flag: "da_above_ceiling" } });
    expect(await cloud("ce instituții ies din tipar cu mulți bani contractați în decembrie")).toMatchObject({ block: "scatter", scatter: { flag: "da_year_end" } });
    expect(await cloud("ce instituții ies din tipar unde o firmă ia mare parte din bani")).toMatchObject({ block: "scatter", scatter: { flag: "da_concentration" } });
    expect(await cloud("ce firme ies din tipar cu un singur client public mare")).toMatchObject({ block: "scatter", dim: "supplier", scatter: { flag: "da_dependence" } });
  });

  it("sets no signal for „finalizare rapidă”, which no longer counts", async () => {
    const spec = await cloud("ce firme ies din tipar cu finalizare rapidă");
    expect(spec?.block).toBe("scatter");
    expect(spec?.scatter?.flag).toBeUndefined();
    expect(LENS_PHRASES.scatter?.map((phrase) => phrase.value)).not.toContain("da_rapid");
  });
});

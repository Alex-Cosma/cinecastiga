import { describe, expect, it } from "vitest";
import { legacyCorpus } from "../lib/ask/fixtures/legacy-corpus";
import { FIXTURE_IDENTITIES } from "../lib/ask/fixtures/golden-fixture";
import { goldenJson, type GoldenRecord } from "../lib/ask/fixtures/golden-run";
import { changedRecords, goldenOptions, LOCAL_IDENTITIES } from "./ask-golden";

describe("ask-golden (the corpus on a local copy)", () => {
  it("runs the fixture's corpus, without the person entries the local copy cannot answer", () => {
    const local = legacyCorpus(LOCAL_IDENTITIES).map((e) => e.id);
    const fixture = legacyCorpus(FIXTURE_IDENTITIES).map((e) => e.id);
    expect(local).toEqual(fixture.filter((id) => local.includes(id)));
    expect(fixture.filter((id) => !local.includes(id))).toEqual(["site:person-firms", "site:person-clip", "site:capture-person",
      "legacy:admin-trend", "legacy:admin-leader-value", "legacy:admin-unidentified", "combo:table:admin", "combo:stat:admin"]);
  });

  it("requires an output file and rejects unknown arguments", () => {
    expect(() => goldenOptions([])).toThrow(/--out/);
    expect(() => goldenOptions(["--out=x.json", "--fast"])).toThrow(/Unknown/);
    expect(goldenOptions(["--out=x.json", "--only=a, b", "--csv-max=10"])).toMatchObject({ out: "x.json", only: ["a", "b"], csvMax: 10 });
  });

  it("names the entries whose record changed, appeared or disappeared", () => {
    const record = (id: string, total: number) => ({ id, sources: { total } }) as unknown as GoldenRecord;
    expect(changedRecords([record("a", 1), record("b", 2), record("c", 3)], [record("a", 1), record("b", 5), record("d", 4)])).toEqual(["b", "c", "d"]);
  });

  it("writes JSON that reads back the same, with short scalar arrays on one line", () => {
    const value = { a: [1, "x", null], b: { c: [], d: {}, e: [{ f: true }] }, g: "ș" };
    const text = goldenJson(value);
    expect(JSON.parse(text)).toEqual(value);
    expect(text).toContain('"a": [1,"x",null]');
  });
});

import { describe, expect, it } from "vitest";
import { pickContainedSynonyms, type SynonymRow } from "./ground";

const rows = (spec: string): SynonymRow[] => spec.split(",").map((pair) => {
  const [term, cpv_prefix] = pair.split("=");
  return { term: term!, cpv_prefix: cpv_prefix!, note: null };
});
const TABLE = rows([
  "iluminat=31500000", "iluminat=34993000", "iluminat=34928500", "iluminat=45316000", "iluminat=50232000",
  "iluminat public=34993000", "reabilitare drumuri=45233140", "reabilitare drumuri=45233000", "drumuri=45233000",
  "reabilitare=45453000", "reabilitare=45321000", "reabilitare=45233140", "scoala=45214000", "gaz=09123000",
  "apa=41000000", "aparatura medicala=33100000", "transport=60000000", "laptopuri=30213100",
].join(","));
// what the SQL prefilter returns: letter containment in either direction
const candidates = (q: string) => TABLE.filter((r) => q.includes(r.term) || r.term.includes(q));
const pick = (q: string) => [...new Set(pickContainedSynonyms(q, candidates(q)).map((r) => `${r.term}=${r.cpv_prefix}`))];

describe("synonyms for a query that is not a curated term", () => {
  it("keeps every row of a contained term", () => {
    expect(pick("iluminat stradal")).toEqual(["iluminat=31500000", "iluminat=34928500", "iluminat=34993000", "iluminat=45316000", "iluminat=50232000"]);
  });
  it("takes several contained terms, but not those inside a longer picked one", () => {
    expect(pick("reabilitare drumuri scoala")).toEqual(["reabilitare drumuri=45233000", "reabilitare drumuri=45233140", "scoala=45214000"]);
    expect(pick("transport public")).toEqual(["transport=60000000"]);
  });
  it("matches from a word start only", () => {
    expect(pick("gazon")).toEqual([]);
    expect(pick("capacitate")).toEqual([]);
  });
  it("completes a fragment with the shortest terms that contain it", () => {
    expect(pick("ilum")).toEqual(["iluminat=31500000", "iluminat=34928500", "iluminat=34993000", "iluminat=45316000", "iluminat=50232000"]);
    expect(pick("laptop")).toEqual(["laptopuri=30213100"]);
  });
});

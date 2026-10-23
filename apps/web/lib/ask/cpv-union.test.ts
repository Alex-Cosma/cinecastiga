import { describe, expect, it } from "vitest";
import { carvePrefixes, splitSynonymRows, unionCpvParts, type CpvPart, type SynonymRow } from "./ground";
import { cpvTermParts, joinCpvTerms } from "./cpv-terms";

/** What one subject counts: under an include, under none of its own exclusions. */
const counts = (part: CpvPart, code: string) => part.prefixes.some((p) => code.startsWith(p)) && !part.excludePrefixes.some((x) => code.startsWith(x));
/** The engine's single condition: like any(prefixes) and not like any(excludePrefixes). */
const flat = (u: { prefixes: string[]; excludePrefixes: string[] }, code: string) => u.prefixes.some((p) => code.startsWith(p)) && !u.excludePrefixes.some((x) => code.startsWith(x));

describe("several subjects in one cpvTerm", () => {
  it("joins and splits subjects with « + », a single subject stays whole", () => {
    expect(joinCpvTerms(["parcuri", "spatii verzi", "parcuri"])).toBe("parcuri + spatii verzi");
    expect(cpvTermParts("parcuri + spatii verzi")).toEqual(["parcuri", "spatii verzi"]);
    expect(cpvTermParts("iluminat + 39298910-9")).toEqual(["iluminat", "39298910-9"]);
    expect(cpvTermParts("iluminat public")).toEqual(["iluminat public"]);
    expect(cpvTermParts("c++")).toEqual(["c++"]);
  });

  it("carves an exclusion around a narrower class another subject counts", () => {
    expect(carvePrefixes("33696", [])).toEqual(["33696"]);
    expect(carvePrefixes("33696", ["33696"])).toEqual([]);
    const pieces = carvePrefixes("33696", ["3369612"]);
    expect(pieces).toContain("336960");
    expect(pieces).toContain("3369611");
    expect(pieces.some((p) => "33696120".startsWith(p))).toBe(false);
    expect(pieces.some((p) => "33696500".startsWith(p))).toBe(true);
  });

  it("drops an exclusion another subject counts, keeps one nobody counts", () => {
    const medicamente: CpvPart = { prefixes: ["336"], excludePrefixes: ["33682", "33683", "33696"] };
    // reactivi = 33696: counted, so not excluded any more
    expect(unionCpvParts([medicamente, { prefixes: ["33696"], excludePrefixes: [] }]).excludePrefixes).toEqual(["33682", "33683"]);
    // a broader subject that does not leave 33696 out counts it
    expect(unionCpvParts([medicamente, { prefixes: ["33"], excludePrefixes: [] }])).toEqual({ prefixes: ["33"], excludePrefixes: [] });
    // the same exclusion on both sides stays
    expect(unionCpvParts([medicamente, { prefixes: ["336"], excludePrefixes: ["33682", "33683"] }]).excludePrefixes).toEqual(["33682", "33683"]);
  });

  it("is exactly the OR of each subject's own condition (exhaustive check on a small code space)", () => {
    // every 4-digit code over the digits 0-2, random subjects with exclusions inside their includes
    const codes: string[] = [];
    for (let n = 0; n < 81; n++) codes.push(n.toString(3).padStart(4, "0"));
    let seed = 7;
    const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % k; };
    const prefix = (len: number) => Array.from({ length: len }, () => String(rnd(3))).join("");
    for (let round = 0; round < 400; round++) {
      const parts: CpvPart[] = Array.from({ length: 2 + rnd(2) }, () => {
        const prefixes = [...new Set(Array.from({ length: 1 + rnd(2) }, () => prefix(1 + rnd(2))))];
        const excludePrefixes = [...new Set(Array.from({ length: rnd(3) }, () => {
          const p = prefixes[rnd(prefixes.length)]!;
          return p + prefix(1 + rnd(4 - p.length));
        }))].filter((x) => x.length <= 4 && !prefixes.some((p) => p.startsWith(x)));
        return { prefixes, excludePrefixes };
      });
      const u = unionCpvParts(parts);
      for (const code of codes) expect(flat(u, code), JSON.stringify({ parts, code })).toBe(parts.some((p) => counts(p, code)));
    }
  });

  it("several synonym terms of one text count what any of them counts", () => {
    const rows = (spec: string): SynonymRow[] => spec.split(",").map((pair) => {
      const [term, cpv_prefix, flag] = pair.split("=");
      return { term: term!, cpv_prefix: cpv_prefix!, note: null, exclude: flag === "x" };
    });
    // "medicamente si produse farmaceutice": the second term does not leave reagents out, so they count
    const both = splitSynonymRows(rows("medicamente=33600000,medicamente=33696000=x,medicamente=33682000=x,produse farmaceutice=33600000,produse farmaceutice=33682000=x"));
    expect(both.excludePrefixes).toEqual(["33682"]);
    // one term alone keeps its exclusions
    expect(splitSynonymRows(rows("medicamente=33600000,medicamente=33696000=x")).excludePrefixes).toEqual(["33696"]);
  });
});

import { describe, expect, it } from "vitest";
import { readsWholeMartIndex } from "./compile";

/*
 * S6 review: a live national grouping without a county runs as a sequential scan when its plan would read a
 * transaction mart's covering index whole (withoutWholeIndexScan in compile.ts). The plan check, on EXPLAIN's JSON.
 */
const ios = (relation: string, cond?: string) => ({ "Node Type": "Index Only Scan", "Relation Name": relation, "Index Name": "da_tx_county_ent_idx", ...(cond ? { "Index Cond": cond } : {}) });
const tree = (...leaves: object[]) => ({ "Node Type": "Aggregate", Plans: [{ "Node Type": "Gather Merge", Plans: [{ "Node Type": "Append", Plans: leaves }] }] });

describe("a covering index of the marts read whole", () => {
  it("is an index-only scan of a transaction mart without an index condition, anywhere in the plan", () => {
    expect(readsWholeMartIndex(tree(ios("da_transactions"), { "Node Type": "Seq Scan", "Relation Name": "contract_transactions" }))).toBe(true);
    expect(readsWholeMartIndex(tree(ios("contract_transactions")))).toBe(true);
  });

  it("is not an index read on a condition (a county, a domain, an entity), another table's, or a sequential scan", () => {
    expect(readsWholeMartIndex(tree(ios("da_transactions", "(county = 'Cluj'::text)")))).toBe(false);
    expect(readsWholeMartIndex(tree(ios("entity_profile")))).toBe(false);
    expect(readsWholeMartIndex(tree({ "Node Type": "Seq Scan", "Relation Name": "da_transactions" }))).toBe(false);
    expect(readsWholeMartIndex(null)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { cpvCodeName, isCpvCodeTerm } from "./cpv-label";
import { knownCpvName } from "../../app/intreaba/cpv-name";

/** A tagged template that records the values it was given and answers one catalogue row. */
function catalogue(name: string | null) {
  const seen: unknown[][] = [];
  const sql = ((_strings: TemplateStringsArray, ...values: unknown[]) => { seen.push(values); return Promise.resolve(name === null ? [] : [{ name_ro: name }]); }) as unknown as DbSql;
  return { sql, seen };
}

describe("a CPV code's name, for the label route and beside the answer", () => {
  it("reads the code's own padded node, never words", async () => {
    const { sql, seen } = catalogue("Lucrări de construcţii");
    expect(await cpvCodeName(sql, "45")).toBe("Lucrări de construcţii");
    expect(seen[0]).toEqual(["45000000", "45000000-%"]);
    expect(await cpvCodeName(sql, "03413000-8")).toBe("Lucrări de construcţii");
    expect(seen[1]).toEqual(["03413000", "03413000-%"]);
    expect(await cpvCodeName(sql, "asfaltare")).toBeNull();
    expect(seen).toHaveLength(2);
    expect(await cpvCodeName(catalogue(null).sql, "99")).toBeNull();
    expect(["45", "4523", "45233120-6"].every(isCpvCodeTerm)).toBe(true);
    expect(["4", "medicamente", "123456789"].some(isCpvCodeTerm)).toBe(false);
  });

  it("the page keeps the name the answer brought, so the title never says „CPV 45” first (S4)", () => {
    expect(knownCpvName("45")).toBeUndefined();
    expect(knownCpvName("45", "Lucrări de construcții")).toBe("Lucrări de construcții");
    // Kept for the next title on the same code (a strip toggle, a thread), without another answer.
    expect(knownCpvName("45")).toBe("Lucrări de construcții");
    expect(knownCpvName("asfaltare", "Lucrări de construcții")).toBeUndefined();
    expect(knownCpvName(undefined)).toBeUndefined();
  });
});

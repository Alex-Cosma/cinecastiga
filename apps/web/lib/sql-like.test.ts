import { describe, expect, it } from "vitest";
import { alnumCount, likeContains, likeEscape } from "./sql-like";
import { suggestPersons, suggestSuppliers, suggestUat } from "./intent/vocabulary-queries";

/** A stand-in for postgres.js that records each query's text and bound values. */
function recordingSql() {
  const queries: { text: string; values: unknown[] }[] = [];
  const flatten = (strings: readonly string[], values: unknown[]): { text: string; values: unknown[] } => {
    let text = strings[0]!;
    const out: unknown[] = [];
    values.forEach((v, i) => {
      if (v && typeof v === "object" && "fragment" in v) {
        const inner = (v as { fragment: { text: string; values: unknown[] } }).fragment;
        text += inner.text;
        out.push(...inner.values);
      } else {
        text += `$${out.length + 1}`;
        out.push(v);
      }
      text += strings[i + 1]!;
    });
    return { text, values: out };
  };
  const sql = Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = flatten(strings, values);
    const p = Promise.resolve([]) as Promise<never[]> & { fragment: typeof q };
    p.fragment = q;
    queries.push(q);
    return p;
  }, { typed: (v: unknown) => v });
  return { sql: sql as never, queries };
}

const BACKSLASH = String.fromCharCode(92);
const escapeClause = new RegExp(`like \\$\\d+ escape '\\${BACKSLASH}'`);

describe("LIKE patterns from visitor text (audit S2F1)", () => {
  it("escapes the wildcards and the escape character", () => {
    expect(likeEscape("____")).toBe(`${BACKSLASH}_`.repeat(4));
    expect(likeEscape("100%")).toBe(`100${BACKSLASH}%`);
    expect(likeEscape(`a${BACKSLASH}b`)).toBe(`a${BACKSLASH}${BACKSLASH}b`);
    expect(likeEscape("dedeman srl")).toBe("dedeman srl");
    expect(likeContains("a_b")).toBe(`%a${BACKSLASH}_b%`);
  });

  it("counts letters and digits", () => {
    expect(alnumCount("____")).toBe(0);
    expect(alnumCount("ăb-1")).toBe(3);
  });

  it("binds the typed query escaped, with an explicit escape clause", async () => {
    const { sql, queries } = recordingSql();
    await suggestSuppliers(sql, "a_%");
    await suggestUat(sql, "__", "");
    const [supplier, uat] = queries.filter((q) => q.text.includes(" like "));
    expect(supplier!.values).toContain(`%a${BACKSLASH}_${BACKSLASH}%%`);
    expect(supplier!.text).toMatch(escapeClause);
    expect(uat!.values).toContain(`%${BACKSLASH}_${BACKSLASH}_%`);
    expect(uat!.text).toMatch(escapeClause);
  });

  it("asks ONRC only with three letters or digits", async () => {
    const { sql, queries } = recordingSql();
    for (const q of ["____", "a_b_", "%%%%", "ab--"]) expect(await suggestPersons(sql, q)).toEqual([]);
    expect(queries).toHaveLength(0);
    await suggestPersons(sql, "ion_");
    const onrc = queries.filter((q) => q.text.includes("reference.company_reps"));
    expect(onrc).toHaveLength(1);
    expect(onrc[0]!.values).toContain(`%ion${BACKSLASH}_%`);
  });
});

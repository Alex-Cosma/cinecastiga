import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { AUTHORITY_KINDS } from "./spec";
import { authorityKindCond, authorityKindExpression, authorityPeerKind, KIND_PATTERNS } from "./authority-kind";
import { authorityPeerKind as peersKind } from "../peers";

// One module for the kind of an institution (plan §2.5), with the two rules of today.

const fake = Object.assign(
  (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings: [...strings], values }),
  { array: (values: unknown[]) => ({ array: values }) },
) as unknown as DbSql;
function render(fragment: unknown): { text: string; params: unknown[] } {
  const params: unknown[] = [];
  const walk = (x: unknown): string => {
    const f = x as { strings?: string[]; values?: unknown[] };
    if (f && Array.isArray(f.strings)) return f.strings.reduce((out, s, i) => out + s + (i < f.values!.length ? walk(f.values![i]) : ""), "");
    params.push(x);
    return `$${params.length}`;
  };
  return { text: walk(fragment), params };
}
/** SQL LIKE of a folded name against a folded pattern, in JavaScript. */
const like = (name: string, pattern: string) => {
  const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return new RegExp(`^${fold(pattern).split("%").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "u").test(fold(name));
};

describe("the kind of an institution", () => {
  it("is written for Întreabă as one condition per kind, any pattern matching the folded name", () => {
    const cond = render(authorityKindCond(fake, "oras_municipiu", fake`d.authority_name`));
    expect(cond.text).toBe(`(${KIND_PATTERNS.oras_municipiu.map((_, i) => `lower(unaccent(d.authority_name)) like $${i + 1}`).join(" or ")})`);
    // Folded like unaccent(): the patterns with diacritics are sent without them.
    expect(cond.params).toEqual(["oras%", "ors%", "oras%", "munici%", "primaria %", "primaria %"]);
    expect(render(authorityKindCond(fake, "spital", fake`ef.name_display`)).text).toBe("(lower(unaccent(ef.name_display)) like $1)");
  });

  it("keeps the two rules of today: any kind it matches in Întreabă, exactly one in the peer groups", () => {
    // A commune named after a school is both in Întreabă, neither in a peer group.
    const name = "Comuna Școala Nouă";
    expect(AUTHORITY_KINDS.filter((kind) => KIND_PATTERNS[kind].some((p) => like(name, p)))).toEqual(["comuna", "scoala"]);
    expect(authorityPeerKind(name)).toBeNull();
    expect(authorityPeerKind("COMUNA Măgura")).toBe("comuna");
    expect(authorityPeerKind("Primăria Buzău")).toBe("oras_municipiu");
    expect(authorityPeerKind("Ministerul Educației")).toBeNull();
    // The peer pages read the same function.
    expect(peersKind).toBe(authorityPeerKind);
  });

  it("gives the peer groups' SQL the same rule: a kind only when exactly one matches", () => {
    const expression = render(authorityKindExpression(fake, fake`e.name_display`));
    const patterns = AUTHORITY_KINDS.flatMap((kind) => KIND_PATTERNS[kind]);
    expect(expression.text.startsWith("case when (case when (lower(unaccent(e.name_display)) like $1")).toBe(true);
    expect(expression.text).toMatch(/\)=1 then case when \(.*\) then \$\d+ .* else null end else null end$/s);
    // Every pattern twice (the count, then the case), then the kinds' names.
    const kinds = expression.params.filter((p) => (AUTHORITY_KINDS as readonly unknown[]).includes(p));
    expect(kinds).toEqual([...AUTHORITY_KINDS]);
    expect(expression.params.length).toBe(patterns.length * 2 + AUTHORITY_KINDS.length);
  });
});

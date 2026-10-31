import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import {
  inDaCode, likeAnywhere, SEARCH_LIST_CAP, searchCandidates, searchWords, storedSearchable, storedSearchCond, type SearchLists,
} from "./source-search";
import { broadSearch, budgetedRead, commonWordsSearch, searchBudgetReason, slowSearch, withSearchBudget } from "./compile";

/*
 * „Caută în surse”, names first (S5 PRE-trend): the words, the forms a word can
 * take in a code, and the candidates' condition, rendered by a fake `sql` (as
 * predicates.test.ts). That the candidates hold every record today's condition
 * keeps is the parity test's (source-search.integration.test.ts).
 */
const fake = Object.assign(
  (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings: [...strings], values }),
  { array: (values: unknown[]) => ({ array: [...values] }) },
) as unknown as DbSql;
function render(fragment: unknown): { text: string; params: unknown[] } {
  const params: unknown[] = [];
  const walk = (x: unknown): string => {
    const f = x as { strings?: string[]; values?: unknown[]; array?: unknown[] };
    if (f && Array.isArray(f.strings)) return f.strings.reduce((out, s, i) => out + s + (i < f.values!.length ? walk(f.values![i]) : ""), "");
    params.push(f && typeof f === "object" && "array" in f ? f.array : x);
    return `$${params.length}`;
  };
  return { text: walk(fragment).replace(/\s+/g, " ").trim(), params };
}
const none: SearchLists = { ids: [], codes: [], counties: [] };
const range = fake`d.finalization_date >= ${"2024"} and d.finalization_date < ${"2026"}` as unknown as ReturnType<DbSql>;

describe("searchWords", () => {
  it("folds as the drawer's condition does and splits at any whitespace, each word once", () => {
    expect(searchWords("  Spitalul   JUDEȚEAN\tspitalul ")).toEqual(["spitalul", "judetean"]);
    expect(searchWords("Țară șină")).toEqual(["tara", "sina"]);
    expect(searchWords("DA38380070")).toEqual(["da38380070"]);
  });
});

describe("inDaCode", () => {
  it("accepts only what can lie inside „DA” and digits", () => {
    for (const word of ["d", "da", "a", "da38380070", "a383", "383", "0"]) expect(inDaCode(word), word).toBe(true);
    for (const word of ["dab", "ad", "d3", "medicamente", "selgros", "38a", "-6", ""]) expect(inDaCode(word), word).toBe(false);
  });
});

describe("searchCandidates", () => {
  it("reads a name's word on the ids, codes and counties, bounded by the period, and the contract number on the row", () => {
    const out = searchCandidates(fake, ["medicamente"], [{ ids: ["7", "9"], codes: ["33600000-6"], counties: [] }], { daCodesPlain: true, range });
    expect(out?.indexed).toBe(true);
    const { text, params } = render(out!.cond);
    expect(text).toBe("((d.authority_id = any($1::bigint[]) and d.finalization_date >= $2 and d.finalization_date < $3) or "
      + "(d.supplier_id = any($4::bigint[]) and d.finalization_date >= $5 and d.finalization_date < $6) or "
      + "(d.cpv_code = any($7::text[]) and d.finalization_date >= $8 and d.finalization_date < $9) or "
      + "(d.src = 'contracts' and strpos(lower(unaccent(d.da_code)), $10) > 0))");
    expect(params).toEqual([["7", "9"], "2024", "2026", ["7", "9"], "2024", "2026", ["33600000-6"], "2024", "2026", "medicamente"]);
  });

  it("reads a code's word on every row: the record number, the CPV code and the DA code", () => {
    const code = searchCandidates(fake, ["da38380070"], [none], { daCodesPlain: true, range: null })!;
    expect(code.indexed).toBe(false);
    expect(render(code.cond).text).toBe("((d.src = 'da' and strpos(lower(unaccent(d.da_code)), $1) > 0) or (d.src = 'contracts' and strpos(lower(unaccent(d.da_code)), $2) > 0))");
    const digits = render(searchCandidates(fake, ["3360"], [{ ...none, codes: ["33600000-6"] }], { daCodesPlain: true, range: null })!.cond).text;
    expect(digits).toBe("((d.cpv_code = any($1::text[])) or strpos(d.ref_id::text, $2) > 0 or strpos(lower(unaccent(d.cpv_code)), $3) > 0 or "
      + "(d.src = 'da' and strpos(lower(unaccent(d.da_code)), $4) > 0) or (d.src = 'contracts' and strpos(lower(unaccent(d.da_code)), $5) > 0))");
  });

  it("reads every word on the DA code when a code of another form exists", () => {
    const out = searchCandidates(fake, ["selgros"], [{ ...none, ids: ["1"] }], { daCodesPlain: false, range: null })!;
    expect(out.indexed).toBe(false);
    expect(render(out.cond).text).toContain("(d.src = 'da' and strpos(lower(unaccent(d.da_code)), $3) > 0)");
  });

  it("ANDs the words; a word found nowhere keeps only the contract numbers", () => {
    const out = searchCandidates(fake, ["spitalul", "zzz"], [{ ...none, ids: ["1"] }, none], { daCodesPlain: true, range: null })!;
    expect(out.indexed).toBe(true);
    expect(render(out.cond).text).toBe("((d.authority_id = any($1::bigint[])) or (d.supplier_id = any($2::bigint[])) or "
      + "(d.src = 'contracts' and strpos(lower(unaccent(d.da_code)), $3) > 0)) and ((d.src = 'contracts' and strpos(lower(unaccent(d.da_code)), $4) > 0))");
  });

  it("leaves a word listing too many names to the recheck, and returns null when no word narrows", () => {
    const many: SearchLists = { ...none, ids: Array.from({ length: SEARCH_LIST_CAP + 1 }, (_, i) => String(i)) };
    expect(searchCandidates(fake, ["srl"], [many], { daCodesPlain: true, range: null })).toBeNull();
    const out = searchCandidates(fake, ["srl", "vaslui"], [many, { ...none, counties: ["Vaslui"] }], { daCodesPlain: true, range: null })!;
    expect(render(out.cond).text).toBe("(d.county = any($1::text[]) or (d.src = 'contracts' and strpos(lower(unaccent(d.da_code)), $2) > 0))");
  });
});

describe("a search past its budget on a broad list (S5 review)", () => {
  const timeout = () => Promise.reject(new Error("canceling statement due to statement timeout"));
  it("says what to add instead of the route's timeout, only for a budgeted read", async () => {
    expect(await withSearchBudget(() => budgetedRead(commonWordsSearch("srl"), timeout))).toEqual({ error: commonWordsSearch("srl") });
    expect(commonWordsSearch("srl")).toBe("„srl”: cuvintele apar în prea multe nume pentru toată lista. Adaugă un cuvânt mai rar: un nume, un cod sau o localitate.");
    // The route's own timeout (the list's figures, an unbudgeted search) stays an error, never „too many names”.
    await expect(withSearchBudget(timeout)).rejects.toThrow("statement timeout");
    await expect(withSearchBudget(() => budgetedRead("x", () => Promise.reject(new Error("boom"))))).rejects.toThrow("boom");
    expect(await withSearchBudget(() => budgetedRead("x", async () => 7))).toBe(7);
  });

  it("is „too many names” only when no word narrows; a code read on every row keeps the route's limit (P2)", () => {
    expect(searchBudgetReason("srl", null)).toBe(commonWordsSearch("srl"));
    expect(searchBudgetReason("s.r.l. bucuresti", { indexed: true })).toBe(slowSearch("s.r.l. bucuresti"));
    expect(slowSearch("srl bucuresti")).toBe("„srl bucuresti”: căutarea pe toată lista a durat prea mult. Încearcă din nou sau adaugă un cuvânt mai rar.");
    expect(searchBudgetReason("DA38380070", { indexed: false })).toBeNull();
  });
});

describe("the stored text (S6)", () => {
  it("reads only a text with three letters or digits in a row, which the trigram index narrows", () => {
    for (const text of ["33600000", "da38380070", "s.r.l. bucuresti", "srl", "c20_"]) expect(storedSearchable(text), text).toBe(true);
    for (const text of ["10", "-6", "a.b", "s r l", "", "ab_c"]) expect(storedSearchable(text), text).toBe(false);
  });

  it("is strpos as like: the text anywhere, with \\, % and _ written literally", () => {
    expect(likeAnywhere("medicamente")).toBe("%medicamente%");
    expect(likeAnywhere("10%_a\\b")).toBe("%10\\%\\_a\\\\b%");
  });

  it("joins the drawer's row to its stored key, a contract with its winner, within the selection's years", () => {
    const { text, params } = render(storedSearchCond(fake, "33600000", { from: 2024, to: 2025 }));
    expect(text).toBe("(d.src, d.ref_id, case when d.src = 'da' then 0::bigint else d.supplier_id end) in ( "
      + "select s.src, s.ref_id, s.sid from marts.source_search s where s.t like $1 and s.y between $2 and $3)");
    expect(params).toEqual(["%33600000%", 2024, 2025]);
    expect(render(storedSearchCond(fake, "x1y", null)).text).toMatch(/where s\.t like \$1\)$/);
    // A trend's two years with others between them: the range for the BRIN, then the two years alone.
    const pair = render(storedSearchCond(fake, "srl", { from: 2018, to: 2025, only: [2018, 2025] }));
    expect(pair.text).toMatch(/where s\.t like \$1 and s\.y between \$2 and \$3 and s\.y = any\(\$4::int\[\]\)\)$/);
    expect(pair.params).toEqual(["%srl%", 2018, 2025, [2018, 2025]]);
  });

  it("says a text found in too many records as such", () => {
    expect(broadSearch("srl")).toBe("„srl”: textul apare în prea multe înregistrări. Adaugă un cuvânt mai rar: un nume, un cod sau o localitate.");
  });
});

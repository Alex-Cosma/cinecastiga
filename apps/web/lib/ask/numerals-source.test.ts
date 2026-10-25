import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
 * G10 (plan §2.1, kit §4 "Numerale"): every number with a noun in the texts of
 * Întreabă, its builder, its answers, the interpreter and the watches goes
 * through countWords (lib/ask/answer-text.ts), which adds the «de» from 20 up
 * ("124 de înregistrări", "14 înregistrări", "113 firme"). The outputs of
 * describeConditions, the pills, the titles and the CSV message are checked
 * on the corpus (filters/describe.test.ts); this reads the sources, so a count
 * written by hand next to its noun anywhere in these folders fails here,
 * with or without a hand-written «de».
 */

const WEB = fileURLToPath(new URL("../../", import.meta.url));
const DIRS = ["app/intreaba", "lib/ask", "lib/intent", "app/urmariri"];
/** The watches' engine, whose errors reach Întreabă ("Urmărește") and /urmariri. */
const WATCH_FILES = /^monitoring[\w-]*\.ts$/;
/** Generated or frozen texts: fixtures keep the old grammars on purpose. */
const SKIP = /(?:\.test\.|\/fixtures\/|\.css$)/;

/** The nouns Întreabă counts, singular and plural. */
const NOUNS = [
  "înregistrări", "înregistrare", "firme", "firmă", "instituții", "instituție", "autorități", "autoritate", "județe", "județ",
  "entități", "entitate", "achiziții", "achiziție", "contracte", "contract", "locuitori", "angajați", "profiluri", "profil",
  "domenii", "parteneri", "condiții", "grupuri", "rezultate", "potriviri", "persoane", "identități", "localități", "semnale",
  "câmpuri", "modificări", "ani", "membri", "furnizori", "clienți", "oferte", "coduri", "subclase", "primării", "spitale",
  "categorii", "rânduri", "puncte", "linkuri", "zile", "luni",
];
/** Helpers that already apply the rule. */
const COUNTED = /countWords|entityNoun|recordsWords|employeesCount|Words\(|spokenCount/;
/** An interpolation that holds a number: a count, a length, a total, a formatted integer. */
const NUMERIC = /formatInt|toLocaleString|\.length|count|Count|total|Total|\bn\b|\bn[A-Z]\w*|\.n\b|size|population|shown|members|observed|available/;

// `${n} firme`, `{formatInt(n)} înregistrări`, `<b>{n}</b> firme`, `{n}{" "}firme`, each also with a hand-written «de».
const COUNT_THEN_NOUN = new RegExp(String.raw`(\$\{[^{}]*\}|\{[^{}]*\})(?:</(?:b|strong)>)?(?:\{" "\}|\s)+(?:de\s+)?(${NOUNS.join("|")})(?![\wăâîșț])`, "g");

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(name) && !SKIP.test(path)) out.push(path);
  }
  return out;
}

/** Offending counts in one source text, as "file:line: text". */
export function handWrittenCounts(text: string, file = ""): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(COUNT_THEN_NOUN)) {
    const expr = m[1]!;
    if (COUNTED.test(expr) || !NUMERIC.test(expr)) continue;
    const line = text.slice(0, m.index).split("\n").length;
    found.push(`${file}:${line}: ${m[0].replace(/\s+/g, " ").slice(0, 90)}`);
  }
  return found;
}

describe("numerals in the sources (G10)", () => {
  it("finds a count written by hand next to its noun, with or without «de»", () => {
    expect(handWrittenCounts("`${formatInt(n)} entități`")).toHaveLength(1);
    expect(handWrittenCounts("cele <b>{formatInt(d.total)}</b> firme")).toHaveLength(1);
    expect(handWrittenCounts("`toate cele ${formatInt(density.total)} de entități`")).toHaveLength(1);
    expect(handWrittenCounts("Top {nodes.length} parteneri")).toHaveLength(1);
    expect(handWrittenCounts("`${countWords(n, \"firmă\", \"firme\")} din județ`")).toEqual([]);
    expect(handWrittenCounts("`${formatRon(v)} achiziții directe`")).toEqual([]);
    expect(handWrittenCounts("`${p.year} achiziții`")).toEqual([]);
  });

  it("routes every count with its noun through countWords in Întreabă, the interpreter and the watches", () => {
    const watches = readdirSync(join(WEB, "lib")).filter((name) => WATCH_FILES.test(name) && !SKIP.test(name)).map((name) => join(WEB, "lib", name));
    expect(watches.length).toBeGreaterThan(3);
    const found = [...DIRS.flatMap((dir) => sources(join(WEB, dir))), ...watches]
      .flatMap((path) => handWrittenCounts(readFileSync(path, "utf8"), relative(WEB, path)));
    expect(found).toEqual([]);
  });
});

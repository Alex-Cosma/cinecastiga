import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
 * The kit's vocabulary (kit §4 "Nu folosi", plan G3, §6.1, F1b-polish): the
 * words Întreabă retired stay out of every text its builder, answers,
 * interpreter and watches write. describeConditions' outputs are checked on
 * the corpus (filters/describe.test.ts); this reads the sources, without their
 * comments, so a retired word typed into a new label fails here.
 */

const WEB = fileURLToPath(new URL("../../", import.meta.url));
const DIRS = ["app/intreaba", "lib/ask", "lib/intent", "app/urmariri"];
/** Frozen grammars, the kit's demo (which shows the words it replaces in its notes) and the tests. */
const SKIP = /(?:\.test\.|\/fixtures\/|\/trusa\/)/;
/** Sources that match a person's own words, never write them: the typed input of the old parser, the interpreter's rules and the model's prompt. */
const READS_INPUT = new Set(["lib/ask/intent.ts", "lib/ask/llm.ts", "lib/intent/rules.ts"]);
/** The register names today's administrator (kit §4 "Administratorul"): "conduse azi de", never "conduse de" alone. */
const ADMIN_WITHOUT_TODAY = /(?<!azi )[Cc]onduse de/;

export const RETIRED_WORDS = [
  "toți anii disponibili", "toate sursele", "Toată perioada", "un singur ofertant", "Un singur ofertant", "La prima apariție", "debut în arhivă",
  "Ascunde din", "Fără acest cumpărător", "De unde sunt firmele", "Ce achiziții?", "Ce perioadă?", "Cum a cumpărat?", "banii rămân", "Doar înainte",
  "Caută în grup", "+ Un domeniu", "Domeniul achiziției", "Pe ce domeniu", "Mărimea firmelor", "Sediul firmelor", "Tipul clienților", "Tipul cumpărătorilor",
  "Tipul instituțiilor", "Județul instituțiilor", "De la o anumită firmă", "De la ce firme", "Alt interval", "toată România", "Toată România",
  "Elimină condițiile", "Condiție veche", "Nu mai e oferit", "Restrânge partenerii", "Posibilă fracționare sub prag", "Lei / locuitor", "lei / locuitor",
  "Surse →", "Vezi sursele", "Adaugă o condiție", "Mai multe filtre", "Număr minim de înregistrări", "Orașe și municipii", "Școli și licee",
  "orașe/municipii", "școli/licee", "Firme străine", "consorți", "Consorți",
];

/** The source without its comments (block, JSX and line comments; never the "//" of a URL). */
export function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[\s;{}(),])\/\/.*$/gm, "$1");
}

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(name) && !SKIP.test(path)) out.push(path);
  }
  return out;
}

describe("the kit's vocabulary in the sources (kit §4)", () => {
  it("reads code, not comments", () => {
    expect(withoutComments("const a = \"x\"; // Ascunde din răspuns\n/* Surse → */ const b = \"https://ted.europa.eu\";")).toBe("const a = \"x\"; \n const b = \"https://ted.europa.eu\";");
  });

  it("never writes a word the kit retires in Întreabă, the interpreter or the watches", () => {
    const found: string[] = [];
    for (const dir of DIRS)
      for (const path of sources(join(WEB, dir))) {
        const file = relative(WEB, path);
        if (READS_INPUT.has(file)) continue;
        const code = withoutComments(readFileSync(path, "utf8"));
        for (const word of RETIRED_WORDS) if (code.includes(word)) found.push(`${file}: «${word}»`);
        if (ADMIN_WITHOUT_TODAY.test(code)) found.push(`${file}: «conduse de» without «azi»`);
      }
    expect(found).toEqual([]);
  });
});

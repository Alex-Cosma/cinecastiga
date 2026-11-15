import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Another question on /intreaba is a plain <a> or KitLink (a full load), never a next/link: AskPanel reads the
 * question from the address when the page loads and on «Înapoi», so a client navigation to the same page changed the
 * address and kept the old answer on screen. Found 15 November 2026 on „Include-le” („Cine conduce?”, since 5 November),
 * „Toate spitalele din țară” and „Caută în toată țara” (the risk cloud), the partners and „Verifică” (fact check) and
 * „Vezi achizițiile” (distribution).
 */

const ROOT = join(__dirname);
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

/** Each `<Link …>` opening tag of a file: from `<Link` to its `>` outside braces. */
function linkTags(source: string): string[] {
  const out: string[] = [];
  for (let at = source.indexOf("<Link"); at >= 0; at = source.indexOf("<Link", at + 5)) {
    if (/\w/.test(source[at + 5] ?? "")) continue;
    let depth = 0, end = at;
    for (let i = at; i < source.length; i++) {
      const c = source[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0 && source[i - 1] !== "=") { end = i; break; }
    }
    out.push(source.slice(at, end + 1));
  }
  return out;
}

describe("the links of the answers", () => {
  it("open another question with a full load, never a client navigation to the same page", () => {
    const offenders = files(ROOT).flatMap((path) => linkTags(readFileSync(path, "utf8"))
      .filter((tag) => /askLink\(|\/intreaba\?|widenHref/.test(tag))
      .map((tag) => `${relative(ROOT, path)}: ${tag.replace(/\s+/g, " ").slice(0, 120)}`));
    expect(offenders).toEqual([]);
  });

  it("finds a next/link to another question when there is one (the check reads the tags)", () => {
    expect(linkTags(`<p><Link className="x" href={askLink({ ...spec, filters: { a: 1 } })}>Mai mult</Link> <Link href="/metodologie">M</Link></p>`))
      .toEqual([`<Link className="x" href={askLink({ ...spec, filters: { a: 1 } })}>`, `<Link href="/metodologie">`]);
  });
});

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FLAG_META, flagLabel } from "./flags";

/*
 * A signal has one name on the site (plan §9, F6b; final scatter §5): its short label (FLAG_META.label, else its
 * title) in Întreabă, /semnale, the entity and contract pages, the investigations; the long title only on
 * /metodologie. A page that prints FLAG_META[…].title shows a second name for the same signal.
 */
const WEB = fileURLToPath(new URL("..", import.meta.url));
const DIRS = ["app", "components", "lib"];
/** The methodology keeps the long titles; flags.ts defines them; a search may still match them. */
const ALLOWED = new Set(["app/metodologie/page.tsx", "lib/flags.ts", "app/semnale/SignalsExplorer.tsx"]);

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { if (name !== "node_modules" && !name.startsWith(".")) sources(path, out); }
    else if (/\.(tsx?|mts)$/.test(name) && !/\.test\./.test(name)) out.push(path);
  }
  return out;
}

describe("a signal's name outside the methodology (S6 review)", () => {
  it("is its short label", () => {
    expect(flagLabel("da_round")).toBe("Aproape de prag");
    expect(FLAG_META.da_round!.title).toBe("Valoare aproape de prag");
    // A signal without a short label keeps its title.
    expect(flagLabel("award_single_bid")).toBe(FLAG_META.award_single_bid!.title);
  });

  it("is never printed from FLAG_META's title by a page", () => {
    const offenders = DIRS.flatMap((dir) => sources(join(WEB, dir)))
      .map((path) => relative(WEB, path))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => /FLAG_META\[[^\]]+\][?!]*\.title\b/.test(readFileSync(join(WEB, rel), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("is searched with the title too on /semnale, and shown as the label there", () => {
    const explorer = readFileSync(join(WEB, "app/semnale/SignalsExplorer.tsx"), "utf8");
    expect(explorer.match(/FLAG_META\[[^\]]+\][?!]*\.title\b/g)).toHaveLength(1);
    expect(explorer).toMatch(/fold\(`\$\{flagLabel\(c\)\} \$\{FLAG_META\[c\]!\.title\}/);
  });
});

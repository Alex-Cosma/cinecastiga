import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Ad blockers (EasyList, used by uBlock Origin, AdBlock, Brave) hide any element whose
// class or id is a common ad name, on every site. The direct-acquisition page used an
// "ad-" prefix ("acquisition detail") and showed up empty for those visitors (1 Nov 2026).
// No class or id in the web app may start like an ad slot.
const AD_NAME = /^(ad|ads|advert|advertisement|sponsor|sponsored)([-_]|$)/i;
const ROOTS = ["app", "components"];
const SKIP = new Set(["node_modules", ".next", ".next-preview", "_legacy"]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (SKIP.has(name)) return [];
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx|css)$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

function names(path: string, text: string): string[] {
  if (path.endsWith(".css")) return [...text.matchAll(/[.#]([A-Za-z_][\w-]*)/g)].map((m) => m[1]!);
  const attrs = [...text.matchAll(/\b(?:className|id)=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g)]
    .map((m) => (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " "));
  return attrs.flatMap((value) => value.split(/\s+/)).filter(Boolean);
}

describe("class and id names", () => {
  it("never look like an ad slot, so ad blockers do not hide our content", () => {
    const root = join(__dirname, "..");
    const hits = ROOTS.flatMap((dir) => files(join(root, dir))).flatMap((path) =>
      names(path, readFileSync(path, "utf8")).filter((name) => AD_NAME.test(name)).map((name) => `${relative(root, path)}: ${name}`));
    expect(hits).toEqual([]);
  });
});

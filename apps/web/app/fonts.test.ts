import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "fonts.css"), "utf8");
const served = readdirSync(join(here, "../public/fonts")).filter((name) => name.endsWith(".woff2")).sort();
const named = [...css.matchAll(/url\(\/fonts\/([^)]+)\)/g)].map((match) => match[1]!).sort();

describe("app/fonts.css", () => {
  it("names exactly the font files the site serves", () => {
    expect(named).toEqual(served);
  });

  it("declares every family the three font variables name", () => {
    const families = new Set([...css.matchAll(/@font-face\{font-family:'([^']+)'/g)].map((match) => match[1]));
    const used = [...css.matchAll(/--font-(?:display|body|mono):'([^']+)'/g)].map((match) => match[1]);
    expect(used).toHaveLength(3);
    for (const family of used) expect(families).toContain(family);
  });

  it("sizes a face inside its own declaration, never with font-size-adjust", () => {
    expect(css).not.toMatch(/font-size-adjust\s*:/);
  });
});

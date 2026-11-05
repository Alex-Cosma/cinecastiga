import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Audit P3F1 (5 Nov 2026): the entity page imported useTip from blocks.tsx, which brought the Ask answer renderers into
 * that page's bundle (287 → 214 KB gzip once moved). The entity page reads the hook from its own module.
 */
describe("useTip module", () => {
  it("keeps the entity page off blocks.tsx", () => {
    const dir = new URL("../entitati/[id]/", import.meta.url);
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const src = readFileSync(new URL(file, dir), "utf8");
      expect(src, file).not.toMatch(/from "(?:\.\.\/)+intreaba\/blocks"/);
    }
  });

  it("is still re-exported by blocks.tsx for the Ask renderers", () => {
    const blocks = readFileSync(new URL("./blocks.tsx", import.meta.url), "utf8");
    expect(blocks).toContain('export { useTip, type TipBind } from "./use-tip";');
  });
});

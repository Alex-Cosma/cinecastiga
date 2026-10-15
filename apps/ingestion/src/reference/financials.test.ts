import { afterAll, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTxt } from "./financials.js";
import { financialSpecCodes } from "./parsers.js";

const dir = mkdtempSync(join(tmpdir(), "seap-financial-parser-"));
const file = join(dir, "data.txt");
afterAll(() => rmSync(dir, { recursive: true, force: true }));
it("imports exact profit and explicit zero; last CUI occurrence wins", () => {
  writeFileSync(file, "CUI,CAEN,I24\n100,1234,1\n200,,0\n100,1234,9007199254740993.12\n300,,\n");
  const rows = parseTxt(file, "CUSTOM", 2025, 2025, financialSpecCodes("Profit net;i24"), true);
  expect(rows.map((r) => [r.cui, r.profit_net])).toEqual([
    ["100", "9007199254740993.12"], ["200", "0"], ["300", null],
  ]);
});
it("uses no standard fallback for a category spec without these metrics", () => {
  writeFileSync(file, "CUI,CAEN,I18,I20\n100,,1000,500\n");
  const rows = parseTxt(file, "INST_DE_CREDIT", 2025, 2025, {}, true);
  expect(rows[0]).toMatchObject({ profit_net: null, employees: null });
  expect(parseTxt(file, "UU", 2025, 2025, {}, false)[0]!.profit_net).toBeNull();
});
it("fails if a changed file header cannot satisfy the paired spec", () => {
  writeFileSync(file, "CUI,CAEN,I19\n100,,1\n");
  expect(() => parseTxt(file, "UU", 2025, 2025, { profit_net: "I18" }, true)).toThrow("missing from header");
});

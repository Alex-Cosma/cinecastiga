import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as siteLinks from "./site-links";
import { encodeSpec } from "./permalink";
import { NEWER_VERSION_LINK, validateSpec } from "./spec";
import { localityScopeError } from "./question-ui";
import { legacyCorpus } from "./fixtures/legacy-corpus";
import { FIXTURE_IDENTITIES } from "./fixtures/golden-fixture";
import { SITE_LINK_INVENTORY, SITE_LINK_PATTERN, SPEC_BUILDERS } from "./fixtures/site-links-inventory";
import type { GoldenRecord } from "./fixtures/golden-run";

const web = fileURLToPath(new URL("../..", import.meta.url));
const corpus = legacyCorpus(FIXTURE_IDENTITIES);
const ids = new Set(corpus.map((e) => e.id));

function linkFiles(): Map<string, number> {
  const found = new Map<string, number>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { if (!["node_modules", "fixtures"].includes(entry.name) && !entry.name.startsWith(".")) walk(path); continue; }
      if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
      const n = readFileSync(path, "utf8").match(SITE_LINK_PATTERN)?.length ?? 0;
      if (n) found.set(relative(web, path), n);
    }
  };
  for (const dir of ["app", "components", "lib"]) walk(join(web, dir));
  return found;
}

describe("links into Întreabă from the rest of the site (plan §2.6)", () => {
  it("lists every file that builds, hands over or relays a question, with its count of links", () => {
    const listed = new Map(SITE_LINK_INVENTORY.map((f) => [f.file, f.occurrences]));
    // A new link must enter fixtures/site-links-inventory.ts and, for a producer, the legacy corpus.
    expect(Object.fromEntries(linkFiles())).toEqual(Object.fromEntries(listed));
  });

  it("runs every producer and derived link, and every shared spec builder, in the legacy corpus", () => {
    for (const file of SITE_LINK_INVENTORY) {
      if (file.kind !== "producer" && file.kind !== "derived") continue;
      expect(file.corpus?.length, file.file).toBeGreaterThan(0);
      for (const id of file.corpus ?? []) expect(ids.has(id), `${file.file}: ${id}`).toBe(true);
    }
    for (const module of SPEC_BUILDERS) for (const id of module.corpus) expect(ids.has(id), `${module.module}: ${id}`).toBe(true);
    for (const name of Object.keys(siteLinks))
      expect(corpus.some((e) => e.source.includes(`site-links.ts ${name}`)), `site-links.ts ${name} has no corpus entry`).toBe(true);
  });

  // The builders moved out of the pages unchanged: the same JSON, so every existing permalink keeps its bytes.
  it("builds byte-identical permalinks to the pages' former inline specs", () => {
    const old = (spec: unknown) => encodeSpec(spec);
    expect(encodeSpec(siteLinks.entityChannelSpec("12", "Comuna X", "authority", "da")))
      .toBe(old({ block: "stat", measure: "value", dataset: "da", filters: { authorityName: "Comuna X", authorityId: 12 } }));
    expect(encodeSpec(siteLinks.entityChannelSpec("34", "Firma Y", "supplier", "all")))
      .toBe(old({ block: "stat", measure: "value", dataset: "all", filters: { supplierName: "Firma Y", supplierId: 34 } }));
    expect(encodeSpec(siteLinks.personFirmsSpec("k|1970-01-01|x", "ION X")))
      .toBe(old({ block: "table", dim: "supplier", measure: "value", filters: { adminPersonKey: "k|1970-01-01|x", adminName: "ION X" } }));
    expect(encodeSpec(siteLinks.entityMonthSpec("34", "Firma Y", "supplier", "2025", 12)))
      .toBe(old({ block: "stat", measure: "value", dataset: "da", filters: { supplierId: 34, supplierName: "Firma Y", yearFrom: 2025, yearTo: 2025, monthFrom: 12, monthTo: 12 } }));
    expect(encodeSpec(siteLinks.pairSpec({ id: "12", name: "Comuna X" }, { id: "34", name: "Firma Y" })))
      .toBe(old({ block: "stat", measure: "value", filters: { authorityName: "Comuna X", supplierName: "Firma Y", authorityId: 12, supplierId: 34 } }));
    expect(encodeSpec(siteLinks.domainContextSpec("table", "45", 2025, "supplier")))
      .toBe(old({ block: "table", dataset: "all", measure: "value", dim: "supplier", topN: 10, filters: { cpvTerm: "45", yearFrom: 2025, yearTo: 2025 } }));
    expect(encodeSpec(siteLinks.domainContextSpec("timeseries", "45", 2025)))
      .toBe(old({ block: "timeseries", dataset: "all", measure: "value", filters: { cpvTerm: "45", yearFrom: 2025, yearTo: 2025 } }));
    expect(encodeSpec(siteLinks.personClipSpec("k"))).toBe(old({ block: "table", measure: "value", dim: "supplier", filters: { adminPersonKey: "k" } }));
    expect(encodeSpec(siteLinks.NATIONAL_DA_COUNT_SPEC))
      .toBe(old({ block: "stat", dataset: "da", measure: "count", filters: {}, population: { operator: "and", groups: [{ operator: "and", conditions: [{ field: "value", op: "lte", value: "2000000" }] }] } }));
    expect(encodeSpec(siteLinks.ROADS_RANKING_SPEC)).toBe(old({ block: "table", dataset: "all", dim: "supplier", measure: "value", topN: 10, filters: { cpvTerm: "drumuri" } }));
    expect(encodeSpec(siteLinks.NATIONAL_MAP_SPEC)).toBe(old({ block: "map", dataset: "all", measure: "value", filters: {} }));
  });
});

// Without a test database the golden answers cannot run; the refusals that never reach the database still can.
describe("the legacy corpus refuses today what it refused when the golden file was written", () => {
  const golden = JSON.parse(readFileSync(new URL("./fixtures/golden-legacy.json", import.meta.url), "utf8")) as { records: GoldenRecord[] };
  it.each(corpus.map((e) => [e.id, e] as const))("%s", (id, entry) => {
    const record = golden.records.find((r) => r.id === id);
    expect(record, "regenerate fixtures/golden-legacy.json with GOLDEN_UPDATE=1").toBeDefined();
    const parsed = validateSpec(entry.spec, { refuseNewer: NEWER_VERSION_LINK });
    const refusal = "error" in parsed ? { status: parsed.newer ? 422 : 400, error: parsed.error }
      : localityScopeError(parsed) ? { status: 400, error: localityScopeError(parsed) } : null;
    if (record!.answer["status"] === 400 || record!.answer["status"] === 422) expect(refusal).toEqual({ status: record!.answer["status"], error: record!.answer["error"] });
    else expect(refusal).toBeNull();
  });
});

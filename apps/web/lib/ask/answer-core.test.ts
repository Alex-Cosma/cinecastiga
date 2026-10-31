import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  alignAnswerVersions, ANSWER_VERSIONS, answerCore, answerVersion, canonicalJson, isFirstAnswerVersion, KEY_VERSION_NOTES, KEY_VERSIONS, keyVersionNotes,
  readAnswerVersion, sameAnswerCore, sameAnswerVersion,
} from "./answer-core";
import { FILTERS } from "./filters/registry";
import { SCOPE_CHANGES } from "./filters/today";
import { personClipSpec } from "./site-links";
import { BLOCKS, type AskSpec } from "./spec";
import { comparableMethodologies, methodologiesDiffer } from "../monitoring-shared";
import { BUZAU_LIST } from "./fixtures/distribution-screen";

// The answer versions and the core a watch compares (plan §2.8, §6.2).

const stat: AskSpec = { block: "stat", measure: "value", filters: { county: "Cluj" } };
const trend: AskSpec = { block: "trend", dim: "supplier", measure: "value", filters: { yearFrom: 2024, yearTo: 2025 } };
const map: AskSpec = { block: "map", measure: "value", filters: {} };
const hospitals: AskSpec = { block: "stat", measure: "value", filters: { authorityKind: "spital" } };
const smallFirms: AskSpec = { block: "table", dim: "supplier", measure: "value", topN: 10, filters: { maxEmployees: 9 } };
const smallFirmsBuyers: AskSpec = { ...smallFirms, dim: "authority" };
const person = personClipSpec("popescu ion|1970-01-01|cluj");
/** A run as stored by monitoring-engine.ts, with this question's answer version, or none (a run from before F0). */
const run = (spec: AskSpec, withAnswer = true) => ({ version: "monitoring-1", refresh: { version: "fixture-v1" }, ...(withAnswer ? { answer: answerVersion(spec) } : {}) });
/** The key versions this release declares (D1: kind-2, F3: table:employees-2). Each test starts from F0 (none) and bumps what it needs. */
const DECLARED = { ...KEY_VERSIONS };
/** The versions of the D1 and F3 releases, as declared. */
const bumpKind = () => { KEY_VERSIONS.kind = DECLARED.kind!; };
const bumpEmployees = () => { KEY_VERSIONS["table:employees"] = DECLARED["table:employees"]!; };

beforeEach(() => { for (const id of Object.keys(KEY_VERSIONS)) delete KEY_VERSIONS[id]; });
/** The versions of this release (F2: trend-2), restored after every test. */
const RELEASED = { ...ANSWER_VERSIONS };
/** As a run stored before F2 computed it: no block bumped. */
const beforeF2 = () => { delete ANSWER_VERSIONS.trend; };
afterEach(() => {
  for (const block of Object.keys(ANSWER_VERSIONS)) delete ANSWER_VERSIONS[block as keyof typeof ANSWER_VERSIONS];
  Object.assign(ANSWER_VERSIONS, RELEASED);
  for (const id of Object.keys(KEY_VERSIONS)) delete KEY_VERSIONS[id];
  Object.assign(KEY_VERSIONS, DECLARED);
});

describe("the key versions of this release", () => {
  it("are D1's kind and F3's employees on a ranking of firms: one alert each, with its note", () => {
    expect(Object.keys(DECLARED)).toEqual(["kind", "table:employees", "seat", "uat", "table:per-capita"]);
    // F3 (plan §4.2, DECISIONS F1b-s-employees): the employees of a ranking of firms are a group (CÂȘTIGĂTORII); only „% din total” changes.
    expect(DECLARED["table:employees"]).toMatchObject({ version: "table:employees-2", label: "Angajații firmelor", paths: ["filters.minEmployees", "filters.maxEmployees"], blocks: ["table"] });
    expect(KEY_VERSION_NOTES["table:employees-2"]).toBe("Angajații restrâng acum doar lista firmelor; totalul și „% din total” sunt ale întregii selecții.");
    expect(DECLARED.kind).toMatchObject({ version: "kind-2", label: "Tipul instituției", paths: ["filters.authorityKind"] });
    Object.assign(KEY_VERSIONS, DECLARED);
    expect(answerVersion(hospitals)).toEqual({ question: "stat-1", conditions: { kind: "kind-2" } });
    expect(answerVersion(stat)).toEqual({ question: "stat-1", conditions: {} });
    // The local administrations (F5's local_admin, the map's) are new with F5: no D1 version.
    expect(answerVersion({ ...hospitals, filters: { authorityKind: "local_admin" } })).toEqual({ question: "stat-1", conditions: {} });
    // Only the kinds D1 and D2 corrected: schools keep their institutions and records; D2 adds three county councils.
    for (const kind of ["comuna", "oras_municipiu", "spital", "consiliu_judetean"] as const)
      expect([kind, answerVersion({ ...hospitals, filters: { authorityKind: kind } }).conditions]).toEqual([kind, { kind: "kind-2" }]);
    for (const kind of ["scoala"] as const)
      expect([kind, answerVersion({ ...hospitals, filters: { authorityKind: kind } }).conditions]).toEqual([kind, {}]);
    expect(KEY_VERSION_NOTES["kind-2"]).toBe("Tipul instituției a fost corectat (primăriile din registrul localităților, spitalele cu institutele clinice, toate cele 41 de consilii județene).");
  });

  it("are D2's town hall, only where it gained an identity, and the per-inhabitant list on a ranking: one alert each", () => {
    Object.assign(KEY_VERSIONS, DECLARED);
    const cluj: AskSpec = { block: "stat", dataset: "all", measure: "value", filters: { uatSiruta: 54975, uatName: "Municipiul Cluj-Napoca (Cluj)" } };
    // The answer of a town hall that gained an identity (runSpec's uatJoined), and only that one.
    expect(answerVersion(cluj, { uatJoined: true }).conditions).toEqual({ uat: "uat-2" });
    expect(answerVersion(cluj).conditions).toEqual({});
    expect(answerVersion(stat, { uatJoined: true }).conditions).toEqual({});
    expect(KEY_VERSION_NOTES["uat-2"]).toBe("Primăria cuprinde acum toate identitățile ei din SEAP.");
    // A restored link has not run: no note on every town hall, the answer carries it where it moved (S5 review).
    expect(keyVersionNotes(cluj)).toEqual([]);
    // The per-inhabitant list (41 county councils): its rankings, not the map of local_admin, new with F5.
    const perCapita: AskSpec = { block: "table", dim: "authority", measure: "value_per_capita", topN: 10, filters: {} };
    expect(answerVersion(perCapita).conditions).toEqual({ "table:per-capita": "table:per-capita-2" });
    expect(answerVersion({ ...perCapita, measure: "value" }).conditions).toEqual({});
    expect(answerVersion({ block: "map", measure: "value_per_capita", filters: { authorityKind: "local_admin" } } as AskSpec).conditions).toEqual({});
    expect(KEY_VERSION_NOTES["table:per-capita-2"]).toBe("Lista pe locuitor are acum toate cele 41 de consilii județene.");
  });

  it("give a restored question the note of each key version it carries («Ce se schimbă»)", () => {
    Object.assign(KEY_VERSIONS, DECLARED);
    expect(keyVersionNotes(hospitals)).toEqual([KEY_VERSION_NOTES["kind-2"]]);
    expect(keyVersionNotes({ block: "table", dim: "authority", measure: "value", topN: 10, filters: { authorityKind: "comuna", county: "Ilfov" } })).toEqual([KEY_VERSION_NOTES["kind-2"]]);
    expect(keyVersionNotes({ ...hospitals, filters: { authorityKind: "scoala" } })).toEqual([]);
    expect(keyVersionNotes(stat)).toEqual([]);
    // F3's note on a ranking of firms only: not on institutions, nor on a total with the same employees (F4's seat beside it).
    expect(keyVersionNotes(smallFirms)).toEqual([KEY_VERSION_NOTES["table:employees-2"], KEY_VERSION_NOTES["seat-2"]]);
    expect(keyVersionNotes(smallFirmsBuyers)).toEqual([]);
    expect(keyVersionNotes({ ...smallFirms, block: "stat" })).toEqual([]);
    // A version without a note says nothing.
    const note = KEY_VERSION_NOTES["table:employees-2"]!;
    delete KEY_VERSION_NOTES["table:employees-2"];
    try { expect(keyVersionNotes(smallFirms)).toEqual([KEY_VERSION_NOTES["seat-2"]]); } finally { KEY_VERSION_NOTES["table:employees-2"] = note; }
  });

  it("are F4's seat on every answer of before it that shows a firm's own county: one alert, with its note (owner-seat-switch)", () => {
    expect(DECLARED.seat).toMatchObject({ version: "seat-2", label: "Sediul firmei", paths: ["block"] });
    expect(KEY_VERSION_NOTES["seat-2"]).toBe("Județul firmei e acum sediul ei: ultima înmatriculare la Registrul Comerțului, apoi SEAP; firmele străine apar separat.");
    Object.assign(KEY_VERSIONS, DECLARED);
    const firms = (spec: Omit<AskSpec, "measure">) => answerVersion({ measure: "value", ...spec } as AskSpec).conditions.seat;
    // The county beside each firm: a ranking, a trend, the cloud and „Cine conduce?” of firms, two firms compared.
    for (const spec of [smallFirms, trend, { block: "scatter", dim: "supplier", filters: {} }, { block: "entity_card", dim: "supplier", rankBy: "value", filters: {} },
      { block: "entity_card", dim: "supplier", filters: { county: "Cluj" } }, { block: "compare", filters: { supplierId: 1, compareWithId: 2 } },
      { block: "distribution", filters: { supplierId: 1, county: "Cluj" } }] as const)
      expect([spec.block, firms(spec as Omit<AskSpec, "measure">)]).toEqual([spec.block, "seat-2"]);
    // No firm's county: institutions, a total, a map by the buyers' counties, a firm's network, a firm placed among every firm.
    for (const spec of [smallFirmsBuyers, stat, map, { block: "scatter", dim: "authority", filters: { county: "Cluj" } }, { block: "network", filters: { supplierId: 1 } },
      { block: "compare", filters: { authorityId: 1, compareWithId: 2 } }, { block: "distribution", filters: { supplierId: 1 } }] as const)
      expect([spec.block, firms(spec as Omit<AskSpec, "measure">)]).toEqual([spec.block, undefined]);
    // F4's own keys could not be asked before it: no version on a question that shows no firm's county.
    expect(firms({ block: "stat", filters: { firmSeat: "other" } })).toBeUndefined();
    // Run on the SEAP county (the seat column not filled yet): the answer of before F4, no seat-2; the other keys stay.
    const unfilled = answerVersion(smallFirms, { seatColumn: false });
    expect([unfilled.conditions.seat, unfilled.conditions["table:employees"]]).toEqual([undefined, "table:employees-2"]);
  });
});

describe("the version of an answer", () => {
  it("is the block's, then each key's the question carries; F2 changed the trend's, F4 the network's and the flow's, F6a the distribution's and the verification's, F6c the leader's (entity_card-2)", () => {
    expect(ANSWER_VERSIONS).toEqual({ trend: "trend-2", network: "network-2", sankey: "sankey-2", distribution: "distribution-2", fact_check: "fact_check-2", entity_card: "entity_card-2" });
    expect(KEY_VERSIONS).toEqual({});
    for (const block of BLOCKS)
      expect(answerVersion({ block, measure: "value", filters: {} })).toEqual({ question: ANSWER_VERSIONS[block] ?? `${block}-1`, conditions: {} });
    bumpKind(); bumpEmployees();
    expect(answerVersion(hospitals)).toEqual({ question: "stat-1", conditions: { kind: "kind-2" } });
    expect(answerVersion(stat)).toEqual({ question: "stat-1", conditions: {} });
    expect(answerVersion(smallFirms)).toEqual({ question: "table-1", conditions: { "table:employees": "table:employees-2" } });
    expect(answerVersion(smallFirmsBuyers)).toEqual({ question: "table-1", conditions: {} });
    expect(answerVersion({ ...smallFirms, block: "stat" })).toEqual({ question: "stat-1", conditions: {} });
    expect(answerVersion(trend)).toEqual({ question: "trend-2", conditions: {} });
    expect(answerVersion(person)).toEqual({ question: "table-1", conditions: {} });
  });

  it("reads a run from before F0 as \"<block>-1\" and a condition without a version as \"<id>-1\"", () => {
    expect(readAnswerVersion(undefined, "trend")).toEqual({ question: "trend-1", conditions: {} });
    expect(readAnswerVersion({ question: "trend-2", conditions: { kind: "kind-2", bad: 3 } }, "trend")).toEqual({ question: "trend-2", conditions: { kind: "kind-2" } });
    expect(alignAnswerVersions({ question: "stat-1", conditions: {} }, { question: "stat-1", conditions: { kind: "kind-2" } }))
      .toEqual([{ question: "stat-1", conditions: { kind: "kind-1" } }, { question: "stat-1", conditions: { kind: "kind-2" } }]);
    expect(sameAnswerVersion({ question: "stat-1", conditions: {} }, { question: "stat-1", conditions: { kind: "kind-1" } })).toBe(true);
    expect(sameAnswerVersion({ question: "stat-1", conditions: {} }, { question: "stat-1", conditions: { kind: "kind-2" } })).toBe(false);
  });

  it("is the first one, which a watch does not store, until a release bumps it (a revert below F0 then compares equal)", () => {
    for (const block of BLOCKS) expect(isFirstAnswerVersion(answerVersion({ block, measure: "value", filters: {} }), block), block).toBe(!(block in RELEASED));
    beforeF2();
    expect(isFirstAnswerVersion(answerVersion(trend), "trend")).toBe(true);
    Object.assign(ANSWER_VERSIONS, RELEASED);
    bumpKind();
    expect(isFirstAnswerVersion(answerVersion(stat), "stat")).toBe(true);
    expect(isFirstAnswerVersion(answerVersion(hospitals), "stat")).toBe(false);
    expect(isFirstAnswerVersion(answerVersion(trend), "trend")).toBe(false);
  });

  it("is well formed, and covers every key that leaves the records for a group (plan §2.2)", () => {
    bumpKind(); bumpEmployees();
    for (const [block, version] of Object.entries(ANSWER_VERSIONS)) expect(version).toMatch(new RegExp(`^${block}-([2-9]|[1-9]\\d+)$`));
    for (const [id, key] of Object.entries(KEY_VERSIONS)) {
      expect(key.version.startsWith(`${id}-`) && Number(key.version.slice(id.length + 1)) >= 2, id).toBe(true);
      expect(BLOCKS as readonly string[], id).not.toContain(id);
      expect(key.label.length, id).toBeGreaterThan(0);
    }
    for (const change of SCOPE_CHANGES) {
      const block = change.form.split(":")[0]!;
      const keys: readonly string[] = FILTERS[change.filter].keys;
      // "<block>-1": the scope moved but the answer did not ("Cine conduce?" by value shows the same first firm, F3r-leader-version).
      const unchanged = change.version === `${block}-1` && ANSWER_VERSIONS[block as keyof typeof ANSWER_VERSIONS] === undefined;
      const covered = unchanged || ANSWER_VERSIONS[block as keyof typeof ANSWER_VERSIONS] === change.version
        || Object.values(KEY_VERSIONS).some((key) => key.version === change.version && key.paths.some((path) => keys.includes(path))
          && (!key.blocks || key.blocks.includes(block as never)));
      expect(covered, `${change.filter} on ${change.form}: ${change.version}`).toBe(true);
    }
  });
});

describe("what a watch compares between two checks", () => {
  it("a run from before F0 against one of today: no change, but on a trend (trend-2, once)", () => {
    for (const spec of [stat, map, hospitals, smallFirms, person])
      expect(methodologiesDiffer(run(spec, false), run(spec), spec.block), spec.block).toBe(false);
    expect(methodologiesDiffer(run(trend, false), run(trend), "trend")).toBe(true);
  });

  it("the trend's new version (F2) changes the methodology of trend watches only, once", () => {
    beforeF2();
    const before = Object.fromEntries([stat, trend, map].map((spec) => [spec.block, run(spec)]));
    Object.assign(ANSWER_VERSIONS, RELEASED);
    const after = Object.fromEntries([stat, trend, map].map((spec) => [spec.block, run(spec)]));
    expect(methodologiesDiffer(before.trend!, after.trend!, "trend")).toBe(true);
    expect(methodologiesDiffer(before.stat!, after.stat!, "stat")).toBe(false);
    expect(methodologiesDiffer(before.map!, after.map!, "map")).toBe(false);
    // The next check compares trend-2 with trend-2.
    expect(methodologiesDiffer(after.trend!, run(trend), "trend")).toBe(false);
  });

  it("a key's version alerts only the questions that carry it; the person's firms never", () => {
    const specs = [stat, hospitals, smallFirms, smallFirmsBuyers, person, trend];
    const before = specs.map((spec) => run(spec));
    bumpKind(); bumpEmployees();
    const changed = specs.filter((spec, i) => methodologiesDiffer(before[i]!, run(spec), spec.block));
    expect(changed).toEqual([hospitals, smallFirms]);
    // A run stored before F0, against the new version, alerts as well.
    expect(methodologiesDiffer(run(hospitals, false), run(hospitals), "stat")).toBe(true);
  });

  it("a changed refresh methodology is still a change, as before", () => {
    expect(methodologiesDiffer(run(stat), { ...run(stat), refresh: { version: "fixture-v2" } }, "stat")).toBe(true);
  });

  it("shows both sides with the same answer fields, so \"Ce s-a schimbat\" lists only what changed", () => {
    const before = run(hospitals, false);
    bumpKind();
    const [a, b] = comparableMethodologies(before, run(hospitals), "stat");
    expect(a!.answer).toEqual({ question: "stat-1", conditions: { kind: "kind-1" } });
    expect(b.answer).toEqual({ question: "stat-1", conditions: { kind: "kind-2" } });
    expect(comparableMethodologies(null, run(stat), "stat")).toEqual([null, run(stat)]);
  });

  it("leaves out what F3 adds for the screen alone: an evolution's marker, a breakdown's every group and channels", () => {
    const series = { block: "timeseries", series: [{ year: 2025, value: 10, count: 1 }] };
    expect(sameAnswerCore("timeseries", series, { ...series, ref: { year: 2025, months: [1, 8], value: 4, count: 1, current: { value: 5, count: 1 } } })).toBe(true);
    // Its options are the question's own: a split or month by month is another core.
    expect(sameAnswerCore("timeseries", series, { ...series, grain: "month" })).toBe(false);
    const slices = { block: "breakdown", slices: [{ code: "45", name: "A", value: 10, count: 1 }], other: { value: 0, count: 0 } };
    expect(sameAnswerCore("breakdown", slices, { ...slices, base: slices.slices, streams: { da: { value: 1, count: 1 }, contracts: { value: 9, count: 1 } } })).toBe(true);
  });

  it("on a distribution (distribution-2), compares the group and the position, never the words, the facts or the country's marks", () => {
    const data = { block: "distribution", distribution: BUZAU_LIST };
    const core = answerCore("distribution", data) as { distribution: Record<string, unknown> };
    expect(Object.keys(core.distribution).sort()).toEqual(["focal", "group", "hist", "members", "perCriterion", "position", "role", "status", "version"]);
    // A country's mark, the words or the coverage of the band move: not a change of this watch.
    const country = { ...BUZAU_LIST, countryTotal: 15_800, perCriterion: BUZAU_LIST.perCriterion!.map((c) => ({ ...c, country: c.country + 1 })) };
    const words = { ...BUZAU_LIST, group: { ...BUZAU_LIST.group, words: "altfel", coverage: { inBand: 33, identified: 31, missing: [] } } };
    for (const after of [country, words]) expect(sameAnswerCore("distribution", data, { block: "distribution", distribution: after })).toBe(true);
    // A member that gains a criterion, or the entity's own criteria, are.
    const member = { ...BUZAU_LIST, members: BUZAU_LIST.members!.map((m, i) => i === 0 ? { ...m, nFlags: 3 } : m) };
    const own = { ...BUZAU_LIST, focal: { ...BUZAU_LIST.focal, nFlags: 2 } };
    for (const after of [member, own]) expect(sameAnswerCore("distribution", data, { block: "distribution", distribution: after })).toBe(false);
    // An answer of distribution-1 (buckets, a percentile) is compared whole; the alert is the methodology's (distribution-2).
    const v1 = { block: "distribution", distribution: { buckets: [], focal: { entityId: "1", name: "X", cri: 0.2, percentile: 40 }, role: "authority", totalEntities: 9 } };
    expect(answerCore("distribution", v1)).toBe(v1);
    const spec = { block: "distribution", measure: "value", filters: { authorityId: 1 } } as AskSpec;
    delete ANSWER_VERSIONS.distribution;
    const before = run(spec);
    Object.assign(ANSWER_VERSIONS, RELEASED);
    expect(methodologiesDiffer(before, run(spec), "distribution")).toBe(true);
    expect(methodologiesDiffer(run(spec), run(spec), "distribution")).toBe(false);
  });

  it("on a verification (fact_check-2), compares the verdict and the selection's figures, never its profile, list, weight or the relation around it", () => {
    const fact = { version: 2, state: "yes", verdict: true, authority: { entityId: "1", name: "A", cui: "11", county: "Buzau" }, supplier: { entityId: "2", name: "B" },
      count: 3, value: 900, yearFirst: 2024, yearLast: 2025, samples: [{ daCode: "DA1", date: "2025-01-02", cpvName: "x", value: 500 }],
      undated: { count: 0, value: 0 }, channels: { da: { count: 3, value: 900 }, contracts: { count: 0, value: 0 } },
      frameworks: { count: 0, ceiling: 0, inSums: 0, inSumsCeiling: 0, rows: [] }, excluded: { count: 0, rows: [] },
      share: { ofSupplier: { rank: 1, of: 4, share: 0.5 }, ofAuthority: { rank: 9, of: 90, share: 0.01 } }, relation: { count: 9, value: 2000, yearFirst: 2019, yearLast: 2025, frameworks: 0, excluded: 0 },
      coverage: { da: "2026-09-25", contracts: "2026-09-25" }, years: [{ year: 2024, count: 1, value: 400 }], domains: [], competition: null, consortium: null, partners: null, twins: [] };
    const data = { block: "fact_check", fact };
    const core = answerCore("fact_check", data) as { fact: Record<string, unknown> };
    expect(Object.keys(core.fact).sort()).toEqual(["authority", "channels", "count", "excluded", "frameworks", "state", "supplier", "undated", "value", "version"]);
    // Other clients of the firm, the data's last day, the relation outside the period, a new largest record of the same total: not a change.
    for (const after of [{ ...fact, share: { ...fact.share, ofSupplier: { rank: 2, of: 5, share: 0.4 } } }, { ...fact, coverage: { da: "2026-10-25", contracts: "2026-10-25" } },
      { ...fact, relation: { ...fact.relation, count: 10 } }, { ...fact, samples: [] }])
      expect(sameAnswerCore("fact_check", data, { block: "fact_check", fact: after })).toBe(true);
    // A new record, a ceiling found, a row leaving the sums, the verdict: a change.
    for (const after of [{ ...fact, count: 4, value: 950 }, { ...fact, frameworks: { ...fact.frameworks, count: 1, ceiling: 7 } },
      { ...fact, excluded: { count: 1, rows: [] } }, { ...fact, state: "no" }])
      expect(sameAnswerCore("fact_check", data, { block: "fact_check", fact: after })).toBe(false);
    // An answer of fact_check-1 is compared whole; the alert is the methodology's, once.
    const v1 = { block: "fact_check", fact: { verdict: true, count: 3, value: 900, samples: [] } };
    expect(answerCore("fact_check", v1)).toBe(v1);
    const spec = { block: "fact_check", measure: "value", filters: { authorityId: 1, supplierId: 2 } } as AskSpec;
    delete ANSWER_VERSIONS.fact_check;
    const before = run(spec);
    Object.assign(ANSWER_VERSIONS, RELEASED);
    expect(methodologiesDiffer(before, run(spec), "fact_check")).toBe(true);
    expect(methodologiesDiffer(run(spec), run(spec), "fact_check")).toBe(false);
  });

  it("compares the core of the answer as jsonb does: key order does not count, array order does", () => {
    const data = { block: "table", rows: [{ entityId: "1", value: 10, name: "A" }, { entityId: "2", value: 5, name: "B" }], total: 2 };
    expect(answerCore("table", data)).toBe(data);
    expect(sameAnswerCore("table", data, { total: 2, rows: [{ name: "A", value: 10, entityId: "1" }, { name: "B", entityId: "2", value: 5 }], block: "table" })).toBe(true);
    expect(sameAnswerCore("table", data, { ...data, rows: [...data.rows].reverse() })).toBe(false);
    expect(sameAnswerCore("table", data, { ...data, total: 3 })).toBe(false);
    // As stored: an undefined field is absent, NaN is null.
    expect(sameAnswerCore("stat", { stat: { value: 1, note: undefined } }, { stat: { value: 1 } })).toBe(true);
    expect(canonicalJson({ b: [2, { d: 1, c: NaN }], a: null })).toBe('{"a":null,"b":[2,{"c":null,"d":1}]}');
    expect(canonicalJson(undefined)).toBe("null");
  });

  it("on a trend (trend-2), compares only the chosen group: its rows and its own totals, never the other groups or the row facts", () => {
    const row = (entityId: string, valueA: number, valueB: number) => ({ entityId, name: `Firma ${entityId}`, county: "Cluj", valueA, valueB });
    const growths = [row("1", 10, 30), row("2", 5, 9)];
    const answer = {
      block: "trend", yearA: 2024, yearB: 2025, change: "up", months: { from: 1, to: 12, mode: "auto" }, list: "up", rowsTrend: growths,
      groups: { all: [row("3", 50, 0), ...growths], up: growths, new: [], first: [], down: [], gone: [row("3", 50, 0)] },
      composition: { all: { count: 3, valueA: 65, valueB: 39 }, up: { count: 2, valueA: 15, valueB: 39 }, gone: { count: 1, valueA: 50, valueB: 0 }, equal: { count: 0, valueA: 0, valueB: 0 } },
      noun: "firme", rowFacts: { "1": { year: 2025, value: 30, joint: 0 } },
    };
    expect(answerCore("trend", answer)).toEqual({
      block: "trend", yearA: 2024, yearB: 2025, change: "up", months: { from: 1, to: 12, mode: "auto" }, list: "up", rowsTrend: growths,
      composition: { up: { count: 2, valueA: 15, valueB: 39 } },
    });
    // A change only in "Nu mai apar", in the facts or in the noun is no change of a watch on the growths.
    const gone = { ...answer, groups: { ...answer.groups, gone: [row("4", 70, 0)] }, composition: { ...answer.composition, gone: { count: 1, valueA: 70, valueB: 0 }, all: { count: 3, valueA: 85, valueB: 39 } } };
    expect(sameAnswerCore("trend", answer, gone)).toBe(true);
    expect(sameAnswerCore("trend", answer, { ...answer, rowFacts: {}, noun: "furnizori" })).toBe(true);
    // The firms an employees band leaves out without a filing are not the group either.
    expect(sameAnswerCore("trend", answer, { ...answer, withoutFiling: { up: 3, new: 1 } })).toBe(true);
    // Its own rows and totals are.
    expect(sameAnswerCore("trend", answer, { ...answer, rowsTrend: [growths[1], growths[0]] })).toBe(false);
    expect(sameAnswerCore("trend", answer, { ...answer, composition: { ...answer.composition, up: { count: 3, valueA: 15, valueB: 40 } } })).toBe(false);
    // "Prima dată" compares its own list's totals; the order in percent adds the growths from the base.
    const first = { ...answer, change: "new", list: "first", composition: { new: { count: 9, valueA: 0, valueB: 90 }, first: { count: 4, valueA: 0, valueB: 40 } } };
    expect((answerCore("trend", first) as { composition: unknown }).composition).toEqual({ first: { count: 4, valueA: 0, valueB: 40 } });
    const percent = { ...answer, composition: { ...answer.composition, eligible: { count: 1, valueA: 10, valueB: 30 } } };
    expect((answerCore("trend", percent) as { composition: unknown }).composition).toEqual({ up: { count: 2, valueA: 15, valueB: 39 }, eligible: { count: 1, valueA: 10, valueB: 30 } });
    // An answer stored before trend-2 (no groups) is compared whole, as before.
    const old = { block: "trend", yearA: 2024, yearB: 2025, rowsTrend: growths };
    expect(answerCore("trend", old)).toBe(old);
  });
});

describe("a comparison's core (F4)", () => {
  // Before F4: the cards' sums, years and partners; F4 adds rows for the screen (the context rows, „Doar clienții comuni”).
  const card = { entityId: "1", value: 10, count: 2, years: [{ year: 2025, value: 10 }], streams: { da: { value: 4, count: 1 }, contracts: { value: 6, count: 1, singleBid: 0, bidsKnown: 1 } } };
  const before = { block: "compare", entities: [card], shared: { total: 1, rows: [{ entityId: "7", name: "X", a: { value: 3, count: 1 }, b: { value: 2, count: 1 } }] } };
  const after = {
    block: "compare",
    entities: [{ ...card, years: [{ year: 2025, value: 10, count: 2 }], general: 5, seats: { same: 1, other: 2, abroad: 0, unknown: 0 }, populationLevel: "local",
      whole: { value: 20, count: 4, partners: 3 }, joint: { value: 1, contracts: 1 }, streams: { ...card.streams, contracts: { ...card.streams.contracts, distinct: 1 } } }],
    shared: { total: 1, rows: [{ entityId: "7", name: "X", a: { value: 3, count: 1, joint: 1 }, b: { value: 2, count: 1, joint: 1 } }] },
  };
  it("leaves out what F4 draws for the screen: a watch of before F4 sees the same core", () => {
    expect(sameAnswerCore("compare", before, after)).toBe(true);
    expect(sameAnswerCore("compare", before, { ...after, entities: [{ ...after.entities[0]!, value: 11 }] })).toBe(false);
  });
  it("needs no answer version: the default comparison's figures are the same", () => {
    expect(answerVersion({ block: "compare", measure: "value", filters: { authorityId: 1, compareWithId: 2 } })).toEqual({ question: "compare-1", conditions: {} });
  });
});

describe("«Cine conduce?»'s core (entity_card-2, F6c)", () => {
  const card = { entityId: "1", name: "ALLIANCE", county: "Bucuresti", role: "supplier", value: 100, count: 3, cri: null, nFlags: 0, flags: [], population: null };
  const podium = { version: 2, places: [{ entityId: "1", name: "ALLIANCE", county: "Bucuresti", value: 100, count: 3 }, { entityId: "2", name: "DR.MAX", county: "Ilfov", value: 60, count: 2 }], total: { value: 300, count: 9, entities: 40 } };
  const ties = {
    version: 2, level: 0.2, maxFlags: 1, criteria: 5, count: 2, pool: 19, nextLevel: 0, nextCount: 5,
    rows: [{ entityId: "5", name: "Spital 5", county: "Cluj", count: 40, value: 90, nFlags: 1, flags: ["da_split"] }, { entityId: "6", name: "Spital 6", county: "Cluj", count: 30, value: 80, nFlags: 1, flags: ["da_round"] }],
  };
  const value = { block: "entity_card", card, podium };
  const index = { block: "entity_card", card: { ...card, entityId: "5", role: "authority", cri: 0.2, nFlags: 1, flags: ["da_split"] }, ties };
  it("is the question's second answer, on both axes", () => {
    expect(answerVersion({ block: "entity_card", dim: "supplier", rankBy: "value", measure: "value", filters: {} }).question).toBe("entity_card-2");
    expect(answerVersion({ block: "entity_card", dim: "supplier", rankBy: "risk", measure: "value", filters: {} }).question).toBe("entity_card-2");
    // A watch stored before it (no version: "entity_card-1") hears of it once.
    expect(sameAnswerVersion(readAnswerVersion(undefined, "entity_card"), answerVersion({ block: "entity_card", dim: "supplier", rankBy: "value", measure: "value", filters: {} }))).toBe(false);
  });
  it("compares the places and their total, or the level and the profiles at it; never the names, the pool or the next level", () => {
    expect(answerCore("entity_card", value)).toEqual({
      block: "entity_card", card: { entityId: "1", role: "supplier", value: 100, count: 3, cri: null, nFlags: 0, flags: [] },
      podium: { places: [{ entityId: "1", value: 100, count: 3 }, { entityId: "2", value: 60, count: 2 }], totals: { value: 300, count: 9, entities: 40 } },
    });
    // Under a band of CÂȘTIGĂTORII the total is the category's: kept under its own name.
    expect(answerCore("entity_card", { ...value, podium: { ...podium, selection: { value: 900, count: 20, entities: 90 } } })).toMatchObject({
      podium: { categoryTotals: { value: 300, count: 9, entities: 40 } },
    });
    const renamed = { ...value, podium: { ...podium, places: podium.places.map((p) => ({ ...p, name: "Altă denumire", county: "Cluj" })) } };
    expect(sameAnswerCore("entity_card", value, renamed)).toBe(true);
    expect(sameAnswerCore("entity_card", value, { ...value, podium: { ...podium, total: { ...podium.total, value: 301 } } })).toBe(false);
    expect(sameAnswerCore("entity_card", value, { ...value, podium: { ...podium, places: [podium.places[1]!, podium.places[0]!] } })).toBe(false);
    // The pool and the next level are references: a firm added to the pool does not change a watch on the group at the top.
    expect(sameAnswerCore("entity_card", index, { ...index, ties: { ...ties, pool: 20, nextCount: 6, nextLevel: 0.1 } })).toBe(true);
    expect(sameAnswerCore("entity_card", index, { ...index, ties: { ...ties, count: 3 } })).toBe(false);
    expect(sameAnswerCore("entity_card", index, { ...index, ties: { ...ties, rows: [ties.rows[1], ties.rows[0]] } })).toBe(false);
  });
  it("compares an answer stored before entity_card-2 whole", () => {
    const old = { block: "entity_card", card };
    expect(answerCore("entity_card", old)).toBe(old);
  });
});

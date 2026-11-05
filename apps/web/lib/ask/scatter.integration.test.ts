import { afterAll, describe, expect, it } from "vitest";
import { createDb, TRANSACTION_MART_BUILD_INDEXES, type DbSql } from "@seap/db";
import { forgetAuthorityKinds } from "./authority-kind";
import { runRows, runSpec } from "./compile";
import { locate, profileFacts } from "./facets";
import { ground } from "./ground";
import { scatterWithFacts } from "./scatter";
import { builtFlagTotals, flaggedRecordKeys } from "./scatter-records";
import type { ScatterDataV3 } from "./scatter-shared";
import { pointPlace } from "../../app/intreaba/scatter-answer";
import { validateSpec, type AskSpec } from "./spec";
import { ENGINE_GLOBAL_TABLES, testDatabaseUrl, withAskFixture } from "./test-fixture";

/*
 * The risk cloud (scatter-3, rf-2026.18; F6b, plan §4.12, §6.2) on a rolled-back fixture of the engine's tables: the
 * group counted once (the cloud from 10 acquisitions, the list from 20, a group under 10 listed whole); the list in the
 * strip's order (the unrounded risk score, then the value) and signal, the signal narrowing the list and never the
 * cloud; the number on a chip equals the list it opens; the sources of one criterion are exactly the records it flags
 * (the count on its row, the card's facts and the drawer's total are one number), for the profiles that have the
 * signal; December counts only the years it flags; the main supplier's records are the concentration's; the search
 * places a profile in that list; an older link's retired signal („Finalizare rapidă”) runs as the whole group.
 */

const url = testDatabaseUrl("Risk cloud");
const connection = url ? createDb(url, { max: 1 }) : null;
afterAll(async () => { await connection?.sql.end(); });

const BASE = 9_277_000_000;
const id = (n: number) => String(BASE + n);
type Authority = [number, string, string, number, number, string[], number];
/** n, name, county, accepted direct acquisitions, total, criteria met, the unrounded risk score (displayed: rounded). */
const AUTHORITIES: Authority[] = [
  [1, "Comuna Alfa", "Buzau", 30, 5000, ["da_split", "da_year_end", "da_above_ceiling"], 73.6],
  [2, "Comuna Beta", "Buzau", 25, 9000, ["da_split"], 20],
  [3, "Comuna Gama", "Buzau", 22, 100, ["da_concentration", "da_above_ceiling"], 51.7],
  [4, "Comuna Delta", "Buzau", 20, 700, ["da_year_end"], 20],
  [5, "Comuna Epsilon", "Buzau", 15, 400, [], 0],
  [6, "Comuna Zeta", "Buzau", 12, 300, ["da_split"], 20],
  ...[7, 8, 9, 10, 11, 12].map((n): Authority => [n, `Comuna Mica ${n}`, "Buzau", 10, 100 + n, [], 0]),
  [13, "Spital Unu", "Cluj", 40, 800, ["da_split"], 20],
  [14, "Spital Doi", "Cluj", 25, 600, [], 0],
  [15, "Spital Trei", "Cluj", 12, 200, [], 0],
];

interface Row { sicap_da_id: number; da_code: string; authority_id: number; authority_name: string; supplier_id: number; supplier_name: string; county: string; closing_value: number; finalization_date: string; da_flags: string[] }
const rows: Row[] = [];
let next = 1;
function records(authority: number, count: number, supplierOf: (i: number) => number, opts: { flags?: Record<number, string[]>; date?: (i: number) => string } = {}) {
  const name = AUTHORITIES.find((a) => a[0] === authority)!;
  for (let i = 0; i < count; i++) rows.push({
    sicap_da_id: BASE + next++, da_code: `DA${authority}-${i}`, authority_id: BASE + authority, authority_name: name[1], supplier_id: BASE + 100 + supplierOf(i),
    supplier_name: `Furnizor ${supplierOf(i)}`, county: name[2], closing_value: 100, finalization_date: opts.date?.(i) ?? "2021-06-15 10:00", da_flags: opts.flags?.[i] ?? [],
  });
}
// Alfa: three suppliers; three acquisitions in a split group, eight above the ceiling (26.7%), four in December 2022.
records(1, 30, (i) => (i < 10 ? 1 : i < 25 ? 2 : 3), {
  flags: { 0: ["da_split"], 1: ["da_split"], 2: ["da_split", "da_above_ceiling"], 3: ["da_above_ceiling"], 4: ["da_above_ceiling"], 5: ["da_above_ceiling"], 6: ["da_above_ceiling"], 7: ["da_above_ceiling"], 8: ["da_above_ceiling"], 9: ["da_above_ceiling"] },
  date: (i) => (i >= 26 ? "2022-12-05 10:00" : i >= 20 ? "2022-11-05 10:00" : "2021-06-15 10:00"),
});
records(2, 25, (i) => 4 + (i % 2), { flags: { 0: ["da_split"], 1: ["da_split"], 2: ["da_split"] } });
// Gama: 15 of its 22 are with the supplier 7 (the main one); six above the ceiling (27%).
records(3, 22, (i) => (i < 15 ? 7 : 8), { flags: { 0: ["da_above_ceiling"], 1: ["da_above_ceiling"], 2: ["da_above_ceiling"], 3: ["da_above_ceiling"], 4: ["da_above_ceiling"], 5: ["da_above_ceiling"] } });
records(4, 20, (i) => 9, { date: (i) => (i < 6 ? "2024-12-20 10:00" : "2024-03-20 10:00") });
// Epsilon has no signal, but one of its acquisitions carries the row flag (under the profile's floor of two).
records(5, 15, (i) => 10, { flags: { 0: ["da_above_ceiling"] } });
records(6, 12, (i) => 11, { flags: { 0: ["da_split"], 1: ["da_split"], 2: ["da_split"] } });
records(13, 40, (i) => 12, { flags: { 0: ["da_split"], 1: ["da_split"], 2: ["da_split"] } });

async function seed(q: DbSql): Promise<void> {
  const list = AUTHORITIES.map(([n, name, county, nDas, total, flags, raw]) => ({ id: id(n), name, county, nDas, total, flags, n: flags.length, raw, score: Math.round(raw) }));
  await q`insert into core.entities (id, name_display, name_normalized, cui_canonical, cui_valid, county, country_code, is_foreign)
    select (r->>'id')::bigint, r->>'name', lower(r->>'name'), r->>'id', true, r->>'county', 'RO', false from jsonb_array_elements(${JSON.stringify(list)}::jsonb) r`;
  await q`insert into marts.entity_profile (entity_id, role, name_display, county, n_das, n_contracts, total_ron_full, total_ron_split, is_foreign)
    select (r->>'id')::bigint, 'authority', r->>'name', r->>'county', (r->>'nDas')::int, 0, (r->>'total')::numeric, (r->>'total')::numeric, false from jsonb_array_elements(${JSON.stringify(list)}::jsonb) r`;
  // rf-2026.18: the score (0–100), its unrounded value (the order) and cri = score / 100, as the build writes them.
  await q`insert into marts.entity_flags (entity_id, role, name_display, county, n_das, total_ron, cri, n_flags, flags, score, score_raw)
    select (r->>'id')::bigint, 'authority', r->>'name', r->>'county', (r->>'nDas')::int, (r->>'total')::numeric, round((r->>'score')::numeric / 100, 4), (r->>'n')::int, r->'flags',
           (r->>'score')::smallint, (r->>'raw')::real
    from jsonb_array_elements(${JSON.stringify(list)}::jsonb) r`;
  await q`insert into marts.da_transactions (sicap_da_id, da_code, authority_id, authority_name, supplier_id, supplier_name, county, cpv_code, cpv_name, closing_value, finalization_date, publication_date, da_flags)
    select (r->>'sicap_da_id')::bigint, r->>'da_code', (r->>'authority_id')::bigint, r->>'authority_name', (r->>'supplier_id')::bigint, r->>'supplier_name', r->>'county', '45000000', 'Lucrări',
           (r->>'closing_value')::numeric, r->>'finalization_date', r->>'finalization_date', array(select jsonb_array_elements_text(r->'da_flags'))
    from jsonb_array_elements(${JSON.stringify(rows)}::jsonb) r`;
  // The build's instances: the years of a split (a pair) and of December, the main supplier's share.
  await q`insert into marts.flag_instances (id, flag_code, subject_type, entity_id, partner_id, period, evidence) values
    (1, 'da_split', 'pair', ${id(1)}, ${id(101)}, '2020', '{"count": 3}'), (2, 'da_split', 'pair', ${id(1)}, ${id(101)}, '2019', '{"count": 3}'),
    (3, 'da_year_end', 'authority', ${id(1)}, null, '2022', '{"december_pct": 0.4}'), (4, 'da_year_end', 'authority', ${id(4)}, null, '2024', '{"december_pct": 0.5}'),
    (5, 'da_concentration', 'authority', ${id(3)}, null, 'all', '{"top_supplier_pct": 0.68, "suppliers": 2}'),
    (6, 'da_split', 'pair', ${id(2)}, ${id(104)}, '2021', '{"count": 3}'), (7, 'da_split', 'pair', ${id(6)}, ${id(111)}, '2021', '{"count": 3}'),
    (8, 'da_split', 'pair', ${id(13)}, ${id(112)}, '2021', '{"count": 3}')`;
  await q`insert into marts.spend_by_county (county, role, n, total_ron) values ('Buzau', 'authority', 1, 1), ('Cluj', 'authority', 1, 1)`;
  forgetAuthorityKinds();
}

const cloud = (extra: Partial<AskSpec> = {}, filters: AskSpec["filters"] = { county: "Buzau" }): AskSpec =>
  validateSpec({ block: "scatter", dim: "authority", measure: "value", filters, scatter: { rankBy: "risk" }, ...extra }) as AskSpec;
async function answer(q: DbSql, spec: AskSpec): Promise<ScatterDataV3> {
  const result = await runSpec(q, spec, await ground(q, spec.filters));
  if ("error" in result) throw new Error(result.error);
  if (result.data.block !== "scatter" || !("scatter" in result.data) || result.data.scatter.version !== 3) throw new Error("not a scatter-3 answer");
  return result.data.scatter;
}
const ids = (d: ScatterDataV3) => d.list.map((r) => r.entityId.slice(-2).replace(/^0/, ""));
const sources = async (q: DbSql, spec: AskSpec, scope: Record<string, unknown>) => {
  const r = await runRows(q, spec, await ground(q, spec.filters), 0, { scope } as never);
  if ("error" in r) throw new Error(r.error);
  return r;
};

describe.runIf(Boolean(connection))("the risk cloud (scatter-3, isolated PostgreSQL)", () => {
  it("counts the group once: the cloud from 10 acquisitions, the list from 20, and the signals of the group", async () => {
    const out = await withAskFixture(connection!.sql, "scatter_group", seed, async (q) => {
      const d = await answer(q, cloud());
      const byValue = await answer(q, cloud({ scatter: { rankBy: "value" } })), split = await answer(q, cloud({ scatter: { rankBy: "risk", flag: "da_split" } }));
      // The screen places a point past the list's rows from the points alone: the server's order, row by row.
      const placed = [d, byValue, split].map((x) => x.list.map((r) => pointPlace(x, r.entityId)));
      return { version: d.version, group: d.group, criteria: d.criteria, cloud: "points" in d.cloud ? d.cloud.points.length : -1, list: ids(d), p90: d.p90 > 0,
        scores: d.list.map((r) => [r.score, r.scoreRaw]), points: "points" in d.cloud ? d.cloud.points.filter((p) => p.score > 0).map((p) => [p.score, Math.round(p.scoreRaw * 10)]) : [],
        counties: "points" in d.cloud ? [...new Set(d.cloud.points.map((p) => p.county))] : [], placed, wider: d.wider };
    });
    expect(out.version).toBe(3);
    expect(out.counties).toEqual(["Buzău"]);
    expect(out.placed).toEqual([[1, 2, 3, 4], [1, 2, 3, 4], [1, 2]]);
    // A cloud is no small group: no way out to count.
    expect(out.wider).toBeUndefined();
    expect(out.group).toEqual({ n: 12, nList: 4 });
    expect(out.criteria).toEqual({ da_split: 3, da_round: 0, da_year_end: 2, da_concentration: 1, da_above_ceiling: 2 });
    expect(out.cloud).toBe(12);
    expect(out.p90).toBe(true);
    // The list's order is the unrounded risk score, then value (Alfa 73.6, Gama 51.7, Beta 20 with 9000, Delta 20 with 700).
    expect(out.list).toEqual(["1", "3", "2", "4"]);
    expect(out.scores.map(([score]) => score)).toEqual([74, 52, 20, 20]);
    expect(out.scores[0]![1]).toBeCloseTo(73.6, 4);
    expect(out.points).toEqual([[74, 736], [20, 200], [52, 517], [20, 200], [20, 200]]);
  });

  it("orders by value when asked, and narrows the list to a signal without cutting the cloud", async () => {
    const out = await withAskFixture(connection!.sql, "scatter_signal", seed, async (q) => {
      const byValue = await answer(q, cloud({ scatter: { rankBy: "value" } }));
      const split = await answer(q, cloud({ scatter: { rankBy: "risk", flag: "da_split" } }));
      const none = await answer(q, cloud());
      return { byValue: ids(byValue), split: ids(split), chosen: split.chosen, cloud: "points" in split.cloud ? split.cloud.points.length : -1,
        marked: "points" in split.cloud ? split.cloud.points.filter((p) => (p.flags & 1) !== 0).length : -1, chip: split.criteria.da_split, listLength: split.list.length,
        sameCloud: JSON.stringify(none.cloud) === JSON.stringify(split.cloud) || "points" in split.cloud };
    });
    expect(out.byValue).toEqual(["2", "1", "4", "3"]);
    // Beta and Alfa have a possible split and 20 acquisitions or more; Zeta has it with 12: in the cloud, not in the list.
    expect(out.split).toEqual(["1", "2"]);
    expect(out.chosen).toEqual({ n: 3, nList: 2 });
    // The number on the chip is the number of profiles that have the signal, the list is the 20-acquisition part of them.
    expect(out.chip).toBe(3);
    expect(out.cloud).toBe(12);
    expect(out.marked).toBe(3);
    expect(out.listLength).toBe(out.chosen!.nList);
  });

  it("lists a group of fewer than 10 whole, from 10 acquisitions, without a cloud", async () => {
    const d = await withAskFixture(connection!.sql, "scatter_small", seed, (q) => answer(q, cloud({}, { county: "Cluj" })));
    expect(d.group).toEqual({ n: 3, nList: 3, small: true });
    // The way out counts the same group without its county: the 15 institutions of the fixture.
    expect(d.wider).toBe(15);
    expect(d.list.map((r) => r.name)).toEqual(["Spital Unu", "Spital Doi", "Spital Trei"].sort((a, b) => (a === "Spital Unu" ? -1 : b === "Spital Unu" ? 1 : 0)).slice(0, 3));
    expect("points" in d.cloud && d.cloud.points).toEqual([]);
  });

  it("says each listed signal with its years or its share, and counts the records behind it as the drawer does", async () => {
    const out = await withAskFixture(connection!.sql, "scatter_facts", seed, async (q) => {
      const spec = cloud();
      const d = await answer(q, spec);
      const alfa = d.list.find((r) => r.entityId === id(1))!, gama = d.list.find((r) => r.entityId === id(3))!;
      const facts = await profileFacts(q, spec, [id(1), id(3), id(5)]);
      if (!("rows" in facts)) throw new Error("facts");
      const by = (entity: number) => facts.rows.find((r) => r.id === id(entity))!;
      const drawer = async (entity: number, flag: string) => (await sources(q, spec, { entityIds: [id(entity)], role: "authority", flag })).total;
      // A capture freezes the same facts in its list (evidence-captures.ts queryCapture).
      const frozen = await scatterWithFacts(q, d);
      return {
        frozenAlfa: frozen.list.find((r) => r.entityId === id(1))!.flags,
        alfa: alfa.flags, gama: gama.flags, factsAlfa: by(1).flags, factsGama: by(3).flags, factsEpsilon: by(5).flags,
        drawn: { split: await drawer(1, "da_split"), above: await drawer(1, "da_above_ceiling"), december: await drawer(1, "da_year_end"), main: await drawer(3, "da_concentration"), aboveGama: await drawer(3, "da_above_ceiling") },
      };
    });
    // The signals in the order of the risk score's criteria (split, round, December, concentration, above the ceiling).
    expect(out.alfa).toEqual([{ code: "da_split", years: [2019, 2020] }, { code: "da_year_end", years: [2022] }, { code: "da_above_ceiling" }]);
    expect(out.gama).toEqual([{ code: "da_concentration", share: 0.68 }, { code: "da_above_ceiling" }]);
    // The profile's facts carry the records and the shares of the per-acquisition signals; a profile without a signal has none.
    expect(out.factsAlfa).toEqual([
      { code: "da_split", years: [2019, 2020], rows: 3 }, { code: "da_year_end", years: [2022], rows: 4 }, { code: "da_above_ceiling", rows: 8, share: 8 / 30 },
    ]);
    expect(out.factsGama).toEqual([{ code: "da_concentration", share: 0.68, rows: 15 }, { code: "da_above_ceiling", rows: 6, share: 6 / 22 }]);
    expect(out.factsEpsilon).toEqual([]);
    expect(out.frozenAlfa).toEqual(out.factsAlfa);
    // One number: the count on the row, the card's fact, the drawer's total.
    expect(out.drawn).toEqual({ split: 3, above: 8, december: 4, main: 15, aboveGama: 6 });
  });

  it("opens only the profiles that have the signal: a row flagged under the profile's floor does not enter the sources", async () => {
    const out = await withAskFixture(connection!.sql, "scatter_cohort", seed, async (q) => {
      const spec = cloud();
      const above = await sources(q, spec, { flag: "da_above_ceiling" });
      const chosen = await sources(q, cloud({ scatter: { rankBy: "risk", flag: "da_above_ceiling" } }), {});
      const epsilon = await sources(q, spec, { flag: "da_above_ceiling", entityIds: [id(5)], role: "authority" });
      const whole = await sources(q, cloud({ scatter: { rankBy: "risk", flag: "da_above_ceiling" } }), { entityIds: [id(1)], role: "authority" });
      return { above: above.total, chosen: chosen.total, epsilon: epsilon.total, whole: whole.total, groups: above.profileCount, notes: above.scopeNotes.filter((n) => n.startsWith("Sursele semnalului „")) };
    });
    // Alfa's 8 and Gama's 6 (Epsilon's flagged row is not counted: it does not have the signal).
    expect(out.above).toBe(14);
    expect(out.chosen).toBe(14);
    expect(out.epsilon).toBe(0);
    expect(out.whole).toBe(8);
    expect(out.groups).toBe(2);
    expect(out.notes).toEqual(["Sursele semnalului „Declarate directe, peste plafon”: achizițiile înregistrate cu peste 10% peste plafon, unde excepțiile cunoscute nu se aplică, nu tot istoricul profilurilor."]);
  });

  it("runs an older link's retired signal („Finalizare rapidă”) as the whole group: the answer, the search and the sources apply none", async () => {
    const out = await withAskFixture(connection!.sql, "scatter_retired", seed, async (q) => {
      const old = cloud({ scatter: { rankBy: "risk", flag: "da_rapid" as never } });
      const [was, now] = [await answer(q, old), await answer(q, cloud())];
      const found = await locate(q, old, "gama");
      const drawer = await sources(q, old, { flag: "da_above_ceiling" });
      const plain = await runRows(q, old, await ground(q, old.filters), 0, { scope: {} } as never);
      return {
        same: JSON.stringify(was) === JSON.stringify(now), flag: was.flag, chosen: was.chosen ?? null,
        found: "matches" in found ? found.matches.map((m) => [m.name, m.rank]) : found, drawer: drawer.total,
        plain: "error" in plain ? plain.error : plain.scopeNotes.filter((n) => n.startsWith("Sursele semnalului")),
      };
    });
    expect(out).toEqual({ same: true, flag: null, chosen: null, found: [["Comuna Gama", 2]], drawer: 14, plain: [] });
  });

  it("counts December only in the years the criterion flags, and the main supplier by value", async () => {
    const out = await withAskFixture(connection!.sql, "scatter_months", seed, async (q) => {
      const spec = cloud();
      // Alfa: December 2022 (flagged) has 4 acquisitions; its November 2022 ones and every other month do not count.
      const alfa = await sources(q, spec, { flag: "da_year_end", entityIds: [id(1)], role: "authority" });
      // Delta is flagged for 2024: its six December acquisitions, none of 2021's.
      const delta = await sources(q, spec, { flag: "da_year_end", entityIds: [id(4)], role: "authority" });
      const gama = await sources(q, spec, { flag: "da_concentration", entityIds: [id(3)], role: "authority" });
      return { alfa: alfa.rows.map((r) => r.date), delta: delta.total, gama: [gama.total, [...new Set(gama.rows.map((r) => r.supplierId))]] };
    });
    expect(out.alfa).toEqual(["2022-12-05", "2022-12-05", "2022-12-05", "2022-12-05"]);
    expect(out.delta).toBe(6);
    expect(out.gama).toEqual([15, [id(107)]]);
  });

  it("counts and orders a signal's records on their keys exactly as on the whole rows, and its keys read the build's index", async () => {
    const out = await withAskFixture(connection!.sql, "scatter_keys", seed, async (q) => {
      const spec = cloud({}, {});
      // A search that keeps every record reads whole rows (the path before the F6b review); without one, the keys.
      const run = async (sort: string, dir: string, page: number, search?: string) => {
        const r = await runRows(q, spec, await ground(q, spec.filters), page, { scope: { flag: "da_above_ceiling" }, sort, dir, ...(search ? { search } : {}) } as never);
        if ("error" in r) throw new Error(r.error);
        return { total: r.total, value: r.value, from: r.dateFrom, to: r.dateTo, ids: r.rows.map((row) => row.refId) };
      };
      const pairs: [unknown, unknown][] = [];
      for (const [sort, dir] of [["value", "desc"], ["date", "asc"], ["source", "desc"]]) for (const page of [0, 1])
        pairs.push([await run(sort!, dir!, page), await run(sort!, dir!, page, "comuna")]);
      // The index the nightly build makes (TRANSACTION_MART_BUILD_INDEXES), on the fixture's copy of the mart.
      await q.unsafe(TRANSACTION_MART_BUILD_INDEXES.find((index) => index.name === "da_tx_flagged_idx")!.definition);
      await q.unsafe("set local enable_seqscan = off");
      const keys = flaggedRecordKeys(q, "supplier", "da_above_ceiling", q`select ${BASE + 107}::bigint`);
      const plan = (await q`explain select count(*), sum(k.closing_value) from ${keys} k`) as unknown as { "QUERY PLAN": string }[];
      // S6 over-bar: its twin keyed on the firm answers one firm's signal (DEDEMAN: 0.7 s on its supplier index, 25 ms
      // here), with the same records in every order and page.
      await q.unsafe(TRANSACTION_MART_BUILD_INDEXES.find((index) => index.name === "da_tx_flagged_supplier_idx")!.definition);
      const firmPlan = (await q`explain select count(*), sum(k.closing_value) from ${keys} k`) as unknown as { "QUERY PLAN": string }[];
      await q.unsafe("set local enable_seqscan = on");
      const twin: unknown[] = [];
      for (const [sort, dir] of [["value", "desc"], ["date", "asc"], ["source", "desc"]]) for (const page of [0, 1]) twin.push(await run(sort!, dir!, page));
      return { pairs, twin, plan: plan.map((line) => line["QUERY PLAN"]).join("\n"), firmPlan: firmPlan.map((line) => line["QUERY PLAN"]).join("\n") };
    });
    for (const [keyed, whole] of out.pairs) expect(keyed).toEqual(whole);
    expect(out.twin).toEqual(out.pairs.map(([keyed]) => keyed));
    // Alfa's 8 and Gama's 6, ten on the first page and four on the second.
    expect(out.pairs.map(([keyed]) => (keyed as { ids: string[] }).ids.length)).toEqual([10, 4, 10, 4, 10, 4]);
    // The partial index is usable only when the query repeats its predicate (an unvacuumed copy reads it by bitmap or index scan).
    expect(out.plan).toMatch(/(Scan using|Scan on) da_tx_flagged_idx/);
    expect(out.firmPlan).toMatch(/(Scan using|Scan on) da_tx_flagged_supplier_idx/);
  });

  it("refuses a signal the role cannot have, and a signal on another question", async () => {
    await withAskFixture(connection!.sql, "scatter_refuse", seed, async (q) => {
      const firms = validateSpec({ block: "scatter", dim: "supplier", measure: "value", filters: {}, scatter: { flag: "da_concentration" } });
      expect(firms).toHaveProperty("error");
      const spec = { block: "table", dim: "supplier", measure: "value", filters: {} } as AskSpec;
      const result = await runRows(q, spec, {}, 0, { scope: { flag: "da_split" } } as never);
      expect(result).toEqual({ error: "Semnalul se aplică norului de risc." });
    });
  });

  it("finds a profile of the group by name and places it in the list of the strip's order and signal", async () => {
    const out = await withAskFixture(connection!.sql, "scatter_locate", seed, async (q) => {
      const spec = cloud();
      const found = await locate(q, spec, "gama");
      const small = await locate(q, spec, "mica 7");
      const withSignal = await locate(q, cloud({ scatter: { rankBy: "risk", flag: "da_split" } }), "gama");
      const byValue = await locate(q, cloud({ scatter: { rankBy: "value" } }), "alfa");
      const outside = await locate(q, spec, "spital");
      const tie = await locate(q, spec, "delta");
      const all = (r: Awaited<ReturnType<typeof locate>>) => "matches" in r ? { total: r.total, by: r.by, matches: r.matches.map((m) => [m.name, m.rank, m.profile?.why ?? null, m.n]) } : r;
      // The search gives the score (as cri, the score over one) for the found point's place on the chart.
      const score = "matches" in found ? found.matches[0]?.profile?.cri : null;
      return { found: all(found), small: all(small), withSignal: all(withSignal), byValue: all(byValue), outside: all(outside), tie: all(tie), score };
    });
    expect(out.found).toEqual({ total: 4, by: "risk", matches: [["Comuna Gama", 2, null, 22]] });
    // At the same score (20), the larger value first: Beta (9000) is third, Delta (700) fourth.
    expect(out.tie).toEqual({ total: 4, by: "risk", matches: [["Comuna Delta", 4, null, 20]] });
    // Under 20 acquisitions: not in the list, said so; it is in the cloud, so it is found.
    expect(out.small).toEqual({ total: 4, by: "risk", matches: [["Comuna Mica 7", null, "below", 10]] });
    // Gama is in the group but has no possible split: found, with the reason it has no place.
    expect(out.withSignal).toEqual({ total: 2, by: "risk", matches: [["Comuna Gama", null, "signal", 22]] });
    expect(out.byValue).toEqual({ total: 4, by: "value", matches: [["Comuna Alfa", 2, null, 30]] });
    // The group is Buzau's: a hospital of Cluj is not found.
    expect(out.outside).toEqual({ total: 4, by: "risk", matches: [] });
    expect(out.score).toBe(0.52);
  });

  it("reconciles a signal's sources with what the build itself flagged, for a few profiles, and says when they differ", async () => {
    const fill = async (q: DbSql) => {
      await seed(q);
      // The build's own side: its acquisitions and its flags (core), the same rows as the mart's.
      await q`insert into core.direct_acquisitions (id, da_code, sicap_da_id, authority_entity_id, closing_value, finalization_date, state)
        select (r->>'sicap_da_id')::bigint, r->>'da_code', (r->>'sicap_da_id')::bigint, (r->>'authority_id')::bigint, (r->>'closing_value')::numeric,
               (r->>'finalization_date')::timestamptz, 'Oferta acceptata' from jsonb_array_elements(${JSON.stringify(rows)}::jsonb) r`;
      const flagged = (flag: string) => rows.filter((r) => r.da_flags.includes(flag));
      await q`insert into core.flags (subject_type, subject_id, flag_code, triggered, methodology_version)
        select 'da', (r->>'sicap_da_id')::bigint, 'da_above_ceiling', true, 'rf-test' from jsonb_array_elements(${JSON.stringify(flagged("da_above_ceiling"))}::jsonb) r`;
      await q`insert into core.flags (subject_type, subject_id, partner_id, flag_code, period, triggered, evidence, methodology_version) values
        ('pair', ${id(1)}, ${id(101)}, 'da_split', '2020', true, ${JSON.stringify({ source_ids: flagged("da_split").filter((r) => r.authority_id === BASE + 1).map((r) => String(r.sicap_da_id)) })}::jsonb, 'rf-test'),
        ('authority', ${id(1)}, null, 'da_year_end', '2022', true, '{"december": 400}', 'rf-test')`;
    };
    const out = await withAskFixture(connection!.sql, "scatter_reconcile", fill, async (q) => {
      const spec = cloud();
      const checked = async (flag: string, entity?: number) => {
        const r = await sources(q, spec, { flag, ...(entity ? { entityIds: [id(entity)], role: "authority" } : {}) });
        return [r.total, r.profileReconciled, r.scopeNotes.some((n) => n.startsWith("Sursele semnalului nu coincid"))];
      };
      const before = { above: await checked("da_above_ceiling"), split: await checked("da_split", 1), december: await checked("da_year_end", 1), main: await checked("da_concentration", 3) };
      // The mart and the build part: one acquisition of the signal leaves the build's side.
      await q`delete from core.flags where subject_type = 'da' and subject_id = ${rows.find((r) => r.da_flags.includes("da_above_ceiling"))!.sicap_da_id}`;
      return { before, after: await checked("da_above_ceiling") };
    }, { globals: [...ENGINE_GLOBAL_TABLES, "core.flags"] });
    expect(out.before).toEqual({ above: [14, true, false], split: [3, true, false], december: [4, true, false], main: [15, null, false] });
    expect(out.after).toEqual([14, false, true]);
  });

  it("reconciles a firm's acquisitions above and just under the ceiling on its own, never one where the authority supplies itself (S6, F6b verify)", async () => {
    const firm = BASE + 101, own = BASE + 1;
    const fill = async (q: DbSql) => {
      await seed(q);
      // The firm 101 sells to Alfa and Beta; Alfa also "buys" from itself (a supplier equal to the authority is none).
      const da = [
        { id: 1, authority: BASE + 1, supplier: firm, value: 100, flag: "da_above_ceiling" }, { id: 2, authority: BASE + 2, supplier: firm, value: 250, flag: "da_above_ceiling" },
        { id: 3, authority: BASE + 2, supplier: firm, value: 40, flag: "da_round" }, { id: 4, authority: own, supplier: own, value: 900, flag: "da_above_ceiling" },
        { id: 5, authority: BASE + 2, supplier: own, value: 70, flag: "da_above_ceiling" },
      ].map((r) => ({ ...r, id: BASE + 900 + r.id }));
      await q`insert into core.entities (id, name_display, name_normalized, cui_canonical, cui_valid, county, country_code, is_foreign)
        values (${firm}, 'Furnizor 1', 'furnizor 1', ${String(firm)}, true, 'Buzau', 'RO', false) on conflict do nothing`;
      await q`insert into core.direct_acquisitions (id, da_code, sicap_da_id, authority_entity_id, supplier_entity_id, closing_value, finalization_date, state)
        select (r->>'id')::bigint, 'F' || (r->>'id'), (r->>'id')::bigint, (r->>'authority')::bigint, (r->>'supplier')::bigint, (r->>'value')::numeric,
               '2021-06-15', 'Oferta acceptata' from jsonb_array_elements(${JSON.stringify(da)}::jsonb) r`;
      await q`insert into core.flags (subject_type, subject_id, flag_code, triggered, methodology_version)
        select 'da', (r->>'id')::bigint, r->>'flag', true, 'rf-test' from jsonb_array_elements(${JSON.stringify(da)}::jsonb) r`;
    };
    const out = await withAskFixture(connection!.sql, "scatter_firm_built", fill, async (q) => ({
      above: await builtFlagTotals(q, "supplier", "da_above_ceiling", q`select ${firm}::bigint`),
      round: await builtFlagTotals(q, "supplier", "da_round", q`select ${firm}::bigint`),
      // Alfa as a firm: only what it sold to Beta, not its acquisition from itself.
      self: await builtFlagTotals(q, "supplier", "da_above_ceiling", q`select ${own}::bigint`),
    }), { globals: [...ENGINE_GLOBAL_TABLES, "core.flags"] });
    expect(out).toEqual({ above: { records: 2, value: "350" }, round: { records: 1, value: "40" }, self: { records: 1, value: "70" } });
  });
});

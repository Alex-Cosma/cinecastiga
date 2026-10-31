import { afterAll, describe, expect, it } from "vitest";
import { createDb, TRANSACTION_MART_BUILD_INDEXES, type DbSql } from "@seap/db";
import { forgetAuthorityKinds } from "./authority-kind";
import { runRows, runSpec } from "./compile";
import { locate, profileFacts } from "./facets";
import { ground } from "./ground";
import { scatterWithFacts } from "./scatter";
import { builtFlagTotals, flaggedRecordKeys } from "./scatter-records";
import type { ScatterData } from "./scatter-shared";
import { pointPlace, type ScatterV2 } from "../../app/intreaba/scatter-answer";
import { validateSpec, type AskSpec } from "./spec";
import { ENGINE_GLOBAL_TABLES, testDatabaseUrl, withAskFixture } from "./test-fixture";

/*
 * The risk cloud (scatter-2, F6b, plan §4.12, §6.2) on a rolled-back fixture of the engine's tables: the group
 * counted once (the cloud from 10 acquisitions, the list from 20, a group under 10 listed whole); the list in the
 * strip's order and signal, the signal narrowing the list and never the cloud; the number on a chip equals the list
 * it opens; the sources of one criterion are exactly the records it flags (the count on its row, the card's facts
 * and the drawer's total are one number), for the profiles that have the signal; December counts only the years it
 * flags; the main supplier's records are the concentration's; the search places a profile in that list.
 */

const url = testDatabaseUrl("Risk cloud");
const connection = url ? createDb(url, { max: 1 }) : null;
afterAll(async () => { await connection?.sql.end(); });

const BASE = 9_277_000_000;
const id = (n: number) => String(BASE + n);
/** n, name, county, accepted direct acquisitions, total, criteria met. */
const AUTHORITIES: [number, string, string, number, number, string[]][] = [
  [1, "Comuna Alfa", "Buzau", 30, 5000, ["da_split", "da_year_end", "da_rapid"]],
  [2, "Comuna Beta", "Buzau", 25, 9000, ["da_split"]],
  [3, "Comuna Gama", "Buzau", 22, 100, ["da_rapid", "da_concentration"]],
  [4, "Comuna Delta", "Buzau", 20, 700, ["da_year_end"]],
  [5, "Comuna Epsilon", "Buzau", 15, 400, []],
  [6, "Comuna Zeta", "Buzau", 12, 300, ["da_split"]],
  ...[7, 8, 9, 10, 11, 12].map((n): [number, string, string, number, number, string[]] => [n, `Comuna Mica ${n}`, "Buzau", 10, 100 + n, []]),
  [13, "Spital Unu", "Cluj", 40, 800, ["da_split"]],
  [14, "Spital Doi", "Cluj", 25, 600, []],
  [15, "Spital Trei", "Cluj", 12, 200, []],
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
// Alfa: three suppliers; three acquisitions flagged as a possible split, eight as rapid (26.7%), four in December 2022.
records(1, 30, (i) => (i < 10 ? 1 : i < 25 ? 2 : 3), {
  flags: { 0: ["da_split"], 1: ["da_split"], 2: ["da_split", "da_rapid"], 3: ["da_rapid"], 4: ["da_rapid"], 5: ["da_rapid"], 6: ["da_rapid"], 7: ["da_rapid"], 8: ["da_rapid"], 9: ["da_rapid"] },
  date: (i) => (i >= 26 ? "2022-12-05 10:00" : i >= 20 ? "2022-11-05 10:00" : "2021-06-15 10:00"),
});
records(2, 25, (i) => 4 + (i % 2), { flags: { 0: ["da_split"], 1: ["da_split"], 2: ["da_split"] } });
// Gama: 15 of its 22 are with the supplier 7 (the main one); six rapid (27%).
records(3, 22, (i) => (i < 15 ? 7 : 8), { flags: { 0: ["da_rapid"], 1: ["da_rapid"], 2: ["da_rapid"], 3: ["da_rapid"], 4: ["da_rapid"], 5: ["da_rapid"] } });
records(4, 20, (i) => 9, { date: (i) => (i < 6 ? "2024-12-20 10:00" : "2024-03-20 10:00") });
// Epsilon has no signal, but two of its acquisitions carry the row flag (it is under the rule's thresholds).
records(5, 15, (i) => 10, { flags: { 0: ["da_rapid"], 1: ["da_rapid"] } });
records(6, 12, (i) => 11, { flags: { 0: ["da_split"], 1: ["da_split"], 2: ["da_split"] } });
records(13, 40, (i) => 12, { flags: { 0: ["da_split"], 1: ["da_split"], 2: ["da_split"] } });

async function seed(q: DbSql): Promise<void> {
  const list = AUTHORITIES.map(([n, name, county, nDas, total, flags]) => ({ id: id(n), name, county, nDas, total, flags, n: flags.length }));
  await q`insert into core.entities (id, name_display, name_normalized, cui_canonical, cui_valid, county, country_code, is_foreign)
    select (r->>'id')::bigint, r->>'name', lower(r->>'name'), r->>'id', true, r->>'county', 'RO', false from jsonb_array_elements(${JSON.stringify(list)}::jsonb) r`;
  await q`insert into marts.entity_profile (entity_id, role, name_display, county, n_das, n_contracts, total_ron_full, total_ron_split, is_foreign)
    select (r->>'id')::bigint, 'authority', r->>'name', r->>'county', (r->>'nDas')::int, 0, (r->>'total')::numeric, (r->>'total')::numeric, false from jsonb_array_elements(${JSON.stringify(list)}::jsonb) r`;
  await q`insert into marts.entity_flags (entity_id, role, name_display, county, n_das, total_ron, cri, n_flags, flags)
    select (r->>'id')::bigint, 'authority', r->>'name', r->>'county', (r->>'nDas')::int, (r->>'total')::numeric, (r->>'n')::numeric / 5, (r->>'n')::int, r->'flags'
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
async function answer(q: DbSql, spec: AskSpec): Promise<ScatterData> {
  const result = await runSpec(q, spec, await ground(q, spec.filters));
  if ("error" in result) throw new Error(result.error);
  if (result.data.block !== "scatter" || !("scatter" in result.data)) throw new Error("not a scatter-2 answer");
  return result.data.scatter;
}
const ids = (d: ScatterData) => d.list.map((r) => r.entityId.slice(-2).replace(/^0/, ""));
const sources = async (q: DbSql, spec: AskSpec, scope: Record<string, unknown>) => {
  const r = await runRows(q, spec, await ground(q, spec.filters), 0, { scope } as never);
  if ("error" in r) throw new Error(r.error);
  return r;
};

describe.runIf(Boolean(connection))("the risk cloud (scatter-2, isolated PostgreSQL)", () => {
  it("counts the group once: the cloud from 10 acquisitions, the list from 20, and the signals of the group", async () => {
    const out = await withAskFixture(connection!.sql, "scatter_group", seed, async (q) => {
      const d = await answer(q, cloud());
      const byValue = await answer(q, cloud({ scatter: { rankBy: "value" } })), split = await answer(q, cloud({ scatter: { rankBy: "risk", flag: "da_split" } }));
      // The screen places a point past the list's rows from the points alone: the server's order, row by row.
      const placed = [d, byValue, split].map((x) => x.list.map((r) => pointPlace(x as ScatterV2, r.entityId)));
      return { group: d.group, criteria: d.criteria, levels: d.levels, cloud: "points" in d.cloud ? d.cloud.points.length : -1, list: ids(d), p90: d.p90 > 0,
        counties: "points" in d.cloud ? [...new Set(d.cloud.points.map((p) => p.county))] : [], placed, wider: d.wider };
    });
    expect(out.counties).toEqual(["Buzău"]);
    expect(out.placed).toEqual([[1, 2, 3, 4], [1, 2, 3, 4], [1, 2]]);
    // A cloud is no small group: no way out to count.
    expect(out.wider).toBeUndefined();
    expect(out.group).toEqual({ n: 12, nList: 4 });
    expect(out.criteria).toEqual({ da_split: 3, da_year_end: 2, da_rapid: 2, da_round: 0, da_concentration: 1 });
    expect(out.levels).toBe(5);
    expect(out.cloud).toBe(12);
    expect(out.p90).toBe(true);
    // The list's order is "Cine conduce?" on the index: criteria, then value (Alfa 3, Gama 2, Beta 1 with 9000, Delta 1 with 700).
    expect(out.list).toEqual(["1", "3", "2", "4"]);
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
        drawn: { split: await drawer(1, "da_split"), rapid: await drawer(1, "da_rapid"), december: await drawer(1, "da_year_end"), main: await drawer(3, "da_concentration"), rapidGama: await drawer(3, "da_rapid") },
      };
    });
    expect(out.alfa).toEqual([{ code: "da_split", years: [2019, 2020] }, { code: "da_year_end", years: [2022] }, { code: "da_rapid" }]);
    expect(out.gama).toEqual([{ code: "da_rapid" }, { code: "da_concentration", share: 0.68 }]);
    // The profile's facts carry the records and the shares of the two rates; a profile without a signal has none.
    expect(out.factsAlfa).toEqual([
      { code: "da_split", years: [2019, 2020], rows: 3 }, { code: "da_year_end", years: [2022], rows: 4 }, { code: "da_rapid", rows: 8, share: 8 / 30 },
    ]);
    expect(out.factsGama).toEqual([{ code: "da_rapid", rows: 6, share: 6 / 22 }, { code: "da_concentration", share: 0.68, rows: 15 }]);
    expect(out.factsEpsilon).toEqual([]);
    expect(out.frozenAlfa).toEqual(out.factsAlfa);
    // One number: the count on the row, the card's fact, the drawer's total.
    expect(out.drawn).toEqual({ split: 3, rapid: 8, december: 4, main: 15, rapidGama: 6 });
  });

  it("opens only the profiles that have the signal: a row flagged under the rule's thresholds does not enter the sources", async () => {
    const out = await withAskFixture(connection!.sql, "scatter_cohort", seed, async (q) => {
      const spec = cloud();
      const rapid = await sources(q, spec, { flag: "da_rapid" });
      const chosen = await sources(q, cloud({ scatter: { rankBy: "risk", flag: "da_rapid" } }), {});
      const epsilon = await sources(q, spec, { flag: "da_rapid", entityIds: [id(5)], role: "authority" });
      const whole = await sources(q, cloud({ scatter: { rankBy: "risk", flag: "da_rapid" } }), { entityIds: [id(1)], role: "authority" });
      return { rapid: rapid.total, chosen: chosen.total, epsilon: epsilon.total, whole: whole.total, groups: rapid.profileCount, notes: rapid.scopeNotes.filter((n) => n.startsWith("Sursele semnalului „")) };
    });
    // Alfa's 8 and Gama's 6 (Epsilon's two flagged rows are not counted: it does not have the signal).
    expect(out.rapid).toBe(14);
    expect(out.chosen).toBe(14);
    expect(out.epsilon).toBe(0);
    expect(out.whole).toBe(8);
    expect(out.groups).toBe(2);
    expect(out.notes).toEqual(["Sursele semnalului „Finalizare rapidă”: achizițiile finalizate în mai puțin de o oră de la publicare, nu tot istoricul profilurilor."]);
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
        const r = await runRows(q, spec, await ground(q, spec.filters), page, { scope: { flag: "da_rapid" }, sort, dir, ...(search ? { search } : {}) } as never);
        if ("error" in r) throw new Error(r.error);
        return { total: r.total, value: r.value, from: r.dateFrom, to: r.dateTo, ids: r.rows.map((row) => row.refId) };
      };
      const pairs: [unknown, unknown][] = [];
      for (const [sort, dir] of [["value", "desc"], ["date", "asc"], ["source", "desc"]]) for (const page of [0, 1])
        pairs.push([await run(sort!, dir!, page), await run(sort!, dir!, page, "comuna")]);
      // The index the nightly build makes (TRANSACTION_MART_BUILD_INDEXES), on the fixture's copy of the mart.
      await q.unsafe(TRANSACTION_MART_BUILD_INDEXES.find((index) => index.name === "da_tx_flagged_idx")!.definition);
      await q.unsafe("set local enable_seqscan = off");
      const keys = flaggedRecordKeys(q, "supplier", "da_rapid", q`select ${BASE + 107}::bigint`);
      const plan = (await q`explain select count(*), sum(k.closing_value) from ${keys} k`) as unknown as { "QUERY PLAN": string }[];
      await q.unsafe("set local enable_seqscan = on");
      return { pairs, plan: plan.map((line) => line["QUERY PLAN"]).join("\n") };
    });
    for (const [keyed, whole] of out.pairs) expect(keyed).toEqual(whole);
    // Alfa's 8 and Gama's 6, ten on the first page and four on the second.
    expect(out.pairs.map(([keyed]) => (keyed as { ids: string[] }).ids.length)).toEqual([10, 4, 10, 4, 10, 4]);
    // The partial index is usable only when the query repeats its predicate (an unvacuumed copy reads it by bitmap or index scan).
    expect(out.plan).toMatch(/(Scan using|Scan on) da_tx_flagged_idx/);
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
      const all = (r: Awaited<ReturnType<typeof locate>>) => "matches" in r ? { total: r.total, by: r.by, matches: r.matches.map((m) => [m.name, m.rank, m.profile?.why ?? null, m.n]) } : r;
      return { found: all(found), small: all(small), withSignal: all(withSignal), byValue: all(byValue), outside: all(outside) };
    });
    expect(out.found).toEqual({ total: 4, by: "risk", matches: [["Comuna Gama", 2, null, 22]] });
    // Under 20 acquisitions: not in the list, said so; it is in the cloud, so it is found.
    expect(out.small).toEqual({ total: 4, by: "risk", matches: [["Comuna Mica 7", null, "below", 10]] });
    // Gama is in the group but has no possible split: found, with the reason it has no place.
    expect(out.withSignal).toEqual({ total: 2, by: "risk", matches: [["Comuna Gama", null, "signal", 22]] });
    expect(out.byValue).toEqual({ total: 4, by: "value", matches: [["Comuna Alfa", 2, null, 30]] });
    // The group is Buzau's: a hospital of Cluj is not found.
    expect(out.outside).toEqual({ total: 4, by: "risk", matches: [] });
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
        select 'da', (r->>'sicap_da_id')::bigint, 'da_rapid', true, 'rf-test' from jsonb_array_elements(${JSON.stringify(flagged("da_rapid"))}::jsonb) r`;
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
      const before = { rapid: await checked("da_rapid"), split: await checked("da_split", 1), december: await checked("da_year_end", 1), main: await checked("da_concentration", 3) };
      // The mart and the build part: one acquisition of the signal leaves the build's side.
      await q`delete from core.flags where subject_type = 'da' and subject_id = ${rows.find((r) => r.da_flags.includes("da_rapid"))!.sicap_da_id}`;
      return { before, after: await checked("da_rapid") };
    }, { globals: [...ENGINE_GLOBAL_TABLES, "core.flags"] });
    expect(out.before).toEqual({ rapid: [14, true, false], split: [3, true, false], december: [4, true, false], main: [15, null, false] });
    expect(out.after).toEqual([14, false, true]);
  });

  it("reconciles a firm's rapid and round on its own acquisitions, never one where the authority supplies itself (S6, F6b verify)", async () => {
    const firm = BASE + 101, own = BASE + 1;
    const fill = async (q: DbSql) => {
      await seed(q);
      // The firm 101 sells to Alfa and Beta; Alfa also "buys" from itself (a supplier equal to the authority is none).
      const da = [
        { id: 1, authority: BASE + 1, supplier: firm, value: 100, flag: "da_rapid" }, { id: 2, authority: BASE + 2, supplier: firm, value: 250, flag: "da_rapid" },
        { id: 3, authority: BASE + 2, supplier: firm, value: 40, flag: "da_round" }, { id: 4, authority: own, supplier: own, value: 900, flag: "da_rapid" },
        { id: 5, authority: BASE + 2, supplier: own, value: 70, flag: "da_rapid" },
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
      rapid: await builtFlagTotals(q, "supplier", "da_rapid", q`select ${firm}::bigint`),
      round: await builtFlagTotals(q, "supplier", "da_round", q`select ${firm}::bigint`),
      // Alfa as a firm: only what it sold to Beta, not its acquisition from itself.
      self: await builtFlagTotals(q, "supplier", "da_rapid", q`select ${own}::bigint`),
    }), { globals: [...ENGINE_GLOBAL_TABLES, "core.flags"] });
    expect(out).toEqual({ rapid: { records: 2, value: "350" }, round: { records: 1, value: "40" }, self: { records: 1, value: "70" } });
  });
});

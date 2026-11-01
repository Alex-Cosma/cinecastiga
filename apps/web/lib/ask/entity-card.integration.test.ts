import { afterAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { forgetAuthorityKinds } from "./authority-kind";
import { forgetPodiums, runRows, runSpec, type BlockData } from "./compile";
import { forgetNationalTotals, nationalTotals } from "./entity-card";
import { evidenceCsv } from "./evidence";
import { podiumFacts } from "./answer-facts";
import { facetCounts, forgetFacets } from "./facets";
import { sameAnswerCore } from "./answer-core";
import { retarget } from "./filters/retarget";
import { ground } from "./ground";
import { forgetMartColumns } from "./mart-columns";
import { unsupportedPopulationView } from "./population";
import { validateSpec, type AskSpec } from "./spec";
import { testDatabaseUrl, withAskFixture } from "./test-fixture";

/*
 * entity_card-3 (rf-2026.18; entity_card-2: F6c, plan §4.13, §6.2) on a rolled-back fixture of the engine's tables: by
 * value the podium is the ranking's first three with its total (live, under a band, and on the precomputed national
 * ranking, where the total is agg_national's); the facts of the places are their own records'; on the risk axis the
 * answer lists the profiles with a score by the displayed score, then the value, and the sources are
 * exactly those profiles; a firm's size and seat select the profiles; an institution's kind (D1) too. A dedicated
 * seap_test_* database (schema through migration 0087, the score columns), one transaction rolled back.
 */

const url = testDatabaseUrl("entity_card-3 fixtures");
const connection = url ? createDb(url, { max: 1 }) : null;
afterAll(async () => { forgetMartColumns(); await connection?.sql.end(); });

const BASE = 9_190_000_000;
const id = (n: number) => String(BASE + n);
/** n, name, SEAP county, seat (ONRC), employees, balance year. */
const FIRMS: [number, string, string, string | null, number | null, number | null][] = [
  [1, "Alfa Constructii SRL", "Cluj", "Cluj", 120, 2024],
  [2, "Beta Asociere SRL", "Ilfov", "Ilfov", 0, 2024],
  [3, "Gama Unica SRL", "Cluj", "Cluj", 0, 2020],
  [4, "Delta Mica SRL", "Bucuresti", "Bucuresti", 5, 2024],
  [5, "Epsilon Fara Bilant SRL", "Cluj", "Cluj", null, null],
  [6, "Zeta Mare SRL", "Ilfov", "Ilfov", 50, 2025],
];
/** Institutions: n, name, county, n_das, patterns, unrounded score (the value is n_das × 10). */
const AUTHORITIES: [number, string, string, number, string[], number][] = [
  [50, "Primaria Fixture", "Cluj", 40, [], 0],
  [61, "Spitalul Fixture 1", "Cluj", 30, ["da_split"], 40],
  [62, "Spitalul Fixture 2", "Cluj", 60, ["da_year_end"], 40],
  [63, "Institutul Oncologic Fixture Cluj-Napoca", "Cluj", 25, ["da_round"], 40],
  [64, "Spitalul Fixture 4", "Cluj", 90, ["da_split", "da_above_ceiling"], 64],
  [65, "Spitalul Fixture 5", "Cluj", 50, [], 0],
  [66, "Scoala Fixture 6", "Cluj", 45, ["da_split"], 40],
];
/**
 * Firms with profiles: n, accepted direct acquisitions, value, patterns, unrounded score. Zeta 79; Gama, Alfa and Beta
 * all show 78 and are ordered by value (Gama's 78,45 does not put it first: the screen shows the same 78%); Epsilon 20;
 * Delta without a pattern.
 */
const FLAGGED: [number, number, number, string[], number][] = [
  [1, 30, 6200, ["da_split", "da_dependence", "da_above_ceiling"], 78.4],
  [2, 25, 3000, ["da_split", "da_dependence", "da_round"], 78.4],
  [3, 40, 2000, ["da_split", "da_dependence", "da_round"], 78.45],
  [4, 22, 500, [], 0],
  [5, 50, 100, ["da_split"], 20],
  [6, 100, 9000, ["da_split", "da_dependence", "da_above_ceiling"], 78.6],
];

async function seed(q: DbSql): Promise<void> {
  const ents = [
    ...FIRMS.map(([n, name, county]) => ({ id: id(n), name, county })),
    ...AUTHORITIES.map(([n, name, county]) => ({ id: id(n), name, county })),
  ];
  await q`insert into core.entities (id, name_display, name_normalized, cui_canonical, cui_valid, county, country_code, is_foreign)
    select (r->>'id')::bigint, r->>'name', lower(r->>'name'), r->>'id', true, r->>'county', 'RO', false from jsonb_array_elements(${JSON.stringify(ents)}::jsonb) r`;
  await q`insert into marts.entity_profile (entity_id, role, name_display, county, n_das, n_contracts, total_ron_full, total_ron_split, is_foreign, employees, employees_year, seat_county, seat_source, first_activity)
    select (r->>'id')::bigint, 'supplier', r->>'name', r->>'county', 5, 1, 1000, (r->>'value')::numeric, false, (r->>'emp')::int, (r->>'year')::int, r->>'seat', 'onrc', '2019-05-02'
    from jsonb_array_elements(${JSON.stringify(FIRMS.map(([n, name, county, seat, emp, year]) => ({ id: id(n), name, county, seat, emp, year, value: 1000 })))}::jsonb) r`;
  await q`insert into marts.entity_profile (entity_id, role, name_display, county, n_das, n_contracts, total_ron_full, total_ron_split, is_foreign)
    select (r->>'id')::bigint, 'authority', r->>'name', r->>'county', (r->>'n')::int, 0, 1000, 1000, false from jsonb_array_elements(${JSON.stringify(AUTHORITIES.map(([n, name, county, nDas]) => ({ id: id(n), name, county, n: nDas })))}::jsonb) r`;
  // The profiles with enough acquisitions, with their score as the build writes it (score.ts): the unrounded score, the
  // displayed one rounded, cri = score / 100 (old links), the patterns met.
  await q`insert into marts.entity_flags (entity_id, role, name_display, county, n_das, total_ron, score_raw, score, cri, n_flags, flags)
    select (r->>'id')::bigint, 'supplier', r->>'name', r->>'county', (r->>'n')::int, (r->>'value')::numeric, (r->>'raw')::real, round((r->>'raw')::numeric),
           round(round((r->>'raw')::numeric) / 100, 4), jsonb_array_length(r->'flags'), r->'flags'
    from jsonb_array_elements(${JSON.stringify(FLAGGED.map(([n, nDas, value, flags, raw]) => ({ id: id(n), name: FIRMS.find((f) => f[0] === n)![1], county: FIRMS.find((f) => f[0] === n)![2], n: nDas, value, flags, raw })))}::jsonb) r`;
  await q`insert into marts.entity_flags (entity_id, role, name_display, county, n_das, total_ron, score_raw, score, cri, n_flags, flags)
    select (r->>'id')::bigint, 'authority', r->>'name', r->>'county', (r->>'n')::int, (r->>'n')::numeric * 10, (r->>'raw')::real, round((r->>'raw')::numeric),
           round(round((r->>'raw')::numeric) / 100, 4), jsonb_array_length(r->'flags'), r->'flags'
    from jsonb_array_elements(${JSON.stringify(AUTHORITIES.map(([n, name, county, nDas, flags, raw]) => ({ id: id(n), name, county, n: nDas, flags, raw })))}::jsonb) r`;
  await q`insert into marts.national_stats (kind,year) values ('da',2025),('award',2025)`;
  await q`insert into marts.spend_by_county (county, role, n, total_ron) values ('Cluj','authority',1,0),('Ilfov','authority',1,0),('Cluj','supplier',1,0),('Ilfov','supplier',1,0)`;
  // The records by value: A 6200 (200 direct, 1000 in a joint contract of 2, 5000 in one), B 3000 (a joint contract of 3), C 2000 (one
  // direct acquisition), D 500, E 100; Zeta 4 (so the ranking has a small tail).
  const buyer = id(50);
  await q`insert into marts.da_transactions (sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date) values
    (1,'DA1',${buyer},'Primaria Fixture',${id(1)},'Alfa Constructii SRL','Cluj','33600000-6',100,'2025-01-10'),
    (2,'DA2',${buyer},'Primaria Fixture',${id(1)},'Alfa Constructii SRL','Cluj','33600000-6',100,'2025-02-10'),
    (3,'DA3',${buyer},'Primaria Fixture',${id(3)},'Gama Unica SRL','Cluj','33600000-6',2000,'2025-03-10'),
    (4,'DA4',${buyer},'Primaria Fixture',${id(4)},'Delta Mica SRL','Cluj','33600000-6',500,'2025-04-10'),
    (5,'DA5',${buyer},'Primaria Fixture',${id(5)},'Epsilon Fara Bilant SRL','Cluj','33600000-6',100,'2025-05-10'),
    (6,'DA6',${buyer},'Primaria Fixture',${id(6)},'Zeta Mare SRL','Cluj','33600000-6',4,'2025-06-10')`;
  await q`insert into marts.contract_transactions (contract_id,contract_no,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date,ca_notice_id,n_winners,contract_value_full,procedure_type) values
    (11,'CT11',${buyer},'Primaria Fixture',${id(1)},'Alfa Constructii SRL','Cluj','33600000-6',1000,'2025-07-10',901,2,2000,'Licitatie deschisa'),
    (12,'CT12',${buyer},'Primaria Fixture',${id(1)},'Alfa Constructii SRL','Cluj','33600000-6',5000,'2025-08-10',902,1,5000,'Licitatie deschisa'),
    (13,'CT13',${buyer},'Primaria Fixture',${id(2)},'Beta Asociere SRL','Cluj','33600000-6',3000,'2025-09-10',903,3,9000,'Licitatie deschisa')`;
  // The precomputed national ranking and its totals (agg_top_entities keeps the leaders; agg_national both channels).
  await q`insert into marts.agg_top_entities (role, eid, nm, county, v_plaf, n_plaf, v_all, n_all) values
    ('supplier', ${id(1)}, 'Alfa Constructii SRL', 'Cluj', 6200, 3, 6200, 3), ('supplier', ${id(2)}, 'Beta Asociere SRL', 'Ilfov', 3000, 1, 3000, 1),
    ('supplier', ${id(3)}, 'Gama Unica SRL', 'Cluj', 2000, 1, 2000, 1), ('supplier', ${id(4)}, 'Delta Mica SRL', 'Bucuresti', 500, 1, 500, 1)`;
  await q`insert into marts.agg_national (src, v_plaf, n_plaf, v_all, n_all) values ('da', 2804, 6, 2804, 6), ('contracts', 9000, 3, 9000, 3)`;
  // The accepted direct acquisitions behind the profiles (their sources).
  await q`insert into core.direct_acquisitions (sicap_da_id, da_code, authority_entity_id, supplier_entity_id, closing_value, finalization_date, state)
    select 1000 + n, 'DAX' || n, ${buyer}::bigint, (${BASE}::bigint + s), 100, '2025-03-01'::timestamptz + (n || ' days')::interval, 'Oferta acceptata'
    from (values (1, 1), (2, 1), (3, 1), (4, 2), (5, 3), (6, 4), (7, 6), (8, 6)) v(n, s)`;
  forgetMartColumns(); forgetAuthorityKinds(); forgetFacets(); forgetNationalTotals();
}

const T = { yearFrom: 2025, yearTo: 2025 };
async function run(q: DbSql, raw: Record<string, unknown>, grounded: Record<string, unknown> = {}) {
  const spec = validateSpec({ block: "entity_card", measure: "value", ...raw });
  if ("error" in spec) throw new Error(spec.error);
  const grounding = { ...(await ground(q, spec.filters, spec.population)), ...grounded };
  const result = await runSpec(q, spec, grounding);
  return { spec, grounding, result };
}
const card = (data: BlockData) => { if (data.block !== "entity_card") throw new Error(data.block); return data; };
const answer = async (q: DbSql, raw: Record<string, unknown>) => {
  const { result, spec, grounding } = await run(q, raw);
  if ("error" in result) throw new Error(result.error);
  return { data: card(result.data), spec, grounding };
};

describe.runIf(Boolean(connection))("entity_card-3: „Cine conduce?” (isolated PostgreSQL)", () => {
  it("by value: the podium is the ranking's first three, the total the selection's, place 1 the card", async () => {
    const out = await withAskFixture(connection!.sql, "ec_value", seed, async (q) => {
      const podium = await answer(q, { dim: "supplier", rankBy: "value", filters: T });
      const ranking = await run(q, { block: "table", dim: "supplier", topN: 10, filters: T });
      const authorities = await answer(q, { dim: "authority", rankBy: "value", filters: T });
      const hospitals = await answer(q, { dim: "supplier", rankBy: "value", filters: { ...T, seatCounty: "Ilfov" } });
      return { podium, ranking, authorities, hospitals };
    });
    const ranked = "error" in out.ranking.result ? null : out.ranking.result.data;
    if (ranked?.block !== "table") throw new Error("no ranking");
    const { podium } = out.podium.data;
    expect(out.podium.data.ranking).toBeUndefined();
    expect(out.podium.data.ties).toBeUndefined();
    expect(podium!.version).toBe(2);
    expect(podium!.places.map((p) => [p.entityId, p.value, p.count])).toEqual(ranked.rows.slice(0, 3).map((r) => [r.entityId, r.value, r.count]));
    expect(podium!.places.map((p) => p.name)).toEqual(["Alfa Constructii SRL", "Beta Asociere SRL", "Gama Unica SRL"]);
    // The total is the whole selection's, the same as the ranking's: 6 firms, 11.804 lei.
    expect(podium!.total).toEqual(ranked.totals);
    expect(podium!.total).toEqual({ value: 11804, count: 9, entities: 6 });
    expect(out.podium.data.card).toMatchObject({ entityId: id(1), name: "Alfa Constructii SRL", value: 6200, count: 4, role: "supplier", cri: null, flags: [] });
    // An institution's podium reads the buyers' ranking.
    expect(out.authorities.data.podium!.places.map((p) => p.name)).toEqual(["Primaria Fixture"]);
    expect(out.authorities.data.podium!.total!.entities).toBe(1);
    // A seat selects firms: the podium of the firms seated in Ilfov.
    expect(out.hospitals.data.podium!.places.map((p) => p.name)).toEqual(["Beta Asociere SRL", "Zeta Mare SRL"]);
  }, 60000);

  it("under a band of CÂȘTIGĂTORII the share is the category's, and the selection's total stays beside it", async () => {
    const out = await withAskFixture(connection!.sql, "ec_band", seed, async (q) => {
      const band = await answer(q, { dim: "supplier", rankBy: "value", filters: { ...T, maxEmployees: 0 } });
      const { result } = await run(q, { dim: "supplier", rankBy: "value", filters: { ...T, maxEmployees: 0 } });
      const plain = await run(q, { dim: "supplier", rankBy: "value", filters: T });
      return { ...band, displaySql: "error" in result ? "" : result.displaySql, plainSql: "error" in plain.result ? "" : plain.result.displaySql };
    });
    const { podium } = out.data;
    // Firms with no employees: Beta (3000) and Gama (2000); the whole selection is 11.804 lei over 6 firms.
    expect(podium!.places.map((p) => p.name)).toEqual(["Beta Asociere SRL", "Gama Unica SRL"]);
    expect(podium!.total).toEqual({ value: 5000, count: 2, entities: 2 });
    expect(podium!.selection).toEqual({ value: 11804, count: 9, entities: 6 });
    // „Cum am calculat” says the podium's denominator (the category), not the ranking's (the whole selection).
    expect(out.displaySql).toMatch(/„% din categorie” este din valoarea firmelor din categorie/);
    expect(out.displaySql).not.toMatch(/sunt ale întregii selecții/);
    expect(out.plainSql).not.toMatch(/din categorie/);
  }, 60000);

  it("on the precomputed national ranking, the total is agg_national's and the firms are the profiles'", async () => {
    const out = await withAskFixture(connection!.sql, "ec_national", seed, async (q) => answer(q, { dim: "supplier", rankBy: "value", filters: {} }));
    const { podium } = out.data;
    expect(podium!.places.map((p) => p.name)).toEqual(["Alfa Constructii SRL", "Beta Asociere SRL", "Gama Unica SRL"]);
    // Both channels of agg_national (the analysis ceilings applied), the firms with value on their profiles.
    expect(podium!.total).toEqual({ value: 11804, count: 9, entities: 6 });
    expect(podium!.places[0]!.county).toBe("Cluj");
  }, 60000);

  it("keeps the national totals per build: a change in place keeps them, a rebuilt agg_national gives the new ones", async () => {
    const out = await withAskFixture(connection!.sql, "ec_national_kept", seed, async (q) => {
      const first = await nationalTotals(q, "supplier");
      // In place (the same files): the count over the profiles is not paid again.
      await q`update marts.entity_profile set total_ron_split = 0 where entity_id = ${id(4)}`;
      const kept = await nationalTotals(q, "supplier");
      // A new build: the rollup is dropped and created again, with new files.
      await q`create table marts.agg_national_next as table marts.agg_national`;
      await q`drop table marts.agg_national`;
      await q`alter table marts.agg_national_next rename to agg_national`;
      await q`update marts.agg_national set v_plaf = v_plaf * 2`;
      const rebuilt = await nationalTotals(q, "supplier");
      return { first, kept, rebuilt };
    });
    expect(out.first).toEqual({ value: 11804, count: 9, entities: 6 });
    expect(out.kept).toEqual(out.first);
    expect(out.rebuilt).toEqual({ value: 23608, count: 9, entities: 5 });
  }, 60000);

  it("gives the places' facts from their own records and their profiles", async () => {
    const out = await withAskFixture(connection!.sql, "ec_facts", seed, async (q) => {
      const { data, spec } = await answer(q, { dim: "supplier", rankBy: "value", filters: T });
      const facts = await podiumFacts(q, spec as AskSpec, data.podium!.places.map((p) => p.entityId));
      const wrong = await podiumFacts(q, { ...(spec as AskSpec), rankBy: "risk" }, [id(1)]);
      return { facts, wrong };
    });
    if ("error" in out.facts || "timeout" in out.facts || "precompute" in out.facts) throw new Error(JSON.stringify(out.facts));
    const [alfa, beta, gama] = out.facts.places;
    // Alfa: 1000 of its 6200 in a contract of two winners; its largest record is the 5000 contract; 120 employees (2024).
    expect(alfa).toMatchObject({ entityId: id(1), joint: 1000, largest: { value: 5000, src: "contracts" }, employees: 120, employeesYear: 2024 });
    // Beta: all of its 3000 in a joint contract; it is that one record.
    expect(beta).toMatchObject({ entityId: id(2), joint: 3000, largest: { value: 3000, src: "contracts" }, employees: 0 });
    expect(gama).toMatchObject({ entityId: id(3), joint: 0, largest: { value: 2000, src: "da" }, employeesYear: 2020 });
    // Facts describe the value axis only.
    expect("error" in out.wrong).toBe(true);
  }, 60000);

  it("counts the places' facts over the ranking's records: the record threshold leaves out what the ranking leaves out", async () => {
    const out = await withAskFixture(connection!.sql, "ec_facts_min", seed, async (q) => {
      // A 9.000 lei direct acquisition to Alfa from a buyer with that one record: under „at least 2 records per institution” it
      // is in neither the ranking nor the facts.
      await q`insert into marts.da_transactions (sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date)
        values (88,'DA88',${id(61)},'Spitalul Fixture 1',${id(1)},'Alfa Constructii SRL','Cluj','33600000-6',9000,'2025-11-10')`;
      const { data, spec } = await answer(q, { dim: "supplier", rankBy: "value", filters: T, minimumRecords: { role: "authority", count: 2 } });
      const facts = await podiumFacts(q, spec as AskSpec, data.podium!.places.map((p) => p.entityId));
      return { podium: data.podium!, facts };
    });
    if ("error" in out.facts || "timeout" in out.facts || "precompute" in out.facts) throw new Error(JSON.stringify(out.facts));
    expect(out.podium.places[0]).toMatchObject({ entityId: id(1), value: 6200, count: 4 });
    expect(out.facts.places[0]).toMatchObject({ entityId: id(1), joint: 1000, largest: { value: 5000, src: "contracts" } });
    // The data's latest filing year, what an old balance sheet is old against.
    expect(out.facts.balanceYear).toBe(2025);
  }, 60000);

  it("on the risk axis: the profiles with a score by the displayed score, then the value; the card is the first", async () => {
    const out = await withAskFixture(connection!.sql, "ec_ranking", seed, async (q) => ({
      firms: await answer(q, { dim: "supplier", rankBy: "risk", filters: {} }),
      cluj: await answer(q, { dim: "supplier", rankBy: "risk", filters: { seatCounty: "Cluj" } }),
      none: await answer(q, { dim: "supplier", rankBy: "risk", filters: { maxEmployees: 0 } }),
      band: await answer(q, { dim: "supplier", rankBy: "risk", filters: { minEmployees: 1, maxEmployees: 9 } }),
    }));
    const { ranking } = out.firms.data;
    expect(out.firms.data.podium).toBeUndefined();
    expect(out.firms.data.ties).toBeUndefined();
    // Zeta 79 alone; Alfa, Beta and Gama at 78 by value (Gama's unrounded 78,45 does not count); Epsilon 20; Delta,
    // without a pattern, not listed.
    expect(ranking).toMatchObject({ version: 3, pool: 6, scored: 5, top: 79, topCount: 1 });
    expect(ranking!.rows.map((r) => [r.name, r.score])).toEqual([
      ["Zeta Mare SRL", 79], ["Alfa Constructii SRL", 78], ["Beta Asociere SRL", 78], ["Gama Unica SRL", 78], ["Epsilon Fara Bilant SRL", 20],
    ]);
    expect(ranking!.rows[0]).toMatchObject({ entityId: id(6), county: "Ilfov", count: 100, value: 9000, nFlags: 3, flags: ["da_split", "da_dependence", "da_above_ceiling"] });
    expect(out.firms.data.card).toMatchObject({ entityId: id(6), cri: null, score: 79, nFlags: 3 });
    // The seat (the profiles' county): Alfa and Gama tied on 78 in Cluj (by value), then Epsilon.
    expect(out.cluj.data.ranking).toMatchObject({ pool: 3, scored: 3, top: 78, topCount: 2 });
    expect(out.cluj.data.ranking!.rows.map((r) => r.name)).toEqual(["Alfa Constructii SRL", "Gama Unica SRL", "Epsilon Fara Bilant SRL"]);
    // The size of the firms (their latest filing) selects the profiles: no employees = Gama and Beta; 1–9 = Delta alone,
    // who has no score: „Nu are semnale în profil”, the profile still listed by value for the sources.
    expect(out.none.data.ranking!.rows.map((r) => r.name)).toEqual(["Beta Asociere SRL", "Gama Unica SRL"]);
    expect(out.none.data.ranking).toMatchObject({ pool: 2, scored: 2, top: 78, topCount: 2 });
    expect(out.band.data.ranking).toMatchObject({ pool: 1, scored: 0, top: 0, topCount: 1 });
    expect(out.band.data.ranking!.rows.map((r) => [r.name, r.score])).toEqual([["Delta Mica SRL", 0]]);
    expect(out.band.data.card.name).toBe("Delta Mica SRL");
  }, 60000);

  it("refuses a firm's size on the institutions' index, and on the risk cloud", () => {
    const authority = { block: "entity_card", dim: "authority", rankBy: "risk", measure: "value", filters: { maxEmployees: 0 } };
    const firms = { block: "entity_card", dim: "supplier", rankBy: "risk", measure: "value", filters: { maxEmployees: 0 } };
    expect(unsupportedPopulationView(authority as unknown as AskSpec)).toMatch(/profiluri istorice/);
    expect(unsupportedPopulationView(firms as unknown as AskSpec)).toBeNull();
    expect(unsupportedPopulationView({ ...firms, block: "scatter" } as unknown as AskSpec)).toMatch(/profiluri istorice/);
  });

  it("takes an institution's kind by name, the clinical institutes with the hospitals (D1)", async () => {
    const out = await withAskFixture(connection!.sql, "ec_kind", seed, async (q) => ({
      hospitals: await answer(q, { dim: "authority", rankBy: "risk", filters: { authorityKind: "spital" } }),
      // The fixture has no hospital with records: the answer by value is empty, not an error.
      value: await answer(q, { dim: "authority", rankBy: "value", filters: { ...T, authorityKind: "spital" } }),
    }));
    // Spitalul 4 (64) alone at the top; the institute and the hospitals at 40 follow by value, Spitalul 5 has no score and
    // the school is no hospital.
    expect(out.hospitals.data.ranking).toMatchObject({ pool: 5, scored: 4, top: 64, topCount: 1 });
    expect(out.hospitals.data.ranking!.rows.map((r) => [r.name, r.score])).toEqual([
      ["Spitalul Fixture 4", 64], ["Spitalul Fixture 2", 40], ["Spitalul Fixture 1", 40], ["Institutul Oncologic Fixture Cluj-Napoca", 40],
    ]);
    expect(out.value.data).toMatchObject({ block: "entity_card", empty: true });
  }, 60000);

  it("lists the sources of the answer: the tied profiles' direct acquisitions, one profile's, and nobody else's", async () => {
    const out = await withAskFixture(connection!.sql, "ec_sources", seed, async (q) => {
      const { spec, grounding } = await answer(q, { dim: "supplier", rankBy: "risk", filters: {} });
      const group = await runRows(q, spec, grounding, 0, { limit: 100 });
      const one = await runRows(q, spec, grounding, 0, { limit: 100, scope: { entityIds: [id(1)], role: "supplier" } });
      // A profile the answer does not list (Delta, no score) is not in it: its sources are refused empty, not listed.
      const below = await runRows(q, spec, grounding, 0, { limit: 100, scope: { entityIds: [id(4)], role: "supplier" } });
      // A group in which nobody has a score (1–9 employees: Delta): the sources are its profiles by value, and say so.
      const nobody = await answer(q, { dim: "supplier", rankBy: "risk", filters: { minEmployees: 1, maxEmployees: 9 } });
      const none = await runRows(q, nobody.spec, nobody.grounding, 0, { limit: 100 });
      return { group, one, below, none };
    });
    if ("error" in out.group || "error" in out.one || "error" in out.below || "error" in out.none) throw new Error(JSON.stringify(out));
    // The five listed: Zeta (2), Alfa (3), Beta (1), Gama (1), Epsilon (none) of the seeded acquisitions; Delta's is not listed.
    expect([out.group.sourceTotal, out.group.profileCount]).toEqual([7, 5]);
    expect([...new Set(out.group.rows.map((row) => row.supplierId))].sort()).toEqual([id(1), id(2), id(3), id(6)]);
    expect([out.one.sourceTotal, out.one.profileCount]).toEqual([3, 1]);
    expect([out.below.sourceTotal, out.below.profileCount]).toEqual([0, 0]);
    expect(evidenceCsv(out.group.rows).trim().split("\n")).toHaveLength(8);
    expect([out.none.sourceTotal, out.none.profileCount]).toEqual([1, 1]);
    expect(out.none.scopeNotes.join(" ")).toMatch(/Niciun profil din grup nu are tipare de risc: sursele sunt ale primelor profiluri după valoare \(cel mult 50\)/);
    expect(out.group.scopeNotes.join(" ")).not.toMatch(/Niciun profil din grup/);
  }, 60000);

  it("by value: each podium place's records are its own, place 1 by default, and an id off the podium is refused", async () => {
    const out = await withAskFixture(connection!.sql, "ec_podium_sources", seed, async (q) => {
      const { spec, grounding } = await answer(q, { dim: "supplier", rankBy: "value", filters: T });
      const place = (n: number) => runRows(q, spec, grounding, 0, { limit: 100, scope: { entityIds: [id(n)], role: "supplier" } });
      return {
        whole: await runRows(q, spec, grounding, 0, { limit: 100 }),
        first: await place(1), second: await place(2), third: await place(3), fourth: await place(4),
      };
    });
    const { whole, first, second, third, fourth } = out;
    if ("error" in whole || "error" in first || "error" in second || "error" in third) throw new Error(JSON.stringify(out));
    // Alfa 4 (two direct acquisitions, two contracts), Beta its joint contract, Gama its direct acquisition.
    expect([whole.sourceTotal, first.sourceTotal, second.sourceTotal, third.sourceTotal]).toEqual([4, 4, 1, 1]);
    expect(second.rows.map((row) => row.supplierId)).toEqual([id(2)]);
    expect(third.rows.map((row) => row.supplierId)).toEqual([id(3)]);
    // Place 2's CSV is its record.
    const csv = evidenceCsv(second.rows).trim().split("\n");
    expect(csv).toHaveLength(2);
    expect(csv[1]).toMatch(/CT13/);
    // Delta is fourth: not on the podium, refused.
    expect(fourth).toMatchObject({ error: expect.stringMatching(/podium/) });
  }, 60000);

  it("by value: the sources read the podium the answer kept for this build, and rank again once it is forgotten", async () => {
    const out = await withAskFixture(connection!.sql, "ec_podium_kept", seed, async (q) => {
      const { spec, grounding } = await answer(q, { dim: "supplier", rankBy: "value", filters: T });
      // In place (the same files): Delta would now lead, but the drawer follows the answer's podium.
      await q`insert into marts.da_transactions (sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date)
        values (89,'DA89',${id(61)},'Spitalul Fixture 1',${id(4)},'Delta Mica SRL','Bucuresti','33600000-6',9000,'2025-11-11')`;
      const kept = await runRows(q, spec, grounding, 0, { limit: 100 });
      const delta = await runRows(q, spec, grounding, 0, { limit: 100, scope: { entityIds: [id(4)], role: "supplier" } });
      forgetPodiums();
      const ranked = await runRows(q, spec, grounding, 0, { limit: 100 });
      return { kept, delta, ranked };
    });
    if ("error" in out.kept || "error" in out.ranked) throw new Error(JSON.stringify(out));
    expect([...new Set(out.kept.rows.map((row) => row.supplierId))]).toEqual([id(1)]);
    expect(out.delta).toMatchObject({ error: expect.stringMatching(/podium/) });
    expect([...new Set(out.ranked.rows.map((row) => row.supplierId))]).toEqual([id(4)]);
  }, 60000);

  it("counts the profiles of each band of the firms' size for the window, the draft's own band left out", async () => {
    const out = await withAskFixture(connection!.sql, "ec_facets", seed, async (q) => {
      const spec = validateSpec({ block: "entity_card", dim: "supplier", rankBy: "risk", measure: "value", filters: { maxEmployees: 0, seatCounty: "Cluj" } }) as AskSpec;
      const counts = await facetCounts(q, spec, "employees");
      const wholeCountry = await facetCounts(q, { ...spec, filters: {} }, "employees");
      const institutions = await facetCounts(q, { ...spec, dim: "authority", filters: {} }, "employees");
      return { counts, wholeCountry, institutions };
    });
    if ("error" in out.counts || "timeout" in out.counts || "precompute" in out.counts) throw new Error(JSON.stringify(out.counts));
    // The band is the window's own key: its options count the profiles seated in Cluj (Alfa, Gama, Epsilon) in each band.
    expect(out.counts.unit).toBe("profiles");
    expect(out.counts.options.map((o) => [o.value, o.n])).toEqual([["0", 1], ["1-9", 0], ["10-49", 0], ["50-249", 1], ["250+", 0]]);
    expect(out.counts.rest).toMatchObject({ n: 1 });
    expect(out.counts.total.n).toBe(3);
    if ("error" in out.wholeCountry || "timeout" in out.wholeCountry || "precompute" in out.wholeCountry) throw new Error(JSON.stringify(out.wholeCountry));
    expect(out.wholeCountry.options.map((o) => o.n)).toEqual([2, 1, 0, 2, 0]);
    expect(out.wholeCountry.total.n).toBe(6);
    // An institution has no size of its own: the window is not offered on its index.
    expect("error" in out.institutions).toBe(true);
  }, 60000);

  it("changes what a watch compares only when the listed profiles or their scores change, not their values or the pool", async () => {
    const out = await withAskFixture(connection!.sql, "ec_watch", seed, async (q) => {
      const raw = { dim: "supplier", rankBy: "risk", filters: {} };
      const before = (await answer(q, raw)).data;
      // A profile without a score: the pool grows, the list is the same.
      await q`insert into marts.entity_flags (entity_id, role, name_display, county, n_das, total_ron, cri, n_flags, flags, score, score_raw) values (${id(70)}, 'supplier', 'Mica SRL', 'Cluj', 21, 5, 0, 0, '[]', 0, 0)`;
      // A listed profile's value grows past another's with the same score: the screen's order moves, the answer does not.
      await q`update marts.entity_flags set total_ron = 7000 where entity_id = ${id(2)} and role = 'supplier'`;
      const poolOnly = (await answer(q, raw)).data;
      // A new profile tied on the best score: the list and the tie change.
      await q`insert into marts.entity_flags (entity_id, role, name_display, county, n_das, total_ron, cri, n_flags, flags, score, score_raw)
        values (${id(71)}, 'supplier', 'Noua SRL', 'Cluj', 30, 70, 0.79, 3, '["da_split","da_dependence","da_round"]', 79, 78.6)`;
      const grown = (await answer(q, raw)).data;
      const podiumBefore = (await answer(q, { dim: "supplier", rankBy: "value", filters: T })).data;
      await q`insert into marts.da_transactions (sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date)
        values (77,'DA77',${id(50)},'Primaria Fixture',${id(4)},'Delta Mica SRL','Cluj','33600000-6',10000,'2025-10-10')`;
      const podiumAfter = (await answer(q, { dim: "supplier", rankBy: "value", filters: T })).data;
      return { before, poolOnly, grown, podiumBefore, podiumAfter };
    });
    expect(out.poolOnly.ranking!.pool).toBe(out.before.ranking!.pool + 1);
    expect(out.poolOnly.ranking!.rows.map((r) => r.name).slice(1, 3)).toEqual(["Beta Asociere SRL", "Alfa Constructii SRL"]);
    expect(sameAnswerCore("entity_card", out.before, out.poolOnly)).toBe(true);
    expect(out.grown.ranking).toMatchObject({ top: 79, topCount: 2 });
    expect(sameAnswerCore("entity_card", out.before, out.grown)).toBe(false);
    // The podium: a firm that climbs to place 1 changes it; its names alone would not.
    expect(out.podiumAfter.podium!.places[0]!.name).toBe("Delta Mica SRL");
    expect(sameAnswerCore("entity_card", out.podiumBefore, out.podiumAfter)).toBe(false);
  }, 60000);

  it("answers an empty selection as an empty answer (G2), not as an error: by value and on the risk axis", async () => {
    const out = await withAskFixture(connection!.sql, "ec_empty", seed, async (q) => ({
      value: await answer(q, { dim: "supplier", rankBy: "value", filters: { yearFrom: 2025, yearTo: 2025, minEmployees: 250 } }),
      index: await answer(q, { dim: "supplier", rankBy: "risk", filters: { minEmployees: 250 } }),
    }));
    for (const empty of [out.value.data, out.index.data]) {
      expect(empty).toMatchObject({ block: "entity_card", empty: true, card: { entityId: "", role: "supplier" } });
      expect(empty.podium).toBeUndefined();
      expect(empty.ranking).toBeUndefined();
      expect(empty.ties).toBeUndefined();
    }
  }, 60000);

  it("keeps „Tot clasamentul ›” the same selection as a ranking: the conditions it applies stay", () => {
    const spec = { block: "entity_card", dim: "supplier", rankBy: "value", measure: "value", filters: { cpvTerm: "medicamente", ...T, seatCounty: "Cluj", maxEmployees: 0 } };
    const ranking = retarget(spec as never, "table") as unknown as AskSpec;
    expect(ranking.block).toBe("table");
    expect(ranking.filters).toEqual(spec.filters);
    expect(validateSpec({ ...ranking, topN: 10 })).not.toHaveProperty("error");
  });
});

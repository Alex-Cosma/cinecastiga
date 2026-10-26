import { afterAll, describe, expect, it } from "vitest";
import { buildAskRollups, createDb, type DbSql } from "@seap/db";
import { runRows, runSpec } from "./compile";
import { ground } from "./ground";
import { ENTITY_LIVE, facetCounts, facetStats, forgetFacets, locate, type FacetFailure } from "./facets";
import { ABROAD, EMPLOYEE_BAND_BOUNDS, type CountPart, type FacetCounts } from "./facet-parts";
import { forgetAuthorityKinds, readAuthorityKinds } from "./authority-kind";
import { forgetRollupsReady } from "./rollups";
import { forgetMartColumns } from "./mart-columns";
import { PROCEDURE_ORDER, VALUE_RANGES } from "./purchase";
import { AUTHORITY_KINDS, type AskSpec } from "./spec";
import { ENGINE_GLOBAL_TABLES, testDatabaseUrl, withAskFixture } from "./test-fixture";

/*
 * The windows' counts (plan §2.5 "Fațetele", §6.2): the number beside an
 * option is the answer after choosing it, for every part; the rollups give
 * the live counts; the kinds counted per institution are the kinds of the
 * records; the counts are never served across a data checkpoint or a marts
 * build; "Unde e …?" places a name as the ranking does, on the profiles' fast
 * path and on a kept rank vector, which a second search reuses without
 * grouping again. A dedicated seap_test_* database, one transaction rolled back.
 */

const testUrl = testDatabaseUrl("Facet fixtures");
const connection = testUrl ? createDb(testUrl) : null;
afterAll(async () => { await connection?.sql.end(); });

async function load(q: DbSql) {
  await q`insert into marts.national_stats (kind,year) values ('da',2024),('da',2025),('award',2024),('award',2025)`;
  // The buyer's counties ground through spend_by_county.
  await q`insert into marts.spend_by_county (county) values ('Cluj'),('Iasi')`;
  await q`insert into marts.entity_profile (entity_id,role,name_display,county,employees,is_foreign,n_das,n_contracts) values
    (1,'authority','Spitalul Judetean Cluj','Cluj',null,false,0,0),(2,'authority','Comuna Feleacu','Cluj',null,false,0,0),
    (3,'authority','Municipiul Iasi','Iasi',null,false,0,0),(4,'authority','Spitalul Clinic Iasi','Iasi',null,false,0,0),
    (5,'authority','Autoritate fara judet',null,null,false,0,0),
    (10,'supplier','Furnizor A','Bucuresti',5,false,0,0),(11,'supplier','Furnizor B','Cluj',50,false,0,0),(12,'supplier','Furnizor C','IASI',3,false,0,0),
    (13,'supplier','Furnizor D',null,null,false,0,0),(14,'supplier','Furnizor E','Ilfov',0,false,0,0),(15,'supplier','Furnizor Strain','NA',null,true,0,0)`;
  await q`insert into core.entities (id, name_display, name_normalized, cui_valid) select entity_id, name_display, lower(name_display), true from marts.entity_profile`;
  const names = `(select entity_id, name_display from marts.entity_profile)`;
  // Every kind of code, one without; a direct acquisition at and one above the 2 mil. lei ceiling; every size range.
  await q.unsafe(`insert into marts.da_transactions (sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date)
    select v.id, 'DA'||v.id, v.a, an.name_display, v.s, sn.name_display, v.county, v.cpv, v.cv, v.dt
    from (values
      (101,1,10,'Cluj','33600000-6',1000.10,'2024-03-01 10:00'),
      (102,1,10,'Cluj','33600000-6',2000.25,'2025-03-01 10:00'),
      (103,1,11,'Cluj','45000000-7',50000.5,'2025-05-01 10:00'),
      (104,2,11,'Cluj','45233140-2',3000,'2024-06-01 10:00'),
      (105,2,12,'Cluj','79100000-0',750.75,'2025-07-01 10:00'),
      (106,3,12,'Iasi','33600000-6',150000,'2024-02-01 10:00'),
      (107,3,13,'Iasi','30190000-7',2500.5,'2025-02-01 10:00'),
      (108,4,13,'Iasi','48000000-8',4000,'2025-08-01 10:00'),
      (109,4,10,'Iasi','33600000-6',1999999.99,'2025-09-01 10:00'),
      (110,4,10,'Iasi','33600000-6',2000000.01,'2025-09-02 10:00'),
      (111,5,14,null,'45000000-7',800,'2024-11-01 10:00'),
      (112,3,15,'Iasi',null,120,'2025-01-15 10:00'),
      (113,1,14,'Cluj','90000000-7',0,'2025-01-01 10:00'),
      (114,2,15,'Cluj','90900000-6',2000000,'2025-10-01 10:00'),
      (115,3,14,'Iasi','33600000-6',333.33,'2024-04-04 10:00')
    ) v(id,a,s,county,cpv,cv,dt)
    left join ${names} an on an.entity_id = v.a left join ${names} sn on sn.entity_id = v.s`);
  // Every procedure class (an empty type among "Alte proceduri"), a consortium whose whole value is over 1 mil. lei.
  await q.unsafe(`insert into marts.contract_transactions (contract_id,contract_no,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date,ca_notice_id,n_winners,contract_value_full,procedure_type)
    select v.id, 'C'||v.id, v.a, an.name_display, v.s, sn.name_display, v.county, v.cpv, v.cv, v.dt, 900+v.id, v.nw, v.vfull, v.pt
    from (values
      (201,1,11,'Cluj','45000000-7',3000000,'2025-04-01',1,3000000,'Licitatie deschisa'),
      (202,3,10,'Iasi','45233140-2',600000,'2024-09-01',2,1200000,'Licitatie deschisa accelerata'),
      (202,3,12,'Iasi','45233140-2',600000,'2024-09-01',2,1200000,'Licitatie deschisa accelerata'),
      (203,4,13,'Iasi','33600000-6',90000,'2025-06-01',1,90000,'Procedura simplificata'),
      (204,5,11,null,'30190000-7',7000,'2025-12-01',1,7000,'Negociere fara publicare prealabila'),
      (205,2,14,'Cluj',null,65000,'2025-03-03',1,65000,'Licitatie restransa'),
      (206,1,15,'Cluj','79100000-0',5000,'2024-05-05',1,5000,'')
    ) v(id,a,s,county,cpv,cv,dt,nw,vfull,pt)
    left join ${names} an on an.entity_id = v.a left join ${names} sn on sn.entity_id = v.s`);
  // Each profile's sum and records over the same rows, as the marts build writes them (the fast paths read them).
  for (const role of ["authority", "supplier"] as const) {
    const id = role === "authority" ? "authority_id" : "supplier_id";
    await q.unsafe(`update marts.entity_profile ep set
        total_ron_split = coalesce((select sum(d.closing_value) from marts.da_transactions d where d.${id} = ep.entity_id and d.closing_value > 0 and d.closing_value <= 2000000), 0)
          + coalesce((select sum(c.closing_value) from marts.contract_transactions c where c.${id} = ep.entity_id and c.closing_value > 0), 0),
        n_das = (select count(*) from marts.da_transactions d where d.${id} = ep.entity_id and d.closing_value > 0 and d.closing_value <= 2000000),
        n_contracts = (select count(*) from marts.contract_transactions c where c.${id} = ep.entity_id and c.closing_value > 0)
      where ep.role = '${role}'`);
  }
  // The national totals of the nightly build (an unfiltered answer, and the channels over every year, read them).
  await q`insert into marts.agg_national (src, v_plaf, n_plaf, v_all, n_all)
    select 'da', sum(closing_value) filter (where closing_value <= 2000000), count(*) filter (where closing_value <= 2000000), sum(closing_value), count(*)
    from marts.da_transactions where closing_value > 0
    union all
    select 'contracts', sum(closing_value), count(*), sum(closing_value), count(*) from marts.contract_transactions where closing_value > 0`;
  // Risk profiles of institutions for the cloud (at least 10 direct acquisitions).
  await q`insert into marts.entity_flags (entity_id,role,name_display,county,n_das,total_ron,cri,n_flags,flags) values
    (1,'authority','Spitalul Judetean Cluj','Cluj',20,4000,0.4,2,'[]'),(2,'authority','Comuna Feleacu','Cluj',12,300,0.2,1,'[]'),
    (3,'authority','Municipiul Iasi','Iasi',30,9000,0.6,3,'[]'),(4,'authority','Spitalul Clinic Iasi','Iasi',9,10,0.1,0,'[]'),
    (5,'authority','Autoritate fara judet',null,11,50,0.3,1,'[]')`;
}

const Y: AskSpec["filters"] = { yearFrom: 2024, yearTo: 2025 };
const stat = (filters: AskSpec["filters"] = Y, extra: Partial<AskSpec> = {}): AskSpec => ({ block: "stat", measure: "value", filters, ...extra });
const table = (dim: "authority" | "supplier", filters: AskSpec["filters"] = Y, extra: Partial<AskSpec> = {}): AskSpec => ({ block: "table", dim, measure: "value", filters, ...extra });
const cents = (n: number) => Math.round(n * 100) / 100;

const counts = (r: FacetCounts | FacetFailure): FacetCounts => { if (!("options" in r)) throw new Error(JSON.stringify(r)); return r; };
const option = (c: FacetCounts, value: string) => c.options.find((o) => o.value === value) ?? { n: 0, value_ron: 0 };
/** An answer's records and value (a total), or its ranked entities and value (a ranking of every entity). */
async function answer(q: DbSql, spec: AskSpec): Promise<{ n: number; value: number }> {
  const r = await runSpec(q, spec, await ground(q, spec.filters, spec.population));
  if ("error" in r) throw new Error(r.error);
  if (r.data.block === "stat") return { n: r.data.stat.count, value: cents(r.data.stat.value) };
  // F3-rows (table:employees-2): a band of firms is the ranking's group; its totals stay the selection's.
  if (r.data.block === "table") return { n: r.data.total ?? r.data.rows.length, value: cents(r.data.group?.value ?? r.data.totals?.value ?? r.data.rows.reduce((a, x) => a + x.value, 0)) };
  throw new Error(r.data.block);
}

/** Each part, on a draft, with the answers its options give once chosen. */
const PARTS: { name: string; part: CountPart; draft: AskSpec; chosen: (value: string) => AskSpec }[] = [
  { name: "channels", part: "channel", draft: stat(), chosen: (v) => stat(Y, { dataset: v as "da" | "contracts" }) },
  // Every year: the nightly build's national totals (agg_national), as the unfiltered answer reads them.
  { name: "channels, every year", part: "channel", draft: stat({}), chosen: (v) => stat({}, { dataset: v as "da" | "contracts" }) },
  { name: "procedures", part: "procedure", draft: stat(), chosen: (v) => stat({ ...Y, procedure: v as "deschisa" }, { dataset: "contracts" }) },
  { name: "kinds of purchase", part: "domain", draft: stat(), chosen: (v) => stat({ ...Y, purchaseKind: v as "lucrari" }) },
  { name: "sizes", part: "size", draft: stat(), chosen: (v) => { const { purchaseValueMin: min, purchaseValueMax: max } = VALUE_RANGES[Number(v)]!; return stat({ ...Y, ...(min !== undefined ? { purchaseValueMin: min } : {}), ...(max !== undefined ? { purchaseValueMax: max } : {}) }); } },
  { name: "years", part: "years", draft: stat({}), chosen: (v) => stat({ yearFrom: Number(v), yearTo: Number(v) }) },
  { name: "buyer counties", part: "county", draft: stat(), chosen: (v) => stat({ ...Y, county: v }) },
  // Per institution and per firm, live only where an index anchors the selection (a county): nationally they wait on the rollups.
  ...entityParts("in Cluj", { ...Y, county: "Cluj" }),
];
/** The institutions of each kind and the firms of each band, on a selection, with the rankings they give once chosen. */
function entityParts(name: string, filters: AskSpec["filters"]): typeof PARTS {
  return [
    { name: `kinds of institution ${name}`, part: "kind", draft: stat(filters), chosen: (v) => table("authority", { ...filters, authorityKind: v as "spital" }) },
    { name: `employee bands ${name}`, part: "employees", draft: stat(filters), chosen: (v) => {
      const band = EMPLOYEE_BAND_BOUNDS.find((b) => b.value === v)!;
      return table("supplier", { ...filters, minEmployees: band.min, ...(band.max !== null ? { maxEmployees: band.max } : {}) });
    } },
  ];
}
/** The answer a whole window counts: every institution or firm, the contracts of the procedures, else the draft itself. */
const wholeOf = (c: (typeof PARTS)[number]): AskSpec => c.part === "kind" ? table("authority", c.draft.filters) : c.part === "employees" ? table("supplier", c.draft.filters)
  : c.part === "procedure" ? stat(c.draft.filters, { dataset: "contracts" }) : c.draft;
/** Every option's count is the answer after choosing it, and the options and the rest add up to the window's first row. */
async function expectAnswers(q: DbSql, c: (typeof PARTS)[number], got: FacetCounts): Promise<void> {
  const whole = await answer(q, wholeOf(c));
  expect([c.name, got.total.n, cents(got.total.value_ron)]).toEqual([c.name, whole.n, whole.value]);
  for (const o of got.options) {
    const chosen = o.n === 0 && (c.part === "kind" || c.part === "employees") ? { n: 0, value: 0 } : await answer(q, c.chosen(o.value));
    expect([c.name, o.value, o.n, cents(o.value_ron)]).toEqual([c.name, o.value, chosen.n, chosen.value]);
  }
  expect([c.name, got.options.reduce((a, o) => a + o.n, 0) + (got.rest?.n ?? 0)]).toEqual([c.name, got.total.n]);
}

describe.runIf(Boolean(connection))("the windows' counts (dedicated rollback fixture)", () => {
  it("count each option as its answer, the same from the rollups, per institution as per record, and never across a build or a checkpoint", async () => {
    await withAskFixture(connection!.sql, "facet_fixture", load, async (q) => {
      forgetAuthorityKinds(); forgetRollupsReady(); forgetMartColumns(); forgetFacets();
      const kinds = await readAuthorityKinds(q);
      expect(kinds.ids).toMatchObject({ spital: ["1", "4"], comuna: ["2"], oras_municipiu: ["3"] });

      // 1. Live (no rollups yet): every option's count is the answer after choosing it; the options and the rest add up.
      const live = new Map<string, FacetCounts>();
      for (const c of PARTS) {
        const got = counts(await facetCounts(q, c.draft, c.part));
        live.set(c.name, got);
        await expectAnswers(q, c, got);
      }
      // The fixture's own figures: the rest rows a reader sees.
      expect(live.get("kinds of institution in Cluj")!.options.map((o) => [o.value, o.n]).filter(([, n]) => n)).toEqual([["comuna", 1], ["spital", 1]]);
      expect(live.get("employee bands in Cluj")!.rest).toMatchObject({ label: "Fără bilanț", n: 1 });
      expect(option(live.get("kinds of purchase")!, "lucrari").n).toBe(6);
      expect(live.get("kinds of purchase")!.rest).toMatchObject({ label: "Fără cod CPV", n: 2 });
      expect(option(live.get("procedures")!, "altele").n).toBe(2);

      // The firms' own seats over every record (the profiles), as „Cine conduce?” by value offers them: each county's
      // firms (any spelling of the data), abroad, unknown. The seat column is not filled here: the SEAP county stands in.
      const leader = { block: "entity_card", dim: "supplier", rankBy: "value", measure: "value", filters: {} } as AskSpec;
      const seat = counts(await facetCounts(q, leader, "seat"));
      expect(seat.options.map((o) => [o.value, o.n])).toEqual(expect.arrayContaining([["Iași", 1], ["Cluj", 1], ["București", 1], ["Ilfov", 1], [ABROAD, 1]]));
      expect(seat.rest).toMatchObject({ label: "Sediu necunoscut", n: 1 });
      expect([seat.total.n, cents(seat.total.value_ron)]).toEqual(Object.values(await answer(q, table("supplier", {}))));
      // F4: a ranking of firms counts the seat against each record's buyer county (firmSeat), each class as its answer.
      const inCluj = { ...Y, county: "Cluj" };
      const classes = counts(await facetCounts(q, table("supplier", inCluj), "seat"));
      expect(classes.options.map((o) => [o.value, o.n, cents(o.value_ron)])).toEqual([["same", 1, 3053000.5], ["abroad", 1, 2005000], ["other", 3, 68751.1]]);
      for (const o of classes.options)
        expect([o.value, o.n, cents(o.value_ron)]).toEqual([o.value, ...Object.values(await answer(q, table("supplier", { ...inCluj, firmSeat: o.value as "same" })))]);
      // Nationally, without the rollups, the records' classes wait on them (ENTITY_LIVE), as the other entity counts.
      expect(await facetCounts(q, table("supplier", Y), "seat")).toEqual({ precompute: ENTITY_LIVE });
      // The bands over every record read the profiles too: the firms the ranking holds, those without a filing apart.
      const bands = counts(await facetCounts(q, table("supplier", {}), "employees"));
      expect([bands.options.map((o) => o.n), bands.rest?.n]).toEqual([[1, 2, 0, 1, 0], 2]);

      // The kinds per institution are the kinds of the records (the sources' rows, classified one by one).
      const rows = await runRows(q, stat({ ...Y, county: "Cluj" }), await ground(q, { county: "Cluj" }), 0, { limit: 100 });
      if ("error" in rows) throw new Error(rows.error);
      const byKind = new Map<string, { ids: Set<string>; v: number }>();
      for (const r of rows.rows) {
        const kind = kinds.byId.get(String(r.authorityId)) ?? "rest";
        const at = byKind.get(kind) ?? { ids: new Set(), v: 0 };
        at.ids.add(String(r.authorityId)); at.v += Number(r.value);
        byKind.set(kind, at);
      }
      const kindCounts = live.get("kinds of institution in Cluj")!;
      for (const kind of AUTHORITY_KINDS) expect([kind, option(kindCounts, kind).n, cents(option(kindCounts, kind).value_ron)])
        .toEqual([kind, byKind.get(kind)?.ids.size ?? 0, cents(byKind.get(kind)?.v ?? 0)]);

      // A trend counts its two years and their months; per institution nationally, live, it waits on the marts stage.
      const trend: AskSpec = { block: "trend", dim: "supplier", measure: "value", topN: 10, filters: { ...Y, county: "Cluj" }, trend: { change: "up", months: [1, 6] } };
      const trendLive = counts(await facetCounts(q, trend, "kind"));
      const trendChannels = counts(await facetCounts(q, { ...trend, filters: Y }, "channel"));
      // January–June of 2024 and 2025: eight direct acquisitions and four contracts.
      expect([option(trendChannels, "da").n, option(trendChannels, "contracts").n]).toEqual([8, 4]);
      expect(await facetCounts(q, { ...trend, filters: Y }, "kind")).toEqual({ precompute: ENTITY_LIVE });
      expect(await facetCounts(q, stat({ ...Y, purchaseKind: "lucrari" }), "kind")).toEqual({ precompute: ENTITY_LIVE });
      expect(counts(await facetCounts(q, stat({ ...Y, purchaseKind: "lucrari", county: "Cluj" }), "kind")).total.n).toBe(2);
      // The cloud's institutions: their profiles (at least 10 direct acquisitions), by kind.
      const cloud = counts(await facetCounts(q, { block: "scatter", dim: "authority", measure: "value", filters: {} }, "kind"));
      expect([cloud.unit, option(cloud, "spital").n, option(cloud, "comuna").n, cloud.rest?.n]).toEqual(["profiles", 1, 1, 1]);

      // 2. Kept: the same draft again is not counted again; another checkpoint or another marts build is.
      const cluj = stat({ ...Y, county: "Cluj" });
      const before = facetStats();
      const again = counts(await facetCounts(q, cluj, "kind"));
      expect([facetStats().hits - before.hits, facetStats().grouped - before.grouped, again.tookMs]).toEqual([1, 0, 0]);
      await q`insert into app.monitoring_refreshes (id, version, status) values ('00000000-0000-0000-0000-0000000000c2', 2, 'ready')`;
      const published = counts(await facetCounts(q, cluj, "kind"));
      expect([published.checkpoint, facetStats().grouped - before.grouped]).toEqual(["00000000-0000-0000-0000-0000000000c2", 1]);
      // A rebuild gives the mart a new file node (a TRUNCATE; here, in the fixture's own transaction, which truncates
      // in place, a new table): its counts are counted again, with the rows it now holds.
      await q`create table marts.da_transactions_next as select * from marts.da_transactions where sicap_da_id <> 101`;
      await q`drop table marts.da_transactions`;
      await q`alter table marts.da_transactions_next rename to da_transactions`;
      const rebuilt = counts(await facetCounts(q, cluj, "kind"));
      expect([cents(option(rebuilt, "spital").value_ron), facetStats().grouped - before.grouped]).toEqual([cents(option(published, "spital").value_ron - 1000.10), 2]);
      // The record back, for the rollups' build below.
      await q`insert into marts.da_transactions (sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date)
        values (101,'DA101',1,'Spitalul Judetean Cluj',10,'Furnizor A','Cluj','33600000-6',1000.10,'2024-03-01 10:00')`;

      // 3. The rollups give the live counts, part by part (and the trend's months from agg_entity_month).
      const report = await buildAskRollups(q);
      expect(report.rows.agg_entity_year).toBeGreaterThan(0);
      forgetRollupsReady(); forgetFacets();
      for (const c of PARTS) {
        const rolled = counts(await facetCounts(q, c.draft, c.part));
        const { tookMs: _a, checkpoint: _c1, ...a } = rolled, { tookMs: _b, checkpoint: _c2, ...b } = live.get(c.name)!;
        expect([c.name, a]).toEqual([c.name, b]);
      }
      const { tookMs: _t1, checkpoint: _k1, ...trendRolled } = counts(await facetCounts(q, trend, "kind"));
      const { tookMs: _t2, checkpoint: _k2, ...trendLiveCore } = trendLive;
      expect(trendRolled).toEqual(trendLiveCore);
      // Nationally, per institution and per firm, from the rollups: each option is its answer, the rests as the fixture holds them.
      for (const c of entityParts("nationally", Y)) {
        const got = counts(await facetCounts(q, c.draft, c.part));
        await expectAnswers(q, c, got);
        expect(got.rest).toMatchObject(c.part === "kind" ? { label: "Alte instituții", n: 1 } : { label: "Fără bilanț", n: 2 });
      }
      // A kind of purchase per institution stays live (the rollups keep no code per entity): it waits on the marts stage.
      expect(await facetCounts(q, stat({ ...Y, purchaseKind: "lucrari" }), "kind")).toEqual({ precompute: ENTITY_LIVE });
    }, { globals: [...ENGINE_GLOBAL_TABLES, "app.monitoring_refreshes"] });
  });

  it("places a name in a ranking as the ranking does: from the profiles, and from a kept rank vector", async () => {
    await withAskFixture(connection!.sql, "facet_locate", load, async (q) => {
      forgetAuthorityKinds(); forgetRollupsReady(); forgetMartColumns(); forgetFacets();
      // The whole ranking (paged: the fixture's few entities are on its first page).
      const placesOf = async (spec: AskSpec) => {
        const r = await runSpec(q, spec, await ground(q, spec.filters));
        if ("error" in r || r.data.block !== "table") throw new Error("error" in r ? r.error : r.data.block);
        expect(r.data.total).toBe(r.data.rows.length);
        return new Map(r.data.rows.map((row, i) => [row.entityId!, i + 1]));
      };
      // Every record, every year: the profiles' fast path, by value and by records, firms and institutions.
      for (const spec of [table("supplier", {}), table("supplier", {}, { measure: "count" }), table("authority", {})]) {
        const places = await placesOf(spec);
        const found = await locate(q, spec, spec.dim === "authority" ? "i" : "furnizor");
        if (!("matches" in found)) throw new Error(JSON.stringify(found));
        expect(found.total).toBe(places.size);
        expect(found.matches.length).toBeGreaterThan(1);
        for (const m of found.matches) expect([m.name, m.rank]).toEqual([m.name, places.get(m.id)]);
      }
      // A filtered ranking: grouped once, its rank vector kept; a second text on the same question groups nothing.
      const works = table("supplier", { yearFrom: 2025, yearTo: 2025, purchaseKind: "lucrari" });
      const places = await placesOf(works);
      const before = facetStats().grouped;
      const first = await locate(q, works, "Furnizor B");
      const second = await locate(q, works, "Furnizor E");
      if (!("matches" in first) || !("matches" in second)) throw new Error("locate");
      expect(facetStats().grouped - before).toBe(1);
      expect(first.matches.map((m) => [m.name, m.rank])).toEqual([["Furnizor B", places.get("11")]]);
      expect(second.matches.map((m) => [m.name, m.rank])).toEqual([["Furnizor E", places.get("14") ?? null]]);
      expect(first.total).toBe(places.size);
      // A name the ranking does not hold is said so: no place.
      const absent = await locate(q, works, "Strain");
      if (!("matches" in absent)) throw new Error("locate");
      expect(absent.matches.map((m) => [m.name, m.rank])).toEqual([["Furnizor Strain", null]]);
    }, { globals: [...ENGINE_GLOBAL_TABLES, "app.monitoring_refreshes"] });
  });
});

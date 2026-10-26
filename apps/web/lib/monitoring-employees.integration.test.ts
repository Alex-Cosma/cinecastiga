import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createDb, type DbSql } from "@seap/db";
import { createMonitoringWatch, getMonitoringRun } from "./monitoring";
import { evaluateMonitoringWatch } from "./monitoring-engine";
import { MONITORING_METHODOLOGY_CHANGED_NOTE, monitoringRunTag } from "./monitoring-shared";
import { KEY_VERSIONS } from "./ask/answer-core";
import { forgetMartColumns } from "./ask/mart-columns";
import { testDatabaseUrl } from "./ask/test-fixture";
import type { AskSpec } from "./ask/spec";

/*
 * F3's CÂȘTIGĂTORII on what a user keeps (plan §2.8, §6.2: "table:employees-2
 * doar pe clasamentele de firme"): on a ranking of firms the employees narrow
 * the list while the total stays the whole selection's. The release that made
 * it alerts once, with a methodology alert, only the watches on a ranking of
 * firms with employees, never as a second "recalculated"; the same ranking
 * without employees, "Cine conduce?" by value with employees (its answer did
 * not change: no version) and a ranking of institutions are not alerted. The
 * release before is emulated as it ran: KEY_VERSIONS without
 * "table:employees", and a ranking's totals those of its band (the band was a
 * selection). Rows are committed on the dedicated seap_test_* database and
 * deleted after. S4 tests.
 */

const release = vi.hoisted(() => ({ beforeF3: false }));
vi.mock("./ask/compile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ask/compile")>();
  return {
    ...actual,
    runSpec: async (...args: Parameters<typeof actual.runSpec>) => {
      const answer = await actual.runSpec(...args);
      if (!release.beforeF3 || "error" in answer || answer.data.block !== "table" || !answer.data.group) return answer;
      const { group, ...data } = answer.data;
      return { ...answer, data: { ...data, totals: group } };
    },
  };
});

const url = testDatabaseUrl("F3's employees on the watches");
const BASE = 886870000, AUTHORITY = String(BASE + 1);
/** id offset → name, employees. Two direct acquisitions of 100 lei each in Tulcea, March 2019. */
const FIRMS: [number, string, number | null][] = [
  [500, "Firma Mica Fixture Angajati", 5], // in the 1–9 band
  [501, "Firma Mare Fixture Angajati", 50], // outside it
  [502, "Firma Fara Bilant Fixture Angajati", null], // no filing
];
const id = (offset: number) => String(BASE + offset);
// Months keep the answers on their live queries (the rollups keep whole years).
const PLACE = { county: "Tulcea", yearFrom: 2019, yearTo: 2019, monthFrom: 1, monthTo: 12 };
const BAND = { ...PLACE, minEmployees: 1, maxEmployees: 9 };
const FIRMS_BAND: AskSpec = { block: "table", dim: "supplier", measure: "value", topN: 10, filters: BAND };
const FIRMS_ALL: AskSpec = { block: "table", dim: "supplier", measure: "value", topN: 10, filters: PLACE };
const LEADER_BAND: AskSpec = { block: "entity_card", dim: "supplier", rankBy: "value", measure: "value", filters: BAND };
const BUYERS_BAND: AskSpec = { block: "table", dim: "authority", measure: "value", topN: 10, filters: BAND };

describe.skipIf(!url)("F3's employees on watches: one methodology alert, only on a ranking of firms with employees (isolated PostgreSQL)", () => {
  let sql: DbSql, checkpointId: string, insertedCounty = false;
  const uid = `monitoring-employees-${randomUUID()}`;
  const checkpoints: string[] = [];
  const declared = KEY_VERSIONS["table:employees"]!;
  async function checkpoint() {
    const value = randomUUID();
    checkpoints.push(value);
    await sql`insert into app.monitoring_refreshes (id, kind, status, methodology, source_coverage, validation, completed_at)
      values (${value}, 'baseline', 'ready', ${JSON.stringify({ version: "fixture-v1", fixture: uid })}::jsonb, '{}', '{}', now())`;
    checkpointId = value;
  }
  const run = async (watchId: string) => {
    const runId = (await evaluateMonitoringWatch(watchId, checkpointId, sql))!;
    return (await getMonitoringRun(uid, watchId, runId, sql))!;
  };
  /** The release before F3's CÂȘTIGĂTORII for `work`: no employees version, the band's totals as the ranking's. */
  async function beforeF3<T>(work: () => Promise<T>): Promise<T> {
    release.beforeF3 = true; delete KEY_VERSIONS["table:employees"];
    try { return await work(); } finally { release.beforeF3 = false; KEY_VERSIONS["table:employees"] = declared; }
  }

  beforeAll(async () => {
    sql = createDb(url).sql;
    (globalThis as typeof globalThis & { __seapAskSql?: DbSql }).__seapAskSql = sql;
    await sql`insert into auth.users (id, name, email, email_verified) values (${uid}, 'Employees watch owner', ${uid + "@example.invalid"}, true)`;
    await sql`insert into core.entities (id, name_display, name_normalized, cui_canonical, cui_valid, county, country_code)
      select (v->>0)::bigint, v->>1, lower(v->>1), v->>0, true, 'Tulcea', 'RO'
      from jsonb_array_elements(${JSON.stringify([[AUTHORITY, "Primaria Fixture Angajati"], ...FIRMS.map(([o, n]) => [id(o), n])])}::jsonb) v`;
    await sql`insert into marts.entity_profile (entity_id, role, name_display, county, n_das, n_contracts, total_ron_full, total_ron_split)
      values (${AUTHORITY}, 'authority', 'Primaria Fixture Angajati', 'Tulcea', 6, 0, 600, 600)`;
    for (const [offset, name, employees] of FIRMS)
      await sql`insert into marts.entity_profile (entity_id, role, name_display, county, seat_county, seat_source, employees, employees_year, n_das, n_contracts, total_ron_full, total_ron_split)
        values (${id(offset)}, 'supplier', ${name}, 'Tulcea', 'Tulcea', 'onrc', ${employees}, ${employees === null ? null : 2018}, 2, 0, 200, 200)`;
    await sql`insert into marts.da_transactions (sicap_da_id, da_code, authority_id, authority_name, supplier_id, supplier_name, county, closing_value, finalization_date, cpv_code)
      select ${BASE} + (e.id - ${BASE}) * 10 + r, 'DA employees ' || e.id || '-' || r, ${AUTHORITY}::bigint, 'Primaria Fixture Angajati', e.id, e.name_display, 'Tulcea', 100, '2019-03-0' || r, '33600000-6'
      from core.entities e cross join generate_series(1, 2) r where e.id between ${BASE + 500} and ${BASE + 599}`;
    // The county a question names is grounded on the institutions' counties of the marts.
    insertedCounty = (await sql`insert into marts.spend_by_county (county, role, n, total_ron) values ('Tulcea', 'authority', 0, 0) on conflict do nothing returning county`).length > 0;
    forgetMartColumns();
  });
  afterAll(async () => {
    if (!sql) return;
    release.beforeF3 = false; KEY_VERSIONS["table:employees"] = declared;
    await sql`delete from auth.users where id = ${uid}`;
    await sql`delete from app.monitoring_refreshes where id = any(${checkpoints}::uuid[])`;
    await sql`delete from marts.da_transactions where authority_id between ${BASE} and ${BASE + 999}`;
    await sql`delete from marts.entity_profile where entity_id between ${BASE} and ${BASE + 999}`;
    await sql`delete from core.entities where id between ${BASE} and ${BASE + 999}`;
    if (insertedCounty) await sql`delete from marts.spend_by_county where county = 'Tulcea' and role = 'authority'`;
    forgetMartColumns();
    delete (globalThis as typeof globalThis & { __seapAskSql?: DbSql }).__seapAskSql;
    await sql.end();
  });

  it("a ranking of firms with employees: exactly one methodology alert; without employees, „Cine conduce?” and institutions: none", async () => {
    // The release before takes the baselines: the band was the ranking's selection, its totals the band's.
    const [band, all, leader, buyers] = await beforeF3(async () => {
      await checkpoint();
      const watches = [
        (await createMonitoringWatch(uid, { spec: FIRMS_BAND, title: "Firmele mici din Tulcea" }, sql)).id,
        (await createMonitoringWatch(uid, { spec: FIRMS_ALL, title: "Firmele din Tulcea" }, sql)).id,
        (await createMonitoringWatch(uid, { spec: LEADER_BAND, title: "Cea mai mare firmă mică din Tulcea" }, sql)).id,
        (await createMonitoringWatch(uid, { spec: BUYERS_BAND, title: "Instituțiile, de la firme mici" }, sql)).id,
      ] as const;
      const baseline = await run(watches[0]);
      // The band's records (the sources) both before and after: two records of 100 lei.
      expect(baseline.run).toMatchObject({ kind: "baseline", hasAlert: false, rowCount: 2, totalExact: "200" });
      expect((baseline.methodology.answer as { conditions?: Record<string, string> } | undefined)?.conditions?.["table:employees"]).toBeUndefined();
      expect((baseline.result as { totals: { count: number } }).totals.count).toBe(2);
      for (const watch of watches.slice(1)) expect((await run(watch)).run).toMatchObject({ kind: "baseline", hasAlert: false });
      return watches;
    });

    // F3: the employees narrow the list; the total is the whole selection's. The first check after it.
    await checkpoint();
    const switched = await run(band);
    expect(switched.run).toMatchObject({ kind: "update", hasAlert: true, methodologyChanged: true, resultChanged: true,
      rowCount: 2, totalExact: "200", counts: { added: 0, removed: 0, changed: 0 } });
    expect(switched.methodology.answer).toMatchObject({ question: "table-1", conditions: { "table:employees": "table:employees-2" } });
    // A methodology alert: the same records and rows, the total now the whole selection's; never "recalculated".
    expect(monitoringRunTag(switched.run)).toBe("Metodologie modificată");
    expect(switched.run.notes).toContain(MONITORING_METHODOLOGY_CHANGED_NOTE);
    const totals = (result: unknown) => (result as { totals: { count: number }; group?: { count: number } });
    expect([totals(switched.previousResult).totals.count, totals(switched.result).totals.count, totals(switched.result).group?.count]).toEqual([2, 6, 2]);
    // The others show no change of method: the same result, the same methodology, no alert.
    for (const watch of [all, leader, buyers])
      expect((await run(watch)).run).toMatchObject({ kind: "unchanged", hasAlert: false, methodologyChanged: false, resultChanged: false });

    // The next check: nothing more on any watch, so one alert in all.
    await checkpoint();
    for (const watch of [band, all, leader, buyers])
      expect((await run(watch)).run).toMatchObject({ kind: "unchanged", hasAlert: false, methodologyChanged: false, resultChanged: false });
    const [alerts] = await sql`select count(*) filter (where has_alert)::int n, count(*)::int runs from app.monitoring_runs where watch_id = ${band}`;
    expect(alerts).toEqual({ n: 1, runs: 3 });
  });
});

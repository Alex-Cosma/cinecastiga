import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createDb, SEAT_ABROAD_LABEL, type DbSql } from "@seap/db";
import { createMonitoringWatch, getMonitoringRun } from "./monitoring";
import { evaluateMonitoringWatch } from "./monitoring-engine";
import { MONITORING_METHODOLOGY_CHANGED_NOTE, monitoringRunTag } from "./monitoring-shared";
import { KEY_VERSIONS } from "./ask/answer-core";
import { forgetMartColumns } from "./ask/mart-columns";
import { testDatabaseUrl } from "./ask/test-fixture";
import type { AskSpec } from "./ask/spec";

/*
 * The seat switch on what a user keeps (owner-seat-switch, plan §2.8): the
 * release that shows a firm's seat in place of its SEAP county alerts once,
 * with a methodology alert, only the watches whose answer shows a firm's
 * county (a ranking of firms), never as a second "recalculated"; a ranking of
 * institutions is not alerted. The release before F4 is emulated as it ran:
 * KEY_VERSIONS without seat-2, and the seat column read as not filled
 * (mart-columns.ts), so the "Județ" beside a firm was entity_profile.county.
 * Rows are committed on the dedicated seap_test_* database and deleted after.
 */

const release = vi.hoisted(() => ({ beforeF4: false, unfilled: false }));
vi.mock("./ask/mart-columns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ask/mart-columns")>();
  return {
    ...actual,
    martColumns: async (sql: DbSql) => {
      const columns = await actual.martColumns(sql);
      // `unfilled`: F4 deployed, its migration's seat columns still empty until the next marts build.
      return release.beforeF4 || release.unfilled ? { ...columns, seat: false } : columns;
    },
  };
});

const url = testDatabaseUrl("F4 on the watches");
const BASE = 886760000, AUTHORITY = String(BASE + 1);
/** id offset → name, SEAP county (entity_profile.county), seat (seat_county, seat_source). Two direct acquisitions of 100 lei each in Vaslui, March 2019. */
const FIRMS: [number, string, string | null, string | null, string | null][] = [
  [500, "Firma Mutata Fixture Sediu", "Vrancea", "Bucuresti", "onrc"], // SEAP's county is a buyer's: the seat is București
  [501, "Firma Straina Fixture Sediu", "NA", null, "foreign"], // a foreign "county" in SEAP: the seat is abroad
  [502, "Firma Locala Fixture Sediu", "Vaslui", "Vaslui", "onrc"], // the same county in both
];
const id = (offset: number) => String(BASE + offset);
// Months keep the answers on their live queries (the rollups keep whole years).
const PLACE = { county: "Vaslui", yearFrom: 2019, yearTo: 2019, monthFrom: 1, monthTo: 12 };
const FIRMS_RANKING: AskSpec = { block: "table", dim: "supplier", measure: "value", topN: 10, filters: PLACE };
const BUYERS_RANKING: AskSpec = { block: "table", dim: "authority", measure: "value", topN: 10, filters: PLACE };

describe.skipIf(!url)("F4 on watches: one methodology alert, only on an answer that shows a firm's county (isolated PostgreSQL)", () => {
  let sql: DbSql, checkpointId: string, insertedCounty = false;
  const uid = `monitoring-seat-${randomUUID()}`;
  const checkpoints: string[] = [];
  const declared = KEY_VERSIONS.seat!;
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
  /** The release before F4 for `work`: the SEAP county beside a firm, no seat version. */
  async function beforeF4<T>(work: () => Promise<T>): Promise<T> {
    release.beforeF4 = true; delete KEY_VERSIONS.seat;
    try { return await work(); } finally { release.beforeF4 = false; KEY_VERSIONS.seat = declared; }
  }

  beforeAll(async () => {
    sql = createDb(url).sql;
    (globalThis as typeof globalThis & { __seapAskSql?: DbSql }).__seapAskSql = sql;
    await sql`insert into auth.users (id, name, email, email_verified) values (${uid}, 'Seat watch owner', ${uid + "@example.invalid"}, true)`;
    await sql`insert into core.entities (id, name_display, name_normalized, cui_canonical, cui_valid, county, country_code)
      select (v->>0)::bigint, v->>1, lower(v->>1), v->>0, true, v->>2, 'RO'
      from jsonb_array_elements(${JSON.stringify([[AUTHORITY, "Primaria Fixture Sediu", "Vaslui"], ...FIRMS.map(([o, n, c]) => [id(o), n, c])])}::jsonb) v`;
    await sql`insert into marts.entity_profile (entity_id, role, name_display, county, n_das, n_contracts, total_ron_full, total_ron_split)
      values (${AUTHORITY}, 'authority', 'Primaria Fixture Sediu', 'Vaslui', 6, 0, 600, 600)`;
    for (const [offset, name, county, seat, source] of FIRMS)
      await sql`insert into marts.entity_profile (entity_id, role, name_display, county, is_foreign, seat_county, seat_source, n_das, n_contracts, total_ron_full, total_ron_split)
        values (${id(offset)}, 'supplier', ${name}, ${county}, ${source === "foreign"}, ${seat}, ${source}, 2, 0, 200, 200)`;
    await sql`insert into marts.da_transactions (sicap_da_id, da_code, authority_id, authority_name, supplier_id, supplier_name, county, closing_value, finalization_date, cpv_code)
      select ${BASE} + (e.id - ${BASE}) * 10 + r, 'DA seat ' || e.id || '-' || r, ${AUTHORITY}::bigint, 'Primaria Fixture Sediu', e.id, e.name_display, 'Vaslui', 100, '2019-03-0' || r, '33600000-6'
      from core.entities e cross join generate_series(1, 2) r where e.id between ${BASE + 500} and ${BASE + 599}`;
    // The county a question names is grounded on the institutions' counties of the marts.
    insertedCounty = (await sql`insert into marts.spend_by_county (county, role, n, total_ron) values ('Vaslui', 'authority', 0, 0) on conflict do nothing returning county`).length > 0;
    forgetMartColumns();
  });
  afterAll(async () => {
    if (!sql) return;
    release.beforeF4 = false; KEY_VERSIONS.seat = declared;
    await sql`delete from auth.users where id = ${uid}`;
    await sql`delete from app.monitoring_refreshes where id = any(${checkpoints}::uuid[])`;
    await sql`delete from marts.da_transactions where authority_id between ${BASE} and ${BASE + 999}`;
    await sql`delete from marts.entity_profile where entity_id between ${BASE} and ${BASE + 999}`;
    await sql`delete from core.entities where id between ${BASE} and ${BASE + 999}`;
    if (insertedCounty) await sql`delete from marts.spend_by_county where county = 'Vaslui' and role = 'authority'`;
    forgetMartColumns();
    delete (globalThis as typeof globalThis & { __seapAskSql?: DbSql }).__seapAskSql;
    await sql.end();
  });

  it("a ranking of firms: exactly one methodology alert, no false recalculated; a ranking of institutions: none", async () => {
    // The release before F4 takes the baselines: the firm's county was SEAP's.
    const [firms, buyers] = await beforeF4(async () => {
      await checkpoint();
      const watches = [(await createMonitoringWatch(uid, { spec: FIRMS_RANKING, title: "Firmele din Vaslui" }, sql)).id,
        (await createMonitoringWatch(uid, { spec: BUYERS_RANKING, title: "Instituțiile din Vaslui" }, sql)).id] as const;
      const baseline = await run(watches[0]);
      expect(baseline.run).toMatchObject({ kind: "baseline", hasAlert: false, rowCount: 6, totalExact: "600" });
      expect(baseline.methodology.answer).toBeUndefined();
      expect((await run(watches[1])).run).toMatchObject({ kind: "baseline", hasAlert: false, rowCount: 6, totalExact: "600" });
      return watches;
    });

    // F4: the seat beside each firm. The first check after it.
    await checkpoint();
    const switched = await run(firms);
    expect(switched.run).toMatchObject({ kind: "update", hasAlert: true, methodologyChanged: true, resultChanged: true,
      rowCount: 6, totalExact: "600", counts: { added: 0, removed: 0, changed: 0 } });
    expect(switched.methodology.answer).toEqual({ question: "table-1", conditions: { seat: "seat-2" } });
    // A methodology alert: the same records, another county beside two firms; never "recalculated".
    expect(monitoringRunTag(switched.run)).toBe("Metodologie modificată");
    expect(switched.run.notes).toContain(MONITORING_METHODOLOGY_CHANGED_NOTE);
    // The same firms and values, each beside its seat (SEAP said Vrancea and NA).
    const counties = (result: unknown) => ((result as { rows: { entityId: string; county: string | null }[] }).rows).map((r) => [r.entityId, r.county]).sort();
    expect(counties(switched.previousResult)).toEqual([[id(500), "Vrancea"], [id(501), "NA"], [id(502), "Vaslui"]]);
    expect(counties(switched.result)).toEqual([[id(500), "Bucuresti"], [id(501), SEAT_ABROAD_LABEL], [id(502), "Vaslui"]]);
    // A ranking of institutions shows no firm's county: the same result, the same methodology, no alert.
    const plain = await run(buyers);
    expect(plain.run).toMatchObject({ kind: "unchanged", hasAlert: false, methodologyChanged: false, resultChanged: false });
    expect(plain.methodology).not.toHaveProperty("answer");

    // The next check: nothing more on either watch, so one alert in all.
    await checkpoint();
    for (const watch of [firms, buyers])
      expect((await run(watch)).run).toMatchObject({ kind: "unchanged", hasAlert: false, methodologyChanged: false, resultChanged: false });
    const [alerts] = await sql`select count(*) filter (where has_alert)::int n, count(*)::int runs from app.monitoring_runs where watch_id = ${firms}`;
    expect(alerts).toEqual({ n: 1, runs: 3 });
  });

  it("a watch that follows only recalculations hears the new result once, labelled as the methodology change", async () => {
    // monitoring-engine.ts: a watch that does not follow methodology changes still hears of the new result; the run
    // says why (monitoringRunTag), never "Rezultat recalculat".
    const watch = await beforeF4(async () => {
      await checkpoint();
      const created = (await createMonitoringWatch(uid, { spec: FIRMS_RANKING, title: "Doar recalculări",
        preferences: { types: ["recalculated"], minimumValueExact: "0", digest: false } }, sql)).id;
      await run(created);
      return created;
    });
    await checkpoint();
    const switched = (await run(watch)).run;
    expect(switched).toMatchObject({ kind: "update", methodologyChanged: true, resultChanged: true, hasAlert: true });
    expect(monitoringRunTag(switched)).toBe("Metodologie modificată");
    await checkpoint();
    expect((await run(watch)).run).toMatchObject({ kind: "unchanged", hasAlert: false });
  });

  it("before the marts build fills the seat, F4 answers as before with no version; the alert comes once the seat is read", async () => {
    const watch = await beforeF4(async () => {
      await checkpoint();
      const created = (await createMonitoringWatch(uid, { spec: FIRMS_RANKING, title: "Înainte de completarea sediului" }, sql)).id;
      await run(created);
      return created;
    });
    // F4 deployed, the seat column empty (the deploy migration adds it; the nightly build fills it): the SEAP county, no seat-2.
    release.unfilled = true;
    try {
      await checkpoint();
      const waiting = await run(watch);
      expect(waiting.run).toMatchObject({ kind: "unchanged", hasAlert: false, methodologyChanged: false, resultChanged: false });
      expect(waiting.methodology).not.toHaveProperty("answer");
    } finally { release.unfilled = false; }
    // The build filled it: one methodology alert with the new counties, never "Rezultat recalculat"; then quiet.
    await checkpoint();
    const switched = await run(watch);
    expect(switched.run).toMatchObject({ kind: "update", hasAlert: true, methodologyChanged: true, resultChanged: true });
    expect(monitoringRunTag(switched.run)).toBe("Metodologie modificată");
    await checkpoint();
    expect((await run(watch)).run).toMatchObject({ kind: "unchanged", hasAlert: false, methodologyChanged: false, resultChanged: false });
  });
});

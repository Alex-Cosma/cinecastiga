import { afterAll, describe, expect, it } from "vitest";
import { AGG_MAP_COUNTY_SEAT_COLUMNS, createDb, type DbSql } from "@seap/db";
import { forgetMartColumns, martColumns, NO_MART_COLUMNS } from "./mart-columns";

const testUrl = process.env["TEST_DATABASE_URL"];
if (testUrl && !/^seap_test_[a-z0-9_]+$/.test(new URL(testUrl).pathname.slice(1))) throw new Error("Column probe fixtures require a dedicated seap_test_* database");
const connection = testUrl ? createDb(testUrl) : null;
afterAll(async () => { await connection?.sql.end(); });

/** Each probe reads the database, not the process cache. */
const probe = (q: DbSql) => { forgetMartColumns(); return martColumns(q); };

describe("firm columns of the marts on a migrated database", () => {
  it.skipIf(!connection)("finds the 0086 columns only once filled, and the map split only with the rebuilt table and a known seat", async () => {
    const rollback = new Error("rollback column probe fixture");
    await expect(connection!.sql.begin(async (tx) => {
      const q = tx as unknown as DbSql;
      await q`delete from marts.entity_profile`;
      await q`delete from marts.entity_flags`;
      // Migrated, not yet rebuilt: the columns exist and are empty; agg_map_county has no seat split.
      await q`drop table if exists marts.agg_map_county, marts.agg_map_county_top`;
      await q`create table marts.agg_map_county (county text primary key, v_plaf numeric, n_plaf bigint, v_all numeric, n_all bigint)`;
      const NONE = { ...NO_MART_COLUMNS, logTotal: true }; // 0085's generated column
      expect(await probe(q)).toEqual(NONE);
      await q`insert into marts.entity_profile (entity_id, role, county) values (1, 'authority', 'Cluj')`;
      await q`insert into marts.entity_profile (entity_id, role, seat_county, seat_source) values (10, 'supplier', 'Cluj', 'onrc')`;
      expect(await probe(q)).toEqual({ ...NONE, seat: true });
      await q`update marts.entity_profile set registered_year = 2004 where entity_id = 10`;
      await q`insert into marts.entity_flags (entity_id, role, main_cpv_div) values (10, 'supplier', '45')`;
      for (const column of AGG_MAP_COUNTY_SEAT_COLUMNS)
        await q.unsafe(`alter table marts.agg_map_county add column ${column} ${column.startsWith("v_") ? "numeric" : "bigint"}`);
      // Rebuilt before the seats were filled: every record of the county is unknown.
      await q`insert into marts.agg_map_county (county, v_plaf, n_plaf, v_all, n_all, n_all_unknown) values ('Cluj', 10, 2, 10, 2, 2)`;
      expect(await probe(q)).toEqual({ ...NONE, seat: true, registeredYear: true, mainCpvDiv: true });
      await q`update marts.agg_map_county set n_all_same = 1, n_all_unknown = 1`;
      expect(await probe(q)).toEqual({ ...NONE, seat: true, registeredYear: true, mainCpvDiv: true, mapSeat: true });
      await q`create table marts.agg_map_county_top (scope text, channel text, county text, top_record_id bigint)`;
      expect(await probe(q)).toEqual({ seat: true, registeredYear: true, mainCpvDiv: true, mapSeat: true, logTotal: true, mapTop: true });
      throw rollback;
    })).rejects.toBe(rollback);
  });
});

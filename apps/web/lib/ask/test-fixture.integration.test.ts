import { afterAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { inSavepoint, testDatabaseUrl, withAskFixture } from "./test-fixture";

const url = testDatabaseUrl("Ask fixture helpers");
const connection = url ? createDb(url, { max: 1 }) : null;
afterAll(async () => { await connection?.sql.end(); });

describe.runIf(Boolean(connection))("ask fixtures (rollback schema copies)", () => {
  it("reads marts and the engine's global tables from the fixture only, and leaves nothing behind", async () => {
    const seen = await withAskFixture(connection!.sql, "fixture_helpers", async (q) => {
      await q`insert into marts.national_stats (kind, year, n, total_ron) values ('da', 2031, 1, 1)`;
      await q`insert into core.entities (id, cui_valid, name_display, name_normalized, is_foreign) values (9199999999, false, 'Fixture', 'fixture', false)`;
    }, async (q) => {
      const [stats] = await q`select count(*)::int n, max(year)::int y from marts.national_stats` as unknown as { n: number; y: number }[];
      const [entities] = await q`select count(*)::int n from core.entities` as unknown as { n: number }[];
      const [probe] = await q`select to_regclass('reference.authority_uat')::text t` as unknown as { t: string }[];
      return { stats, entities: entities!.n, probe: probe!.t };
    });
    expect(seen).toMatchObject({ stats: { n: 1, y: 2031 }, entities: 1 });
    expect(seen.probe).toMatch(/^fixture_helpers_\d+_\d+\.reference_authority_uat$/);
    expect(await connection!.sql`select 1 from core.entities where id = 9199999999`).toHaveLength(0);
  });

  it("keeps the fixture usable after a failed query inside a savepoint, and returns an answer given despite it", async () => {
    const out = await withAskFixture(connection!.sql, "fixture_savepoint", async () => {}, async (q) => {
      const answered = await inSavepoint(q, async (db) => {
        try { await db`select 1 / 0`; return "not reached"; } catch { return "answered"; }
      });
      await expect(inSavepoint(q, async (db) => db`select 1 / 0`)).rejects.toThrow(/division by zero/);
      const [after] = await q`select count(*)::int n from marts.national_stats` as unknown as { n: number }[];
      return { answered, after: after!.n };
    });
    expect(out).toEqual({ answered: "answered", after: 0 });
  });
});

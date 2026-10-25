import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "@seap/db";
import { entityNames } from "./entity-names";
import { testDatabaseUrl, withAskFixture } from "./ask/test-fixture";

// On a dedicated seap_test_* database, in a rolled-back fixture with its own empty core tables.
const testUrl = testDatabaseUrl("Entity names");
const connection = testUrl ? createDb(testUrl) : null;
afterAll(async () => { await connection?.sql.end(); });

describe.runIf(Boolean(connection))("entityNames (rollback fixture)", () => {
  it("names each id by primary key, a merged id by its canonical entity, and leaves an unknown one out", async () => {
    const names = await withAskFixture(connection!.sql, "entity_names", async (q) => {
      await q`insert into core.entities (id, name_display, name_normalized) values
        (9100000001, 'RO12345678 FIRMA UNU SRL', 'firma unu srl'), (9100000002, 'FIRMA UNU VECHE', 'firma unu veche'), (9100000003, 'Comuna Fixture', 'comuna fixture')`;
      await q`insert into core.entity_redirects (old_id, canonical_id, reason, evidence) values (9100000002, 9100000001, 'fixture', '{}')`;
    }, (q) => entityNames(q, ["9100000001", "9100000002", "9100000003", "9100000099"]));
    expect(names).toEqual({ "9100000001": "FIRMA UNU SRL", "9100000002": "FIRMA UNU SRL", "9100000003": "Comuna Fixture" });
  });
});

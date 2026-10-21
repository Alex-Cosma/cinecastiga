import { afterAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { readDaEvidence } from "./source-evidence";

const url = process.env.TEST_DATABASE_URL;
if (url && !/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error("Source evidence integration tests require a dedicated seap_test_* database");
const q = url ? createDb(url).sql : null;
afterAll(async () => { await q?.end(); });

describe.skipIf(!q)("DA source rows (dedicated PostgreSQL database)", () => {
  // Audit F12: a DA whose recorded supplier is its own authority has no supplier entity,
  // as in marts.da_transactions; the source name stays so the row remains transparent.
  it("keeps the recorded supplier name but no supplier entity when it is the authority itself", async () => {
    const rollback = Error("rollback source evidence fixture");
    await expect(q!.begin(async tx => {
      const [a, s] = await tx`insert into core.entities(name_display,name_normalized) values('CB Palatul Copiilor','cb palatul copiilor'),('Furnizor','furnizor') returning id::text`;
      await tx`insert into core.direct_acquisitions(sicap_da_id,da_code,authority_entity_id,supplier_entity_id,state,closing_value,finalization_date) values
        (99101,'DA99101',${a!.id},${a!.id},'Oferta acceptata',60000,'2024-03-01T08:20:00Z'),
        (99102,'DA99102',${a!.id},${s!.id},'Oferta acceptata',5000,'2024-05-03T08:00:00Z')`;
      const rows = await readDaEvidence(tx as unknown as DbSql, (tx as unknown as DbSql)`da.sicap_da_id in (99101, 99102)`);
      expect(rows.map(r => [r.refId, r.authorityId, r.supplierId, r.supplier])).toEqual([
        ["99101", a!.id, null, "CB Palatul Copiilor"],
        ["99102", a!.id, s!.id, "Furnizor"],
      ]);
      throw rollback;
    })).rejects.toBe(rollback);
  });
});

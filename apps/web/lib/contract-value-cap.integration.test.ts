import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { getContractDetail, getEntityContractsAboveCap } from "./marts";

// Regression (audit F09, 21 Oct 2026): CNAIR showed 53,5 mld. lei while 37 of its
// contracts above 1 mld. lei (84,9 mld. lei) were absent with no notice. The entity
// page now lists them and the contract page says it is outside the totals.
const url = process.env.TEST_DATABASE_URL;
if (url && !/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error("Contract cap fixtures require a dedicated seap_test_* database");

const authority = "991190001", supplier = "991190002", partner = "991190003";
const contract = (n: number) => String(991191000 + n);

describe.skipIf(!url)("entity and contract pages disclose contracts above the value cap (isolated PostgreSQL)", () => {
  let sql: DbSql;
  const globals = globalThis as unknown as { __seapSql?: DbSql };
  beforeAll(async () => {
    sql = createDb(url).sql;
    const [existing] = await sql`select count(*)::int n from core.contracts`;
    if (Number(existing?.n) !== 0) throw new Error("Expected an empty migrated test database");
    globals.__seapSql = sql;
    await sql`insert into core.entities(id,name_display,name_normalized,cui_valid,country_code) values
      (${authority},'Compania de drumuri','compania de drumuri',false,'RO'),
      (${supplier},'Constructor','constructor',false,'RO'),(${partner},'Asociat','asociat',false,'RO')`;
    await sql`insert into core.awards(raw_id,ca_notice_id,notice_no,authority_entity_id) values (1,991192001,'CAN1',${authority})`;
    const rows: [number, string, string, string][] = [
      [1, "6626404001", "Autostradă secțiunea 3B", "2025-03-01"],
      [2, "900000000.25", "Lucrări sub plafon", "2024-05-01"],
      [3, "177930419250", "ACORD CADRU servicii", "2024-05-01"],
      [4, "4729755332.14", "Varianta ocolitoare, consorțiu", "2024-06-30T22:30:00"],
    ];
    for (const [n, value, title, date] of rows) {
      await sql`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_no,contract_date,contract_value,currency,title)
        values (${contract(n)},${n},${contract(n)},991192001,${"C" + n},${date.includes("T") ? date + "Z" : date + "T09:00:00Z"},${value},'RON',${title})`;
    }
    await sql`insert into core.contract_winners(contract_id,entity_id) values
      (${contract(1)},${supplier}),(${contract(2)},${supplier}),(${contract(3)},${supplier}),(${contract(4)},${supplier}),(${contract(4)},${partner})`;
  });
  afterAll(async () => {
    if (!sql) return;
    delete globals.__seapSql;
    await sql`delete from core.contracts where id between ${contract(1)} and ${contract(4)}`;
    await sql`delete from core.awards where ca_notice_id=991192001`;
    await sql`delete from core.entities where id in (${authority},${supplier},${partner})`;
    await sql.end();
  });

  it("lists an authority's above-cap contracts with an exact total, excluding framework ceilings", async () => {
    const result = await getEntityContractsAboveCap(authority, "authority", sql);
    expect(result).toEqual({ count: 2, totalExact: "11356159333.14", rows: [
      { natId: contract(1), title: "Autostradă secțiunea 3B", contractNo: "C1", contractDate: "2025-03-01", valueRonExact: "6626404001", nWinners: 1 },
      // 22:30 UTC on 30 June is 1 July in Romania.
      { natId: contract(4), title: "Varianta ocolitoare, consorțiu", contractNo: "C4", contractDate: "2024-07-01", valueRonExact: "4729755332.14", nWinners: 2 },
    ] });
    expect(await getEntityContractsAboveCap(partner, "supplier", sql)).toMatchObject({ count: 1, totalExact: "4729755332.14" });
    const limited = await getEntityContractsAboveCap(supplier, "supplier", sql, 1);
    expect(limited).toMatchObject({ count: 2, totalExact: "11356159333.14" });
    expect(limited.rows.map(r => r.natId)).toEqual([contract(1)]);
  });

  it("marks only the reportable above-cap contract as outside the totals", async () => {
    expect(await getContractDetail(contract(1))).toMatchObject({ aboveValueCap: true, nonAdditive: false, financialKind: "contract" });
    expect(await getContractDetail(contract(2))).toMatchObject({ aboveValueCap: false });
    expect(await getContractDetail(contract(3))).toMatchObject({ aboveValueCap: true, nonAdditive: true, financialKind: "framework" });
  });
});

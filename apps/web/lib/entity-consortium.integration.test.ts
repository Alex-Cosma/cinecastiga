import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { getEntityPartnersPaged, getEntitySubjects, getEntityTransactions, getEntityTxCounts } from "./marts";

// Entity page, beginner pass (22 Oct 2026): consortium shares are labelled and
// "Pe scurt" groups exactly the KPI selection by CPV division. Shaped on the
// Buzău contract 108758: 381.909.792,16 lei split between 3 winners.
const url = process.env.TEST_DATABASE_URL;
if (url && !/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error("Entity consortium fixtures require a dedicated seap_test_* database");

const authority = "992260001", winnerA = "992260002", winnerB = "992260003", winnerC = "992260004", solo = "992260005";
const consortium = "992261001", single = "992261002";

describe.skipIf(!url)("entity page consortium labels and summary (isolated PostgreSQL)", () => {
  let sql: DbSql;
  const globals = globalThis as unknown as { __seapSql?: DbSql };
  beforeAll(async () => {
    sql = createDb(url).sql;
    const [existing] = await sql`select count(*)::int n from marts.contract_transactions`;
    if (Number(existing?.n) !== 0) throw new Error("Expected an empty migrated test database");
    globals.__seapSql = sql;
    await sql`insert into core.cpv_codes(code,name_ro,revision,division) values
      ('45000000-7','Lucrări de construcţii','Rev.2','45'),('90000000-7','Servicii de evacuare a apelor reziduale','Rev.2','90')
      on conflict do nothing`;
    const ct = (supplier: string, name: string, value: string) => sql`insert into marts.contract_transactions
      (contract_id,supplier_id,contract_no,authority_id,authority_name,supplier_name,cpv_code,cpv_name,closing_value,contract_value_full,n_winners,finalization_date)
      values (${consortium},${supplier},'108758',${authority},'MUNICIPIUL TEST',${name},'45453000-7','Lucrări de reparații',${value},'381909792.16',3,'2025-07-16')`;
    await ct(winnerA, "CONCELEX", "127303264.06");
    await ct(winnerB, "Concelex Engineering S.R.L", "127303264.05");
    await ct(winnerC, "CONSTRUCTII ERBASU S.A.", "127303264.05");
    await sql`insert into marts.contract_transactions
      (contract_id,supplier_id,contract_no,authority_id,authority_name,supplier_name,cpv_code,closing_value,contract_value_full,n_winners,finalization_date)
      values (${single},${solo},'200',${authority},'MUNICIPIUL TEST','RER SUD','90511000-2','300000000','300000000',1,'2023-02-06')`;
    await sql`insert into marts.da_transactions(sicap_da_id,authority_id,supplier_id,authority_name,supplier_name,cpv_code,closing_value,finalization_date) values
      (992262001,${authority},${solo},'MUNICIPIUL TEST','RER SUD','90511000-2',1000.5,'2024-03-01'),
      (992262002,${authority},${winnerA},'MUNICIPIUL TEST','CONCELEX',null,500,'2024-03-02'),
      (992262003,${authority},${solo},'MUNICIPIUL TEST','RER SUD','90511000-2',2500000,'2024-03-03')`;
  });
  afterAll(async () => {
    if (!sql) return;
    delete globals.__seapSql;
    await sql`delete from marts.contract_transactions where contract_id in (${consortium},${single})`;
    await sql`delete from marts.da_transactions where sicap_da_id between 992262001 and 992262003`;
    await sql`delete from core.cpv_codes where code in ('45000000-7','90000000-7')`;
    await sql.end();
  });

  it("returns each consortium row with its whole contract and the other members", async () => {
    const { rows } = await getEntityTransactions(authority, "authority", { src: "contracts", pageSize: 10 });
    const share = rows.filter((r) => r.sicapDaId === consortium);
    expect(share).toHaveLength(3);
    expect(share.find((r) => r.partnerId === winnerC)).toMatchObject({
      closingValue: 127303264.05, contractValueFull: 381909792.16, nWinners: 3,
      consortiumOthers: ["CONCELEX", "Concelex Engineering S.R.L"],
    });
    expect(rows.find((r) => r.sicapDaId === single)).toMatchObject({ nWinners: 1, consortiumOthers: [] });
    const supplierView = await getEntityTransactions(winnerA, "supplier", { pageSize: 10 });
    expect(supplierView.rows.find((r) => r.src === "contract")).toMatchObject({
      nWinners: 3, consortiumOthers: ["Concelex Engineering S.R.L", "CONSTRUCTII ERBASU S.A."],
    });
    expect(supplierView.rows.find((r) => r.src === "da")).toMatchObject({ nWinners: null, contractValueFull: null, consortiumOthers: [] });
  });

  it("marks ranking rows whose total includes consortium shares", async () => {
    const { rows } = await getEntityPartnersPaged(authority, "authority", 1, 10);
    expect(Object.fromEntries(rows.map((r) => [r.partnerId, r.nConsortium]))).toEqual({ [solo]: 0, [winnerA]: 1, [winnerB]: 1, [winnerC]: 1 });
    const buyers = await getEntityPartnersPaged(winnerA, "supplier", 1, 10);
    expect(buyers.rows).toEqual([expect.objectContaining({ partnerId: authority, n: 2, nConsortium: 1 })]);
  });

  it("groups exactly the KPI selection by CPV division, with distinct consortium contracts", async () => {
    const [subjects, counts] = await Promise.all([getEntitySubjects(authority, "authority", 3, sql), getEntityTxCounts(authority, "authority")]);
    expect(subjects).toEqual({
      nConsortium: 1,
      divisions: [
        { code: "45", name: "Lucrări de construcţii", valueExact: "381909792.16", n: 3 },
        { code: "90", name: "Servicii de evacuare a apelor reziduale", valueExact: "300001000.5", n: 2 },
        { code: null, name: null, valueExact: "500", n: 1 },
      ],
    });
    // The 2.5 million lei DA is outside both the KPI and the summary.
    expect(counts.valueExact).toBe("681911292.66");
    const cents = subjects.divisions.reduce((total, d) => total + Math.round(Number(d.valueExact) * 100), 0);
    expect(cents).toBe(Math.round(Number(counts.valueExact) * 100));
    expect(await getEntitySubjects(winnerB, "supplier", 1, sql)).toEqual({
      nConsortium: 1, divisions: [{ code: "45", name: "Lucrări de construcţii", valueExact: "127303264.05", n: 1 }],
    });
  });
});

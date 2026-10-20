import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contractAboveValueCap, CONTRACT_VALUE_CAP_RON, createDb, type DbSql } from "@seap/db";
import { runCoverage } from "./coverage.js";

// Regression (audit F09, 21 Oct 2026): RON contracts above the 1 mld. lei cap
// (CNAIR motorway sections, Cluj-Napoca metro, CFR works) silently dropped out
// of every total. The cap stays; the inventory now counts and sums them.
// Runs only against a dedicated, migrated seap_test_* database; rows are removed afterwards.
const url = process.env.TEST_DATABASE_URL;
if (url && !/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error("Contract cap fixtures require a dedicated seap_test_* database");

const authority = "991090001", supplier = "991090002", partner = "991090003";
const contract = (n: number) => String(991091000 + n);
const evidence = { version: "1" };

describe.skipIf(!url)("contracts above the value cap (isolated PostgreSQL)", () => {
  let sql: DbSql;
  beforeAll(async () => {
    sql = createDb(url).sql;
    const [existing] = await sql`select count(*)::int n from core.contracts`;
    if (Number(existing?.n) !== 0) throw new Error("Expected an empty migrated test database");
    await sql`insert into core.entities(id,name_display,name_normalized,cui_valid,country_code) values
      (${authority},'Compania de drumuri','compania de drumuri',false,'RO'),
      (${supplier},'Constructor','constructor',false,'RO'),(${partner},'Asociat','asociat',false,'RO')`;
    await sql`insert into core.awards(raw_id,ca_notice_id,notice_no,authority_entity_id) values
      (1,991092001,'CAN1',${authority}),(2,991092002,'CAN2',null)`;
    const rows: [number, number, string | null, string | null, string, string][] = [
      // n, award, value, currency, title, date
      [1, 991092001, "1500000000.50", "RON", "Proiectare și execuție autostradă secțiunea 1", "2024-05-01"],
      [2, 991092001, "900000000", "RON", "Lucrări sub plafon", "2024-05-01"],
      [3, 991092001, "1000000000", "RON", "Lucrări exact la plafon", "2024-05-01"],
      [4, 991092001, "2000000000", "RON", "Acord - cadru lucrări", "2024-05-01"],
      [5, 991092001, "3000000000", "RON", "Fără câștigător publicat", "2024-05-01"],
      [6, 991092001, "5000000000", "EUR", "Monedă istorică neconvertită", "2024-05-01"],
      [7, 991092001, "1200000000", "RON", "Metrou, consorțiu", "2025-01-02"],
      [8, 991092001, "1200000000", "RON", "Metrou, consorțiu", "2025-01-02"],
      [10, 991092002, "4000000000", "RON", "Fără autoritate", "2024-05-01"],
    ];
    for (const [n, award, value, currency, title, date] of rows) {
      await sql`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_no,contract_date,contract_value,currency,title)
        values (${contract(n)},${n},${contract(n)},${award},${"C" + n},${date + "T09:00:00Z"},${value},${currency},${title})`;
    }
    // Dated null: otherwise above the cap, but not part of the contract population.
    await sql`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_no,contract_value,currency,title)
      values (${contract(11)},11,${contract(11)},991092001,'C11',7000000000,'RON','Fără dată')`;
    // Verified conversion from EUR above the cap counts in RON.
    await sql`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_no,contract_date,contract_value,currency,title,
        original_value,original_currency,value_ron,currency_rate,amount_status,amount_raw_id,amount_evidence)
      values (${contract(9)},9,${contract(9)},991092001,'C9','2023-03-03T09:00:00Z',300000000,'EUR','Linie feroviară',
        300000000,'EUR',1500000000,5,'converted',9,${JSON.stringify(evidence)}::jsonb)`;
    await sql`insert into core.contract_winners(contract_id,entity_id) select id,${supplier}::bigint from core.contracts
      where id between ${contract(1)} and ${contract(11)} and id<>${contract(5)}`;
    await sql`insert into core.contract_winners(contract_id,entity_id) values (${contract(7)},${partner}),(${contract(8)},${partner})`;
    // Contract 8 republishes contract 7: the approved version is counted once.
    await sql`insert into marts.contract_identity_candidates(id,fingerprint,status,evidence) values ('f09-fixture','f09-fp','source_verified','{}')`;
    await sql`insert into marts.contract_identity_observations(fingerprint,candidate_id,evidence) values ('f09-fp','f09-fixture','{}')`;
    await sql`insert into marts.contract_identity_decisions(candidate_id,fingerprint,canonical_contract_id,reason) values ('f09-fixture','f09-fp',${contract(7)},'fixture')`;
    await sql`insert into marts.contract_identity_members(contract_id,candidate_id,snapshot_hash) values (${contract(7)},'f09-fixture','h'),(${contract(8)},'f09-fixture','h')`;
  });
  afterAll(async () => {
    if (!sql) return;
    await sql`delete from marts.contract_identity_members where candidate_id='f09-fixture'`;
    await sql`delete from marts.contract_identity_decisions where candidate_id='f09-fixture'`;
    await sql`delete from marts.contract_identity_observations where candidate_id='f09-fixture'`;
    await sql`delete from marts.contract_identity_candidates where id='f09-fixture'`;
    await sql`delete from core.contracts where id between ${contract(1)} and ${contract(11)}`;
    await sql`delete from core.awards where ca_notice_id in (991092001,991092002)`;
    await sql`delete from core.entities where id in (${authority},${supplier},${partner})`;
    await sql`delete from marts.data_coverage where dataset in ('da','contracts','ted','years')`;
    await sql.end();
  });

  it("selects only otherwise-included, canonical contracts strictly above the cap", async () => {
    const rows = await sql`select c.ca_notice_contract_id::text id from core.contracts c join core.awards a using(ca_notice_id)
      where ${contractAboveValueCap(sql)} order by 1`;
    expect(rows.map(r => r.id)).toEqual([contract(1), contract(7), contract(9)]);
    expect(CONTRACT_VALUE_CAP_RON).toBe(1_000_000_000);
  });

  it("counts and sums them exactly in the contracts inventory", async () => {
    await runCoverage(sql);
    const [row] = await sql`select observation from marts.data_coverage where dataset='contracts'`;
    expect(row?.observation).toMatchObject({ above_value_cap: "3", above_value_cap_value: "4200000000.5", value_cap: "1000000000" });
  });
});

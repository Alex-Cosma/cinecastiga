import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { getAwardNoticeDetail, getContractDetail } from "./marts";

// Owner decision of 21 October 2026 (award dates). SEAP republishes an award
// notice under the same number when it adds call-offs: a new caNoticeId, new
// contract ids and a new state date (e.g. CAN1042407, versions of 10.07 and
// 25.09.2026, first contract 15.06.2021). The notice page labels the date as
// this version's and shows the first contract across versions; award signals
// count once per notice, so a contract of an earlier version still shows them.
const url = process.env.TEST_DATABASE_URL;
if (url && !/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error("Award notice fixtures require a dedicated seap_test_* database");

const authority = "991200001", otherAuthority = "991200002";
const notice = (n: number) => String(991201000 + n);
const contract = (n: number) => String(991202000 + n);

describe.skipIf(!url)("award notice versions (isolated PostgreSQL)", () => {
  let sql: DbSql;
  const globals = globalThis as unknown as { __seapSql?: DbSql };
  beforeAll(async () => {
    sql = createDb(url).sql;
    const [existing] = await sql`select count(*)::int n from core.awards`;
    if (Number(existing?.n) !== 0) throw new Error("Expected an empty migrated test database");
    globals.__seapSql = sql;
    await sql`insert into core.entities(id,name_display,name_normalized,cui_valid,country_code) values
      (${authority},'Spitalul','spitalul',false,'RO'),(${otherAuthority},'Primăria','primaria',false,'RO')`;
    await sql`insert into core.awards(raw_id,ca_notice_id,notice_no,authority_entity_id,procedure_type,state_date) values
      (1,${notice(1)},'CAN77',${authority},'Negociere fara publicare prealabila','2026-07-10T12:00:04Z'),
      (2,${notice(2)},'CAN77',${authority},'Negociere fara publicare prealabila','2026-09-25T10:07:13Z'),
      (3,${notice(3)},'CAN77',${otherAuthority},'Licitatie deschisa','2023-03-01T10:00:00Z')`;
    const rows: [number, number, string, string][] = [
      [1, 1, "Contract de furnizare", "2021-06-14T21:00:00Z"], // 15.06.2021 in Romania
      [2, 2, "Contract de furnizare", "2021-06-14T21:00:00Z"],
      [3, 2, "Contract subsecvent nr. 7", "2026-09-19T21:00:00Z"],
      [4, 2, "Contract subsecvent nr. 8", "2000-01-19T22:00:00Z"], // implausible source date
      [5, 3, "Contract de lucrări", "2019-02-28T22:00:00Z"], // same number, another authority
    ];
    for (const [n, award, title, date] of rows) {
      await sql`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_no,contract_date,contract_value,currency,title)
        values (${contract(n)},${n},${contract(n)},${notice(award)},${"C" + n},${date},1000,'RON',${title})`;
    }
    // The signal sits on the latest version only (rf-2026.15).
    await sql`insert into core.flags(subject_type,subject_id,flag_code,period,triggered,severity,evidence,methodology_version)
      select 'award',id,'award_no_competition','2021',true,1,
        '{"value":2000000,"period_source":"first_contract","first_contract_date":"2021-06-15","version_date":"2026-09-25","notice_versions":2}'::jsonb,'rf-2026.15'
      from core.awards where ca_notice_id=${notice(2)}`;
  });
  afterAll(async () => {
    if (!sql) return;
    delete globals.__seapSql;
    await sql`delete from core.flags where subject_type='award' and subject_id in (select id from core.awards where ca_notice_id between ${notice(1)} and ${notice(3)})`;
    await sql`delete from core.contracts where id between ${contract(1)} and ${contract(5)}`;
    await sql`delete from core.awards where ca_notice_id between ${notice(1)} and ${notice(3)}`;
    await sql`delete from core.entities where id in (${authority},${otherAuthority})`;
    await sql.end();
  });

  it("dates the shown version and the first contract across the versions of the notice", async () => {
    const first = await getAwardNoticeDetail(notice(1));
    expect(first).toMatchObject({ versionDate: "2026-07-10", firstContractDate: "2021-06-15",
      versions: [{ caNoticeId: notice(1), versionDate: "2026-07-10" }, { caNoticeId: notice(2), versionDate: "2026-09-25" }] });
    expect(await getAwardNoticeDetail(notice(2))).toMatchObject({ versionDate: "2026-09-25", firstContractDate: "2021-06-15" });
    // The same number under another authority is another notice.
    expect(await getAwardNoticeDetail(notice(3))).toMatchObject({ versionDate: "2023-03-01", firstContractDate: "2019-03-01",
      versions: [{ caNoticeId: notice(3), versionDate: "2023-03-01" }] });
  });

  it("shows the notice's award signal on a contract of an earlier version, not on another authority's notice", async () => {
    expect((await getContractDetail(contract(1)))?.flags.map((f) => f.code)).toEqual(["award_no_competition"]);
    expect((await getContractDetail(contract(3)))?.flags.map((f) => f.code)).toEqual(["award_no_competition"]);
    expect((await getContractDetail(contract(5)))?.flags).toEqual([]);
  });
});

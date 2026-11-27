import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildNoticeFrameworks, contractKind, contractKindBySource, createDb, type DbSql } from "@seap/db";
import { runMarts } from "./marts.js";
import { validateContractPopulation } from "../monitoring/validate.js";

// Owner, 27 November 2026 (contract-reporting-8, migration 0120): a publication without a SEAP contract type that its
// own notice's total leaves out, beside call-offs, is the framework those call-offs were ordered under. A hospital's
// „Contract loturile 44, 26, 27” at 404 mil. lei stood beside 145 call-offs of 9,3 mil. in all, and both were counted.
// Runs only against a dedicated, migrated seap_test_* database; rows are removed afterwards.
const url = process.env.TEST_DATABASE_URL;
if (url && !/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error("Notice framework fixtures require a dedicated seap_test_* database");

const authority = "991290001", supplier = "991290002";
const notice = (n: number) => 991292000 + n;
const contract = (n: number) => String(991291000 + n);
const fixtureCpv = "99909902-0";

describe.skipIf(!url)("frameworks recorded as contracts, read from their notice (isolated PostgreSQL)", () => {
  let sql: DbSql;
  beforeAll(async () => {
    sql = createDb(url).sql;
    const [existing] = await sql`select count(*)::int n from core.contracts`;
    if (Number(existing?.n) !== 0) throw new Error("Expected an empty migrated test database");
    await sql`insert into core.entities(id,name_display,name_normalized,cui_valid,country_code) values
      (${authority},'Spitalul de test','spitalul de test',false,'RO'),(${supplier},'Furnizor','furnizor',false,'RO')`;
    await sql`insert into core.cpv_codes(code,name_ro,revision,division) values (${fixtureCpv},'Cod CPV de test','fixture','99')`;
    // The notices and the total SEAP wrote on each.
    const notices: [number, string | null][] = [[1, "100"], [2, "150"], [3, "100"], [4, "100"], [5, "200"], [6, "200"], [7, null]];
    for (const [n, total] of notices)
      await sql`insert into core.awards(raw_id,ca_notice_id,notice_no,authority_entity_id,cpv_code,ron_contract_value)
        values (${9912000 + n},${notice(n)},${"CANF" + n},${authority},${fixtureCpv},${total})`;
    const rows: [number, number, string, string, number | null][] = [
      // n, notice, value, title, SEAP's own contract type
      [1, 1, "500", "Contract loturile 44, 26, 27", null],          // left out of the total of 100: the framework
      [2, 1, "60", "Contract subsecvent nr. 1", null],
      [3, 1, "40", "Contract subsecvent nr. 2", null],
      [4, 2, "50", "Contract lot 3", null],                         // 150 = 100 of call-offs + 50: counted by SEAP too
      [5, 2, "100", "Contract subsecvent lot 3", null],
      [6, 3, "1", "Contract lot 9", null],                          // 1% of the total: too small for the total to tell
      [7, 3, "100", "Contract subsecvent lot 9", null],
      [8, 4, "500", "Contract lot 1", 1],                           // SEAP says contract: its type wins
      [9, 4, "100", "Contract subsecvent lot 1", 3],
      [10, 5, "200", "Acordul-cadru nr. 5 de furnizare reactivi", null], // the articulated spelling, at the start
      [11, 6, "200", "Furnizare reactivi conform acordului-cadru nr. 5", null], // elsewhere in the title: not read
      [12, 7, "300", "Contract lot 2", null],                       // the notice has no total: nothing to read
      [13, 7, "100", "Contract subsecvent lot 2", null],
    ];
    for (const [n, award, value, title, type] of rows) {
      await sql`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_no,contract_date,contract_value,currency,title,source_contract_type,contract_type_raw_id)
        values (${contract(n)},${n},${contract(n)},${notice(award)},${"C" + n},${`2024-0${1 + (n % 9)}-10T09:00:00Z`},${value},'RON',${title},${type},${type === null ? null : n})`;
    }
    await sql`insert into core.contract_winners(contract_id,entity_id) select id,${supplier}::bigint from core.contracts where id between ${contract(1)} and ${contract(13)}`;
  });
  afterAll(async () => {
    if (!sql) return;
    await sql`delete from marts.contract_notice_frameworks`;
    await sql`delete from marts.contract_value_review where contract_nat_id between ${contract(1)} and ${contract(13)}`;
    await sql`delete from core.contracts where id between ${contract(1)} and ${contract(13)}`;
    await sql`delete from core.awards where ca_notice_id between ${notice(1)} and ${notice(7)}`;
    await sql`delete from core.cpv_codes where code=${fixtureCpv}`;
    await sql`delete from core.entities where id in (${authority},${supplier})`;
    await sql`delete from marts.data_coverage where dataset in ('da','contracts','ted','years')`;
    await sql`truncate marts.contract_transactions, marts.contract_transactions_held, marts.national_stats, marts.spend_by_type, marts.spend_by_cpv, marts.spend_by_county,
      marts.entity_profile, marts.entity_top_partners, marts.top_entities, marts.authority_concentration`;
    await sql.end();
  });

  const kinds = async () => Object.fromEntries((await sql`select c.ca_notice_contract_id::text id, ${contractKind(sql)} kind from core.contracts c order by c.id`)
    .map(r => [Number(r.id) - 991291000, r.kind]));

  it("before any run reads the notices, a publication is what its type or its title says", async () => {
    expect(await kinds()).toMatchObject({ 1: "contract", 2: "calloff", 8: "contract", 9: "calloff", 10: "contract" });
  });

  it("reads as frameworks the publications a notice's total leaves out, and a title that begins „Acordul-cadru”", async () => {
    expect(await sql.begin(q => buildNoticeFrameworks(q))).toEqual({ frameworks: 2, byNoticeTotal: 1, byTitle: 1, value: "700" });
    expect((await sql`select contract_id::text id, rule, value_ron::text v, calloff_sum::text co, notice_total::text total from marts.contract_notice_frameworks order by 1`)
      .map(r => [r.id, r.rule, r.v, r.co, r.total])).toEqual([[contract(1), "notice_total", "500", "100", "100"], [contract(10), "title", "200", null, null]]);
    expect(await kinds()).toEqual({ 1: "framework", 2: "calloff", 3: "calloff", 4: "contract", 5: "calloff", 6: "contract", 7: "calloff", 8: "contract", 9: "calloff",
      10: "framework", 11: "contract", 12: "contract", 13: "calloff" });
    // The source alone still says contract: the identity snapshot and the call-off ceilings keep that reading.
    const [plain] = await sql`select ${contractKindBySource(sql)} kind from core.contracts c where c.id = ${contract(1)}`;
    expect(plain?.kind).toBe("contract");
  });

  it("is rewritten by every run: a notice whose total changes is read again", async () => {
    await sql`update core.awards set ron_contract_value = 600 where ca_notice_id = ${notice(1)}`;    // now 500 + 60 + 40
    expect((await sql.begin(q => buildNoticeFrameworks(q))).byNoticeTotal).toBe(0);
    await sql`update core.awards set ron_contract_value = 100.9 where ca_notice_id = ${notice(1)}`;  // within one percent
    expect((await sql.begin(q => buildNoticeFrameworks(q))).byNoticeTotal).toBe(1);
    await sql`update core.awards set ron_contract_value = 100 where ca_notice_id = ${notice(1)}`;
  });

  it("keeps a framework read this way out of the totals, its call-offs in, and the validation agrees", async () => {
    await runMarts(sql);
    const rows = await sql`select contract_id::text id, sum(closing_value)::text value from marts.contract_transactions group by 1 order by 1`;
    expect(rows.map(r => [Number(r.id) - 991291000, Number(r.value)])).toEqual([[2, 60], [3, 40], [4, 50], [5, 100], [6, 1], [7, 100], [8, 500], [9, 100], [11, 200], [12, 300], [13, 100]]);
    expect(await validateContractPopulation(sql)).toMatchObject({ eligible_missing: "0", excluded_included: "0", allocation_mismatches: "0" });
  }, 120_000);
});

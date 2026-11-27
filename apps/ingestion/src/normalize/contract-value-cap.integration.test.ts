import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildContractValueReview, contractValueAdmitted, contractValueHeld, CONTRACT_VALUE_CAP_RON, createDb, currentSnapshotHashes, type DbSql } from "@seap/db";
import { runCoverage } from "./coverage.js";
import { runMarts } from "./marts.js";
import { validateContractPopulation } from "../monitoring/validate.js";

// Regression (audit F09, 21 Oct 2026): RON contracts above the 1 mld. lei cap
// (CNAIR motorway sections, Cluj-Napoca metro, CFR works) silently dropped out
// of every total; the inventory counted and summed them.
// Owner, 19 November 2026 (migration 0113): a contract above the cap is counted unless its notice contradicts the
// value (the guard) or an administrator excluded it; marts.contract_value_review holds each run's answer.
// Runs only against a dedicated, migrated seap_test_* database; rows are removed afterwards.
const url = process.env.TEST_DATABASE_URL;
if (url && !/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error("Contract cap fixtures require a dedicated seap_test_* database");

const authority = "991090001", supplier = "991090002", partner = "991090003";
const contract = (n: number) => String(991091000 + n);
const evidence = { version: "1" };
const fixtureCpv = "99909901-0";

describe.skipIf(!url)("contracts above the value cap (isolated PostgreSQL)", () => {
  let sql: DbSql;
  beforeAll(async () => {
    sql = createDb(url).sql;
    const [existing] = await sql`select count(*)::int n from core.contracts`;
    if (Number(existing?.n) !== 0) throw new Error("Expected an empty migrated test database");
    await sql`insert into core.entities(id,name_display,name_normalized,cui_valid,country_code) values
      (${authority},'Compania de drumuri','compania de drumuri',false,'RO'),
      (${supplier},'Constructor','constructor',false,'RO'),(${partner},'Asociat','asociat',false,'RO')`;
    await sql`insert into core.cpv_codes(code,name_ro,revision,division) values (${fixtureCpv},'Cod CPV de test','fixture','99')`;
    // Only the first award notice carries a CPV; contract records never do (audit F38).
    await sql`insert into core.awards(raw_id,ca_notice_id,notice_no,authority_entity_id,cpv_code) values
      (1,991092001,'CAN1',${authority},${fixtureCpv}),(2,991092002,'CAN2',null,null)`;
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
    await sql`delete from marts.contract_value_review where contract_nat_id between ${contract(1)} and ${contract(12)}`;
    await sql`delete from app.contract_value_decisions where contract_nat_id between ${contract(1)} and ${contract(12)}`;
    await sql`delete from marts.contract_identity_members where candidate_id='f09-fixture'`;
    await sql`delete from marts.contract_identity_decisions where candidate_id='f09-fixture'`;
    await sql`delete from marts.contract_identity_observations where candidate_id='f09-fixture'`;
    await sql`delete from marts.contract_identity_candidates where id='f09-fixture'`;
    await sql`delete from core.contracts where id between ${contract(1)} and ${contract(12)}`;
    await sql`delete from core.awards where ca_notice_id in (991092001,991092002)`;
    await sql`delete from core.cpv_codes where code=${fixtureCpv}`;
    await sql`delete from core.entities where id in (${authority},${supplier},${partner})`;
    await sql`delete from marts.data_coverage where dataset in ('da','contracts','ted','years')`;
    await sql`truncate marts.contract_transactions, marts.contract_transactions_held, marts.national_stats, marts.spend_by_type, marts.spend_by_cpv, marts.spend_by_county,
      marts.entity_profile, marts.entity_top_partners, marts.top_entities, marts.authority_concentration`;
    await sql.end();
  });

  const held = async () => (await sql`select c.ca_notice_contract_id::text id from core.contracts c join core.awards a using(ca_notice_id)
    where ${contractValueHeld(sql)} order by 1`).map(r => r.id);
  const counted = async () => (await sql`select c.ca_notice_contract_id::text id from core.contracts c
    where ${contractValueAdmitted(sql)} and c.ca_notice_contract_id = any(${[1, 7, 8, 9, 12].map(contract)}::bigint[]) order by 1`).map(r => r.id);
  const review = async () => (await sql`select contract_nat_id::text id, admitted, guard, decision, first_seen_at = 'epoch'::timestamptz baseline
    from marts.contract_value_review order by 1`).map(r => [r.id, r.admitted, r.guard, r.decision, r.baseline]);
  const notice = (total: string | null, lowest: string | null = null) =>
    sql`update core.awards set ron_contract_value=${total}, lowest_offer_value=${lowest} where ca_notice_id=991092001`;
  // Everything with a value in lei in the notice but the framework's own row (4): contracts 1-3, 5, 7, 8, 9 (converted) and 11.
  const NOTICE_SUM = "17300000000.5";

  it("before any review, holds every otherwise-included, canonical contract strictly above the cap", async () => {
    expect(await held()).toEqual([contract(1), contract(7), contract(9)]);
    expect(await counted()).toEqual([]);
    expect(CONTRACT_VALUE_CAP_RON).toBe(1_000_000_000);
    await runCoverage(sql);
    const [row] = await sql`select observation from marts.data_coverage where dataset='contracts'`;
    expect(row?.observation).toMatchObject({ above_value_cap: "3", above_value_cap_value: "4200000000.5", value_cap: "1000000000", above_value_cap_counted: "0", above_value_cap_counted_value: "0" });
  });

  it("holds a contract whose notice carries no total, and dates the first review at the epoch", async () => {
    expect(await buildContractValueReview(sql)).toEqual({ above: 3, admitted: 0, held: 3, added: 3 });
    expect(await review()).toEqual([1, 7, 9].map(n => [contract(n), false, "notice_value_missing", null, true]));
    expect(await held()).toEqual([contract(1), contract(7), contract(9)]);
  });

  it("counts the contracts their notice confirms", async () => {
    await notice(NOTICE_SUM);
    expect(await buildContractValueReview(sql)).toEqual({ above: 3, admitted: 3, held: 0, added: 0 });
    expect(await review()).toEqual([1, 7, 9].map(n => [contract(n), true, null, null, true]));
    expect(await held()).toEqual([]);
    // The republished copy (8) is not reviewed, so not admitted: it is not the canonical publication.
    expect(await counted()).toEqual([contract(1), contract(7), contract(9)]);
    await runCoverage(sql);
    const [row] = await sql`select observation from marts.data_coverage where dataset='contracts'`;
    expect(row?.observation).toMatchObject({ above_value_cap: "0", above_value_cap_value: "0", above_value_cap_counted: "3", above_value_cap_counted_value: "4200000000.5" });
  });

  it("holds contracts that add up to more than one and a half times the notice, or that dwarf its lowest offer", async () => {
    await notice("11533333334");                       // 17.3 / 11.53 = 1.5 exactly: not more
    expect((await buildContractValueReview(sql)).held).toBe(0);
    // With the framework's 2 mld. the notice would add up to 19,3 mld., over 1.5 × 12 mld.: a framework is not added to its call-offs.
    await notice("12000000000");
    expect((await buildContractValueReview(sql)).held).toBe(0);
    await notice("11000000000");
    await buildContractValueReview(sql);
    expect((await review()).map(r => r[2])).toEqual(["notice_sum", "notice_sum", "notice_sum"]);
    await notice(NOTICE_SUM, "400000000.01");          // 1,2 mld. is under three times the offer; 1,5 mld. is over
    await buildContractValueReview(sql);
    expect(await review()).toEqual([[contract(1), false, "lowest_offer", null, true], [contract(7), true, null, null, true], [contract(9), false, "lowest_offer", null, true]]);
  });

  it("follows the administrators: an exclusion holds a confirmed contract, an inclusion counts a held one", async () => {
    await sql`insert into app.contract_value_decisions(contract_nat_id,decision,reason,decided_by) values
      (${contract(7)},'exclude','valoare greșită în sursă','test'),(${contract(9)},'include','verificat în SEAP','test')`;
    expect(await buildContractValueReview(sql)).toEqual({ above: 3, admitted: 1, held: 2, added: 0 });
    expect(await review()).toEqual([[contract(1), false, "lowest_offer", null, true], [contract(7), false, null, "exclude", true], [contract(9), true, "lowest_offer", "include", true]]);
    expect(await held()).toEqual([contract(1), contract(7)]);
    await runCoverage(sql);
    const [row] = await sql`select observation from marts.data_coverage where dataset='contracts'`;
    expect(row?.observation).toMatchObject({ above_value_cap: "2", above_value_cap_value: "2700000000.5", above_value_cap_counted: "1", above_value_cap_counted_value: "1500000000" });
  });

  it("dates a contract that appears later at its first review, and forgets one that left the cap", async () => {
    await sql`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_no,contract_date,contract_value,currency,title)
      values (${contract(12)},12,${contract(12)},991092001,'C12','2026-02-02T09:00:00Z',1100000000,'RON','Drum expres')`;
    await sql`insert into core.contract_winners(contract_id,entity_id) values (${contract(12)},${supplier})`;
    await sql`update core.contracts set contract_value=900000000 where id=${contract(1)}`;
    await notice("19800000000");
    expect(await buildContractValueReview(sql)).toEqual({ above: 3, admitted: 2, held: 1, added: 1 });
    expect(await review()).toEqual([[contract(12), true, null, null, false], [contract(7), false, null, "exclude", true], [contract(9), true, null, "include", true]].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  });

  it("counts in the totals exactly the admitted ones, and the validation recomputes the same population", async () => {
    // The build refuses identity members whose source changed: give the fixture's two publications their real hashes.
    for (const [id, hash] of await currentSnapshotHashes(sql, [contract(7), contract(8)]))
      await sql`update marts.contract_identity_members set snapshot_hash=${hash} where contract_id=${id}`;
    await runMarts(sql);
    // 12 (confirmed by its notice) and 9 (admitted by an administrator) are counted; 7 is excluded and its copy 8 is
    // not the canonical publication; 1 is under the cap now, like 2 and 3.
    const rows = await sql`select contract_id::text id, sum(closing_value)::text value from marts.contract_transactions group by 1 order by 1`;
    expect(rows.map(r => [r.id, Number(r.value)])).toEqual([[contract(1), 900000000], [contract(2), 900000000], [contract(3), 1000000000], [contract(9), 1500000000], [contract(12), 1100000000]]);
    expect(await validateContractPopulation(sql)).toMatchObject({ eligible_missing: "0", excluded_included: "0", allocation_mismatches: "0" });
    // An administrator's decision made after the build changes nothing until the next run: the totals and their
    // validation both read the run's review.
    await sql`delete from app.contract_value_decisions where contract_nat_id=${contract(7)}`;
    expect(await validateContractPopulation(sql)).toMatchObject({ eligible_missing: "0", excluded_included: "0", allocation_mismatches: "0" });
    expect(await held()).toEqual([contract(7)]);
  }, 120_000);

  // Owner, 26 November 2026 (migration 0116): nine contracts between 10 and 815 million lei carried a value ten, a
  // hundred or a thousand times too large and passed under the cap. An administrator's exclusion now holds a contract
  // of any size: out of the totals, and into the table the lists read to show it, marked.
  it("holds a contract under the cap that an administrator excluded: out of the totals, in the held list", async () => {
    await sql`insert into app.contract_value_decisions(contract_nat_id,decision,reason,decided_by) values
      (${contract(2)},'exclude','Estimarea procedurii: 9.000.000 lei. Valoarea din SEAP e de 100 de ori mai mare.','test')`;
    // An inclusion means nothing under the cap: the contract is counted anyway and does not enter the review.
    await sql`insert into app.contract_value_decisions(contract_nat_id,decision,reason,decided_by) values (${contract(3)},'include','fără efect','test')`;
    expect(await buildContractValueReview(sql)).toEqual({ above: 4, admitted: 3, held: 1, added: 1 });
    expect(await review()).toContainEqual([contract(2), false, null, "exclude", false]);
    expect((await review()).map(r => r[0])).not.toContain(contract(3));
    expect(await held()).toEqual([contract(2)]);
    await runMarts(sql);
    const counted = await sql`select contract_id::text id from marts.contract_transactions group by 1 order by 1`;
    expect(counted.map(r => r.id)).toEqual([1, 3, 7, 9, 12].map(contract));
    const listed = await sql`select contract_id::text id, sum(closing_value)::text value, max(contract_value_full)::text full_value from marts.contract_transactions_held group by 1 order by 1`;
    expect(listed.map(r => [r.id, Number(r.value), Number(r.full_value)])).toEqual([[contract(2), 900000000, 900000000]]);
    expect(await validateContractPopulation(sql)).toMatchObject({ eligible_missing: "0", excluded_included: "0", allocation_mismatches: "0" });
    // Withdrawn, it is counted again at the next run and leaves the review.
    await sql`delete from app.contract_value_decisions where contract_nat_id in (${contract(2)},${contract(3)})`;
    expect(await buildContractValueReview(sql)).toEqual({ above: 3, admitted: 3, held: 0, added: 0 });
    await runMarts(sql);
    expect((await sql`select count(*)::int n from marts.contract_transactions_held`)[0]?.n).toBe(0);
    expect((await sql`select count(*)::int n from marts.contract_transactions where contract_id=${contract(2)}`)[0]?.n).toBe(1);
  }, 240_000);

  // Regression (audit F38): the inventory counted contracts.cpv_code, which the
  // parser never fills, so /metodologie showed CPV missing for every contract.
  // Totals use the award notice CPV; only contract 10 (award 991092002) lacks it.
  it("counts missing CPV on the award notice the totals use, not on the contract record", async () => {
    await runCoverage(sql);
    const [row] = await sql`select observation from marts.data_coverage where dataset='contracts'`;
    const observation = row?.observation as Record<string, string>;
    expect(observation).toMatchObject({ available: "12", missing_notice_cpv: "1" });
    expect(observation).not.toHaveProperty("missing_cpv");
  });
});

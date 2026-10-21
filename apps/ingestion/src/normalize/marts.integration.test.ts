import {seedVerifiedIdentity} from '../test/contract-identity-fixture.js';
import {approveContractIdentities} from './approve-contract-identities.js';
import { afterAll, describe, expect, it } from "vitest";
import { contractKindFromTitle, contractWinnerIsAuthority, createDb, cuiCorroborated, readContractIdentityQuality, type DbSql } from "@seap/db";
import { DA_CEILING_SEED_ROWS } from "@seap/domain";
import { runMarts } from "./marts.js";
import { runFlags } from "../flags/build.js";
import { runFlagMarts } from "../flags/marts.js";
import { runRadiografieMarts } from "../flags/radiografie.js";
import { buildTransactionMarts } from "./transaction-marts.js";
import { runCoverage } from "./coverage.js";
import { validateBatch1Snapshot, validateContractPopulation } from "../monitoring/validate.js";

const { sql } = createDb();
afterAll(() => sql.end());

/** All qualified objects are redirected into isolated schemas inside a rollback.
 * Clones have no defaults, constraints or data: no shared sequence is advanced.
 * runMarts never receives the live connection or a live schema identifier.
 */
function isolatedSql(connection: DbSql, prefix: string): DbSql {
  const rewrite = (text: string) => text.replace(/\b(core|marts|reference|raw)\./g, `${prefix}_$1.`);
  const scoped = ((chunks: TemplateStringsArray, ...values: unknown[]) => {
    // Identifier and row helpers (sql("c"), sql(rows, ...columns)) carry no SQL text.
    if (typeof chunks === "string" || !Array.isArray((chunks as { raw?: unknown }).raw))
      return (connection as unknown as (...a: unknown[]) => unknown)(chunks, ...values);
    const mapped = chunks.map(rewrite);
    Object.defineProperty(mapped, "raw", { value: chunks.raw.map(rewrite) });
    return connection(mapped as unknown as TemplateStringsArray, ...values as never[]);
  }) as unknown as DbSql;
  Object.assign(scoped, {
    array: (...args: unknown[]) => (connection as unknown as { array: (...a: unknown[]) => unknown }).array(...args),
    unsafe: (text: string, ...args: unknown[]) => (connection as unknown as { unsafe: (...a: unknown[]) => unknown }).unsafe(rewrite(text), ...args),
    // runCoverage passes isolation options first; a savepoint keeps the outer level.
    begin: (...args: unknown[]) => (connection as unknown as {
      savepoint: (fn: (q: DbSql) => Promise<unknown>) => Promise<unknown>;
    }).savepoint((q) => (args[args.length - 1] as (q: DbSql) => Promise<unknown>)(isolatedSql(q, prefix))),
  });
  return scoped;
}

const tables = {
  core: ["risk_thresholds", "contracts", "awards", "contract_winners", "entities", "cpv_codes", "direct_acquisitions", "notices", "ted_lot_results", "ted_notices", "flags"],
  marts: ["cui_corroborations", "contract_identity_exclusions", "contract_identity_archives", "contract_identity_members", "contract_identity_decisions", "contract_identity_candidates", "contract_identity_observations", "national_stats", "spend_by_type", "spend_by_cpv", "spend_by_county", "entity_profile", "entity_top_partners", "top_entities", "authority_concentration", "contract_transactions", "contract_competition", "da_transactions", "data_coverage"],
  reference: ["authority_uat", "company_financials", "company_reps", "onrc_firm"],
  raw: ["raw_documents"],
};

describe("runMarts canonical totals (isolated rollback fixture)", () => {
  it.each(["UTC", "America/Los_Angeles"])("keeps dates and annual totals in Romanian time when the connection uses %s", async (timezone) => {
    const prefix = `calendar_fixture_${process.pid}_${Date.now()}`;
    const rollback = Error("rollback calendar fixture");
    await expect(sql.begin(async tx => {
      await tx`select set_config('TimeZone', ${timezone}, true)`;
      for (const [schema, names] of Object.entries(tables)) {
        await tx.unsafe(`create schema ${prefix}_${schema}`);
        for (const table of names) await tx.unsafe(`create table ${prefix}_${schema}.${table} as table ${schema}.${table} with no data`);
      }
      const [view] = await tx`select pg_get_viewdef('marts.signal_lookup'::regclass, true) definition`;
      await tx.unsafe(`create materialized view ${prefix}_marts.signal_lookup as ${String(view!.definition).replace(/;\s*$/, "").replace(/\b(core|marts|reference|raw)\./g, `${prefix}_$1.`)} with no data`);
      const q = isolatedSql(tx as unknown as DbSql, prefix);
      await q`insert into core.entities(id,name_display) values(1,'Autoritate'),(2,'Furnizor')`;
      await q`insert into core.awards(id,ca_notice_id,authority_entity_id) values(1,100,1)`;
      await q`insert into core.contracts(id,ca_notice_id,contract_date,contract_value,currency,title) values
        (1,100,'2025-07-15T21:00:00Z',100,'RON','Contract de vară'),
        (2,100,'2025-01-15T22:00:00Z',100,'RON','Contract de iarnă'),
        (3,100,'2025-12-31T22:00:00Z',100,'RON','Contract din noul an')`;
      await q`insert into core.contract_winners(contract_id,entity_id) values(1,2),(2,2),(3,2)`;
      await q`insert into core.direct_acquisitions(id,sicap_da_id,authority_entity_id,supplier_entity_id,state,closing_value,publication_date,finalization_date)
        values(1,99001,1,2,'Oferta acceptata',12.34,'2025-12-31T21:55:00Z','2025-12-31T22:15:00Z')`;
      await runMarts(q);
      expect((await q`select finalization_date from marts.contract_transactions order by contract_id`).map(r => r.finalization_date))
        .toEqual(["2025-07-16", "2025-01-16", "2026-01-01"]);
      await buildTransactionMarts(q as unknown as Parameters<typeof buildTransactionMarts>[0]);
      expect((await q`select publication_date,finalization_date,gap_minutes from marts.da_transactions`)[0])
        .toMatchObject({ publication_date: "2025-12-31 23:55", finalization_date: "2026-01-01 00:15", gap_minutes: 20 });
      expect((await q`select y,v_plaf::text value from marts.agg_years order by y`).map(r => [r.y,r.value]))
        .toEqual([["2025","200.00"],["2026","112.34"]]);
      throw rollback;
    })).rejects.toBe(rollback);
  });
  it("keeps contract dates before the archive in totals but out of every year, range and coverage start", async () => {
    const prefix = `contract_date_fixture_${process.pid}_${Date.now()}`;
    const rollback = Error("rollback contract date fixture");
    await expect(sql.begin(async tx => {
      await tx`select set_config('TimeZone', 'UTC', true)`;
      for (const [schema, names] of Object.entries(tables)) {
        await tx.unsafe(`create schema ${prefix}_${schema}`);
        for (const table of names) await tx.unsafe(`create table ${prefix}_${schema}.${table} as table ${schema}.${table} with no data`);
      }
      const [view] = await tx`select pg_get_viewdef('marts.signal_lookup'::regclass, true) definition`;
      await tx.unsafe(`create materialized view ${prefix}_marts.signal_lookup as ${String(view!.definition).replace(/;\s*$/, "").replace(/\b(core|marts|reference|raw)\./g, `${prefix}_$1.`)} with no data`);
      const q = isolatedSql(tx as unknown as DbSql, prefix);
      await q`insert into core.entities(id,name_display) values(1,'Autoritate'),(2,'Furnizor A'),(3,'Furnizor B')`;
      await q`insert into core.cpv_codes(code,name_ro) values('45000000-7','Lucrări')`;
      // Award notices published 2018 and later, as for every SICAP contract.
      await q`insert into core.awards(id,ca_notice_id,notice_no,authority_entity_id,cpv_code,state_date) values
        (1,100,'CAN-A',1,'45000000-7','2018-02-19'),(2,200,'CAN-B',1,'45000000-7','2024-06-13'),
        (3,300,'CAN-C',1,'45000000-7','2018-01-03')`;
      // Romanian time: 2000-01-20 (typed year; the number says 2020, which is NOT used),
      // 2017-12-31 23:59 (before the archive) and 2018-01-01 00:00 (first archive day).
      await q`insert into core.contracts(id,ca_notice_id,contract_no,contract_date,contract_value,currency,title) values
        (1,100,'nr.1700 / Data 20.01.2020','2000-01-19T22:00:00Z',100,'RON','Contract cu an tastat greșit'),
        (2,200,'nr. 2','2017-12-31T21:59:00Z',100,'RON','Contract înainte de arhivă'),
        (3,300,'nr. 3','2017-12-31T22:00:00Z',100,'RON','Contract din prima zi')`;
      await q`insert into core.contract_winners(contract_id,entity_id) values(1,2),(1,3),(2,2),(2,3),(3,2),(3,3)`;
      await runMarts(q);
      expect((await q`select contract_id::int id, finalization_date d, sum(closing_value)::text v
        from marts.contract_transactions group by 1,2 order by 1`).map(r => [r.id, r.d, r.v]))
        .toEqual([[1, null, "100.00"], [2, null, "100.00"], [3, "2018-01-01", "100.00"]]);
      // The amounts still count; only the year attribution is withheld.
      expect((await q`select role, left(first_activity,10) first_activity, left(last_activity,10) last_activity, total_ron_split::text total
        from marts.entity_profile where entity_id=1`)[0]).toMatchObject({ role: "authority",
        first_activity: "2018-01-01", last_activity: "2018-01-01", total: "300.00" });
      await buildTransactionMarts(q as unknown as Parameters<typeof buildTransactionMarts>[0]);
      expect((await q`select v_plaf::text v from marts.agg_national where src='contracts'`)[0]?.v).toBe("300.00");
      expect((await q`select y, n_plaf::int n from marts.agg_years order by y`).map(r => [r.y, r.n])).toEqual([["2018", 2]]);
      await q`alter table marts.data_coverage add primary key (dataset)`;
      await runCoverage(q);
      const [coverage] = await q`select observation from marts.data_coverage where dataset='contracts'`;
      expect(coverage?.observation).toMatchObject({ available: "3", implausible_date: "2", date_from: "2018-01-01", date_to: "2018-01-01" });
      const [years] = await q`select observation from marts.data_coverage where dataset='years'`;
      expect(years?.observation).toEqual([{ src: "contracts", year: 2018, n: "1" }]);
      // Radiografie: the consortium repeats in three procedures, dated only by the 2018 one.
      for (const threshold of DA_CEILING_SEED_ROWS) {
        await q`insert into core.risk_thresholds (key,valid_from,valid_to,value_num,note)
          values (${threshold.key},${threshold.validFrom + "T00:00:00Z"},${threshold.validTo ? threshold.validTo + "T00:00:00Z" : null},${threshold.valueNum},'fixture')`;
      }
      await runRadiografieMarts(q);
      expect((await q`select kind, reps, y0, y1 from marts.lot_patterns`).map(r => ({ ...r }))).toEqual([{ kind: "consortiu", reps: 3, y0: "2018", y1: "2018" }]);
      expect((await q`select y0, y1 from marts.supplier_dependency where supplier_id=2`).map(r => [r.y0, r.y1])).toEqual([[2018, 2018]]);
      throw rollback;
    })).rejects.toBe(rollback);
  });
  // Regression (audit F12, 21 Oct 2026): SICAP recorded 37 authorities (Transelectrica,
  // CUP Focșani, Județul Vrancea, ...) as the sole winner of 90 of their own contracts,
  // 1.40 mld. lei shown as supplier revenue, top partner and Radiografie dependency.
  it("never counts a contracting authority recorded as its own winner as a supplier", async () => {
    const prefix = `self_winner_fixture_${process.pid}_${Date.now()}`;
    const rollback = Error("rollback self winner fixture");
    await expect(sql.begin(async tx => {
      for (const [schema, names] of Object.entries(tables)) {
        await tx.unsafe(`create schema ${prefix}_${schema}`);
        for (const table of names) await tx.unsafe(`create table ${prefix}_${schema}.${table} as table ${schema}.${table} with no data`);
      }
      const [view] = await tx`select pg_get_viewdef('marts.signal_lookup'::regclass, true) definition`;
      await tx.unsafe(`create materialized view ${prefix}_marts.signal_lookup as ${String(view!.definition).replace(/;\s*$/, "").replace(/\b(core|marts|reference|raw)\./g, `${prefix}_$1.`)} with no data`);
      const q = isolatedSql(tx as unknown as DbSql, prefix);
      await q`insert into core.entities(id,name_display) values(1,'Compania de Utilitati Publice'),(2,'Furnizor'),(3,'Asociat')`;
      await q`insert into core.awards(id,ca_notice_id,notice_no,authority_entity_id,state_date) values(1,100,'CAN-SELF',1,'2024-01-10')`;
      await q`insert into core.contracts(id,ca_notice_contract_id,ca_notice_id,contract_no,contract_date,contract_value,currency,title) values
        (1,103897498,100,'1','2024-02-01T10:00:00Z',1000.25,'RON','Reabilitare rețele de apă'),
        (2,103897499,100,'2','2024-03-01T10:00:00Z',100,'RON','Furnizare'),
        (3,103897500,100,'3','2024-04-01T10:00:00Z',50,'RON','Asociere cu autoritatea')`;
      // 1: the authority is the only winner; 3: the authority is listed beside a real supplier.
      await q`insert into core.contract_winners(contract_id,entity_id) values(1,1),(2,2),(3,1),(3,3)`;
      await runMarts(q);
      expect((await q`select contract_id::int c, supplier_id::int s, closing_value::text v, n_winners n
        from marts.contract_transactions order by 1`).map(r => [r.c, r.s, r.v, r.n]))
        .toEqual([[2, 2, "100.00", 1], [3, 3, "50.00", 1]]);
      expect((await q`select entity_id::int e, role, total_ron_split::text v from marts.entity_profile order by 1, 2`).map(r => [r.e, r.role, r.v]))
        .toEqual([[1, "authority", "150.00"], [2, "supplier", "100.00"], [3, "supplier", "50.00"]]);
      expect(await q`select 1 from marts.entity_top_partners where entity_id = partner_entity_id`).toHaveLength(0);
      expect((await q`select total_ron::text v from marts.national_stats where kind='spend' and year is null`)[0]?.v).toBe("150.00");
      for (const threshold of DA_CEILING_SEED_ROWS) {
        await q`insert into core.risk_thresholds (key,valid_from,valid_to,value_num,note)
          values (${threshold.key},${threshold.validFrom + "T00:00:00Z"},${threshold.validTo ? threshold.validTo + "T00:00:00Z" : null},${threshold.valueNum},'fixture')`;
      }
      await runRadiografieMarts(q);
      expect((await q`select supplier_id::int s, v_here::text v from marts.supplier_dependency where authority_id=1 order by 1`).map(r => [r.s, r.v]))
        .toEqual([[2, "100.00"], [3, "50.00"]]);
      // The population check applies the same supplier rule: nothing missing, nothing extra.
      expect(await validateContractPopulation(q)).toMatchObject({ eligible_missing: "0", excluded_included: "0", allocation_mismatches: "0" });
      expect((await q`select c.id::int id from core.contracts c join core.awards a using(ca_notice_id)
        where ${contractWinnerIsAuthority(q)} order by 1`).map(r => r.id)).toEqual([1]);
      await q`alter table marts.data_coverage add primary key (dataset)`;
      await runCoverage(q);
      const [coverage] = await q`select observation from marts.data_coverage where dataset='contracts'`;
      expect(coverage?.observation).toMatchObject({ included: "2", winner_is_authority: "1", winner_is_authority_value: "1000.25" });
      throw rollback;
    })).rejects.toBe(rollback);
    expect(await sql`select nspname from pg_namespace where nspname like ${`${prefix}_%`}`).toHaveLength(0);
  }, 30_000);
  // Audit F12 leftovers: accepted DAs whose recorded supplier is the authority itself (22 on
  // the 1 October snapshot, 19.205,19 lei, 21 of them CB Palatul Copiilor Suceava 2006463, its
  // own top supplier partner) and award signals that named the authority as their partner.
  // 2006463 also supplied 7 DAs to other authorities (3.186,40 lei): those stay its supplier
  // profile, so the post-deploy check is the profile shrinking, not disappearing.
  it("keeps a DA whose recorded supplier is its own authority in the authority's total only, and never names the authority as a signal partner", async () => {
    const prefix = `self_supplier_fixture_${process.pid}_${Date.now()}`;
    const rollback = Error("rollback self supplier fixture");
    await expect(sql.begin(async tx => {
      await tx`select set_config('TimeZone', 'UTC', true)`;
      for (const [schema, names] of Object.entries(tables)) {
        await tx.unsafe(`create schema ${prefix}_${schema}`);
        for (const table of [...names, ...(schema === "marts" ? ["entity_flags", "flag_instances"] : [])])
          await tx.unsafe(`create table ${prefix}_${schema}.${table} as table ${schema}.${table} with no data`);
      }
      const [view] = await tx`select pg_get_viewdef('marts.signal_lookup'::regclass, true) definition`;
      await tx.unsafe(`create materialized view ${prefix}_marts.signal_lookup as ${String(view!.definition).replace(/;\s*$/, "").replace(/\b(core|marts|reference|raw)\./g, `${prefix}_$1.`)} with no data`);
      const q = isolatedSql(tx as unknown as DbSql, prefix);
      for (const threshold of DA_CEILING_SEED_ROWS) {
        await q`insert into core.risk_thresholds (key,valid_from,valid_to,value_num,note)
          values (${threshold.key},${threshold.validFrom + "T00:00:00Z"},${threshold.validTo ? threshold.validTo + "T00:00:00Z" : null},${threshold.valueNum},'fixture')`;
      }
      await q`insert into core.entities(id,name_display) values(1,'CB Palatul Copiilor'),(2,'Furnizor'),(3,'Autoritate')`;
      // DAs 1 and 2: the authority recorded as its own supplier (DA 1 finalised in 20 minutes); DA 3: a real supplier.
      // DA 4: entity 1 as the supplier of another authority, which stays supplier revenue.
      await q`insert into core.direct_acquisitions(id,sicap_da_id,authority_entity_id,supplier_entity_id,state,closing_value,publication_date,finalization_date) values
        (1,100060303,1,1,'Oferta acceptata',60000,'2024-03-01T08:00:00Z','2024-03-01T08:20:00Z'),
        (2,100060304,1,1,'Oferta acceptata',10000.5,'2024-04-01T08:00:00Z','2024-04-03T08:00:00Z'),
        (3,100060305,1,2,'Oferta acceptata',5000,'2024-05-01T08:00:00Z','2024-05-03T08:00:00Z'),
        (4,100060306,3,1,'Oferta acceptata',3167.5,'2024-06-03T08:00:00Z','2024-06-05T08:00:00Z')`;
      // Notice 100: authority 3 recorded as the only winner of its own contract.
      await q`insert into core.awards(id,ca_notice_id,notice_no,authority_entity_id,state_date) values(1,100,'CAN-SELF',3,'2024-01-10')`;
      await q`insert into core.contracts(id,ca_notice_contract_id,ca_notice_id,contract_no,contract_date,contract_value,currency,title) values
        (1,104111111,100,'1','2024-02-01T10:00:00Z',2000,'RON','Servicii')`;
      await q`insert into core.contract_winners(contract_id,entity_id) values(1,3)`;
      await runMarts(q);
      expect((await q`select entity_id::int e, role, total_ron_split::text v, n_das n from marts.entity_profile order by 1, 2`).map(r => [r.e, r.role, r.v, r.n]))
        .toEqual([[1, "authority", "75000.5", 3], [1, "supplier", "3167.5", 1], [2, "supplier", "5000", 1], [3, "authority", "3167.5", 1]]);
      expect((await q`select entity_id::int e, role, partner_entity_id::int p from marts.entity_top_partners order by 1, 2, 3`).map(r => [r.e, r.role, r.p]))
        .toEqual([[1, "authority", 2], [1, "supplier", 3], [2, "supplier", 1], [3, "authority", 1]]);
      expect((await q`select total_ron::text v from marts.national_stats where kind='spend' and year is null`)[0]?.v).toBe("78168.0");
      await runFlags(q);
      // 70.000,5 lei from a single authority would have made the authority "dependent" on itself.
      expect(await q`select 1 from core.flags where flag_code in ('da_dependence','da_concentration','da_split') or subject_id = 1 and subject_type = 'supplier'`).toHaveLength(0);
      expect(await q`select 1 from core.flags where flag_code='da_rapid' and subject_id=1`).toHaveLength(1);
      await q`insert into core.flags(id,subject_type,subject_id,flag_code,period,triggered,severity,evidence,methodology_version)
        values(9001,'award',1,'award_no_competition','2024',true,0.9,'{"value":2000}','fixture')`;
      await runFlagMarts(q);
      expect((await q`select entity_id::int e, role, n_das n from marts.entity_flags order by 1, 2`).map(r => [r.e, r.role, r.n]))
        .toEqual([[1, "authority", 3], [1, "supplier", 1], [2, "supplier", 1], [3, "authority", 1]]);
      expect((await q`select flag_code, entity_id::int e, partner_id, partner_name from marts.flag_instances order by flag_code`).map(r => [r.flag_code, r.e, r.partner_id, r.partner_name]))
        .toEqual([["award_no_competition", 3, null, null], ["da_rapid", 1, null, null]]);
      expect((await q`select entity_id::int e, partner_id from marts.signal_lookup where flag_code='da_rapid'`)).toEqual([{ e: 1, partner_id: null }]);
      // The source row keeps the recorded name; it just has no supplier entity.
      expect((await q`select sicap_da_id::text id, supplier_id, supplier_name from marts.da_transactions order by 1`).map(r => [r.id, r.supplier_id, r.supplier_name]))
        .toEqual([["100060303", null, "CB Palatul Copiilor"], ["100060304", null, "CB Palatul Copiilor"], ["100060305", "2", "Furnizor"], ["100060306", "1", "CB Palatul Copiilor"]]);
      // The publication gate reconciles role totals and every profile with the same supplier rule.
      const checks = Object.fromEntries((await validateBatch1Snapshot(q, { fullProfiles: true, allAnnual: true })).map(c => [c.check, c.passed]));
      expect(checks).toMatchObject({ canonical_national_and_role_totals: true, entity_profile_reconciliation: true, contract_population_and_allocations: true });
      await q`alter table marts.data_coverage add primary key (dataset)`;
      await runCoverage(q);
      const [coverage] = await q`select observation from marts.data_coverage where dataset='da'`;
      expect(coverage?.observation).toMatchObject({ included: "4", supplier_is_authority: "2", supplier_is_authority_value: "70000.5" });
      throw rollback;
    })).rejects.toBe(rollback);
    expect(await sql`select nspname from pg_namespace where nspname like ${`${prefix}_%`}`).toHaveLength(0);
  }, 30_000);
  // Regression (audit F08, 21 Oct 2026): contracts without an archived SEAP type are
  // typed by their title, which misses about a third of known frameworks; the
  // inventory did not say how many contracts or how much value rested on that rule.
  it("counts and sums contracts typed by the title rule, in all and inside the totals", async () => {
    const prefix = `title_rule_fixture_${process.pid}_${Date.now()}`;
    const rollback = Error("rollback title rule fixture");
    await expect(sql.begin(async tx => {
      for (const [schema, names] of Object.entries(tables)) {
        await tx.unsafe(`create schema ${prefix}_${schema}`);
        for (const table of names) await tx.unsafe(`create table ${prefix}_${schema}.${table} as table ${schema}.${table} with no data`);
      }
      const [view] = await tx`select pg_get_viewdef('marts.signal_lookup'::regclass, true) definition`;
      await tx.unsafe(`create materialized view ${prefix}_marts.signal_lookup as ${String(view!.definition).replace(/;\s*$/, "").replace(/\b(core|marts|reference|raw)\./g, `${prefix}_$1.`)} with no data`);
      const q = isolatedSql(tx as unknown as DbSql, prefix);
      await q`insert into core.entities(id,name_display) values(1,'Autoritate'),(2,'Furnizor')`;
      await q`insert into core.awards(id,ca_notice_id,notice_no,authority_entity_id,state_date) values(1,100,'CAN-TITLE',1,'2024-01-10')`;
      await q`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_no,contract_date,contract_value,currency,title,source_contract_type,contract_type_raw_id) values
        (1,11,108115496,100,'1','2024-02-01T10:00:00Z',1000.25,'RON','Furnizare motorină',null,11),
        (2,12,108115497,100,'2','2024-02-01T10:00:00Z',5000,'RON','Acord-cadru lucrări',null,null),
        (3,13,108115498,100,'3','2024-02-01T10:00:00Z',300,'RON','Contract subsecvent nr. 3',null,null),
        (4,14,108115499,100,'4','2024-02-01T10:00:00Z',200,'RON','Lucrări de întreținere',1,14),
        (5,15,108115500,100,'5','2024-02-01T10:00:00Z',70,'RON','Act adițional nr. 1',null,null),
        (6,16,108115501,100,'6','2024-02-01T10:00:00Z',90,'RON','Servicii de pază',null,99),
        (7,17,108115502,100,'7',null,40,'RON','Servicii fără dată',null,null),
        (8,18,108115503,100,'8','2024-02-01T10:00:00Z',2000,'EUR','Furnizare echipamente',null,null),
        (9,19,108115504,100,'9','2024-02-01T10:00:00Z',null,'RON','Servicii fără sumă',null,null)`;
      await q`insert into core.contract_winners(contract_id,entity_id) select id,2 from core.contracts`;
      await runMarts(q);
      // Title rule: 1 (contract), 2 (framework), 3 (call-off), 7 (contract, undated), 8 (EUR) and
      // 9 (no amount). Not 4 (source type), 5 (addendum) or 6 (type from another archive, under
      // review). In totals: 1 and 3. 8 and 9 have no verifiable sum in lei: counted apart, the
      // lei value covers only 1, 2, 3 and 7 (review of 7ced992: EUR rows were in the count only).
      expect((await q`select contract_id::int c from marts.contract_transactions order by 1`).map(r => r.c)).toEqual([1, 3, 4]);
      expect((await q`select c.id::int id from core.contracts c where ${contractKindFromTitle(q)} order by 1`).map(r => r.id)).toEqual([1, 2, 3, 7, 8, 9]);
      await q`alter table marts.data_coverage add primary key (dataset)`;
      await runCoverage(q);
      const [coverage] = await q`select observation from marts.data_coverage where dataset='contracts'`;
      expect(coverage?.observation).toMatchObject({ title_classified: "6", title_classified_valued: "4",
        title_classified_value: "6340.25", title_classified_without_ron_value: "2",
        title_classified_included: "2", title_classified_included_value: "1300.25" });
      throw rollback;
    })).rejects.toBe(rollback);
    expect(await sql`select nspname from pg_namespace where nspname like ${`${prefix}_%`}`).toHaveLength(0);
  }, 30_000);
  it("keeps every winner in a sub-cent consortium allocation and preserves the exact source total", async () => {
    const prefix = `marts_tiny_fixture_${process.pid}_${Date.now()}`;
    const rollback = new Error("ROLL BACK TINY CONSORTIUM FIXTURE");
    try {
      await sql.begin(async (tx) => {
        for (const [schema, names] of Object.entries(tables)) {
          await tx.unsafe(`create schema ${prefix}_${schema}`);
          for (const table of names) {
            await tx.unsafe(`create table ${prefix}_${schema}.${table} as table ${schema}.${table} with no data`);
          }
        }
        const [view] = await tx`select pg_get_viewdef('marts.signal_lookup'::regclass, true) definition`;
        await tx.unsafe(`create materialized view ${prefix}_marts.signal_lookup as ${String(view!.definition).replace(/;\s*$/, "").replace(/\b(core|marts|reference|raw)\./g, `${prefix}_$1.`)} with no data`);
        const q = isolatedSql(tx as unknown as DbSql, prefix);
        await q`insert into core.entities (id,name_display) values (1,'Authority'),(10,'A'),(11,'B'),(12,'C')`;
        await q`insert into core.awards (id,ca_notice_id,authority_entity_id) values (1,1000,1)`;
        await q`insert into core.contracts (id,ca_notice_id,contract_value,contract_date,currency,title)
          values (100,1000,0.01,'2025-01-01','RON','Contract')`;
        await q`insert into core.contract_winners (contract_id,entity_id) values (100,10),(100,11),(100,12)`;
        await runMarts(q);
        const allocations = await q`select supplier_id::text supplier,closing_value::text value
          from marts.contract_transactions where contract_id=100 order by supplier_id`;
        expect(allocations.map((r) => r["supplier"])).toEqual(["10","11","12"]);
        expect(allocations.map((r) => r["value"])).toEqual(["0.0033","0.0033","0.0034"]);
        const [source] = await q`select count(*)::int n,sum(closing_value)=0.01 exact_total
          from marts.contract_transactions where closing_value>0`;
        expect(source).toMatchObject({ n: 3, exact_total: true });
        const [national] = await q`select total_ron=0.01 exact_total from marts.national_stats where kind='spend' and year is null`;
        expect(national?.["exact_total"]).toBe(true);
        const [profiles] = await q`select count(*)::int n,sum(total_ron_split)=0.01 exact_total
          from marts.entity_profile where role='supplier' and total_ron_split>0`;
        expect(profiles).toMatchObject({ n: 3, exact_total: true });
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    expect(await sql`select nspname from pg_namespace where nspname like ${`${prefix}_%`}`).toHaveLength(0);
  }, 30_000);

  it("reconciles profiles, national totals and source allocations without counting notices twice", async () => {
    const prefix = `marts_fixture_${process.pid}_${Date.now()}`;
    const rollback = new Error("ROLL BACK ISOLATED MARTS FIXTURE");
    try {
      await sql.begin(async (tx) => {
        for (const [schema, names] of Object.entries(tables)) {
          await tx.unsafe(`create schema ${prefix}_${schema}`);
          for (const table of names) {
            await tx.unsafe(`create table ${prefix}_${schema}.${table} as table ${schema}.${table} with no data`);
          }
        }
        const [view] = await tx`select pg_get_viewdef('marts.signal_lookup'::regclass, true) definition`;
        await tx.unsafe(`create materialized view ${prefix}_marts.signal_lookup as ${String(view!.definition).replace(/;\s*$/, "").replace(/\b(core|marts|reference|raw)\./g, `${prefix}_$1.`)} with no data`);
        const q = isolatedSql(tx as unknown as DbSql, prefix);
        await q`insert into core.entities (id, name_display, county) values
          (1,'Authority one','Cluj'), (2,'Authority two',null),
          (10,'Winner A','Cluj'), (11,'Winner B','Cluj'), (12,'Winner C','Cluj')`;
        await q`insert into core.cpv_codes (code, name_ro) values ('45000000-7','Works'), ('03000000-1','Goods')`;
        await q`insert into core.awards (id, ca_notice_id, notice_no, authority_entity_id, cpv_code, acquisition_type, ron_contract_value, state_date)
          values (1,1000,'Notice with two contracts',1,'45000000-7','Lucrari',900000,'2025-01-01'),
            (2,2000,'Framework and call-off',1,'45000000-7','Lucrari',800000,'2025-01-01'),
            (3,3000,'Standalone framework',1,'45000000-7','Lucrari',700000,'2025-01-01'),
            (4,4000,'Exclusions',1,'45000000-7','Lucrari',600000,'2025-01-01')`;
        await q`insert into core.contracts (id, ca_notice_id, contract_no, contract_value, contract_date, currency, title)
          values (100,1000,'Three winners',100.00,'2025-01-02','RON','Contract'),
            (101,1000,'Separate contract',50.00,'2025-01-03','RON','Contract'),
            (200,2000,'Framework ceiling',500.00,'2025-02-01','RON','Acord-cadru'),
            (201,2000,'Actual call-off',60.00,'2025-02-02','RON','Contract subsecvent'),
            (202,2000,'Unnamed contract',25.00,'2025-02-03','RON',null),
            (300,3000,'Standalone framework',70.00,'2025-03-01','RON','Acord cadru'),
            (400,4000,'Zero',0,'2025-04-01','RON','Contract'),
            (401,4000,'Negative',-50,'2025-04-01','RON','Contract'),
            (402,4000,'Missing value',null,'2025-04-01','RON','Contract'),
            (403,4000,'Above bound',1000000001,'2025-04-01','RON','Contract'),
            (404,4000,'Foreign currency',100,'2025-04-01','EUR','Contract'),
            (405,4000,'Unknown date',100,null,'RON','Contract')`;
        // A verified 10 EUR at 5 RON/EUR must contribute 50 RON, once.
        await q`update core.contracts set lots_caption='Lot 1' where id in (200,201,202)`;
        await q`update core.contracts set currency='EUR',original_value=10,original_currency='EUR',
          value_ron=50,currency_rate=5,amount_status='converted',raw_id=7,amount_raw_id=7 where id=101`;
        // Even a legacy field saying RON cannot override an unresolved source.
        await q`insert into core.contracts(id,ca_notice_id,contract_value,contract_date,currency,title,amount_status,raw_id,amount_raw_id)
          values(406,4000,777,'2025-04-01','RON','Inconsistent source','inconsistent',7,7)`;
        // Duplicate source winner does not create an additional allocation.
        await q`insert into core.contract_winners (contract_id, entity_id)
          select id, 10 from core.contracts
          union all select 100,11 union all select 100,12 union all select 100,10`;
        await q`insert into core.direct_acquisitions (id, authority_entity_id, supplier_entity_id, state, closing_value, finalization_date, acquisition_type, cpv_code)
          values (1,1,10,'Oferta acceptata',20,'2025-01-01','Furnizare','03000000-1'),
            (2,1,10,'Oferta refuzata',10000,'2025-01-01','Furnizare','03000000-1'),
            (3,1,10,'Oferta acceptata',0,'2025-01-01','Furnizare','03000000-1'),
            (4,1,10,'Oferta acceptata',-10,'2025-01-01','Furnizare','03000000-1'),
            (5,1,10,'Oferta acceptata',null,'2025-01-01','Furnizare','03000000-1'),
            (6,1,10,'Oferta acceptata',2000001,'2025-01-01','Furnizare','03000000-1'),
            (7,1,null,'Oferta acceptata',30,'2025-01-01','Furnizare','03000000-1'),
            (8,null,10,'Oferta acceptata',40,'2025-01-01','Furnizare','03000000-1'),
            (9,null,null,'Oferta acceptata',50,'2025-01-01','Furnizare','03000000-1'),
            (10,2,10,'Oferta acceptata',10,'2025-01-01','Furnizare','03000000-1')`;

        await runMarts(q);
        const contracts = await q`select contract_id::text id, supplier_id::text supplier, closing_value::text value
          from marts.contract_transactions order by contract_id, supplier_id`;
        expect(contracts.filter((r) => r["id"] === "100").map((r) => r["value"])).toEqual(["33.33", "33.33", "33.34"]);
        expect([...new Set(contracts.map((r) => r["id"]))]).toEqual(["100", "101", "201", "202"]);
        expect(contracts.filter(r => r["id"] === "101").map(r => Number(r["value"]))).toEqual([50]);
        const [contractTotal] = await q`select sum(closing_value)::text value from marts.contract_transactions`;
        expect(Number(contractTotal?.["value"])).toBe(235);
        const [national] = await q`select total_ron::text value from marts.national_stats where kind='spend' and year is null`;
        expect(Number(national?.["value"])).toBe(385); //235 contracts +150 eligible DAs, including unknown parties.
        const [da] = await q`select n, total_ron::text value from marts.national_stats where kind='da' and year is null`;
        expect(da?.["n"]).toBe(5); expect(Number(da?.["value"])).toBe(150);
        const profiles = await q`select entity_id::text id, role, n_das, n_contracts, total_ron_split::text value
          from marts.entity_profile order by role, entity_id`;
        expect(profiles.find((r) => r["id"] === "1" && r["role"] === "authority")).toMatchObject({ n_das: 2, n_contracts: 4 });
        expect(Number(profiles.find((r) => r["id"] === "1" && r["role"] === "authority")?.["value"])).toBe(285);
        expect(Number(profiles.find((r) => r["id"] === "10" && r["role"] === "supplier")?.["value"])).toBe(238.33);
        const totals = await q`select 'type' kind, sum(total_ron)::text value from marts.spend_by_type where kind='all'
          union all select 'cpv',sum(total_ron)::text from marts.spend_by_cpv where kind='all'
          union all select role,sum(total_ron)::text from marts.spend_by_county group by role`;
        const byKind = Object.fromEntries(totals.map((r) => [String(r["kind"]),Number(r["value"])]));
        expect(byKind).toEqual({ type: 385, cpv: 385, authority: 295, supplier: 305 });
        // Missing entity IDs stay in national/source totals, not in an invented entity profile.
        expect(profiles.some((r) => r["id"] === "0" || r["id"] == null)).toBe(false);
        const [unknownCounty] = await q`select total_ron::text value from marts.spend_by_county where role='authority' and county='Necunoscut'`;
        expect(Number(unknownCounty?.["value"])).toBe(10);

        // Concentration uses known counterparties and the same allocations;
        // a second authority must not contribute to the first authority's HHI.
        const concentration = await q`select authority_entity_id::text id, distinct_suppliers,
          top_supplier_pct::text top, hhi::text hhi, total_ron::text total
          from marts.authority_concentration order by authority_entity_id`;
        expect(concentration.map(r => ({ id: r["id"], suppliers: r["distinct_suppliers"],
          top: Number(r["top"]), hhi: Number(r["hhi"]), total: Number(r["total"]) }))).toEqual([
          { id: "1", suppliers: 3, top: 0.7385, hhi: 0.5796, total: 255 },
          { id: "2", suppliers: 1, top: 1, hhi: 1, total: 10 },
        ]);

        // Preflight must preserve existing flags if canonical legal eras are absent.
        await q`insert into core.flags (id, flag_code, evidence) values (9000,'fixture_previous','{"intact":true}'::jsonb)`;
        await expect(runFlags(q)).rejects.toThrow("ceiling eras are missing or outdated");
        const [previous] = await q`select count(*)::int n from core.flags where id=9000`;
        expect(previous?.["n"]).toBe(1);
        for (const threshold of DA_CEILING_SEED_ROWS) {
          await q`insert into core.risk_thresholds (key,valid_from,valid_to,value_num,note)
            values (${threshold.key},${threshold.validFrom + "T00:00:00Z"},${threshold.validTo ? threshold.validTo + "T00:00:00Z" : null},${threshold.valueNum},'fixture')`;
        }
        const lowThresholds = {
          da_conc_min_total: 1, da_conc_min_suppliers: 1, da_conc_top_pct: 0.1,
          da_dep_min_total: 1, da_dep_top_pct: 0.1, da_year_end_min_total: 1, da_year_end_share: 0,
          award_conc_min_total: 1, award_conc_min_suppliers: 3, award_conc_top_pct: 0.1,
          award_dep_min_total: 1, award_dep_min_auth: 1, award_dep_top_pct: 0.1,
          fin_tiny_min_value: 1, fin_reliance_min_public: 1, fin_reliance_min_turnover: 1,
          fin_reliance_min_ratio: 0.1, net_admin_min_total: 1,
        };
        for (const [key,value] of Object.entries(lowThresholds)) {
          await q`insert into core.risk_thresholds (key,valid_from,value_num) values (${key},'2020-01-01',${value})`;
        }
        await q`update core.entities set cui_canonical=id::text, cui_valid=true where id in (10,11,12)`;
        await q`insert into reference.company_financials (cui,year,employees,net_turnover)
          values ('10',2025,1,1000),('11',2025,1,1000),('12',2025,1,1000)`;
        await q`insert into reference.company_reps (cui,person_key,person_name,calitate,birth_date)
          values ('10','fixture-person','Shared representative','administrator','1980-01-01'),
            ('11','fixture-person','Shared representative',null,'1980-01-01')`;
        // Audit F31: a supervisory-board seat is not legal representation, so a
        // board member shared by firms 10 and 12 must not link them. Neither do
        // insolvency or liquidation roles (rf-2026.16): administrator special
        // at 12 (administrator at 10), lichidator at 11 and 12, administrator
        // judiciar provizoriu at 10 and administrator concordatar at 11. An
        // administrator provizoriu (interim board seat, OUG 109/2011) still links.
        await q`insert into reference.company_reps (cui,person_key,person_name,calitate,birth_date)
          values ('10','fixture-board','Shared board member','membru în consiliul de supraveghere','1976-01-01'),
            ('12','fixture-board','Shared board member','membru în consiliul de supraveghere','1976-01-01'),
            ('10','fixture-person','Shared representative','administrator special','1980-01-01'),
            ('10','fixture-special','Insolvency administrator','administrator','1970-01-01'),
            ('12','fixture-special','Insolvency administrator','administrator special','1970-01-01'),
            ('11','fixture-liquidator','Liquidator','lichidator judiciar','1965-01-01'),
            ('12','fixture-liquidator','Liquidator','lichidator','1965-01-01'),
            ('10','fixture-judicial','Judicial administrator','administrator judiciar provizoriu','1968-01-01'),
            ('11','fixture-judicial','Judicial administrator','ADMINISTRATOR CONCORDATAR','1968-01-01'),
            ('11','fixture-interim','Interim board member','administrator provizoriu','1972-01-01'),
            ('12','fixture-interim','Interim board member','administrator provizoriu','1972-01-01')`;
        // Audit F37: namesakes under an ONRC placeholder or implausible birth
        // date share a person_key, which identifies nobody: no link 11–12.
        await q`insert into reference.company_reps (cui,person_key,person_name,calitate,birth_date)
          values ('11','fixture-placeholder','Placeholder namesake','lichidator judiciar','1910-01-01'),
            ('12','fixture-placeholder','Placeholder namesake','lichidator judiciar','1910-01-01'),
            ('11','fixture-placeholder-2','Second namesake','administrator','1910-10-10'),
            ('12','fixture-placeholder-2','Second namesake','administrator','1910-10-10'),
            ('11','fixture-implausible','Implausible namesake','administrator','1900-01-01'),
            ('12','fixture-implausible','Implausible namesake','administrator','1900-01-01')`;
        await q`update core.direct_acquisitions set publication_date=finalization_date-interval '30 minutes'`;
        // Refused records outside every rule; the archive now spans all of 2025,
        // which da_year_end requires before it evaluates that year.
        await q`insert into core.direct_acquisitions (id, authority_entity_id, supplier_entity_id, state, closing_value, finalization_date)
          values (11,1,10,'Oferta refuzata',1,'2024-12-30'),(12,1,10,'Oferta refuzata',1,'2026-01-02')`;
        // The financial comparison must use each contract's year, not its notice publication year.
        await q`update core.awards set state_date='2024-01-01'`;
        const report = await runFlags(q);
        expect(report["da_rapid"]).toBe(5); // excludes refused/null/zero/negative/outlier records.
        const flags = await q`select flag_code,subject_id::text subject,evidence from core.flags`;
        const evidence = (code: string, subject: string) => flags.find((r) => r["flag_code"]===code && r["subject"]===subject)?.["evidence"] as Record<string,number>;
        expect(evidence("da_concentration","1")["total"]).toBe(20);
        expect(evidence("da_dependence","10")["total"]).toBe(30);
        expect(evidence("da_year_end","1")["total"]).toBe(50);
        expect(evidence("award_concentration","1")["total"]).toBe(235);
        expect(evidence("award_concentration","1")["top_winner_pct"]).toBe(0.7163);
        expect(evidence("award_dependence","10")["total"]).toBe(168.33);
        expect(evidence("fin_tiny_staff","10")).toMatchObject({ total: 238.33, year: 2025 });
        expect(evidence("fin_public_reliance","10")).toMatchObject({ public_total: 238.33, revenue_total: 1000, ratio: 0.2383 });
        expect(evidence("net_shared_admin","10")).toMatchObject({ combined: 221.66, n_firms: 2 });
        expect(flags.filter(r => r["flag_code"] === "net_shared_admin")
          .map(r => [r["subject"], (r["evidence"] as Record<string, unknown>)["person"]]).sort())
          .toEqual([["10", "Shared representative"], ["11", "Interim board member"], ["11", "Shared representative"],
            ["12", "Interim board member"]]);
        // The evidence records every ONRC role the person holds at each firm.
        const personEvidence = (subject: string, person: string) => flags.find(r => r["flag_code"] === "net_shared_admin"
          && r["subject"] === subject && (r["evidence"] as Record<string, unknown>)["person"] === person)?.["evidence"];
        expect(personEvidence("10", "Shared representative")).toMatchObject({ roles: ["administrator", "administrator special"] });
        expect(personEvidence("11", "Shared representative")).toMatchObject({ roles: [] });
        expect(personEvidence("12", "Interim board member")).toMatchObject({ roles: ["administrator provizoriu"] });

        // A deliberately failing late rule proves TRUNCATE + earlier inserts roll back together.
        const [beforeFailure] = await q`select jsonb_agg(to_jsonb(f) order by flag_code,subject_id,partner_id) data from core.flags f`;
        await q`alter table core.flags add constraint fixture_reject_late_rule check (flag_code <> 'net_shared_admin') not valid`;
        await expect(runFlags(q)).rejects.toThrow("fixture_reject_late_rule");
        const [afterFailure] = await q`select jsonb_agg(to_jsonb(f) order by flag_code,subject_id,partner_id) data from core.flags f`;
        expect(afterFailure?.["data"]).toEqual(beforeFailure?.["data"]);

        // A structural-lens failure restores the table that DROP/CREATE replaced.
        await q`create table core.notice_meta (notice_no text primary key, assignment_type text, has_subsequent boolean, updated_at timestamptz)`;
        await q`insert into core.notice_meta (notice_no, assignment_type)
          values ('Framework and call-off','Acord-cadru'), ('Standalone framework','Acord-cadru')`;
        await q`insert into reference.company_financials (cui,year,employees,net_turnover) values ('10',2026,1,1000)`;
        await q`create table marts.supplier_dependency (fixture_marker text)`;
        await q`insert into marts.supplier_dependency values ('previous complete lens')`;
        const interrupted = new Error("Stop after rebuilding the slicing lens");
        await expect(runRadiografieMarts(q, { log: (message) => {
          if (message.startsWith("da_slicing:")) throw interrupted;
        } })).rejects.toBe(interrupted);
        const [lens] = await q`select fixture_marker from marts.supplier_dependency`;
        expect(lens?.["fixture_marker"]).toBe("previous complete lens");
        const radiografie = await runRadiografieMarts(q);
        expect(radiografie).toMatchObject({ supplierDependency: 3, daSlicing: 0, lotPatterns: 0, patternElsewhere: 0 });
        const [dependency] = await q`select c_frame::text frame, c_plain::text plain from marts.supplier_dependency
          where authority_id=1 and supplier_id=10`;
        // Contract roles come from the contract itself, not the whole notice:
        // an unnamed contract is not automatically a framework ceiling.
        expect(Number(dependency?.["frame"])).toBe(0);
        expect(Number(dependency?.["plain"])).toBe(168.33);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    const schemas = await sql`select nspname from pg_namespace where nspname like ${`${prefix}_%`}`;
    expect(schemas).toHaveLength(0);
  }, 30_000);

  // Audit F20: the DA archive starts on 2 April 2018. A year without January–March
  // (or without December) must not be read as a whole year's December share.
  it("evaluates December concentration only in years the DA archive covers from January to December", async () => {
    const prefix = `year_end_fixture_${process.pid}_${Date.now()}`;
    const rollback = Error("rollback year-end fixture");
    await expect(sql.begin(async tx => {
      await tx`select set_config('TimeZone', 'UTC', true)`;
      for (const [schema, names] of Object.entries(tables)) {
        await tx.unsafe(`create schema ${prefix}_${schema}`);
        for (const table of names) await tx.unsafe(`create table ${prefix}_${schema}.${table} as table ${schema}.${table} with no data`);
      }
      const q = isolatedSql(tx as unknown as DbSql, prefix);
      for (const threshold of DA_CEILING_SEED_ROWS) {
        await q`insert into core.risk_thresholds (key,valid_from,valid_to,value_num,note)
          values (${threshold.key},${threshold.validFrom + "T00:00:00Z"},${threshold.validTo ? threshold.validTo + "T00:00:00Z" : null},${threshold.valueNum},'fixture')`;
      }
      await q`insert into core.entities(id,name_display) values(1,'Autoritate'),(2,'Furnizor')`;
      // Each year: 50% of a 120,000 lei total in December. Instants are UTC;
      // the archive opens 2018-04-02 00:30 and closes 2020-12-30 in Romanian time.
      await q`insert into core.direct_acquisitions(id,authority_entity_id,supplier_entity_id,state,closing_value,finalization_date) values
        (1,1,2,'Oferta acceptata',60000,'2018-04-01T21:30:00Z'),(2,1,2,'Oferta acceptata',60000,'2018-12-10T10:00:00Z'),
        (3,1,2,'Oferta acceptata',60000,'2019-02-10T10:00:00Z'),(4,1,2,'Oferta acceptata',60000,'2019-12-10T10:00:00Z'),
        (5,1,2,'Oferta acceptata',60000,'2020-02-10T10:00:00Z'),(6,1,2,'Oferta acceptata',60000,'2020-12-30T10:00:00Z')`;
      const years = async () => (await q`select period from core.flags where flag_code='da_year_end' order by period`).map(r => r["period"]);
      await runFlags(q);
      // 2018 lacks January–March; 2020 is not over yet in the archive.
      expect(await years()).toEqual(["2019"]);
      // 2020-12-31 22:30 UTC is already 1 January 2021 in Romania: 2020 is complete.
      await q`insert into core.direct_acquisitions(id,authority_entity_id,supplier_entity_id,state,closing_value,finalization_date)
        values (7,1,2,'Oferta refuzata',1,'2020-12-31T22:30:00Z')`;
      await runFlags(q);
      expect(await years()).toEqual(["2019", "2020"]);
      const [evidence] = await q`select evidence from core.flags where flag_code='da_year_end' and period='2020'`;
      expect(evidence?.["evidence"]).toMatchObject({ year: 2020, total: 120000, december: 60000, december_pct: 0.5 });
      throw rollback;
    })).rejects.toBe(rollback);
  }, 30_000);
});

// Audit F03 (option C stopgap): a foreign number that passes the CUI checksum
// keeps its identity, but never another firm's ONRC representatives, MF
// balance sheet or the signals built on them. Company names are public firms;
// the ONRC names and the person are fictitious.
describe("ONRC and MF joins only through a corroborated CUI", () => {
  it("drops a foreign checksum collision and keeps Romanian firms, including one with a stray foreign country", async () => {
    const prefix = `registry_fixture_${process.pid}_${Date.now()}`;
    const rollback = Error("rollback registry fixture");
    await expect(sql.begin(async tx => {
      for (const [schema, names] of Object.entries(tables)) {
        await tx.unsafe(`create schema ${prefix}_${schema}`);
        for (const table of names) await tx.unsafe(`create table ${prefix}_${schema}.${table} as table ${schema}.${table} with no data`);
      }
      const [view] = await tx`select pg_get_viewdef('marts.signal_lookup'::regclass, true) definition`;
      await tx.unsafe(`create materialized view ${prefix}_marts.signal_lookup as ${String(view!.definition).replace(/;\s*$/, "").replace(/\b(core|marts|reference|raw)\./g, `${prefix}_$1.`)} with no data`);
      const q = isolatedSql(tx as unknown as DbSql, prefix);
      for (const threshold of DA_CEILING_SEED_ROWS) {
        await q`insert into core.risk_thresholds (key,valid_from,valid_to,value_num,note)
          values (${threshold.key},${threshold.validFrom + "T00:00:00Z"},${threshold.validTo ? threshold.validTo + "T00:00:00Z" : null},${threshold.valueNum},'fixture')`;
      }
      for (const [key, value] of Object.entries({ fin_tiny_min_value: 1, fin_reliance_min_public: 1,
        fin_reliance_min_turnover: 1, fin_reliance_min_ratio: 0.1, net_admin_min_total: 1 })) {
        await q`insert into core.risk_thresholds (key,valid_from,value_num) values (${key},'2020-01-01',${value})`;
      }
      // 10: Italian firm whose partita IVA passes the CUI checksum; ONRC holds an
      // unrelated SNC under that number. 11: Romanian company with a stray "DE".
      // 12: ordinary Romanian supplier without a country.
      await q`insert into core.entities (id,name_display,name_normalized,cui_canonical,cui_valid,country_code) values
        (1,'Autoritate','autoritate',null,false,null),
        (10,'FRESIA S.P.A.','fresia s p a','1152147',true,'IT'),
        (11,'COMPANIA NATIONALA DE TRANSPORT AL ENERGIEI ELECTRICE "TRANSELECTRICA" S.A.','transelectrica','13328043',true,'DE'),
        (12,'Furnizor Exemplu S.R.L.','furnizor exemplu','12',true,null)`;
      await q`insert into reference.onrc_firm (j_number,cui,name,snapshot_date) values
        ('J1','1152147','EXEMPLU UNELTE SNC','2026-09-01'),
        ('J2','13328043','COMPANIA NATIONALA DE TRANSPORT AL ENERGIEI ELECTRICE "TRANSELECTRICA" SA','2026-09-01'),
        ('J3','12','FURNIZOR EXEMPLU SRL','2026-09-01')`;
      await q`insert into reference.company_financials (cui,year,category,source_vintage,employees,net_turnover)
        select cui, year, 'fixture', year, 1, 1000 from unnest(array['1152147','13328043','12']) cui, unnest(array[2024,2025]) year`;
      await q`insert into reference.company_reps (j_number,cui,person_key,person_name,calitate,birth_date,snapshot_date)
        select 'J'||cui,cui,'fixture-person','Persoana Fictiva','administrator','1970-01-01','2026-09-01'
        from unnest(array['1152147','13328043','12']) cui`;
      await q`insert into core.direct_acquisitions (id,authority_entity_id,supplier_entity_id,state,closing_value,finalization_date) values
        (1,1,10,'Oferta acceptata',500,'2025-03-01'),(2,1,11,'Oferta acceptata',500,'2025-03-01'),(3,1,12,'Oferta acceptata',500,'2025-03-01')`;
      await q`insert into core.cpv_codes (code,name_ro) values ('45000000-7','Works')`;
      await q`insert into core.awards (id,ca_notice_id,notice_no,authority_entity_id,cpv_code,acquisition_type,ron_contract_value,state_date)
        values (1,1000,'CAN1',1,'45000000-7','Lucrari',600,'2024-05-01')`;
      await q`insert into core.contracts (id,ca_notice_id,contract_no,contract_value,contract_date,currency,title)
        values (100,1000,'1',300,'2024-06-01','RON','Contract'),(101,1000,'2',300,'2024-06-01','RON','Contract')`;
      await q`insert into core.contract_winners (contract_id,entity_id) values (100,10),(101,11)`;
      const corroborated = async () => Object.fromEntries((await q`select e.id::text id, ${cuiCorroborated(q, "e")} ok
        from core.entities e where e.id in (10,11,12) order by e.id`).map(r => [String(r["id"]), r["ok"]]));
      // Fail-closed before the marts build has checked any foreign-marked name.
      expect(await corroborated()).toEqual({ "10": false, "11": false, "12": true });

      await runMarts(q);
      expect(await corroborated()).toEqual({ "10": false, "11": true, "12": true });
      expect((await q`select entity_id::text id, cui from marts.cui_corroborations`).map(r => [r["id"], r["cui"]]))
        .toEqual([["11", "13328043"]]);
      const profiles = await q`select entity_id::text id, employees, net_turnover::text turnover
        from marts.entity_profile where role='supplier' order by entity_id`;
      expect(profiles.map(r => [r["id"], r["employees"], r["turnover"]]))
        .toEqual([["10", null, null], ["11", 1, "1000"], ["12", 1, "1000"]]);

      await runFlags(q);
      const subjects = async (code: string) => (await q`select subject_id::text id from core.flags
        where flag_code=${code} order by subject_id, period`).map(r => r["id"]);
      expect(await subjects("fin_tiny_staff")).toEqual(["11", "11", "12"]);
      expect(await subjects("fin_public_reliance")).toEqual(["11", "12"]);
      expect(await subjects("net_shared_admin")).toEqual(["11", "12"]);
      const [shared] = await q`select evidence from core.flags where flag_code='net_shared_admin' and subject_id=11`;
      expect(shared?.["evidence"]).toMatchObject({ n_firms: 2 });

      await q`create table core.notice_meta (notice_no text primary key, assignment_type text, has_subsequent boolean, updated_at timestamptz)`;
      await runRadiografieMarts(q);
      const dependency = await q`select supplier_id::text id, turn_last::text turnover, emp_last employees
        from marts.supplier_dependency order by supplier_id`;
      expect(dependency.map(r => [r["id"], r["turnover"], r["employees"]])).toEqual([["10", null, null], ["11", "1000", 1]]);

      // A corroboration belongs to the CUI that was checked.
      await q`update core.entities set cui_canonical='13328041' where id=11`;
      expect((await corroborated())["11"]).toBe(false);
      throw rollback;
    })).rejects.toBe(rollback);
  }, 30_000);
});

describe('approved publication identity in actual statistical builders',()=>{
 it.each([false,true])('counts once, preserves publications, and protects source changes (framework=%s)',async framework=>{
  const prefix=`identity_marts_${process.pid}_${Date.now()}`;
  const rollback=Error('rollback identity fixture');
  await expect(sql.begin(async tx=>{
   for(const [schema,names] of Object.entries(tables)){
    await tx.unsafe(`create schema ${prefix}_${schema}`);
    for(const table of names)await tx.unsafe(`create table ${prefix}_${schema}.${table} as table ${schema}.${table} with no data`);
   }
   const q=isolatedSql(tx as unknown as DbSql,prefix);
   const {assessed,archives}=await seedVerifiedIdentity(q,{framework,calloff:framework});
   const representative=framework?'3':'1';
   const expectedValue=framework?'20.00':'100.00';
   await approveContractIdentities(q,[assessed],archives,'Idempotent repeat');
   expect((await q`select count(*)::int n from marts.contract_identity_decisions`)[0]!.n).toBe(1);
   await q`set local time zone 'America/Los_Angeles'`;
   expect((await readContractIdentityQuality(q)).valid).toBe(true);
   await runMarts(q);
   const amounts=await q`select contract_id::text,closing_value::text from marts.contract_transactions`;
   expect(amounts).toEqual([{contract_id:representative,closing_value:expectedValue}]);
   expect((await q`select count(*)::int n from core.contracts where id in (1,2)`)[0]!.n).toBe(2);
   expect((await q`select total_ron_split::text from marts.entity_profile where role='authority'`)[0]!.total_ron_split).toBe(expectedValue);
   // A changed original amount blocks dependent builders; last mart remains.
   await q`update core.contracts set contract_value=101 where id=2`;
   expect((await readContractIdentityQuality(q)).staleMembers).toBe(1);
   await expect(runMarts(q)).rejects.toThrow('require review');
   expect(await q`select contract_id::text,closing_value::text from marts.contract_transactions`).toEqual(amounts);
   await q`update core.contracts set contract_value=100 where id=2`;
   await q`update core.contracts set raw_id=99 where id=2`;
   expect((await readContractIdentityQuality(q)).staleMembers).toBe(1);
   await q`update core.contracts set raw_id=4 where id=2`;
   await q`update core.entities set cui_canonical='9999' where id=10`;
   expect((await readContractIdentityQuality(q)).staleMembers).toBe(2);
   await q`update core.entities set cui_canonical='15219174' where id=10`;
   // Newly seen publication of the same notice must be reviewed, not counted twice.
   await q`insert into core.awards(id,ca_notice_id,notice_no) values(9,900,'CAN-test')`;
   expect((await readContractIdentityQuality(q)).staleMembers).toBe(2);
   await q`delete from core.awards where id=9`;
   await q`update marts.contract_identity_candidates set active=false`;
   expect((await readContractIdentityQuality(q)).invalidDecisions).toBe(1);
   throw rollback;
  })).rejects.toBe(rollback);
 });
});

import {seedVerifiedIdentity} from '../test/contract-identity-fixture.js';
import {approveContractIdentities} from './approve-contract-identities.js';
import { afterAll, describe, expect, it } from "vitest";
import { AGG_MAP_COUNTY_SEAT_COLUMNS, buildAskRollups, contractKindFromTitle, contractWinnerIsAuthority, createDb, cuiCorroborated, readContractIdentityQuality, TRANSACTION_MART_BUILD_INDEXES, TRANSACTION_MART_INDEXES, type DbSql } from "@seap/db";
import { DA_CEILING_SEED_ROWS } from "@seap/domain";
import { runMarts } from "./marts.js";
import { applyFirmRegistry, onrcRegistration } from "./firm-registry.js";
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
  // uat: the December comparison's institution kinds (rf-2026.18, flags/score.ts authorityKindSql).
  reference: ["authority_uat", "uat", "company_financials", "company_reps", "onrc_firm"],
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
      expect((await q`select publication_date,finalization_date from marts.da_transactions`)[0])
        .toMatchObject({ publication_date: "2025-12-31 23:55", finalization_date: "2026-01-01 00:15" });
      expect((await q`select y,v_plaf::text value from marts.agg_years order by y`).map(r => [r.y,r.value]))
        .toEqual([["2025","200.00"],["2026","112.34"]]);
      throw rollback;
    })).rejects.toBe(rollback);
  });
  // Marts audit, 24 October 2026: the county/CPV covering indexes existed only
  // because the builds TRUNCATE; a table rebuilt without them made Ask 8–17 s.
  it("creates the covering county/CPV indexes on transaction tables that lack them", async () => {
    const prefix = `index_fixture_${process.pid}_${Date.now()}`;
    const rollback = Error("rollback index fixture");
    await expect(sql.begin(async tx => {
      for (const [schema, names] of Object.entries(tables)) {
        await tx.unsafe(`create schema ${prefix}_${schema}`);
        for (const table of names) await tx.unsafe(`create table ${prefix}_${schema}.${table} as table ${schema}.${table} with no data`);
      }
      const [view] = await tx`select pg_get_viewdef('marts.signal_lookup'::regclass, true) definition`;
      await tx.unsafe(`create materialized view ${prefix}_marts.signal_lookup as ${String(view!.definition).replace(/;\s*$/, "").replace(/\b(core|marts|reference|raw)\./g, `${prefix}_$1.`)} with no data`);
      const q = isolatedSql(tx as unknown as DbSql, prefix);
      const indexes = () => tx`select indexname, indexdef from pg_indexes where schemaname = ${prefix + "_marts"}
        and tablename in ('da_transactions', 'contract_transactions') order by indexname collate "C"`;
      expect((await indexes()).length).toBe(0);
      await q`insert into core.entities(id,name_display) values(1,'Autoritate'),(2,'Furnizor')`;
      await q`insert into core.awards(id,ca_notice_id,authority_entity_id) values(1,100,1)`;
      await q`insert into core.contracts(id,ca_notice_id,contract_date,contract_value,currency,title) values(1,100,'2025-07-15T09:00:00Z',100,'RON','Contract')`;
      await q`insert into core.contract_winners(contract_id,entity_id) values(1,2)`;
      await q`insert into core.direct_acquisitions(id,sicap_da_id,authority_entity_id,supplier_entity_id,state,closing_value,finalization_date)
        values(1,99001,1,2,'Oferta acceptata',12.34,'2025-07-15T09:00:00Z')`;
      expect((await runMarts(q)).createdIndexes).toEqual(["ctx_county_idx", "ctx_county_ent_idx", "ctx_cpv_idx", "ctx_cpv_val_idx"]);
      const built = await buildTransactionMarts(q as unknown as Parameters<typeof buildTransactionMarts>[0]);
      expect(built.createdIndexes).toEqual(["da_tx_county_date_idx", "da_tx_county_ent_idx", "da_tx_cpv_idx", "da_tx_cpv_val_idx"]);
      // With the covering twins, which the DA build always drops and builds again.
      expect((await indexes()).map(r => [r.indexname, r.indexdef])).toEqual([...TRANSACTION_MART_INDEXES, ...TRANSACTION_MART_BUILD_INDEXES]
        .map(index => [index.name, index.definition.replace(" ON marts.", ` ON ${prefix}_marts.`)])
        .sort(([a], [b]) => a! < b! ? -1 : 1));
      // The next nightly build finds them and creates nothing.
      expect((await buildTransactionMarts(q as unknown as Parameters<typeof buildTransactionMarts>[0])).createdIndexes).toEqual([]);
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
      // DAs 1 and 2: the authority recorded as its own supplier (DA 1 finalised in 20 minutes, no signal since
      // rf-2026.18 retired "Finalizare rapidă"); DA 3: a real supplier.
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
      expect(await q`select 1 from core.flags where flag_code='da_rapid'`).toHaveLength(0);
      // A DA signal on the authority's own DA (the rule's fixture rows are elsewhere) and an award signal.
      await q`insert into core.flags(id,subject_type,subject_id,flag_code,period,triggered,severity,evidence,methodology_version)
        values(9001,'award',1,'award_no_competition','2024',true,0.9,'{"value":2000}','fixture'),
          (9002,'da',1,'da_round','2024',true,0.97,'{"closing":60000}','fixture')`;
      await runFlagMarts(q);
      // No criterion is met: every profile is scored 0 with no parts.
      expect((await q`select entity_id::int e, role, n_das n, score, n_flags, flags, score_parts from marts.entity_flags order by 1, 2`)
        .map(r => [r.e, r.role, r.n, r.score, r.n_flags, r.flags, r.score_parts]))
        .toEqual([[1, "authority", 3, 0, 0, [], {}], [1, "supplier", 1, 0, 0, [], {}], [2, "supplier", 1, 0, 0, [], {}], [3, "authority", 1, 0, 0, [], {}]]);
      expect((await q`select flag_code, entity_id::int e, partner_id, partner_name from marts.flag_instances order by flag_code`).map(r => [r.flag_code, r.e, r.partner_id, r.partner_name]))
        .toEqual([["award_no_competition", 3, null, null], ["da_round", 1, null, null]]);
      expect((await q`select entity_id::int e, partner_id from marts.signal_lookup where flag_code='da_round'`)).toEqual([{ e: 1, partner_id: null }]);
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
  // F2's launch condition (plan §4.7, trend final §6 step 0): no framework ceiling enters a trend. A trend
  // reads marts.contract_transactions (live) or the Ask rollups grouped from it, never core.contracts:
  // a ceiling, typed by SEAP or by its title, is in neither; a call-off and a contract of the same firm are.
  it("keeps framework ceilings out of the contract mart and of every Ask rollup a trend reads", async () => {
    const prefix = `trend_ceiling_fixture_${process.pid}_${Date.now()}`;
    const rollback = Error("rollback trend ceiling fixture");
    await expect(sql.begin(async tx => {
      for (const [schema, names] of Object.entries(tables)) {
        await tx.unsafe(`create schema ${prefix}_${schema}`);
        for (const table of names) await tx.unsafe(`create table ${prefix}_${schema}.${table} as table ${schema}.${table} with no data`);
      }
      const [view] = await tx`select pg_get_viewdef('marts.signal_lookup'::regclass, true) definition`;
      await tx.unsafe(`create materialized view ${prefix}_marts.signal_lookup as ${String(view!.definition).replace(/;\s*$/, "").replace(/\b(core|marts|reference|raw)\./g, `${prefix}_$1.`)} with no data`);
      const q = isolatedSql(tx as unknown as DbSql, prefix);
      await q`insert into core.entities(id,name_display) values(1,'Autoritate'),(2,'Furnizor')`;
      await q`insert into core.awards(id,ca_notice_id,notice_no,authority_entity_id,state_date) values(1,100,'CAN-CEILING',1,'2024-01-10')`;
      await q`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_no,contract_date,contract_value,currency,title,source_contract_type,contract_type_raw_id) values
        (1,11,108116001,100,'1','2024-02-01T10:00:00Z',1000.25,'RON','Furnizare motorină','1',11),
        (2,12,108116002,100,'2','2025-02-01T10:00:00Z',900000,'RON','Furnizare carburant','2',12),
        (3,13,108116003,100,'3','2025-03-01T10:00:00Z',300,'RON','Carburant pentru motoare diesel','3',13),
        (4,14,108116004,100,'4','2025-04-01T10:00:00Z',700000,'RON','Acord-cadru lucrări',null,null),
        (5,15,108116005,100,'5','2025-05-01T10:00:00Z',200,'RON','Contract subsecvent nr. 5',null,null)`;
      await q`insert into core.contract_winners(contract_id,entity_id) select id,2 from core.contracts`;
      await runMarts(q);
      expect((await q`select contract_id::int c from marts.contract_transactions order by 1`).map(r => r.c)).toEqual([1, 3, 5]);
      await buildAskRollups(q);
      // Each rollup a trend groups (by entity and year, by month, by pair) holds the contract and the two call-offs only.
      const years = async (table: string, where: string) => (await q.unsafe(`select y, sum(v)::text v, sum(n)::int n from marts.${table}
        where src = 'contracts' and ${where} group by y order by y`)).map(r => ({ y: r.y, v: Number(r.v), n: r.n }));
      const expected = [{ y: "2024", v: 1000.25, n: 1 }, { y: "2025", v: 500, n: 2 }];
      expect(await years("agg_entity_year", "role = 'supplier' and eid = 2")).toEqual(expected);
      expect(await years("agg_entity_month", "role = 'supplier' and eid = 2")).toEqual(expected);
      expect(await years("agg_pair_year", "supplier_id = 2")).toEqual(expected);
      expect(await years("agg_cpv_year", "true")).toEqual(expected);
      // F3-rows: the evolution's months and the national composition hold the same rows.
      expect(await years("agg_months", "true")).toEqual(expected);
      expect(await years("agg_national_mix", "true")).toEqual(expected);
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
          da_dep_min_total: 1, da_dep_top_pct: 0.1, da_dep_min_count: 1, da_year_end_min_total: 1, da_year_end_share: 0,
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
        // "Finalizare rapidă" is retired (rf-2026.18): DAs finalised 30 minutes after publication carry no signal.
        expect(report["da_rapid"]).toBeUndefined();
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
      // 12: ordinary Romanian supplier without a country. 2095043: INTRASOFT
      // International, no foreign marker, in the reviewed collision manifest
      // (F03 option b): ONRC registers its CUI 16853659 as MEGASPEED TRANS.
      await q`insert into core.entities (id,name_display,name_normalized,cui_canonical,cui_valid,country_code) values
        (1,'Autoritate','autoritate',null,false,null),
        (10,'FRESIA S.P.A.','fresia s p a','1152147',true,'IT'),
        (11,'COMPANIA NATIONALA DE TRANSPORT AL ENERGIEI ELECTRICE "TRANSELECTRICA" S.A.','transelectrica','13328043',true,'DE'),
        (12,'Furnizor Exemplu S.R.L.','furnizor exemplu','12',true,null),
        (2095043,'INTRASOFT International','intrasoft international','16853659',true,null)`;
      await q`insert into reference.onrc_firm (j_number,cui,name,snapshot_date) values
        ('J1','1152147','EXEMPLU UNELTE SNC','2026-09-01'),
        ('J2','13328043','COMPANIA NATIONALA DE TRANSPORT AL ENERGIEI ELECTRICE "TRANSELECTRICA" SA','2026-09-01'),
        ('J3','12','FURNIZOR EXEMPLU SRL','2026-09-01'),
        ('J4','16853659','MEGASPEED TRANS SRL','2026-09-01')`;
      await q`insert into reference.company_financials (cui,year,category,source_vintage,employees,net_turnover)
        select cui, year, 'fixture', year, 1, 1000 from unnest(array['1152147','13328043','12','16853659']) cui, unnest(array[2024,2025]) year`;
      await q`insert into reference.company_reps (j_number,cui,person_key,person_name,calitate,birth_date,snapshot_date)
        select 'J'||cui,cui,'fixture-person','Persoana Fictiva','administrator','1970-01-01','2026-09-01'
        from unnest(array['1152147','13328043','12','16853659']) cui`;
      await q`insert into core.direct_acquisitions (id,authority_entity_id,supplier_entity_id,state,closing_value,finalization_date) values
        (1,1,10,'Oferta acceptata',500,'2025-03-01'),(2,1,11,'Oferta acceptata',500,'2025-03-01'),(3,1,12,'Oferta acceptata',500,'2025-03-01'),
        (4,1,2095043,'Oferta acceptata',500,'2025-03-01')`;
      await q`insert into core.cpv_codes (code,name_ro) values ('45000000-7','Works')`;
      await q`insert into core.awards (id,ca_notice_id,notice_no,authority_entity_id,cpv_code,acquisition_type,ron_contract_value,state_date)
        values (1,1000,'CAN1',1,'45000000-7','Lucrari',600,'2024-05-01')`;
      await q`insert into core.contracts (id,ca_notice_id,contract_no,contract_value,contract_date,currency,title)
        values (100,1000,'1',300,'2024-06-01','RON','Contract'),(101,1000,'2',300,'2024-06-01','RON','Contract')`;
      await q`insert into core.contract_winners (contract_id,entity_id) values (100,10),(101,11)`;
      const corroborated = async () => Object.fromEntries((await q`select e.id::text id, ${cuiCorroborated(q, "e")} ok
        from core.entities e where e.id in (10,11,12,2095043) order by e.id`).map(r => [String(r["id"]), r["ok"]]));
      // Fail-closed before the marts build has checked any foreign-marked name.
      // The reviewed collision is never corroborated.
      expect(await corroborated()).toEqual({ "10": false, "11": false, "12": true, "2095043": false });

      await runMarts(q);
      expect(await corroborated()).toEqual({ "10": false, "11": true, "12": true, "2095043": false });
      expect((await q`select entity_id::text id, cui from marts.cui_corroborations`).map(r => [r["id"], r["cui"]]))
        .toEqual([["11", "13328043"]]);
      const profiles = await q`select entity_id::text id, employees, net_turnover::text turnover
        from marts.entity_profile where role='supplier' order by entity_id`;
      expect(profiles.map(r => [r["id"], r["employees"], r["turnover"]]))
        .toEqual([["10", null, null], ["11", 1, "1000"], ["12", 1, "1000"], ["2095043", null, null]]);

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
      // A reviewed collision applies only to the recorded entity and CUI.
      await q`update core.entities set cui_canonical='16853650' where id=2095043`;
      expect((await corroborated())["2095043"]).toBe(true);
      throw rollback;
    })).rejects.toBe(rollback);
  }, 30_000);
});

// Plan F5 / F6a phase 2 (24 October 2026): firm columns for Ask's filters, built
// from data already imported. Firm names are fictitious.
describe("registration year, seat and main CPV division of the firms", () => {
  it("reads both ONRC formats, picks the seat deterministically, splits the map by seat and names a main division", async () => {
    const prefix = `firm_registry_fixture_${process.pid}_${Date.now()}`;
    const rollback = Error("rollback firm registry fixture");
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
      await q`insert into core.entities (id,name_display,cui_canonical,cui_valid,county,country_code,is_foreign) values
        (1,'Spitalul Judetean Cluj',null,false,'Cluj',null,false),
        (2,'Primaria Sectorului 1',null,false,'Bucuresti',null,false),
        (10,'Firma Veche SRL','10',true,'Cluj',null,false),
        (11,'Firma Noua SRL','11',true,null,'RO',false),
        (12,'Firma Mutata SRL','12',true,'Bucuresti',null,false),
        (13,'Firma Egala SRL','13',true,'Cluj',null,false),
        (14,'Firma Din SEAP SRL',null,false,'SIBIU',null,false),
        (15,'Firma Fara Sediu SRL',null,false,null,null,false),
        (16,'Exemplu Bau GmbH','16',true,'NA','DE',true),
        (17,'Esempio Costruzioni SpA',null,false,null,'IT',false),
        (18,'PFA Popescu Ion','18',true,null,null,false),
        (19,'Firma Fara Judet Nou SRL','19',true,'Timis',null,false),
        (20,'Firma Mare SRL','20',true,'Cluj',null,false),
        (21,'Firma Nehotarata SRL','21',true,'Cluj',null,false),
        (22,'Firma Renumerotata SRL','22',true,'Bucuresti',null,false)`;
      // 12: a seat move (Bucharest 2010, Ilfov 2023); 13: two old 2015 numbers from two
      // county offices, one of them the SEAP county (the higher sequence, 100, is lower
      // as text than 99); 16: a foreign firm whose name ONRC corroborates; 18: a PFA (F);
      // 19: the latest number names no county; 21: two old 2015 numbers, neither in the
      // SEAP county (undecided); 22: an old and a new 2024 number (the new one is later).
      const registry = [
        ["J12/345/2004", "10", "FIRMA VECHE SRL", "Cluj"],
        ["J2024000123408", "11", "FIRMA NOUA SRL", "Bucureşti"],
        ["J40/1000/2010", "12", "FIRMA MUTATA SRL", "Bucureşti"],
        ["J2023000555123", "12", "FIRMA MUTATA SRL", "Ilfov"],
        ["J12/99/2015", "13", "FIRMA EGALA SRL", "Cluj"],
        ["J05/100/2015", "13", "FIRMA EGALA SRL", "Bihor"],
        ["J40/16/2016", "16", "EXEMPLU BAU SRL", "Bucureşti"],
        ["F12/661/2014", "18", "POPESCU ION PERSOANA FIZICA AUTORIZATA", "Cluj"],
        ["J35/5/2001", "19", "FIRMA FARA JUDET NOU SRL", "Timiş"],
        ["J2025000001001", "19", "FIRMA FARA JUDET NOU SRL", ""],
        ["J12/7/2019", "20", "FIRMA MARE SRL", "Cluj"],
        ["J05/7/2015", "21", "FIRMA NEHOTARATA SRL", "Bihor"],
        ["J02/8/2015", "21", "FIRMA NEHOTARATA SRL", "Arad"],
        ["J40/50000/2024", "22", "FIRMA RENUMEROTATA SRL", "Bucureşti"],
        ["J2024000001123", "22", "FIRMA RENUMEROTATA SRL", "Ilfov"],
      ] as const;
      const loadRegistry = async (rows: readonly (readonly [string, string, string, string])[]) => {
        await q`delete from reference.onrc_firm`;
        for (const [j, cui, name, county] of rows)
          await q`insert into reference.onrc_firm (j_number,cui,name,county,snapshot_date) values (${j},${cui},${name},${county},'2026-07-08')`;
      };
      await loadRegistry(registry);
      await q`insert into core.cpv_codes (code,name_ro) values ('45000000-7','Lucrări'),('44000000-0','Materiale'),('33600000-6','Medicamente'),('33100000-1','Echipamente'),('09100000-0','Combustibili')`;
      // Per firm, the main-division case: 10 45 (60%); 11 33 (two classes); 12 an exact
      // 50/50 tie; 13 no half; 14 half in 45, half without CPV; 15 the 2.5M DA is
      // outside the profile, so 09; 20 only a DA above the ceiling (no profile).
      await q`insert into core.direct_acquisitions (id,sicap_da_id,authority_entity_id,supplier_entity_id,state,closing_value,finalization_date,cpv_code) values
        (1,9001,1,10,'Oferta acceptata',60,'2025-03-01','45000000-7'),(2,9002,1,10,'Oferta acceptata',40,'2025-03-01','44000000-0'),
        (3,9003,1,11,'Oferta acceptata',30,'2025-03-01','33600000-6'),(4,9004,2,11,'Oferta acceptata',20,'2025-03-01','33100000-1'),
        (5,9005,1,12,'Oferta acceptata',50,'2025-03-01','45000000-7'),(6,9006,1,12,'Oferta acceptata',50,'2025-03-01','44000000-0'),
        (7,9007,1,13,'Oferta acceptata',40,'2025-03-01','45000000-7'),(8,9008,1,13,'Oferta acceptata',30,'2025-03-01','44000000-0'),
        (9,9009,1,13,'Oferta acceptata',30,'2025-03-01','33600000-6'),
        (10,9010,1,14,'Oferta acceptata',50,'2025-03-01','45000000-7'),(11,9011,1,14,'Oferta acceptata',50,'2025-03-01',null),
        (12,9012,1,15,'Oferta acceptata',2500000,'2025-03-01','45000000-7'),(13,9013,1,15,'Oferta acceptata',5,'2025-03-01','09100000-0'),
        (14,9014,1,16,'Oferta acceptata',70,'2025-03-01','45000000-7'),(15,9015,1,17,'Oferta acceptata',80,'2025-03-01','45000000-7'),
        (16,9016,1,18,'Oferta acceptata',90,'2025-03-01','45000000-7'),(17,9017,1,19,'Oferta acceptata',10,'2025-03-01','45000000-7'),
        (18,9018,1,null,'Oferta acceptata',7,'2025-03-01','45000000-7'),(19,9019,1,20,'Oferta acceptata',3000000,'2025-03-01','45000000-7'),
        (20,9020,1,10,'Oferta refuzata',1000,'2025-03-01','09100000-0'),
        (21,9021,2,21,'Oferta acceptata',4,'2025-03-01','45000000-7'),(22,9022,2,22,'Oferta acceptata',6,'2025-03-01','45000000-7')`;
      // A consortium contract in Cluj: Firma Veche (Cluj) and Firma Mutata (now Ilfov).
      await q`insert into core.awards (id,ca_notice_id,notice_no,authority_entity_id,cpv_code,acquisition_type,ron_contract_value,state_date)
        values (1,1000,'CAN-SEAT',1,'45000000-7','Lucrari',100,'2025-01-10')`;
      await q`insert into core.contracts (id,ca_notice_id,contract_no,contract_value,contract_date,currency,title)
        values (100,1000,'1',100,'2025-02-01','RON','Contract')`;
      await q`insert into core.contract_winners (contract_id,entity_id) values (100,10),(100,12)`;

      const seats = async () => (await q`select entity_id::int id, role, registered_year, seat_county, seat_source
        from marts.entity_profile order by entity_id, role`).map(r => [r["id"], r["role"], r["registered_year"], r["seat_county"], r["seat_source"]]);
      const report = await runMarts(q);
      const expected = [
        [1, "authority", null, null, null], [2, "authority", null, null, null],
        [10, "supplier", 2004, "Cluj", "onrc"], [11, "supplier", 2024, "Bucuresti", "onrc"],
        [12, "supplier", 2010, "Ilfov", "onrc"], [13, "supplier", 2015, "Cluj", "onrc"],
        [14, "supplier", null, "Sibiu", "seap"], [15, "supplier", null, null, null],
        [16, "supplier", null, null, "foreign"], [17, "supplier", null, null, "foreign"],
        [18, "supplier", 2014, "Cluj", "onrc"], [19, "supplier", 2001, "Timis", "seap"],
        [21, "supplier", 2015, "Cluj", "seap"], [22, "supplier", 2024, "Ilfov", "onrc"],
      ];
      expect(await seats()).toEqual(expected);
      expect(report.firmRegistry).toEqual({ registeredYear: 8, seat: { onrc: 6, seap: 3, foreign: 2, unknown: 1 } });
      // The processing run keeps what the seat steps cost (stages.marts in the refresh's validation).
      expect(report.firmRegistryMs).toBeGreaterThanOrEqual(0);
      expect(report.spendByCountyMs).toBeGreaterThanOrEqual(0);
      // /harta's firms sit in their seat (owner-seat-switch): 12 and 22 in Ilfov, not București; 11 and 18, without a
      // SEAP county, in theirs; the foreign 16 and 17 apart; 15 unknown. The institutions keep their own county.
      const spend = async (role: string) => Object.fromEntries((await q`select county, n, total_ron from marts.spend_by_county where role = ${role}`)
        .map(r => [String(r["county"]), [Number(r["n"]), Number(r["total_ron"])]]));
      expect(await spend("supplier")).toEqual({
        Cluj: [4, 344], Bucuresti: [1, 50], Ilfov: [2, 156], Sibiu: [1, 100], Timis: [1, 10], "Străinătate": [2, 150], Necunoscut: [1, 5],
      });
      expect(await spend("authority")).toEqual({ Cluj: [1, 792], Bucuresti: [1, 30] });
      // The SQL reads each number as onrcRegistration does.
      expect(registry.map(([j]) => onrcRegistration(j)?.year)).toEqual([2004, 2024, 2010, 2023, 2015, 2015, 2016, 2014, 2001, 2025, 2019, 2015, 2015, 2024, 2024]);
      // Deterministic: the register loaded in reverse order gives the same seats.
      await loadRegistry([...registry].reverse());
      await q`update marts.entity_profile set registered_year = null, seat_county = null, seat_source = null`;
      await applyFirmRegistry(q as unknown as Parameters<typeof applyFirmRegistry>[0]);
      expect(await seats()).toEqual(expected);

      const transactions = await buildTransactionMarts(q as unknown as Parameters<typeof buildTransactionMarts>[0]);
      expect(transactions.mapCountyMs).toBeGreaterThanOrEqual(0);
      const columns = (await tx`select column_name from information_schema.columns
        where table_schema = ${prefix + "_marts"} and table_name = 'agg_map_county' order by ordinal_position`).map(r => r["column_name"]);
      expect(columns).toEqual(["county", "v_plaf", "n_plaf", "v_all", "n_all", ...AGG_MAP_COUNTY_SEAT_COLUMNS]);
      const map = Object.fromEntries((await q`select * from marts.agg_map_county`).map(r => [String(r["county"]),
        Object.fromEntries(Object.entries(r).filter(([k]) => k !== "county").map(([k, v]) => [k, Number(v)]))]));
      // Cluj: same = 10 (100 + its 50 of the contract), 13 (100) and 18 (90); other = 11
      // (30, in București), 12 (100 + 50, now Ilfov), 14 (100, Sibiu), 19 (10);
      // foreign = 16, 17; unknown = 15 (5) and the DA without supplier (7). Above the
      // ceiling (v_all only): 15's 2.5M, and 20's 3M, unknown because 20 has no profile.
      expect(map["Cluj"]).toMatchObject({
        v_plaf: 792, n_plaf: 18, v_all: 5500792, n_all: 20,
        v_plaf_same: 340, n_plaf_same: 7, v_plaf_other: 290, n_plaf_other: 7, v_plaf_bucuresti: 30, n_plaf_bucuresti: 1,
        v_plaf_foreign: 150, n_plaf_foreign: 2, v_plaf_unknown: 12, n_plaf_unknown: 2,
        v_all_same: 340, n_all_same: 7, v_all_unknown: 5500012, n_all_unknown: 4,
      });
      // In București a București firm is 'same', never 'bucuresti'; 21 (Cluj) and 22 (Ilfov) are other.
      expect(map["Bucuresti"]).toMatchObject({ v_plaf: 30, v_plaf_same: 20, v_plaf_other: 10, v_plaf_bucuresti: 0 });
      for (const county of Object.values(map))
        for (const scope of ["plaf", "all"])
          expect(["same", "other", "foreign", "unknown"].reduce((sum, seat) => sum + county[`v_${scope}_${seat}`]!, 0)).toBe(county[`v_${scope}`]);

      await runFlagMarts(q, { transactions: false });
      expect((await q`select entity_id::int id, role, main_cpv_div from marts.entity_flags order by entity_id, role`).map(r => [r["id"], r["role"], r["main_cpv_div"]]))
        .toEqual([[1, "authority", null], [2, "authority", null], [10, "supplier", "45"], [11, "supplier", "33"], [12, "supplier", null],
          [13, "supplier", null], [14, "supplier", "45"], [15, "supplier", "09"], [16, "supplier", "45"], [17, "supplier", "45"],
          [18, "supplier", "45"], [19, "supplier", "45"], [21, "supplier", "45"], [22, "supplier", "45"]]);
      throw rollback;
    })).rejects.toBe(rollback);
    expect(await sql`select nspname from pg_namespace where nspname like ${`${prefix}_%`}`).toHaveLength(0);
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

// The risk score (rf-2026.18, owner decision of 1 November 2026): the sharper
// DA rules and the score marts.entity_flags gets from applyProfileScores
// (flags/score.ts). Ceilings in 2024: 270.120 lei goods/services, 900.400 lei
// works; in 2020: 135.060 lei goods/services. Every name is fictitious.
describe("risk score rules and profile score (rf-2026.18)", () => {
  it("flags the sharper DA signals, the safe above-ceiling scope and writes each profile's score", async () => {
    const prefix = `risk_score_fixture_${process.pid}_${Date.now()}`;
    const rollback = Error("rollback risk score fixture");
    await expect(sql.begin(async tx => {
      await tx`select set_config('TimeZone', 'UTC', true)`;
      for (const [schema, names] of Object.entries(tables)) {
        await tx.unsafe(`create schema ${prefix}_${schema}`);
        for (const table of [...names, ...(schema === "marts" ? ["entity_flags", "flag_instances"] : [])])
          await tx.unsafe(`create table ${prefix}_${schema}.${table} as table ${schema}.${table} with no data`);
      }
      const q = isolatedSql(tx as unknown as DbSql, prefix);
      for (const threshold of DA_CEILING_SEED_ROWS) {
        await q`insert into core.risk_thresholds (key,valid_from,valid_to,value_num,note)
          values (${threshold.key},${threshold.validFrom + "T00:00:00Z"},${threshold.validTo ? threshold.validTo + "T00:00:00Z" : null},${threshold.valueNum},'fixture')`;
      }
      const entities: [number, string][] = [
        [1, "Primaria Comunei Alfa"], [20, "Primaria Orasului Delta"], [21, "Compania Municipala Epsilon SA"],
        [22, "Serviciul Public de Apa Zeta"], [60, "Scoala Gimnaziala Eta"], [61, "Directia Lambda"],
        [70, "Scoala Gimnaziala Nr 1 Teta"], [71, "Scoala Gimnaziala Nr 2 Teta"], [80, "Directia Iota"], [90, "Spitalul Kappa"],
        [37, "Unifarm SA"],
        ...[10, 11, 12, 13, 14, 31, 32, 33, 34, 35, 36, 38, 39, 40, 41, 42, 43, 44, 45, 50, 51, 52, 53, 99].map((id): [number, string] => [id, `Furnizor ${id} SRL`]),
      ];
      for (const [id, name] of entities)
        await q`insert into core.entities (id,name_display,name_normalized) values (${id},${name},${name.toLowerCase()})`;
      // [id, authority, supplier, closing, cpv, publication]; the estimate equals the closing value unless given.
      const goods = "30190000-7", works = "45233140-2", march = "2024-03-04T09:00:00Z";
      const das: [number, number, number, number, string | null, string, number?][] = [
        // da_round from 96% of the ceiling, strictly under it (authority 1, one DA per firm: no repeated purchases).
        [101, 1, 10, 259_400, goods, march], [102, 1, 11, 270_119, goods, march], [103, 1, 12, 259_000, goods, march],
        [104, 1, 13, 270_120, goods, march], [105, 1, 14, 1_000, goods, march],
        [106, 1, 42, 400_000, goods, march], [107, 1, 43, 1_000_000, works, march],
        // da_above_ceiling: more than 1.1 × the ceiling, only where the known exceptions cannot apply.
        [201, 20, 31, 400_000, goods, march], [202, 20, 32, 1_000_000, works, march], [203, 20, 33, 400_000, goods, "2020-05-20T09:00:00Z"],
        [204, 20, 34, 290_000, goods, march], // 1.07 × the ceiling
        [205, 20, 35, 400_000, "85121000-3", march], // Annex 2 (own procedure)
        [206, 20, 36, 400_000, "33600000-6", march], // CPV 33 (central purchasing)
        [207, 20, 37, 400_000, goods, march], // Unifarm
        [208, 20, 38, 400_000, "44110000-4", march], // building-like goods under the works ceiling
        [209, 20, 39, 850_000, goods, march], // 90–100% of the works ceiling
        [210, 20, 40, 400_000, goods, march, 150_000], // more than twice the estimate
        [211, 20, 41, 400_000, goods, "2020-03-15T09:00:00Z"], // 26.02–14.05.2020
        [212, 21, 44, 400_000, goods, march], // a company buyer
        [213, 22, 45, 400_000, goods, march], // a sectoral-looking buyer
        // da_year_end: 2024's December share against the same kind in the same year (no CPV: no ceiling rules).
        [301, 70, 99, 80_000, null, "2024-03-10T09:00:00Z"], [302, 70, 99, 120_000, null, "2024-12-10T09:00:00Z"],
        [303, 71, 99, 100_000, null, "2024-03-10T09:00:00Z"], [304, 71, 99, 100_000, null, "2024-12-10T09:00:00Z"],
        [305, 80, 99, 100_000, null, "2024-03-10T09:00:00Z"], [306, 80, 99, 100_000, null, "2024-12-10T09:00:00Z"],
        [307, 90, 99, 140_000, null, "2024-03-10T09:00:00Z"], [308, 90, 99, 60_000, null, "2024-12-10T09:00:00Z"],
        // da_dependence: ≥ 85% of the firm's sales, ≥ 250.000 lei and ≥ 5 DAs with the main institution.
        ...Array.from({ length: 20 }, (_, i): [number, number, number, number, null, string] => [401 + i, 60, 50, 30_000, null, "2024-04-10T09:00:00Z"]),
        ...Array.from({ length: 4 }, (_, i): [number, number, number, number, null, string] => [421 + i, 60, 51, 70_000, null, "2024-04-10T09:00:00Z"]),
        ...Array.from({ length: 5 }, (_, i): [number, number, number, number, null, string] => [425 + i, 60, 52, 49_000, null, "2024-04-10T09:00:00Z"]),
        ...Array.from({ length: 5 }, (_, i): [number, number, number, number, null, string] => [430 + i, 60, 53, 60_000, null, "2024-04-10T09:00:00Z"]),
        [435, 61, 53, 100_000, null, "2024-04-10T09:00:00Z"],
      ];
      for (const [id, authority, supplier, closing, cpv, publication, estimate] of das)
        await q`insert into core.direct_acquisitions (id,sicap_da_id,authority_entity_id,supplier_entity_id,state,closing_value,estimated_value_ron,cpv_code,publication_date,finalization_date)
          values (${id},${900_000 + id},${authority},${supplier},'Oferta acceptata',${closing},${estimate ?? closing},${cpv},${publication},${publication}::timestamptz + interval '1 day')`;
      // A refused record on 5 January 2025 closes 2024 in the archive, so December 2024 is evaluated.
      await q`insert into core.direct_acquisitions (id,sicap_da_id,authority_entity_id,supplier_entity_id,state,closing_value,finalization_date)
        values (902,900902,1,10,'Oferta refuzata',1,'2025-01-05T09:00:00Z')`;

      const report = await runFlags(q);
      expect(report["da_rapid"]).toBeUndefined();
      const subjects = async (code: string) => (await q`select subject_id::int s from core.flags where flag_code=${code} order by subject_id`).map(r => r["s"]);
      // 96% and 99,99% of 270.120 lei; 95,9% and exactly the ceiling are not.
      expect(await subjects("da_round")).toEqual([101, 102]);
      // Above the ceiling: the two at authority 1 and three of authority 20's eleven (the 2020 one after the COVID window).
      expect(await subjects("da_above_ceiling")).toEqual([106, 107, 201, 202, 203]);
      const [above] = await q`select evidence from core.flags where flag_code='da_above_ceiling' and subject_id=201`;
      expect(above?.["evidence"]).toMatchObject({ closing: 400000, ceiling: 270120, ratio: 1.4808, works_ceiling: 900400 });
      // Firm 51 has 4 DAs with its institution, 52 only 245.000 lei, 53 sells 75% to it.
      expect(await subjects("da_dependence")).toEqual([50]);
      const [dependence] = await q`select evidence from core.flags where flag_code='da_dependence'`;
      expect(dependence?.["evidence"]).toMatchObject({ total: 600000, top_authority_pct: 1, top_authority: 60, top_authority_count: 20 });
      // 50% in December: flagged at a 'alta' institution (its kind's 95th percentile is 42,5%), not at a school
      // (59%: the other school has 60%); a lone hospital at 30% stays under the 35% floor.
      const yearEnd = await q`select subject_id::int s, period, evidence from core.flags where flag_code='da_year_end' order by subject_id`;
      expect(yearEnd.map(r => [r["s"], r["period"]])).toEqual([[70, "2024"], [80, "2024"]]);
      expect(yearEnd[0]!["evidence"]).toMatchObject({ kind: "scoala", december_pct: 0.6, peer_p95: 0.59, threshold: 0.59 });
      expect(yearEnd[1]!["evidence"]).toMatchObject({ kind: "alta", december_pct: 0.5, peer_p95: 0.425, threshold: 0.425 });
      expect(await subjects("da_split")).toEqual([]);
      expect(await subjects("da_concentration")).toEqual([]);

      await runFlagMarts(q, { transactions: false });
      const profiles = Object.fromEntries((await q`select entity_id::int e, role, score, score_raw, score_parts, cri::float8 cri, n_flags, flags
        from marts.entity_flags order by entity_id, role`).map(r => [`${r["e"]}:${r["role"]}`, r]));
      // Without the gate (20 DAs and 500.000 lei) each met criterion has strength 1: one gives 20, two 36.
      expect(profiles["1:authority"]).toMatchObject({ score: 36, cri: 0.36, n_flags: 2, flags: ["da_round", "da_above_ceiling"],
        score_parts: { da_round: { x: 1, n: 2, share: 0.2857 }, da_above_ceiling: { x: 1, n: 2, value: 1400000, share: 0.5692 } } });
      expect(profiles["1:authority"]!["score_raw"]).toBeCloseTo(36, 4);
      expect(profiles["20:authority"]).toMatchObject({ score: 20, cri: 0.2, n_flags: 1, flags: ["da_above_ceiling"],
        score_parts: { da_above_ceiling: { x: 1, n: 3, value: 1800000, share: 0.3371 } } });
      expect(profiles["70:authority"]).toMatchObject({ score: 20, flags: ["da_year_end"], score_parts: { da_year_end: { x: 1, years: [{ y: 2024, pct: 0.6 }] } } });
      expect(profiles["80:authority"]).toMatchObject({ score: 20, flags: ["da_year_end"] });
      // Gated (20 DAs, 600.000 lei): the firm holds 42,1% of its institution's DA value, strength 2 + (0,421 − 0,2) / 0,3.
      expect(profiles["50:supplier"]).toMatchObject({ score: 55, cri: 0.55, n_flags: 1, flags: ["da_dependence"],
        score_parts: { da_dependence: { x: 2.7368, share: 1, partnerShare: 0.4211, partnerId: "60" } } });
      expect(profiles["50:supplier"]!["score_raw"]).toBeCloseTo(54.7368, 3);
      const scored = ["1:authority", "20:authority", "50:supplier", "70:authority", "80:authority"];
      for (const [key, row] of Object.entries(profiles)) if (!scored.includes(key))
        expect([key, row["score"], row["score_raw"], row["cri"], row["n_flags"], row["flags"], row["score_parts"]]).toEqual([key, 0, 0, 0, 0, [], {}]);
      throw rollback;
    })).rejects.toBe(rollback);
    expect(await sql`select nspname from pg_namespace where nspname like ${`${prefix}_%`}`).toHaveLength(0);
  }, 30_000);
});

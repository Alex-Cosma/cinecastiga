import { afterAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { DA_CEILING_SEED_ROWS } from "@seap/domain";
import { runMarts } from "./marts.js";
import { runFlags } from "../flags/build.js";
import { runRadiografieMarts } from "../flags/radiografie.js";
import { buildTransactionMarts } from "./transaction-marts.js";

const { sql } = createDb();
afterAll(() => sql.end());

/** All qualified objects are redirected into isolated schemas inside a rollback.
 * Clones have no defaults, constraints or data: no shared sequence is advanced.
 * runMarts never receives the live connection or a live schema identifier.
 */
function isolatedSql(connection: DbSql, prefix: string): DbSql {
  const rewrite = (text: string) => text.replace(/\b(core|marts|reference|raw)\./g, `${prefix}_$1.`);
  const scoped = ((chunks: TemplateStringsArray, ...values: unknown[]) => {
    const mapped = chunks.map(rewrite);
    Object.defineProperty(mapped, "raw", { value: chunks.raw.map(rewrite) });
    return connection(mapped as unknown as TemplateStringsArray, ...values as never[]);
  }) as unknown as DbSql;
  Object.assign(scoped, {
    begin: (run: (q: DbSql) => Promise<unknown>) => (connection as unknown as {
      savepoint: (fn: (q: DbSql) => Promise<unknown>) => Promise<unknown>;
    }).savepoint((q) => run(isolatedSql(q, prefix))),
  });
  return scoped;
}

const tables = {
  core: ["risk_thresholds", "contracts", "awards", "contract_winners", "entities", "cpv_codes", "direct_acquisitions", "notices", "ted_lot_results", "ted_notices", "flags"],
  marts: ["national_stats", "spend_by_type", "spend_by_cpv", "spend_by_county", "entity_profile", "entity_top_partners", "top_entities", "authority_concentration", "contract_transactions", "contract_competition", "da_transactions"],
  reference: ["authority_uat", "company_financials", "company_reps"],
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
        expect([...new Set(contracts.map((r) => r["id"]))]).toEqual(["100", "101", "201", "202", "300"]);
        const [contractTotal] = await q`select sum(closing_value)::text value from marts.contract_transactions`;
        expect(Number(contractTotal?.["value"])).toBe(305);
        const [national] = await q`select total_ron::text value from marts.national_stats where kind='spend' and year is null`;
        expect(Number(national?.["value"])).toBe(455); //305 contracts +150 eligible DAs, including unknown parties.
        const [da] = await q`select n, total_ron::text value from marts.national_stats where kind='da' and year is null`;
        expect(da?.["n"]).toBe(5); expect(Number(da?.["value"])).toBe(150);
        const profiles = await q`select entity_id::text id, role, n_das, n_contracts, total_ron_split::text value
          from marts.entity_profile order by role, entity_id`;
        expect(profiles.find((r) => r["id"] === "1" && r["role"] === "authority")).toMatchObject({ n_das: 2, n_contracts: 5 });
        expect(Number(profiles.find((r) => r["id"] === "1" && r["role"] === "authority")?.["value"])).toBe(355);
        expect(Number(profiles.find((r) => r["id"] === "10" && r["role"] === "supplier")?.["value"])).toBe(308.33);
        const totals = await q`select 'type' kind, sum(total_ron)::text value from marts.spend_by_type where kind='all'
          union all select 'cpv',sum(total_ron)::text from marts.spend_by_cpv where kind='all'
          union all select role,sum(total_ron)::text from marts.spend_by_county group by role`;
        const byKind = Object.fromEntries(totals.map((r) => [String(r["kind"]),Number(r["value"])]));
        expect(byKind).toEqual({ type: 455, cpv: 455, authority: 365, supplier: 375 });
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
          { id: "1", suppliers: 3, top: 0.7949, hhi: 0.6528, total: 325 },
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
        await q`update core.entities set cui_canonical=id::text where id in (10,11,12)`;
        await q`insert into reference.company_financials (cui,year,employees,net_turnover)
          values ('10',2025,1,1000),('11',2025,1,1000),('12',2025,1,1000)`;
        await q`insert into reference.company_reps (cui,person_key,person_name,birth_date)
          values ('10','fixture-person','Shared representative','1980-01-01'),
            ('11','fixture-person','Shared representative','1980-01-01')`;
        await q`update core.direct_acquisitions set publication_date=finalization_date-interval '30 minutes'`;
        // The financial comparison must use each contract's year, not its notice publication year.
        await q`update core.awards set state_date='2024-01-01'`;
        const report = await runFlags(q);
        expect(report["da_rapid"]).toBe(5); // excludes refused/null/zero/negative/outlier records.
        const flags = await q`select flag_code,subject_id::text subject,evidence from core.flags`;
        const evidence = (code: string, subject: string) => flags.find((r) => r["flag_code"]===code && r["subject"]===subject)?.["evidence"] as Record<string,number>;
        expect(evidence("da_concentration","1")["total"]).toBe(20);
        expect(evidence("da_dependence","10")["total"]).toBe(30);
        expect(evidence("da_year_end","1")["total"]).toBe(50);
        expect(evidence("award_concentration","1")["total"]).toBe(305);
        expect(evidence("award_concentration","1")["top_winner_pct"]).toBe(0.7814);
        expect(evidence("award_dependence","10")["total"]).toBe(238.33);
        expect(evidence("fin_tiny_staff","10")).toMatchObject({ total: 308.33, year: 2025 });
        expect(evidence("fin_public_reliance","10")).toMatchObject({ public_total: 308.33, revenue_total: 1000, ratio: 0.3083 });
        expect(evidence("net_shared_admin","10")).toMatchObject({ combined: 291.66, n_firms: 2 });

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
        // Explicit call-off 60 stays ordinary; unknown-title 25 keeps the notice fallback,
        // and standalone framework 70 remains a ceiling.
        expect(Number(dependency?.["frame"])).toBe(95);
        expect(Number(dependency?.["plain"])).toBe(143.33);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    const schemas = await sql`select nspname from pg_namespace where nspname like ${`${prefix}_%`}`;
    expect(schemas).toHaveLength(0);
  }, 30_000);
});

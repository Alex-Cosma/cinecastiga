import { afterAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { runRows, runSpec } from "./compile";
import { evidenceCsv, sumDecimalStrings } from "./evidence";
import type { AskSpec } from "./spec";
import type { Grounding } from "./ground";

const testUrl = process.env["TEST_DATABASE_URL"];
if (testUrl && !/^seap_test_[a-z0-9_]+$/.test(new URL(testUrl).pathname.slice(1))) throw new Error("Population fixtures require a dedicated seap_test_* database");
const connection = testUrl ? createDb(testUrl) : null;
afterAll(async () => { await connection?.sql.end(); });

/** Qualified marts are rewritten into unique fixture tables; everything rolls back. */
function scoped(connection:DbSql, prefix:string): DbSql {
  const rewrite = (text:string) => text.replace(/\bmarts\./g, `${prefix}.`);
  const tag = ((chunks:TemplateStringsArray, ...values:unknown[]) => {
    const mapped = chunks.map(rewrite); Object.defineProperty(mapped,"raw",{ value:chunks.raw.map(rewrite) });
    return connection(mapped as unknown as TemplateStringsArray, ...values as never[]);
  }) as unknown as DbSql;
  Object.assign(tag, { array:connection.array.bind(connection), unsafe:(text:string) => connection.unsafe(rewrite(text)), begin:(first:unknown, second?:unknown) => (typeof first === "function" ? first : second as (db:DbSql)=>unknown)(tag) });
  return tag;
}

describe.runIf(Boolean(connection))("investigative population SQL (dedicated rollback fixture)", () => {
  it("reconciles nested conditions, exact fractions, >=N cohorts and scoped comparisons with source/export rows", async () => {
    const sql = connection!.sql, prefix = `population_fixture_${process.pid}_${Date.now()}`;
    const rollback = new Error("rollback population fixture");
    try {
      await sql.begin(async tx => {
        await tx.unsafe(`create schema ${prefix}`);
        for (const table of ["da_transactions", "contract_transactions", "national_stats", "entity_profile", "agg_top_entities"]) await tx.unsafe(`create table ${prefix}.${table} as table marts.${table} with no data`);
        const q = scoped(tx as unknown as DbSql, prefix);
        await q`insert into marts.national_stats (kind,year) values ('da',2024),('da',2025),('award',2025)`;
        await q`insert into marts.da_transactions (sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date) values
          (11,'DA11',1,'Authority A',10,'Supplier A','Cluj','45000000-7',10.10,'2025-01-01'),
          (12,'DA12',1,'Authority A',10,'Supplier A','Cluj','77310000-6',20.20,'2025-01-02'),
          (13,'DA13',2,'Authority B',10,'Supplier A','Cluj','45000000-7',30.30,'2025-01-02'),
          (14,'DA14',2,'Authority B',11,'Supplier B','Cluj','45000000-7',40.40,'2025-02-01'),
          (15,'DA15',1,'Authority A',11,'Supplier B','Cluj','45000000-7',50.50,'2024-01-02'),
          (16,'DA16',1,'Authority A',null,null,'Cluj',null,60.60,'2025-01-02')`;
        await q`insert into marts.contract_transactions (contract_id,contract_no,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date,ca_notice_id,n_winners,contract_value_full) values
          (21,'CT21',1,'Authority A',10,'Supplier A','Cluj','45000000-7',0.0033,'2025-01-02',999,3,0.01),
          (21,'CT21',1,'Authority A',11,'Supplier B','Cluj','45000000-7',0.0033,'2025-01-02',999,3,0.01),
          (21,'CT21',1,'Authority A',12,'Supplier C','Cluj','45000000-7',0.0034,'2025-01-02',999,3,0.01)`;
        const base:AskSpec = { block:"stat", measure:"value", filters:{ yearFrom:2025, yearTo:2025 } };
        const nested:AskSpec = { ...base, population:{ operator:"or", groups:[
          { operator:"and", conditions:[{ field:"date", op:"gte", value:"2025-01-01" },{ field:"date", op:"lte", value:"2025-01-31" },{ field:"cpv", op:"in", values:["45"] }] },
          { operator:"and", conditions:[{ field:"authority", op:"in", values:["1"] },{ field:"cpv", op:"in", values:["7731"] }] },
        ] } };
        const aggregate = await runSpec(q,nested,{}), sources = await runRows(q,nested,{},0,{ limit:100 });
        expect(aggregate).toMatchObject({ data:{ stat:{ value:60.61, count:6 } } });
        expect(sources).toMatchObject({ total:6, sourceTotal:6, sourceValue:"60.6100" });
        if ("error" in sources) throw new Error(sources.error);
        expect(sumDecimalStrings(sources.rows.map(r => r.valueExact))).toBe("60.6100");
        const csv = evidenceCsv(sources.rows);
        expect(csv).toContain("0.0033"); expect(csv).toContain("notices/ca-notices/view-c/999");
        const fractional:AskSpec = { ...base, population:{ operator:"and", groups:[{ operator:"and", conditions:[{ field:"value", op:"lte", value:"0.0033" }] }] } };
        expect(await runRows(q,fractional,{},0)).toMatchObject({ total:2, sourceValue:"0.0066" });
        const exclude:AskSpec = { ...base, population:{ operator:"and", groups:[{ operator:"and", conditions:[{ field:"cpv", op:"not_in", values:["45"] }] }] } };
        expect(await runRows(q,exclude,{},0)).toMatchObject({ total:2, sourceValue:"80.80" });
        const minimum:AskSpec = { ...base, minimumRecords:{ role:"supplier", count:2 } };
        expect(await runSpec(q,minimum,{})).toMatchObject({ data:{ stat:{ count:6 } } });
        expect(await runRows(q,minimum,{},0)).toMatchObject({ total:6, sourceValue:"101.0066" });
        expect(await runRows(q,minimum,{},0,{ scope:{ role:"authority", entityIds:["1"] } })).toMatchObject({ total:4, sourceValue:"30.3066" });
        const grounding:Grounding = { authority:{ entityId:"1",nameDisplay:"Authority A",query:"A",county:"Cluj",alternatives:[] }, compare:{ entityId:"2",nameDisplay:"Authority B",query:"B",county:"Cluj",alternatives:[] } };
        const compare:AskSpec = { ...base, block:"compare", comparisonMode:"transactions", filters:{ ...base.filters,authorityId:1,compareWithId:2 } };
        expect(await runSpec(q,compare,grounding)).toMatchObject({ data:{ entities:[{ entityId:"1",value:90.91,count:6,cri:null },{ entityId:"2",value:70.7,count:2,cri:null }] } });
        expect(await runRows(q,compare,grounding,0)).toMatchObject({ profile:false,total:8,sourceValue:"161.6100" });
        expect(await runRows(q,compare,grounding,0,{ scope:{ role:"authority",entityIds:["2"] } })).toMatchObject({ profile:false,total:2,sourceValue:"70.70" });
        // A contract above the DA plausibility ceiling must count in full. It
        // changes the winning authority despite having fewer than 20 records.
        await q`insert into marts.contract_transactions (contract_id,contract_no,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date,ca_notice_id,n_winners,contract_value_full)
          values (22,'CT22',2,'Authority B',12,'Supplier C','Cluj','45000000-7',3000000,'2025-02-02',1000,1,3000000)`;
        await q`insert into marts.da_transactions (sicap_da_id,authority_id,supplier_id,closing_value,finalization_date)
          values (17,1,10,4000000,'2025-01-03')`;
        const leader:AskSpec = { ...base, block:"entity_card", dim:"authority", rankBy:"value" };
        expect(await runSpec(q,leader,{})).toMatchObject({ data:{ block:"entity_card", card:{ entityId:"2", value:3000070.7, count:3, cri:null } } });
        const evidence = await runRows(q,leader,{},0,{ limit:100 });
        expect(evidence).toMatchObject({ profile:false, total:3, sourceTotal:3, sourceValue:"3000070.70" });
        if ("error" in evidence) throw new Error(evidence.error);
        expect(sumDecimalStrings(evidence.rows.map(row=>row.valueExact))).toBe("3000070.70");
        expect(new Set(evidence.rows.map(row=>row.src))).toEqual(new Set(["da","contracts"]));
        expect(await runRows(q,leader,{},0,{ scope:{role:"authority",entityIds:["1"]} })).toMatchObject({total:0});
        expect(await runRows(q,leader,{},0,{ stream:"da" })).toMatchObject({ total:2, sourceTotal:3, value:"70.70" });
        expect(await runSpec(q,{ ...leader, dataset:"da" },{})).toMatchObject({data:{card:{entityId:"1",value:90.9,count:3}}});
        expect(await runSpec(q,{ ...leader, dataset:"contracts" },{})).toMatchObject({data:{card:{entityId:"2",value:3000000,count:1}}});
        expect(await runSpec(q,{ ...leader, dim:"supplier" },{})).toMatchObject({data:{card:{entityId:"12",value:3000000.0034,count:2}}});
        const supplierEvidence = await runRows(q,{ ...leader, dim:"supplier" },{},0);
        expect(supplierEvidence).toMatchObject({sourceValue:"3000000.0034",total:2});
        const january:AskSpec = { ...leader, filters:{...leader.filters,monthFrom:1,monthTo:1}, minimumRecords:{role:"supplier",count:2} };
        expect(await runSpec(q,january,{})).toMatchObject({data:{card:{entityId:"1",value:30.3033,count:3}}});
        expect(await runRows(q,january,{},0)).toMatchObject({sourceValue:"30.3033",total:3});
        const cpvLeader:AskSpec = { ...leader, filters:{...leader.filters,cpvTerm:"7731"} };
        const cpvGround:Grounding = {cpv:{term:"7731",prefixes:["7731"],matchedNames:[],method:"code"}};
        expect(await runSpec(q,cpvLeader,cpvGround)).toMatchObject({data:{card:{entityId:"1",value:20.2,count:1}}});
        expect(await runRows(q,cpvLeader,cpvGround,0)).toMatchObject({sourceValue:"20.20",total:1});
        // The all-years fast path uses the same combined-stream aggregate as top-1.
        await q`insert into marts.agg_top_entities (role,eid,nm,county,v_plaf,n_plaf,v_all,n_all) values
          ('authority',2,'Authority B','Cluj',3000070.70,3,3000070.70,3)`;
        expect(await runSpec(q,{...leader,filters:{}},{})).toMatchObject({data:{card:{entityId:"2",value:3000070.7,count:3}}});
        expect(await runRows(q,{...leader,filters:{}},{},0)).toMatchObject({sourceValue:"3000070.70",total:3});
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    expect(await sql`select nspname from pg_namespace where nspname=${prefix}`).toHaveLength(0);
  },30000);
});

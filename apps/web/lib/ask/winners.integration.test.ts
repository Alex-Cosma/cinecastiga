import { afterAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { runRows, runSpec } from "./compile";
import { sumDecimalStrings } from "./evidence";
import { facetCounts, locate, rowFacts } from "./facets";
import type { Grounding } from "./ground";
import { forgetMartColumns } from "./mart-columns";
import type { AskSpec } from "./spec";
import { scoped, testDatabaseUrl } from "./test-fixture";

/*
 * F5, the ranked winners (plan §4.2, §6.2; final table §3.3, §3.6, §3.7): on a
 * ranking the list narrows and the totals stay the whole selection's; the
 * list's sources (and their CSV) are its firms' records; the window's number
 * is the list after the click; the whole archive's institutions read from
 * entity_top_partners equal the live grouping over every year; "Unde e o
 * firmă?" places a name in the narrowed list. A dedicated seap_test_*
 * database, one transaction rolled back.
 */

const testUrl = testDatabaseUrl("F5 ranked winners fixtures");
const connection = testUrl ? createDb(testUrl) : null;
afterAll(async () => { forgetMartColumns(); await connection?.sql.end(); });

type Engine = Awaited<ReturnType<typeof runSpec>>;
const table = (r: Engine) => {
  if ("error" in r) throw new Error(r.error);
  if (r.data.block !== "table") throw new Error(r.data.block);
  return r.data;
};
const Y = { yearFrom: 2024, yearTo: 2025 };
const buyer: Grounding = { authority: { query: "1", entityId: "1", nameDisplay: "Primaria Exemplu", county: "Cluj", alternatives: [] } };

/**
 * Institutions 1 (a town hall) and 3 (a school). Firms: 10 registered 2024, first here 02.10.2024, no employees
 * (filing 2024); 11 registered 2010, first in 2019; 12 foreign, first in 2025; 13 registered 2025, first in 2025.
 * The town hall is 10's and 11's main public client (83% and 99%, from 3 records or more); 10 takes 86% of the
 * school's 2025 value from 3 records.
 */
async function load(q: DbSql) {
  await q`insert into marts.national_stats (kind,year) values ('da',2019),('da',2024),('da',2025),('award',2024),('award',2025)`;
  // The buyers' county grounds a county (ground.ts).
  await q`insert into marts.spend_by_county (county, role, n, total_ron) values ('Cluj','authority',2,0)`;
  await q`insert into marts.entity_profile (entity_id,role,name_display,county,is_foreign,seat_county,seat_source,registered_year,employees,employees_year,first_activity,n_das,n_contracts,total_ron_split) values
    (1,'authority','Primaria Exemplu','Cluj',false,null,null,null,null,null,'2019-05-01',7,0,1080),
    (3,'authority','Scoala Exemplu','Cluj',false,null,null,null,null,null,'2025-01-01',4,0,35),
    (10,'supplier','Noua Constructii SRL','Cluj',false,'Cluj','onrc',2024,0,2024,'2024-10-02 10:00:00+03',5,0,180),
    (11,'supplier','Veche Servicii SRL','Cluj',false,'Cluj','onrc',2010,12,2025,'2019-05-01 10:00:00+03',3,0,505),
    (12,'supplier','Straina GmbH','NA',true,null,'foreign',null,null,null,'2025-06-01 10:00:00+03',1,0,400),
    (13,'supplier','Proaspata SRL','Cluj',false,'Cluj','onrc',2025,3,2025,'2025-08-01 10:00:00+03',1,0,30)`;
  await q`insert into marts.da_transactions (sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date) values
    (301,'DA301',1,'Primaria Exemplu',10,'Noua Constructii SRL','Cluj','45000000-7',100,'2024-10-02'),
    (302,'DA302',1,'Primaria Exemplu',10,'Noua Constructii SRL','Cluj','45000000-7',50,'2025-03-01'),
    (303,'DA303',1,'Primaria Exemplu',11,'Veche Servicii SRL','Cluj','79000000-4',300,'2019-05-01'),
    (304,'DA304',1,'Primaria Exemplu',11,'Veche Servicii SRL','Cluj','79000000-4',200,'2025-02-01'),
    (305,'DA305',1,'Primaria Exemplu',12,'Straina GmbH','Cluj','33600000-6',400,'2025-06-01'),
    (306,'DA306',1,'Primaria Exemplu',13,'Proaspata SRL','Cluj','33600000-6',30,'2025-08-01'),
    (307,'DA307',3,'Scoala Exemplu',10,'Noua Constructii SRL','Cluj','15000000-8',10,'2025-01-01'),
    (308,'DA308',3,'Scoala Exemplu',10,'Noua Constructii SRL','Cluj','15000000-8',10,'2025-02-01'),
    (309,'DA309',3,'Scoala Exemplu',10,'Noua Constructii SRL','Cluj','15000000-8',10,'2025-03-01'),
    (310,'DA310',3,'Scoala Exemplu',11,'Veche Servicii SRL','Cluj','15000000-8',5,'2025-04-01')`;
  // The whole archive's partners as the marts build ranks them (by value; its ties are broken again by the engine).
  await q`insert into marts.entity_top_partners (entity_id,role,partner_entity_id,rank,n,total_ron) values
    (1,'authority',11,1,2,500),(1,'authority',12,2,1,400),(1,'authority',10,3,2,150),(1,'authority',13,4,1,30),
    (3,'authority',10,1,3,30),(3,'authority',11,2,1,5)`;
  forgetMartColumns();
}

async function inFixture(label: string, work: (q: DbSql) => Promise<void>) {
  const sql = connection!.sql, prefix = `${label}_${process.pid}_${Date.now()}`;
  const rollback = new Error(`rollback ${label}`);
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(`create schema ${prefix}`);
      for (const t of ["da_transactions", "contract_transactions", "national_stats", "entity_profile", "entity_top_partners", "agg_top_entities", "agg_national", "agg_map_county", "spend_by_county"])
        await tx.unsafe(`create table ${prefix}.${t} as table marts.${t} with no data`);
      await tx.unsafe(`create table ${prefix}.entity_flags (like marts.entity_flags including all)`);
      const q = scoped(tx as unknown as DbSql, prefix);
      await load(q);
      await work(q);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  forgetMartColumns();
  expect(await sql`select nspname from pg_namespace where nspname=${prefix}`).toHaveLength(0);
}

/** The list, its totals and its sources: the sources are the list's firms' records, to the leu. */
async function listed(q: DbSql, spec: AskSpec, grounding: Grounding = {}) {
  const answer = table(await runSpec(q, spec, grounding));
  const rows = await runRows(q, spec, grounding, 0, { limit: 100 });
  if ("error" in rows) throw new Error(rows.error);
  return {
    ids: answer.rows.map((r) => r.entityId), totals: answer.totals, group: answer.group,
    sources: [Number(rows.sourceValue), rows.sourceTotal, Number(sumDecimalStrings(rows.rows.map((r) => r.valueExact)))],
  };
}

describe.runIf(Boolean(connection))("F5: the ranked winners (dedicated rollback fixture)", () => {
  it("narrows a ranking of firms to new ones in three senses and to its buyer's main ones; the totals stay the selection's", async () => {
    await inFixture("f5_firms", async (q) => {
      const firms = (filters: AskSpec["filters"]): AskSpec => ({ block: "table", dim: "supplier", measure: "value", topN: 10, filters: { authorityId: 1, ...Y, ...filters } });
      const all = await listed(q, firms({}), buyer);
      expect([all.ids, all.totals]).toEqual([["12", "11", "10", "13"], { value: 780, count: 5, entities: 4 }]);
      const cases: [string, AskSpec["filters"], string[], number, number][] = [
        // First here from 2024: 10 (02.10.2024), 12 and 13 (2025); 11 sold here in 2019.
        ["new for the buyer, 2024", { newSince: 2024, newScope: "buyer" }, ["12", "10", "13"], 580, 4],
        ["new for the buyer, 2025", { newSince: 2025, newScope: "buyer" }, ["12", "13"], 430, 2],
        ["first in our data, 2025", { newSince: 2025, newScope: "archive" }, ["12", "13"], 430, 2],
        ["registered from 2024", { newSince: 2024, newScope: "registry" }, ["10", "13"], 180, 3],
        ["main public client", { mainClient: true }, ["11", "10"], 350, 3],
        ["new for the buyer and main client", { newSince: 2024, newScope: "buyer", mainClient: true }, ["10"], 150, 2],
      ];
      for (const [name, filters, ids, value, count] of cases) {
        const r = await listed(q, firms(filters), buyer);
        expect([name, r.ids, r.totals, r.group]).toEqual([name, ids, all.totals, { value, count, entities: ids.length }]);
        expect([name, ...r.sources]).toEqual([name, value, count, value]);
      }
    });
  }, 60000);

  it("reads a firm's own year from its profile over every year as the live grouping does", async () => {
    await inFixture("f5_profile", async (q) => {
      const every = (dataset?: "da"): AskSpec => ({ block: "table", dim: "supplier", measure: "value", topN: 10, ...(dataset ? { dataset } : {}), filters: { newSince: 2025, newScope: "archive" } });
      // Every year, both channels: entity_profile (firmSizeOnly); the direct acquisitions alone: the live grouping (the fixture has no contract).
      const fast = table(await runSpec(q, every(), {})), live = table(await runSpec(q, every("da"), {}));
      expect(fast.rows.map((r) => [r.entityId, r.value])).toEqual([["12", 400], ["13", 30]]);
      expect(live.rows.map((r) => [r.entityId, r.value])).toEqual(fast.rows.map((r) => [r.entityId, r.value]));
      expect([fast.group, live.group]).toEqual([{ value: 430, count: 2, entities: 2 }, { value: 430, count: 2, entities: 2 }]);
      // "Unde e o firmă?" places a name in the narrowed list, without filtering it.
      const found = await locate(q, every(), "proaspata");
      if (!("matches" in found)) throw new Error(JSON.stringify(found));
      expect([found.total, found.matches.map((m) => [m.id, m.rank])]).toEqual([2, [["13", 2]]]);
      const outside = await locate(q, every(), "veche");
      if (!("matches" in outside)) throw new Error(JSON.stringify(outside));
      // A name outside the list is not placed (the profiles' path reads the list's firms only).
      expect(outside.matches).toEqual([]);
    });
  }, 60000);

  it("keeps the institutions one firm takes half of, from the whole archive's partners as from the live grouping", async () => {
    await inFixture("f5_dominant", async (q) => {
      const institutions = (filters: AskSpec["filters"]): AskSpec => ({ block: "table", dim: "authority", measure: "value", topN: 10, filters: { dominantSupplier: true, ...filters } });
      // 2025: the school (10 has 30 of 35 from 3 records); the town hall's largest firm (12, 400 of 680) has 1 record.
      const year = await listed(q, institutions({ yearFrom: 2025, yearTo: 2025 }));
      expect([year.ids, year.totals, year.group, year.sources]).toEqual([["3"], { value: 715, count: 8, entities: 2 }, { value: 35, count: 4, entities: 1 }, [35, 4, 35]]);
      // Every year from entity_top_partners (wholeArchive) and over 2018–2026 live: the same institutions and sums.
      const whole = await listed(q, institutions({})), span = await listed(q, institutions({ yearFrom: 2018, yearTo: 2026 }));
      expect([whole.ids, whole.group]).toEqual([["3"], { value: 35, count: 4, entities: 1 }]);
      expect([span.ids, span.group]).toEqual([whole.ids, whole.group]);
      // The window's number is the list after the click, its share of the selection's value.
      // A county anchors the count (nationally, without the rollups, it waits on the marts stage: ENTITY_LIVE).
      const counts = await facetCounts(q, institutions({ county: "Cluj", yearFrom: 2025, yearTo: 2025 }), "winners");
      if (!("options" in counts)) throw new Error(JSON.stringify(counts));
      expect(counts.options).toEqual([{ value: "dominant", n: 1, value_ron: 35, share: 35 / 715 }]);
      // A row's fact: its largest firm in the selection.
      const facts = await rowFacts(q, institutions({ yearFrom: 2025, yearTo: 2025 }), ["1", "3"]);
      if (!("facts" in facts)) throw new Error(JSON.stringify(facts));
      expect(facts.facts).toEqual({
        "1": { top: { id: "12", name: "Straina GmbH", value: 400, count: 1, share: 400 / 680 } },
        "3": { top: { id: "10", name: "Noua Constructii SRL", value: 30, count: 3, share: 30 / 35 } },
      });
    });
  }, 60000);

  it("counts each sense of „Firme noi” as its click would list it, and selects the sellers' year on institutions", async () => {
    await inFixture("f5_counts", async (q) => {
      const firms: AskSpec = { block: "table", dim: "supplier", measure: "value", topN: 10, filters: { county: "Cluj", yearFrom: 2025, yearTo: 2025 } };
      const counts = await facetCounts(q, firms, "winners");
      if (!("options" in counts)) throw new Error(JSON.stringify(counts));
      const option = (value: string) => counts.options.find((o) => o.value === value);
      expect([option("registry:2024")?.n, option("registry:2024")?.value_ron, option("archive:2025")?.n, option("archive:2025")?.value_ron]).toEqual([2, 110, 2, 430]);
      const clicked = table(await runSpec(q, { ...firms, filters: { ...firms.filters, newSince: 2024, newScope: "registry" } }, { county: { query: "Cluj", canonical: "Cluj" } }));
      expect([clicked.group?.entities, clicked.group?.value]).toEqual([2, 110]);
      // On institutions the firms' year selects their records: the total is theirs (10 and 13 in 2025).
      const sellers = await listed(q, { block: "table", dim: "authority", measure: "value", topN: 10, filters: { yearFrom: 2025, yearTo: 2025, newSince: 2024, newScope: "registry" } });
      expect([sellers.ids, sellers.totals, sellers.sources]).toEqual([["1", "3"], { value: 110, count: 5, entities: 2 }, [110, 5, 110]]);
    });
  }, 60000);
});

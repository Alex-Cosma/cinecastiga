import { afterAll, describe, expect, it } from "vitest";
import { createDb, SEAT_ABROAD_LABEL, type DbSql } from "@seap/db";
import { runRows, runSpec, seatNote } from "./compile";
import { evidenceCsv, sumDecimalStrings } from "./evidence";
import { facetCounts } from "./facets";
import { retarget } from "./filters/retarget";
import type { Grounding } from "./ground";
import { forgetMartColumns } from "./mart-columns";
import type { AskSpec } from "./spec";
import { scoped, testDatabaseUrl } from "./test-fixture";

/*
 * F4, the firm's seat (plan §2.5, §4.2, §4.13, §6.2; owner-seat-switch): one
 * column (entity_profile.seat_county, ONRC then SEAP; foreign apart), two
 * keys. The answer, its sources and their CSV select the same records; the
 * classes against the buyer's county and the unknown rest add up to the
 * total; "Cine conduce?" by value crowns the first firm of the ranking with
 * the same seat ("Tot clasamentul ›" keeps the condition); the "Județ" beside
 * a firm, a cloud's point and a trend row is its seat; before the marts build
 * fills the column, the SEAP county stands in, and the note says it. A
 * dedicated seap_test_* database, one transaction rolled back.
 */

const testUrl = testDatabaseUrl("F4 seat fixtures");
const connection = testUrl ? createDb(testUrl) : null;
afterAll(async () => { forgetMartColumns(); await connection?.sql.end(); });

type Engine = Awaited<ReturnType<typeof runSpec>>;
const data = (r: Engine) => { if ("error" in r) throw new Error(r.error); return r.data; };
const stat = (r: Engine) => { const d = data(r); if (d.block !== "stat") throw new Error(d.block); return d.stat; };
const table = (r: Engine) => { const d = data(r); if (d.block !== "table") throw new Error(d.block); return d; };
const sources = async (q: DbSql, spec: AskSpec, grounding: Grounding = {}) => {
  const r = await runRows(q, spec, grounding, 0, { limit: 100 });
  if ("error" in r) throw new Error(r.error);
  return r;
};
const seated = (county: string): Grounding => ({ seatCounty: { query: county, canonical: county } });
const Y = { yearFrom: 2024, yearTo: 2025 };

/**
 * Institutions 1 (Cluj) and 2 (Ilfov). Firms: 10 in Cluj; 11 Cluj in SEAP, Ilfov in ONRC (moved); 12 without a
 * SEAP county, București in ONRC; 13 foreign (its SEAP "county" NA); 14 without a seat. A record without a firm.
 */
async function load(q: DbSql, seat: boolean) {
  await q`insert into marts.national_stats (kind,year) values ('da',2024),('da',2025),('award',2024),('award',2025)`;
  // The institutions' counties ground a county (ground.ts); the firms' rows hold their seats since F4.
  await q`insert into marts.spend_by_county (county, role, n, total_ron) values ('Cluj','authority',1,0),('Ilfov','authority',1,0),('Ilfov','supplier',1,0)`;
  await q`insert into marts.entity_profile (entity_id,role,name_display,county,is_foreign,seat_county,seat_source,n_das,n_contracts,total_ron_split) values
    (1,'authority','Authority Cluj','Cluj',false,null,null,0,0,0), (2,'authority','Authority Ilfov','Ilfov',false,null,null,0,0,0),
    (10,'supplier','Local SRL','Cluj',false,${seat ? "Cluj" : null},${seat ? "onrc" : null},2,0,150),
    (11,'supplier','Mutata SRL','Cluj',false,${seat ? "Ilfov" : null},${seat ? "onrc" : null},2,0,270),
    (12,'supplier','Capitala SRL',null,false,${seat ? "Bucuresti" : null},${seat ? "onrc" : null},1,1,1300),
    (13,'supplier','Straina GmbH','NA',true,null,${seat ? "foreign" : null},1,0,400),
    (14,'supplier','Fara Sediu SRL',null,false,null,null,1,0,30)`;
  await q`insert into marts.da_transactions (sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date) values
    (101,'DA101',1,'Authority Cluj',10,'Local SRL','Cluj','33600000-6',100,'2025-01-10'),
    (102,'DA102',2,'Authority Ilfov',10,'Local SRL','Ilfov','33600000-6',50,'2025-02-10'),
    (103,'DA103',1,'Authority Cluj',11,'Mutata SRL','Cluj','45000000-7',200,'2024-03-10'),
    (104,'DA104',2,'Authority Ilfov',11,'Mutata SRL','Ilfov','45000000-7',70,'2025-04-10'),
    (105,'DA105',1,'Authority Cluj',12,'Capitala SRL','Cluj','79000000-4',300,'2025-05-10'),
    (106,'DA106',1,'Authority Cluj',13,'Straina GmbH','Cluj','33600000-6',400,'2025-06-10'),
    (107,'DA107',1,'Authority Cluj',14,'Fara Sediu SRL','Cluj','33600000-6',30,'2025-07-10'),
    (108,'DA108',1,'Authority Cluj',null,null,'Cluj','33600000-6',5,'2025-08-10')`;
  await q`insert into marts.contract_transactions (contract_id,contract_no,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date,ca_notice_id,n_winners,contract_value_full,procedure_type) values
    (201,'CT201',2,'Authority Ilfov',12,'Capitala SRL','Ilfov','45000000-7',1000,'2025-09-10',901,1,1000,'Licitatie deschisa')`;
  // The flags of the firms with enough direct acquisitions: the cloud and „Cine conduce?” on the index.
  await q`insert into marts.entity_flags (entity_id,role,name_display,county,n_das,total_ron,cri,n_flags,flags) values
    (10,'supplier','Local SRL','Cluj',25,150,0.5,1,'[]'), (11,'supplier','Mutata SRL','Cluj',25,270,0.75,2,'[]'), (12,'supplier','Capitala SRL',null,25,1300,0.25,1,'[]')`;
  forgetMartColumns();
}

async function inFixture(label: string, seat: boolean, work: (q: DbSql) => Promise<void>) {
  const sql = connection!.sql, prefix = `${label}_${process.pid}_${Date.now()}`;
  const rollback = new Error(`rollback ${label}`);
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(`create schema ${prefix}`);
      // agg_map_county too: the column probe (mart-columns.ts) reads whether its seat split is built.
      for (const t of ["da_transactions", "contract_transactions", "national_stats", "entity_profile", "agg_top_entities", "agg_national", "agg_map_county", "spend_by_county"])
        await tx.unsafe(`create table ${prefix}.${t} as table marts.${t} with no data`);
      await tx.unsafe(`create table ${prefix}.entity_flags (like marts.entity_flags including all)`);
      const q = scoped(tx as unknown as DbSql, prefix);
      await load(q, seat);
      await work(q);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  forgetMartColumns();
  expect(await sql`select nspname from pg_namespace where nspname=${prefix}`).toHaveLength(0);
}

describe.runIf(Boolean(connection))("F4: the firm's seat (dedicated rollback fixture)", () => {
  it("selects the same records in the answer, its sources and their CSV, and its classes add up to the total", async () => {
    await inFixture("f4_seat", true, async (q) => {
      const all: AskSpec = { block: "stat", measure: "value", filters: Y };
      const total = stat(await runSpec(q, all, {}));
      expect([total.value, total.count]).toEqual([2155, 9]);
      const cases: [string, AskSpec, Grounding, number, number][] = [
        // The record's firm against the record's buyer county: 10 in Cluj, 11 (now Ilfov) in Ilfov.
        ["same", { ...all, filters: { ...Y, firmSeat: "same" } }, {}, 170, 2],
        // 10 in Ilfov, 11 in Cluj (its SEAP county: "same" before F4), 12 everywhere (București).
        ["other", { ...all, filters: { ...Y, firmSeat: "other" } }, {}, 1550, 4],
        ["abroad", { ...all, filters: { ...Y, firmSeat: "abroad" } }, {}, 400, 1],
        // The firm's own county: every record of 11, wherever its buyer.
        ["seated in Ilfov", { ...all, filters: { ...Y, seatCounty: "Ilfov" } }, seated("Ilfov"), 270, 2],
        ["seated in București, in Ilfov", { ...all, filters: { ...Y, county: "Ilfov", seatCounty: "Bucuresti" } }, { ...seated("Bucuresti"), county: { query: "Ilfov", canonical: "Ilfov" } }, 1000, 1],
      ];
      for (const [name, spec, grounding, value, count] of cases) {
        const answer = await runSpec(q, spec, grounding);
        expect([name, stat(answer).value, stat(answer).count]).toEqual([name, value, count]);
        if ("error" in answer) throw new Error(answer.error);
        expect(answer.caveats).toContain(seatNote(true));
        const rows = await sources(q, spec, grounding);
        expect([name, Number(rows.sourceValue), rows.sourceTotal]).toEqual([name, value, count]);
        expect([name, Number(sumDecimalStrings(rows.rows.map((r) => r.valueExact)))]).toEqual([name, value]);
        expect(evidenceCsv(rows.rows).trim().split("\n")).toHaveLength(count + 1);
        expect(rows.scopeNotes).toContain(seatNote(true));
      }
      // The rest (a seat or a buyer county nobody knows, a record without a firm) is in no option: 30 + 5.
      expect(170 + 1550 + 400 + 35).toBe(total.value);
    });
  }, 60000);

  it("shows a firm's seat beside it, and „Cine conduce?” crowns the ranking's first firm with the same seat", async () => {
    await inFixture("f4_seat_rows", true, async (q) => {
      const firms: AskSpec = { block: "table", dim: "supplier", measure: "value", topN: 10, filters: Y };
      const ranked = table(await runSpec(q, firms, {}));
      // The seat, never the buyers' county: 11 in Ilfov (SEAP said Cluj), 12 in București (SEAP said nothing), 13 apart.
      expect(ranked.rows.map((r) => [r.entityId, r.county])).toEqual([["12", "Bucuresti"], ["13", SEAT_ABROAD_LABEL], ["11", "Ilfov"], ["10", "Cluj"], ["14", null]]);
      // Paged and sorted by county, the same seat.
      const { topN: _top, ...whole } = firms;
      const byCounty = table(await runSpec(q, whole, {}, { sort: "county", dir: "asc" }));
      expect(byCounty.rows.map((r) => r.county)).toEqual([null, "Bucuresti", "Cluj", "Ilfov", SEAT_ABROAD_LABEL]);
      // A seat selects firms (seatCounty: their own county), as the total line says.
      const leader: AskSpec = { block: "entity_card", dim: "supplier", rankBy: "value", measure: "value", filters: { ...Y, seatCounty: "Ilfov" } };
      const card = data(await runSpec(q, leader, seated("Ilfov")));
      if (card.block !== "entity_card") throw new Error(card.block);
      const ranking = table(await runSpec(q, { ...retarget(leader, "table"), topN: 10 }, seated("Ilfov")));
      expect(retarget(leader, "table").filters).toEqual(leader.filters);
      expect([card.card.entityId, card.card.value, card.card.county]).toEqual([ranking.rows[0]!.entityId, ranking.rows[0]!.value, "Ilfov"]);
      expect(ranking.rows.map((r) => [r.entityId, r.value])).toEqual([["11", 270]]);
      // The cloud of firms: a seat selects their profiles; a link's county is that seat; each point says its seat.
      const cloud = (filters: AskSpec["filters"], g: Grounding = {}) => {
        return runSpec(q, { block: "scatter", dim: "supplier", measure: "value", filters }, g).then((r) => {
          const d = data(r);
          if (d.block !== "scatter") throw new Error(d.block);
          return d.points.map((p) => [p.entityId, p.county]).sort();
        });
      };
      expect(await cloud({})).toEqual([["10", "Cluj"], ["11", "Ilfov"], ["12", "Bucuresti"]]);
      expect(await cloud({ seatCounty: "Ilfov" }, seated("Ilfov"))).toEqual([["11", "Ilfov"]]);
      // Before F4 the profile's county (SEAP) put 11 in Cluj; its seat is Ilfov.
      expect(await cloud({ county: "Cluj" }, { county: { query: "Cluj", canonical: "Cluj" } })).toEqual([["10", "Cluj"]]);
    });
  }, 60000);

  it("counts the seat window's classes as the answer selects them, and the counties of their own", async () => {
    await inFixture("f4_seat_counts", true, async (q) => {
      // The window counts without its own key (R5); each class's value is the answer after choosing it. A county anchors
      // the selection (nationally the records' classes wait on the rollups, as the other entity counts: ENTITY_LIVE).
      const cluj = { ...Y, county: "Cluj" };
      const ranking = (filters: AskSpec["filters"]): AskSpec => ({ block: "table", dim: "supplier", measure: "value", filters });
      const counts = await facetCounts(q, ranking({ ...cluj, firmSeat: "other" }), "seat");
      if (!("options" in counts)) throw new Error(JSON.stringify(counts));
      expect(counts.options.map((o) => [o.value, o.n, o.value_ron])).toEqual([["other", 2, 500], ["abroad", 1, 400], ["same", 1, 100]]);
      expect(counts.rest).toMatchObject({ label: "Sediu necunoscut", n: 1, value_ron: 30 });
      const clujGrounding: Grounding = { county: { query: "Cluj", canonical: "Cluj" } };
      for (const o of counts.options) {
        const chosen = table(await runSpec(q, ranking({ ...cluj, firmSeat: o.value as "same" }), clujGrounding));
        expect([o.value, chosen.total, chosen.totals?.value]).toEqual([o.value, o.n, o.value_ron]);
      }
      // „Cine conduce?” by value over every record: the firms of each county of their seat (their profiles), and abroad.
      const own = await facetCounts(q, { block: "entity_card", dim: "supplier", rankBy: "value", measure: "value", filters: {} }, "seat");
      if (!("options" in own)) throw new Error(JSON.stringify(own));
      expect(own.options.map((o) => [o.value, o.n, o.value_ron])).toEqual([["București", 1, 1300], ["abroad", 1, 400], ["Ilfov", 1, 270], ["Cluj", 1, 150]]);
    });
  }, 60000);

  it("stands in the SEAP county before the marts build fills the seat, and says so", async () => {
    await inFixture("f4_seat_fallback", false, async (q) => {
      const same: AskSpec = { block: "stat", measure: "value", filters: { ...Y, firmSeat: "same" } };
      const answer = await runSpec(q, same, {});
      // 11's SEAP county is Cluj: its Cluj record is in its county; 12 has no county; 13 is foreign by its mark.
      expect([stat(answer).value, stat(answer).count]).toEqual([300, 2]);
      if ("error" in answer) throw new Error(answer.error);
      expect(answer.caveats).toContain(seatNote(false));
      expect(Number((await sources(q, same)).sourceValue)).toBe(300);
      expect(stat(await runSpec(q, { ...same, filters: { ...Y, firmSeat: "abroad" } }, {})).value).toBe(400);
      const ranked = table(await runSpec(q, { block: "table", dim: "supplier", measure: "value", topN: 10, filters: Y }, {}));
      expect(ranked.rows.map((r) => [r.entityId, r.county])).toEqual([["12", null], ["13", "NA"], ["11", "Cluj"], ["10", "Cluj"], ["14", null]]);
    });
  }, 60000);
});

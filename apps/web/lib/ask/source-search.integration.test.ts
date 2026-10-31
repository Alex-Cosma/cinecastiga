import { afterAll, describe, expect, it } from "vitest";
import { buildAskRollups, buildSourceSearch, createDb, type DbSql } from "@seap/db";
import { runRows } from "./compile";
import { forgetMartColumns } from "./mart-columns";
import { fold } from "./predicates";
import { forgetRollupsReady, yearKeysReady } from "./rollups";
import { forgetSourceSearch, SEARCH_LIST_CAP, sourceSearchFresh, sourceSearchPresent } from "./source-search";
import type { AskSpec } from "./spec";
import { testDatabaseUrl, withAskFixture } from "./test-fixture";

/*
 * S5 PRE-trend, parity: „Caută în surse” by names first (source-search.ts)
 * finds exactly the records today's condition finds — the folded text inside
 * the folded concat of each record's code, institution, firm, CPV name and
 * code, county and number — with the same totals and the same page, on the
 * national „Toate” of a trend and on a national ranking; before the nightly
 * build (no agg_da_year_keys: a DA code read on every row) and after it (DA
 * codes by their form; the „Toate” page bounded by the two years' keys). A
 * dedicated seap_test_* database, one transaction rolled back.
 */

const url = testDatabaseUrl("PRE-trend search fixtures");
const connection = url ? createDb(url, { max: 1 }) : null;
afterAll(async () => { forgetRollupsReady(); forgetMartColumns(); forgetSourceSearch(); await connection?.sql.end(); });

/**
 * Institutions 1 (Cluj), 2 (Iași, with diacritics in its name), firms 10–13, one recorded supplier equal to its
 * authority (no supplier id), codes of three CPV names, 2023–2025, a DA above the 2M ceiling and a zero, a contract
 * number in free text, and SEARCH_LIST_CAP + 1 profiles named „… SRL” without records.
 */
async function load(q: DbSql) {
  await q`insert into marts.national_stats (kind,year) values ('da',2023),('da',2024),('da',2025),('award',2024),('award',2025)`;
  await q`insert into core.cpv_codes (code,name_ro,revision,division) values
    ('33600000-6','Produse farmaceutice','2008','33'),('45000000-7','Lucrări de construcții','2008','45'),('30190000-7','Echipamente de birou','2008','30')`;
  await q`insert into core.entities (id, name_display, name_normalized) values
    (1,'Primaria Unu','primaria unu'),(2,'Spitalul Județean Iași','spitalul judetean iasi'),
    (10,'Alfa SRL','alfa srl'),(11,'Beta Medicamente SRL','beta medicamente srl'),(12,'Gama SA','gama sa'),(13,'Delta Cluj SRL','delta cluj srl')`;
  await q`insert into marts.da_transactions (sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,cpv_name,closing_value,finalization_date) values
    (101,'DA101',1,'Primaria Unu',10,'Alfa SRL','Cluj','33600000-6','Produse farmaceutice',5000,'2024-03-01 10:00'),
    (102,'DA102',1,'Primaria Unu',10,'Alfa SRL','Cluj','33600000-6','Produse farmaceutice',7000.5,'2025-03-01 10:00'),
    (103,'DA103',2,'Spitalul Județean Iași',11,'Beta Medicamente SRL','Iasi','33600000-6','Produse farmaceutice',4000,'2025-04-01 10:00'),
    (104,'DA104',2,'Spitalul Județean Iași',12,'Gama SA','Iasi','45000000-7','Lucrări de construcții',3000,'2024-05-01 10:00'),
    (105,'DA105',1,'Primaria Unu',13,'Delta Cluj SRL','Cluj','30190000-7','Echipamente de birou',900,'2025-06-01 10:00'),
    (106,'DA106',2,'Spitalul Județean Iași',null,'Spitalul Județean Iași','Iasi','30190000-7','Echipamente de birou',120.25,'2025-07-01 10:00'),
    (107,'DA107',1,'Primaria Unu',10,'Alfa SRL','Cluj','30190000-7','Echipamente de birou',80,'2023-07-01 10:00'),
    (108,'DA108',2,'Spitalul Județean Iași',10,'Alfa SRL','Iasi','33600000-6','Produse farmaceutice',2500000,'2025-08-01 10:00'),
    (109,'DA109',2,'Spitalul Județean Iași',11,'Beta Medicamente SRL','Iasi','33600000-6','Produse farmaceutice',0,'2025-08-02 10:00'),
    (110,'DA110',1,'Primaria Unu',12,'Gama SA','Cluj',null,null,60,'2025-09-01 10:00')`;
  await q`insert into marts.contract_transactions (contract_id,contract_no,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,cpv_name,closing_value,finalization_date,ca_notice_id,n_winners,contract_value_full) values
    (201,'Contract nr. 12/2025 farmacie',2,'Spitalul Județean Iași',10,'Alfa SRL','Iasi','33600000-6','Produse farmaceutice',20000,'2025-02-01',901,1,20000),
    (202,'C202',1,'Primaria Unu',11,'Beta Medicamente SRL','Cluj','45000000-7','Lucrări de construcții',6000,'2024-09-01',902,2,12000),
    (202,'C202',1,'Primaria Unu',12,'Gama SA','Cluj','45000000-7','Lucrări de construcții',6000,'2024-09-01',902,2,12000)`;
  await q`insert into marts.agg_map_county (county,v_plaf,n_plaf,v_all,n_all) values ('Cluj',0,0,0,0),('Iasi',0,0,0,0)`;
  for (const role of ["authority", "supplier"] as const) {
    const id = role === "authority" ? q`authority_id` : q`supplier_id`;
    await q`insert into marts.entity_profile (entity_id, role, name_display, n_das, n_contracts, total_ron_split)
      select g.id, ${role}, e.name_display, g.n_das, g.n_contracts, g.v from (
        select ${id} id, count(*) filter (where src = 'da')::int n_das, count(*) filter (where src = 'contracts')::int n_contracts, sum(cv) v from (
          select authority_id, supplier_id, 'da' src, closing_value cv from marts.da_transactions where closing_value > 0 and closing_value <= 2000000
          union all select authority_id, supplier_id, 'contracts', closing_value from marts.contract_transactions where closing_value > 0
        ) x where ${id} is not null group by 1
      ) g join core.entities e on e.id = g.id`;
  }
  // A word listing more names than SEARCH_LIST_CAP narrows nothing („srl”): today's condition alone.
  await q`insert into marts.entity_profile (entity_id, role, name_display, n_das, n_contracts, total_ron_split)
    select 100000 + i, 'supplier', 'Firma ' || i || ' SRL', 0, 0, 0 from generate_series(1, ${SEARCH_LIST_CAP + 1}) i`;
  forgetMartColumns();
}

/** Today's condition on the drawer's rows of a selection: its records' keys in the drawer's default order, count and value. */
type Fragment = ReturnType<DbSql>;
async function today(q: DbSql, where: Fragment, search: string) {
  const rows = await q`
    select d.src, d.ref_id::text ref, d.supplier_id::text supplier, d.closing_value::text v from (
      select sicap_da_id ref_id, da_code, authority_id, authority_name, supplier_id, supplier_name, county, cpv_code, cpv_name, closing_value, finalization_date, 'da'::text src
      from marts.da_transactions
      union all
      select contract_id, contract_no, authority_id, authority_name, supplier_id, supplier_name, county, cpv_code, cpv_name, closing_value, finalization_date, 'contracts'
      from marts.contract_transactions
    ) d
    where d.closing_value > 0 and (d.src = 'contracts' or d.closing_value <= 2000000) and ${where}
      and strpos(lower(unaccent(concat_ws(' ', d.da_code, d.authority_name, d.supplier_name, d.cpv_name, d.cpv_code, d.county, d.ref_id::text))), ${fold(search)}) > 0
    order by d.ref_id desc, d.src, d.ref_id, d.supplier_id nulls first
  ` as unknown as { src: string; ref: string; supplier: string | null; v: string }[];
  return { keys: rows.map((r) => `${r.src}:${r.ref}:${r.supplier ?? "-"}`), count: rows.length, value: rows.reduce((n, r) => n + Number(r.v), 0) };
}

const SEARCHES = [
  "alfa", "ALFA srl", "srl produse", "medicamente", "spitalul judetean", "Spitalul Județean Iași", "iasi", "IAȘI", "farmaceutice",
  "33600000", "336", "-6", "da101", "DA1", "a10", "101", "10", "c202", "nr. 12/2025", "farmacie", "cluj srl", "srl", "srl cluj", "zzz", "unu   alfa",
  // S6, the stored text: a phrase over two fields, LIKE's own characters written literally, a code's fragment.
  "srl produse farmaceutice", "s.r.l.", "c20_", "da10%", "0000-6", "ceutice 33600",
];

const trendAll: AskSpec = { block: "trend", measure: "value", dim: "supplier", filters: { yearFrom: 2024, yearTo: 2025 } };
const ranking: AskSpec = { block: "table", measure: "value", dim: "supplier", filters: { yearFrom: 2024, yearTo: 2025 } };

describe.runIf(Boolean(connection))("„Caută în surse” by names first (dedicated rollback fixture)", () => {
  it("finds today's records, totals and page on a national trend's „Toate” and a national ranking, before and after the build", async () => {
    await withAskFixture(connection!.sql, "pre_trend_search", load, async (q) => {
      // Before the nightly build, after it, then with the stored text (S6): the same records every time.
      for (const stage of ["before", "built", "stored"] as const) {
        const built = stage !== "before";
        if (stage === "built") await buildAskRollups(q);
        if (stage === "stored") await buildSourceSearch(q);
        forgetRollupsReady(); forgetSourceSearch();
        expect(await yearKeysReady(q)).toBe(built);
        expect([stage, await sourceSearchPresent(q) && await sourceSearchFresh(q)]).toEqual([stage, stage === "stored"]);
        for (const [name, spec] of [["trend", trendAll], ["ranking", ranking]] as const) {
          const selection = (spec.block === "trend"
            ? q`substr(d.finalization_date, 1, 4) in ('2024', '2025') and d.supplier_id is not null`
            : q`substr(d.finalization_date, 1, 4) between '2024' and '2025' and d.supplier_id is not null`) as unknown as Fragment;
          const all = await runRows(q, spec, {}, 0, { limit: 100 });
          if ("error" in all) throw new Error(all.error);
          for (const search of SEARCHES) {
            const want = await today(q, selection, search);
            const got = await runRows(q, spec, {}, 0, { limit: 100, search });
            if ("error" in got) throw new Error(got.error);
            const at = [stage, name, search];
            expect([...at, got.total, Number(got.value)]).toEqual([...at, want.count, want.value]);
            expect([...at, got.rows.map((r) => `${r.src}:${r.refId}:${r.supplierId ?? "-"}`)]).toEqual([...at, want.keys]);
            // The whole list's figures stay those of the selection.
            expect([...at, got.sourceTotal, got.sourceValue]).toEqual([...at, all.sourceTotal, all.sourceValue]);
          }
        }
        // „Toate” without a search: the page bounded by the two years' keys is the unbounded one.
        const want = await today(q, q`substr(d.finalization_date, 1, 4) in ('2024', '2025') and d.supplier_id is not null` as unknown as Fragment, "");
        const page = await runRows(q, trendAll, {}, 0, { limit: 100 });
        if ("error" in page) throw new Error(page.error);
        expect([stage, page.rows.map((r) => `${r.src}:${r.refId}:${r.supplierId ?? "-"}`)]).toEqual([stage, want.keys]);
      }
      // A code no name narrows is read on the stored text: without its row there, it is not found ...
      const code = async () => { const got = await runRows(q, trendAll, {}, 0, { limit: 100, search: "da102" }); if ("error" in got) throw new Error(got.error); return got.total; };
      expect(await code()).toBe(1);
      await q`delete from marts.source_search where src = 'da' and ref_id = 102`;
      expect(await code()).toBe(0);
      // ... and a state naming another load of the marts (the next night's) sends it back to names first, as today.
      await q`update marts.source_search_state set da_node = 0`;
      expect(await sourceSearchFresh(q)).toBe(false);
      expect(await code()).toBe(1);
    });
  });
});

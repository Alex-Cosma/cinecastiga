import { afterAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { runRows, runSpec, type BlockData } from "./compile";
import { evidenceCsv, sumDecimalStrings } from "./evidence";
import { withExclusion } from "./filters/exclusions";
import { forgetMartColumns } from "./mart-columns";
import type { NetworkData } from "./network-shared";
import type { SankeyData } from "./sankey-shared";
import type { Grounding } from "./ground";
import type { AskSpec } from "./spec";
import { testDatabaseUrl, withAskFixture } from "./test-fixture";

/*
 * F4, the relations (plan §4.8, §4.9, §6.2): network-2's groups are a
 * partition of the whole relation and their values add to the total; a group
 * does not move with the channel or the domain; a partner left out is in no
 * group; the official signals sit on a relation; the sources of a group and of
 * a row are their records (answer = sources = CSV); an old link without the
 * network's key lists the same partners and figures as before network-2.
 * sankey-2: its domains two CPV digits below the chosen one, the firms that
 * shared a contract, and the seat and an exclusion with the same records as
 * its sources. A dedicated seap_test_* database, one transaction rolled back.
 */

const url = testDatabaseUrl("F4 relation fixtures");
const connection = url ? createDb(url, { max: 1 }) : null;
afterAll(async () => { forgetMartColumns(); await connection?.sql.end(); });

type Engine = Awaited<ReturnType<typeof runSpec>>;
const data = (r: Engine): BlockData => { if ("error" in r) throw new Error(r.error); return r.data; };
const network = (r: Engine): NetworkData => { const d = data(r); if (d.block !== "network") throw new Error("network expected"); return d; };
const flow = (r: Engine): SankeyData => { const d = data(r); if (d.block !== "sankey") throw new Error("sankey expected"); return d; };
const drawer = async (q: DbSql, spec: AskSpec, scope?: NonNullable<Parameters<typeof runRows>[4]>["scope"]) => {
  const r = await runRows(q, spec, BUYER, 0, { limit: 100, ...(scope ? { scope } : {}) });
  if ("error" in r) throw new Error(r.error);
  return r;
};
const ids = (d: NetworkData, list: keyof NetworkData["lists"]) => d.lists[list].rows.map((r) => r.entityId).sort();
/** The fixture's institution in the centre, as the engine grounds it; a CPV code where the question has one. */
const BUYER: Grounding = { authority: { entityId: "1", nameDisplay: "Primaria Unu", alternatives: [] } } as unknown as Grounding;
const WORKS: Grounding = { ...BUYER, cpv: { term: "45", prefixes: ["45"], method: "code", matchedNames: [] } } as unknown as Grounding;

/**
 * Primaria Unu (1, Cluj) and its firms, against the reference year 2024:
 * Alfa (10, Cluj) since 2021 and in 2024 — continuing; Beta (11, Iași) and Gama (12, Cluj) one contract of 2024
 * won together — new; Delta (13, foreign) in 2022 only — gone; Epsilon (14, Cluj) in 2023 and 2025 — continuing;
 * Zeta (15, Cluj) in 2019 only — gone. Spital Doi (2, Iași) buys from Alfa too; a DA above the 2M ceiling and a
 * zero stay out. Signals: a split of 1 with Epsilon, a shared representative of Beta at 1, Delta's dependence (its
 * pair 90% of the signal's total) and Alfa's (12% of it: not on this relation).
 */
async function load(q: DbSql) {
  await q`insert into marts.national_stats (kind,year) values ('da',2019),('da',2025),('award',2019),('award',2025)`;
  await q`insert into core.entities (id, name_display, name_normalized) values
    (1,'Primaria Unu','primaria unu'),(2,'Spital Doi','spital doi'),
    (10,'Alfa SRL','alfa srl'),(11,'Beta SRL','beta srl'),(12,'Gama SRL','gama srl'),(13,'Delta GmbH','delta gmbh'),(14,'Epsilon SRL','epsilon srl'),(15,'Zeta SRL','zeta srl')`;
  await q`insert into marts.da_transactions (sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date) values
    (101,'DA101',1,'Primaria Unu',10,'Alfa SRL','Cluj','33600000-6',60000,'2021-03-01 10:00'),
    (102,'DA102',1,'Primaria Unu',10,'Alfa SRL','Cluj','33600000-6',70000,'2024-05-01 10:00'),
    (103,'DA103',1,'Primaria Unu',13,'Delta GmbH','Cluj','30190000-7',900,'2022-02-01 10:00'),
    (104,'DA104',1,'Primaria Unu',14,'Epsilon SRL','Cluj','30190000-7',300,'2023-06-01 10:00'),
    (105,'DA105',1,'Primaria Unu',14,'Epsilon SRL','Cluj','45000000-7',200,'2025-01-15 10:00'),
    (106,'DA106',1,'Primaria Unu',15,'Zeta SRL','Cluj','30190000-7',50,'2019-07-01 10:00'),
    (107,'DA107',2,'Spital Doi',10,'Alfa SRL','Iasi','33600000-6',1000,'2025-02-01 10:00'),
    (108,'DA108',1,'Primaria Unu',10,'Alfa SRL','Cluj','33600000-6',2500000,'2025-08-01 10:00'),
    (109,'DA109',1,'Primaria Unu',11,'Beta SRL','Cluj','33600000-6',0,'2025-08-02 10:00')`;
  await q`insert into marts.contract_transactions (contract_id,contract_no,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date,ca_notice_id,n_winners,contract_value_full) values
    (202,'C202',1,'Primaria Unu',11,'Beta SRL','Cluj','45233140-2',6000,'2024-09-01',902,2,12000),
    (202,'C202',1,'Primaria Unu',12,'Gama SRL','Cluj','45233140-2',6000,'2024-09-01',902,2,12000)`;
  for (const role of ["authority", "supplier"] as const) {
    const id = role === "authority" ? q`authority_id` : q`supplier_id`;
    await q`insert into marts.entity_profile (entity_id, role, name_display, county, n_das, n_contracts, total_ron_split)
      select g.id, ${role}, e.name_display, null, g.n_das, g.n_contracts, g.v from (
        select ${id} id, count(*) filter (where src = 'da')::int n_das, count(*) filter (where src = 'contracts')::int n_contracts, sum(cv) v from (
          select authority_id, supplier_id, 'da' src, closing_value cv from marts.da_transactions where closing_value > 0 and closing_value <= 2000000
          union all select authority_id, supplier_id, 'contracts', closing_value from marts.contract_transactions where closing_value > 0
        ) x where ${id} is not null group by 1
      ) g join core.entities e on e.id = g.id`;
  }
  // The institutions' county; the firms' seat (ONRC), Delta abroad (owner-seat-switch, F4).
  await q`update marts.entity_profile set county = case entity_id when 1 then 'Cluj' else 'Iasi' end where role = 'authority'`;
  await q`update marts.entity_profile set seat_county = case entity_id when 11 then 'Iasi' when 13 then null else 'Cluj' end,
    seat_source = case entity_id when 13 then 'foreign' else 'onrc' end, employees = case entity_id when 10 then 40 when 11 then 5 else null end
    where role = 'supplier'`;
  await q`insert into marts.flag_instances (id, flag_code, subject_type, entity_id, partner_id, severity, total_ron, period, evidence) values
    (1, 'da_split', 'pair', 1, 14, 1, 500, '2023', '{}'),
    (2, 'net_shared_admin', 'supplier', 11, 1, 1, null, 'all', '{}'),
    (3, 'da_dependence', 'supplier', 13, null, 1, 1000, 'all', '{}'),
    (4, 'da_dependence', 'supplier', 10, null, 1, 1000000, 'all', '{}'),
    (5, 'da_round', 'da', 1, 15, 1, 50, '2019', '{}')`;
  forgetMartColumns();
}

const around: AskSpec = { block: "network", measure: "value", dim: "authority", filters: { authorityId: 1 } };
const since = (spec: AskSpec, partners?: "new" | "continuing" | "gone"): AskSpec => ({ ...spec, network: { ...spec.network, since: 2024, ...(partners ? { partners } : {}) } });

describe.runIf(Boolean(connection))("F4: the relations, network-2 and sankey-2 (dedicated rollback fixture)", () => {
  it("partitions the partners of the whole relation against the year, the groups adding to the total", async () => {
    await withAskFixture(connection!.sql, "f4_relations", load, async (q) => {
      const d = network(await runSpec(q, since(around), BUYER));
      expect([d.since, d.list]).toEqual([2024, "all"]);
      expect(ids(d, "all")).toEqual(["10", "11", "12", "13", "14", "15"]);
      expect([ids(d, "new"), ids(d, "continuing"), ids(d, "gone")]).toEqual([["11", "12"], ["10", "14"], ["13", "15"]]);
      // A partition: every partner once, the values adding to the total (the DA over the ceiling and the zero out).
      const parts = (["new", "continuing", "gone"] as const).map((g) => d.lists[g]);
      expect(parts.reduce((n, l) => n + l.partners, 0)).toBe(d.lists.all.partners);
      expect(parts.reduce((v, l) => v + l.value, 0)).toBe(d.lists.all.value);
      expect([d.lists.all.value, d.lists.all.count, d.lists.all.oneOff]).toEqual([143450, 8, 4]);
      // The contract of two winners: half each, said as „în asociere” (joint).
      expect(d.lists.new.joint).toBe(12000);
      // The row facts: the whole relation's years, the seat (abroad apart), the employees.
      expect(d.partners["14"]).toMatchObject({ first: 2023, last: 2025, years: [2023, 2025], county: "Cluj", signals: ["da_split"] });
      expect(d.partners["13"]).toMatchObject({ county: "Străinătate", signals: ["da_dependence"] });
      // Alfa: 130,000 of its 131,000 at Primaria Unu (99%, from 50,000 lei); its dependence signal is not this relation's (12%).
      expect(d.partners["10"]).toMatchObject({ employees: 40, signals: [] });
      expect(d.partners["10"]!.firmShare).toBeCloseTo(130000 / 131000, 6);
      expect(d.partners["15"]!.firmShare).toBeNull();
      expect(d.partners["11"]!.signals).toEqual(["net_shared_admin"]);
      // Each channel in the same selection on every channel (the strip's shares).
      expect(d.streams).toEqual({ da: { value: 131450, count: 6 }, contracts: { value: 12000, count: 2 } });
    });
  });

  it("keeps a partner's group whatever the channel and the domain, which only choose who is listed", async () => {
    await withAskFixture(connection!.sql, "f4_relations", load, async (q) => {
      const direct = network(await runSpec(q, { ...since(around), dataset: "da" }, BUYER));
      expect([ids(direct, "new"), ids(direct, "continuing"), ids(direct, "gone")]).toEqual([[], ["10", "14"], ["13", "15"]]);
      // Epsilon's works of 2025 are its only records in „45”: it stays continuing (first record of the relation: 2023).
      const works = network(await runSpec(q, { ...since(around), filters: { ...around.filters, cpvTerm: "45" } }, WORKS));
      expect([ids(works, "new"), ids(works, "continuing"), ids(works, "gone")]).toEqual([["11", "12"], ["14"], []]);
      expect(works.lists.continuing.value).toBe(200);
      // A period applies to „Toți” only; the groups are of the whole selection without it.
      const year = network(await runSpec(q, { ...around, filters: { ...around.filters, yearFrom: 2024, yearTo: 2024 } }, BUYER));
      expect([year.since, ids(year, "all"), ids(year, "new")]).toEqual([2024, ["10", "11", "12"], ["11", "12"]]);
      expect(year.lists.all.value).toBe(82000);
    });
  });

  it("leaves a partner out of every group and total, and selects the partners with a signal on their relation", async () => {
    await withAskFixture(connection!.sql, "f4_relations", load, async (q) => {
      const out = network(await runSpec(q, { ...since(around), population: withExclusion(undefined, { field: "supplier", value: "10", label: "Alfa SRL" }) }, BUYER));
      expect([ids(out, "all"), ids(out, "continuing"), out.lists.all.value]).toEqual([["11", "12", "13", "14", "15"], ["14"], 13450]);
      const flagged = network(await runSpec(q, { ...since(around), network: { since: 2024, signals: true } }, BUYER));
      expect([ids(flagged, "all"), ids(flagged, "new"), ids(flagged, "continuing"), ids(flagged, "gone")]).toEqual([["11", "13", "14"], ["11"], ["14"], ["13"]]);
      expect(flagged.lists.all.value).toBe(7400);
      // The firm's seat against the institution's county: Beta (Iași) only; Delta abroad.
      const other = network(await runSpec(q, { ...since(around), filters: { ...around.filters, firmSeat: "other" } }, BUYER));
      expect(ids(other, "all")).toEqual(["11"]);
      const abroad = network(await runSpec(q, { ...since(around), filters: { ...around.filters, firmSeat: "abroad" } }, BUYER));
      expect(ids(abroad, "all")).toEqual(["13"]);
    });
  });

  it("lists the records of a group, of „Cu semnale” and of a row as their sources and CSV (answer = sources = CSV)", async () => {
    await withAskFixture(connection!.sql, "f4_relations", load, async (q) => {
      const cases: [string, AskSpec][] = [
        ["toți", since(around)], ["noi", since(around, "new")], ["continuă", since(around, "continuing")], ["nu mai apar", since(around, "gone")],
        ["cu semnale", { ...around, network: { since: 2024, signals: true } }], ["noi cu semnale", { ...around, network: { since: 2024, partners: "new", signals: true } }],
        ["noi, directe", { ...since(around, "new"), dataset: "da" }], ["alt județ", { ...since(around), filters: { ...around.filters, firmSeat: "other" } }],
      ];
      for (const [name, spec] of cases) {
        const d = network(await runSpec(q, spec, BUYER));
        const own = d.lists[d.list];
        const rows = await drawer(q, spec);
        expect([name, rows.sourceTotal, Number(rows.sourceValue)]).toEqual([name, own.count, own.value]);
        expect([name, Number(sumDecimalStrings(rows.rows.map((r) => r.valueExact)))]).toEqual([name, own.value]);
        expect([name, evidenceCsv(rows.rows).trim().split("\n").length]).toEqual([name, own.count + 1]);
        // A row's records: its own, in the selection (a group has no period: the whole relation's).
        for (const row of own.rows) {
          const mine = await drawer(q, spec, { role: "supplier", entityIds: [row.entityId] });
          expect([name, row.entityId, mine.sourceTotal, Number(mine.sourceValue)]).toEqual([name, row.entityId, row.count, row.value]);
        }
      }
      const group = await drawer(q, since(around, "new"));
      expect(group.scopeNotes.join(" ")).toMatch(/Grupa „Noi” față de 2024/);
    });
  });

  it("answers an old link without the network's key with the partners and figures of before network-2 (14 rows, by value)", async () => {
    await withAskFixture(connection!.sql, "f4_relations", load, async (q) => {
      const d = network(await runSpec(q, around, BUYER));
      // The query of before network-2: the partners of the selection, by value, the first 14.
      const before = await q`
        select d.supplier_id::text id, sum(d.closing_value)::float8 v, count(*)::int n
        from (select authority_id, supplier_id, closing_value, 'da' src from marts.da_transactions union all
              select authority_id, supplier_id, closing_value, 'contracts' from marts.contract_transactions) d
        where d.closing_value > 0 and (d.src = 'contracts' or d.closing_value <= 2000000) and d.authority_id = 1 and d.supplier_id is not null
        group by 1 order by 2 desc, 1 limit 14` as unknown as { id: string; v: number; n: number }[];
      expect(d.lists.all.rows.slice(0, 14).map((r) => ({ id: r.entityId, v: r.value, n: r.count }))).toEqual(before);
      // The archive's last complete year: the fixture's coverage says none, so the year before its last (2025).
      expect(d.since).toBe(2024);
      // A year the archive has not completed is refused, never counted.
      const late = await runSpec(q, { ...around, network: { partners: "new", since: 2026 } }, BUYER);
      expect(late).toMatchObject({ error: "Anul 2026 nu e încheiat în date. Alege 2024 sau un an mai vechi." });
    });
  });

  it("draws the flow two CPV digits below the domain, with its shared contracts, and the sources of its seat and exclusions", async () => {
    await withAskFixture(connection!.sql, "f4_relations", load, async (q) => {
      const sankey: AskSpec = { block: "sankey", measure: "value", dim: "authority", filters: { authorityId: 1 } };
      const all = flow(await runSpec(q, sankey, BUYER));
      expect([all.stemLen, all.domains.map((d) => d.code)]).toEqual([2, ["33", "45", "30"]]);
      expect(all.totals).toEqual({ value: 143450, count: 8, partners: 6, domains: 3 });
      expect([all.joint, all.partners.find((p) => p.entityId === "11")?.with]).toEqual([12000, ["Gama SRL"]]);
      expect(all.partners.find((p) => p.entityId === "14")).toMatchObject({ count: 2, domains: 2 });
      const works = flow(await runSpec(q, { ...sankey, filters: { ...sankey.filters, cpvTerm: "45" } }, WORKS));
      expect([works.stemLen, works.domains.map((d) => [d.code, d.count]), works.totals.value]).toEqual([4, [["4523", 2], ["4500", 1]], 12200]);
      for (const [name, spec] of [
        ["seat", { ...sankey, filters: { ...sankey.filters, firmSeat: "same" } }],
        ["exclusion", { ...sankey, population: withExclusion(undefined, { field: "cpv", value: "33", label: "Medicale" }) }],
        ["firm out", { ...sankey, population: withExclusion(undefined, { field: "supplier", value: "10", label: "Alfa SRL" }) }],
      ] as [string, AskSpec][]) {
        const d = flow(await runSpec(q, spec, BUYER));
        const rows = await drawer(q, spec);
        expect([name, rows.sourceTotal, Number(rows.sourceValue)]).toEqual([name, d.totals.count, d.totals.value]);
      }
    });
  });
});

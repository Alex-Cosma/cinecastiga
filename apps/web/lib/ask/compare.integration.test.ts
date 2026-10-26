import { afterAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { runRows, runSpec, type CompareData } from "./compile";
import { evidenceCsv, sumDecimalStrings } from "./evidence";
import { forgetCompareFacets, pairFacts } from "./compare-engine";
import { facetCounts, forgetFacets, SHARED_PARTNERS_COUNTS } from "./facets";
import { forgetMartColumns } from "./mart-columns";
import type { Grounding } from "./ground";
import type { AskSpec } from "./spec";
import { testDatabaseUrl, withAskFixture } from "./test-fixture";

/*
 * F4, the comparison (plan §4.6 Teste, final compare §8.11): „Doar clienții
 * comuni” keeps the institutions both firms sold to (the pre-step P) in every
 * section, and the sources and the CSV of a card are its records (answer =
 * sources = CSV); each firm's part won together is the same contracts; the
 * cards' context rows (the codes above a domain, the suppliers' seat, the
 * distinct contracts) and the pair's facts for the builder's windows. A
 * dedicated seap_test_* database, one transaction rolled back.
 */

const url = testDatabaseUrl("F4 comparison fixtures");
const connection = url ? createDb(url, { max: 1 }) : null;
afterAll(async () => { forgetMartColumns(); forgetCompareFacets(); forgetFacets(); await connection?.sql.end(); });

type Engine = Awaited<ReturnType<typeof runSpec>>;
const compare = (r: Engine): CompareData => { if ("error" in r) throw new Error(r.error); if (r.data.block !== "compare") throw new Error("compare expected"); return r.data; };
const FIRMS: Grounding = { supplier: { entityId: "10", nameDisplay: "Alfa SRL", alternatives: [] }, compare: { entityId: "11", nameDisplay: "Beta SRL", alternatives: [] } } as unknown as Grounding;
const TOWNS: Grounding = { authority: { entityId: "1", nameDisplay: "Primaria Unu", county: "Cluj", alternatives: [] }, compare: { entityId: "3", nameDisplay: "Scoala Trei", county: "Cluj", alternatives: [] } } as unknown as Grounding;
const ROADS: Grounding = { ...TOWNS, cpv: { term: "45233", prefixes: ["45233"], method: "code", matchedNames: [] } } as unknown as Grounding;
const firms: AskSpec = { block: "compare", measure: "value", dim: "supplier", filters: { supplierId: 10, compareWithId: 11 } };
const shared: AskSpec = { ...firms, filters: { ...firms.filters, sharedPartners: true } };
const towns: AskSpec = { block: "compare", measure: "value", dim: "authority", filters: { authorityId: 1, compareWithId: 3 } };

/**
 * Alfa (10, Cluj) sells to Primaria Unu (1, Cluj), Spital Doi (2, Iași) and Scoala Trei (3, Cluj); Beta (11, Iași)
 * to Primaria Unu and Spital Doi, and won one contract of Spital Doi together with Alfa (two winners, 1,000 each).
 * The shared clients are 1 and 2. Primaria Unu codes one road at 45233 and one at the general 45000000.
 */
async function load(q: DbSql) {
  await q`insert into marts.national_stats (kind,year) values ('da',2019),('da',2025),('award',2019),('award',2025)`;
  await q`insert into core.entities (id, name_display, name_normalized) values
    (1,'Primaria Unu','primaria unu'),(2,'Spital Doi','spital doi'),(3,'Scoala Trei','scoala trei'),(10,'Alfa SRL','alfa srl'),(11,'Beta SRL','beta srl'),(12,'Gama GmbH','gama gmbh')`;
  await q`insert into marts.da_transactions (sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date) values
    (101,'DA101',1,'Primaria Unu',10,'Alfa SRL','Cluj','45233140-2',100,'2024-03-01 10:00'),
    (102,'DA102',2,'Spital Doi',10,'Alfa SRL','Iasi','33600000-6',200,'2025-03-01 10:00'),
    (103,'DA103',3,'Scoala Trei',10,'Alfa SRL','Cluj','30190000-7',50,'2023-03-01 10:00'),
    (104,'DA104',1,'Primaria Unu',11,'Beta SRL','Cluj','45000000-7',300,'2025-04-01 10:00'),
    (105,'DA105',3,'Scoala Trei',12,'Gama GmbH','Cluj','45233140-2',70,'2016-05-01 10:00')`;
  await q`insert into marts.contract_transactions (contract_id,contract_no,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date,ca_notice_id,n_winners,contract_value_full) values
    (500,'C500',2,'Spital Doi',10,'Alfa SRL','Iasi','45215000-7',1000,'2024-09-01',900,2,2000),
    (500,'C500',2,'Spital Doi',11,'Beta SRL','Iasi','45215000-7',1000,'2024-09-01',900,2,2000)`;
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
  await q`update marts.entity_profile set county = case entity_id when 2 then 'Iasi' else 'Cluj' end where role = 'authority'`;
  await q`update marts.entity_profile set seat_county = case entity_id when 11 then 'Iasi' when 12 then null else 'Cluj' end,
    seat_source = case entity_id when 12 then 'foreign' else 'onrc' end where role = 'supplier'`;
  forgetMartColumns();
}

/** A card's sources (runRows on its entity), as its "Vezi cele N înregistrări →" opens them. */
async function card(q: DbSql, spec: AskSpec, g: Grounding, role: "authority" | "supplier", id: string) {
  const r = await runRows(q, spec, g, 0, { limit: 100, scope: { role, entityIds: [id] } });
  if ("error" in r) throw new Error(r.error);
  return r;
}

describe.runIf(Boolean(connection))("F4: the comparison (dedicated rollback fixture)", () => {
  it("keeps the shared clients only with „Doar clienții comuni”, the cards' whole selection and the part won together beside", async () => {
    await withAskFixture(connection!.sql, "f4_compare", load, async (q) => {
      const all = compare(await runSpec(q, firms, FIRMS));
      expect(all.entities.map((e) => [e.value, e.count, e.partners])).toEqual([[1350, 4, 3], [1300, 2, 2]]);
      expect(all.shared!.total).toBe(2);
      expect(all.entities[0]).not.toHaveProperty("whole");
      const only = compare(await runSpec(q, shared, FIRMS));
      // Scoala Trei bought only from Alfa: out of every section.
      expect(only.entities.map((e) => [e.value, e.count, e.partners])).toEqual([[1300, 3, 2], [1300, 2, 2]]);
      expect(only.entities.map((e) => e.whole)).toEqual([{ value: 1350, count: 4, partners: 3 }, { value: 1300, count: 2, partners: 2 }]);
      // The same contract for both, each firm's share.
      expect(only.entities.map((e) => e.joint)).toEqual([{ value: 1000, contracts: 1 }, { value: 1000, contracts: 1 }]);
      expect(only.shared!.rows.find((r) => r.entityId === "2")).toMatchObject({ a: { value: 1200, joint: 1000 }, b: { value: 1000, joint: 1000 } });
      expect(only.shared!.rows.find((r) => r.entityId === "1")).toMatchObject({ a: { value: 100, joint: 0 }, b: { value: 300, joint: 0 } });
      expect(only.entities[0]!.years).toEqual([{ year: 2024, value: 1100, count: 2 }, { year: 2025, value: 200, count: 1 }]);
    });
  });

  it("gives a card's sources and CSV the records of its sum, the shared clients' only", async () => {
    await withAskFixture(connection!.sql, "f4_compare", load, async (q) => {
      for (const [spec, entity] of [[firms, 0], [shared, 0], [shared, 1]] as const) {
        const answer = compare(await runSpec(q, spec, FIRMS)).entities[entity]!;
        const rows = await card(q, spec, FIRMS, "supplier", answer.entityId);
        expect([rows.total, Number(rows.sourceValue)], `${entity} ${Boolean(spec.filters.sharedPartners)}`).toEqual([answer.count, answer.value]);
        expect(Number(sumDecimalStrings(rows.rows.map((r) => r.valueExact)))).toBe(answer.value);
        expect(evidenceCsv(rows.rows).trim().split("\n")).toHaveLength(answer.count + 1);
      }
      const sources = await card(q, shared, FIRMS, "supplier", "10");
      expect(sources.rows.map((r) => r.authorityId).sort()).toEqual(["1", "2", "2"]);
      expect(sources.scopeNotes).toContain("Doar clienții comuni: 2 instituții care au cumpărat de la ambele firme în selecția aleasă; sursele sunt înregistrările lor.");
    });
  });

  it("finds the shared clients on the whole selection: another channel has its own, so a window has no numbers then", async () => {
    await withAskFixture(connection!.sql, "f4_compare", load, async (q) => {
      // On every channel P is {1, 2}; on direct acquisitions only Primaria Unu bought from both (Beta's DA is there).
      const direct = compare(await runSpec(q, { ...shared, dataset: "da" }, FIRMS));
      expect([direct.shared!.total, direct.entities.reduce((sum, e) => sum + e.value, 0)]).toEqual([1, 400]);
      // A count of „Directe” on P of every channel (600) would not be that answer (kit R5): none is given.
      forgetFacets();
      expect(await facetCounts(q, shared, "channel")).toEqual({ error: SHARED_PARTNERS_COUNTS });
    });
  });

  it("has no shared client and no record when none bought from both in the selection", async () => {
    await withAskFixture(connection!.sql, "f4_compare", load, async (q) => {
      const year = compare(await runSpec(q, { ...shared, filters: { ...shared.filters, yearFrom: 2023, yearTo: 2023 } }, FIRMS));
      expect([year.shared!.total, year.entities[0]!.count, year.entities[1]!.count]).toEqual([0, 0, 0]);
      expect(year.entities[0]!.whole).toEqual({ value: 50, count: 1, partners: 1 });
    });
  });

  it("says, between institutions, the codes above a domain, the suppliers' seat and the distinct contracts", async () => {
    await withAskFixture(connection!.sql, "f4_compare", load, async (q) => {
      const plain = compare(await runSpec(q, towns, TOWNS));
      // Primaria Unu: Alfa (Cluj, same county) 100, Beta (Iași) 300; Scoala Trei: Alfa 50, Gama (abroad) 70.
      expect(plain.entities.map((e) => e.seats)).toEqual([{ same: 100, other: 300, abroad: 0, unknown: 0 }, { same: 50, other: 0, abroad: 70, unknown: 0 }]);
      expect(plain.entities[0]).not.toHaveProperty("general");
      // The years before 2018 stay in the answer (the chart's first column).
      expect(plain.entities[1]!.years?.[0]).toEqual({ year: 2016, value: 70, count: 1 });
      const roads = compare(await runSpec(q, { ...towns, filters: { ...towns.filters, cpvTerm: "45233" } }, ROADS));
      expect(roads.entities.map((e) => [e.value, e.general])).toEqual([[100, 300], [70, 0]]);
      const hospitals = compare(await runSpec(q, { ...towns, filters: { authorityId: 2, compareWithId: 1 } },
        { ...TOWNS, authority: { entityId: "2", nameDisplay: "Spital Doi", county: "Iasi", alternatives: [] }, compare: { entityId: "1", nameDisplay: "Primaria Unu", county: "Cluj", alternatives: [] } } as unknown as Grounding));
      // Spital Doi: two records of one contract (two winners).
      expect(hospitals.entities[0]!.streams!.contracts).toMatchObject({ count: 2, distinct: 1 });
    });
  });

  it("gives the builder the pair's years, common groups and clients, each without its own window's key", async () => {
    await withAskFixture(connection!.sql, "f4_compare", load, async (q) => {
      forgetCompareFacets();
      const pair = await pairFacts(q, { ...firms, filters: { supplierName: "Alfa SRL", supplierId: 10, compareWith: "Beta SRL", compareWithId: 11, yearFrom: 2025, yearTo: 2025 } });
      if (!("part" in pair)) throw new Error(JSON.stringify(pair));
      // The years without the period; the groups both have (45215 both, at Spital Doi), the general code apart.
      expect(pair.years.map((y) => [y.year, y.a.value, y.b.value])).toEqual([[2023, 50, 0], [2024, 1100, 1000], [2025, 200, 300]]);
      expect(pair.domains).toEqual([]);
      // 33600000 and 45000000 are a group and a division code: general on both sides.
      expect(pair.general).toMatchObject({ a: 200, b: 300, totalA: 200, totalB: 300 });
      expect(pair.counties!.options.map((o) => [o.value, o.a, o.b])).toEqual([["Cluj", 0, 300], ["Iași", 200, 0]]);
      forgetCompareFacets();
      const every = await pairFacts(q, { ...firms, filters: { supplierName: "Alfa SRL", supplierId: 10, compareWith: "Beta SRL", compareWithId: 11 } });
      if (!("part" in every)) throw new Error(JSON.stringify(every));
      expect(every.domains.map((d) => [d.code, d.a, d.b])).toEqual([["45215", 1000, 1000]]);
    });
  });
});

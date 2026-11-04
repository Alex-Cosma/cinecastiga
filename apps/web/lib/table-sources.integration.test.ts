import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { getSplitFacet, getSplitPairsPaged } from "./entity-splits";
import { getRadiografieFacet, getRadiografieSuppliers } from "./radiografie";

/*
 * The column filters of the radiography's supplier table and of the repeated-purchases groups on real PostgreSQL
 * (owner decision of 4 November 2026). Fictive rows on a dedicated seap_test_* database, removed afterwards.
 */

const url = process.env.TEST_DATABASE_URL;
if (url && !/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error("Table fixtures require a dedicated seap_test_* database");

const A = "992280001", S1 = "992280002", S2 = "992280003", S3 = "992280004";

describe.skipIf(!url)("supplier and group table filters (isolated PostgreSQL)", () => {
  let sql: DbSql;
  const globals = globalThis as unknown as { __seapSql?: DbSql };
  beforeAll(async () => {
    sql = createDb(url).sql;
    const [existing] = await sql`select count(*)::int n from marts.supplier_dependency where authority_id = ${A}`;
    if (Number(existing?.n) !== 0) throw new Error("Leftover fixtures");
    globals.__seapSql = sql;
    const dep = (supplier: string, name: string, vAll: number, nHere: number, nDa: number) => sql`
      insert into marts.supplier_dependency (authority_id, supplier_id, supplier_name, v_here, da_here, v_all, v_total, n_here, n_da_here, n_auth)
      values (${A}, ${supplier}, ${name}, ${vAll}, 0, ${vAll}, ${vAll * 10}, ${nHere}, ${nDa}, 1)`;
    await dep(S1, "ALFA SRL", 5_000_000, 5, 19);
    await dep(S2, "Beta Medical", 900_000, 1, 0);
    await dep(S3, "Gama Lab", 40_000, 0, 300);
    const group = (id: number, supplier: string, name: string, year: string, type: string, count: number, total: number) => sql`
      insert into marts.flag_instances (id, flag_code, subject_type, entity_id, entity_name, partner_id, partner_name, period, evidence)
      values (${id}, 'da_split', 'authority', ${A}, 'SPITAL TEST', ${supplier}, ${name}, ${year},
        ${JSON.stringify({ type, count, total, ceiling: 270120, cpv_class: "3311" })}::jsonb)`;
    await group(992281001, S1, "ALFA SRL", "2024", "da_ceiling_goods_services", 99, 367_857);
    await group(992281002, S1, "ALFA SRL", "2018", "da_ceiling_goods_services", 12, 300_000);
    await group(992281003, S2, "Beta Medical", "2024", "da_ceiling_works", 4, 1_200_000);
  });
  afterAll(async () => {
    if (!sql) return;
    await sql`delete from marts.flag_instances where id between 992281001 and 992281003`;
    await sql`delete from marts.supplier_dependency where authority_id = ${A}`;
    await sql.end();
  });

  it("filters the radiography's suppliers by value, records and name, and keeps the authority's count", async () => {
    const page = (filters: Parameters<typeof getRadiografieSuppliers>[1]["filters"]) => getRadiografieSuppliers(A, { sort: "value", dir: "desc", page: 1, filters });
    expect((await page({})).total).toBe(3);
    const big = await page({ valoare: { kind: "range", min: 1_000_000, max: null } });
    expect([big.total, big.suppliers, big.rows.map((r) => r.name)]).toEqual([1, 3, ["ALFA SRL"]]);
    expect((await page({ inregistrari: { kind: "range", min: 100, max: null } })).rows.map((r) => r.name)).toEqual(["Gama Lab"]);
    expect((await page({ furnizor: { kind: "pick", values: [S2, S3] } })).total).toBe(2);
  });

  it("lists the suppliers' names largest first, and searches them without diacritics", async () => {
    const all = await getRadiografieFacet(A, "furnizor", {});
    expect(all.kind === "pick" && all.options.map((o) => o.label)).toEqual(["ALFA SRL", "Beta Medical", "Gama Lab"]);
    const found = await getRadiografieFacet(A, "furnizor", {}, { term: "bétà" });
    expect(found.kind === "pick" && found.options.map((o) => o.value)).toEqual([S2]);
    const records = await getRadiografieFacet(A, "inregistrari", { valoare: { kind: "range", min: 500_000, max: null } });
    expect(records.kind === "range" && [records.min, records.max]).toEqual([1, 24]);
  });

  it("filters the groups by year, type, partner, count and total", async () => {
    const total = async (filters: Parameters<typeof getSplitPairsPaged>[2]) => (await getSplitPairsPaged(A, "authority", filters)).total;
    expect(await total({})).toBe(3);
    expect(await total({ an: { kind: "options", values: ["2024"] } })).toBe(2);
    expect(await total({ tip: { kind: "options", values: ["da_ceiling_works"] } })).toBe(1);
    expect(await total({ partener: { kind: "pick", values: [S1] } })).toBe(2);
    expect(await total({ achizitii: { kind: "range", min: 10, max: 50 } })).toBe(1);
    expect(await total({ total: { kind: "range", min: 1_000_000, max: null } })).toBe(1);
    const { rows } = await getSplitPairsPaged(A, "authority", { an: { kind: "options", values: ["2024"] } });
    expect(rows.map((r) => [r.partnerName, r.purchaseType])).toEqual([["Beta Medical", "lucrări"], ["ALFA SRL", "produse / servicii"]]);
  });

  it("counts each group funnel under the other filters", async () => {
    const years = await getSplitFacet(A, "authority", "an", { partener: { kind: "pick", values: [S1] } });
    expect(years.kind === "options" && Object.fromEntries(years.options.map((o) => [o.value, o.n]))).toEqual({ "2018": 1, "2024": 1 });
    const types = await getSplitFacet(A, "authority", "tip", {});
    expect(types.kind === "options" && types.options.map((o) => [o.label, o.n])).toEqual([["produse / servicii", 2], ["lucrări", 1]]);
  });
});

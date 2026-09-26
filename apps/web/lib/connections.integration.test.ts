import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createDb, MONITORING_GATE, type DbSql } from "@seap/db";
import { getConnections, parseConnectionInput, readConnectionEntity } from "./connections";
import { runRows } from "./ask/compile";
import { sumDecimalStrings } from "./ask/evidence";

const url = process.env.TEST_DATABASE_URL;
if (url && !/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error("Connection fixtures require a dedicated seap_test_* database");
describe.skipIf(!url)("procurement relationships (isolated PostgreSQL)", () => {
  let sql: DbSql;
  const a = "887740001", b = "887740002", s = "887741001", c = "887749001", checkpoint = randomUUID();
  const fixtureIds = [checkpoint];
  const input = (extra = "") => parseConnectionInput(new URLSearchParams(`entityId=${a}&role=authority${extra}`));
  beforeAll(async () => {
    sql = createDb(url).sql;
    await sql`insert into core.entities(id,name_display,name_normalized,cui_canonical,cui_valid,county,country_code) values
      (${a},'Primăria A','primaria a','88774001',true,'Cluj','RO'),(${b},'Primăria B','primaria b','88774002',true,'Cluj','RO')`;
    await sql`insert into core.entities(id,name_display,name_normalized,cui_canonical,cui_valid,county,country_code)
      select 887741000+n,case when n=1 then 'Șantier Verde' else 'Furnizor '||n end,'supplier '||n,(88774100+n)::text,true,'Cluj','RO' from generate_series(1,24) n`;
    await sql`insert into marts.da_transactions(sicap_da_id,authority_id,supplier_id,closing_value,finalization_date)
      select 887742000+n,${a}::bigint,887741000+n,1,'2024-06-01' from generate_series(1,24) n`;
    await sql`insert into marts.da_transactions(sicap_da_id,authority_id,supplier_id,closing_value,finalization_date) values
      (887743001,${a},${s},100.0001,'2025-01-02'),(887743002,${a},${s},2.003,null),
      (887743003,${a},${s},2000001,'2025-01-03'),(887743004,${a},${s},0,'2025-01-03'),(887743005,${a},${s},-3,'2025-01-03'),
      (887743006,${a},null,7.25,'2025-01-03'),(887743007,${b},${s},50,'2023-03-04'),
      (887743008,${a},${a},6.75,'2025-01-03')`;
    await sql`insert into marts.contract_transactions(contract_id,supplier_id,authority_id,closing_value,contract_value_full,n_winners,finalization_date,also_in_ted,ted_pubnum) values
      (${c},${s},${a},0.0033,0.01,3,'2025-02-03',true,'999999-2025'),
      (${c},887741002,${a},0.0033,0.01,3,'2025-02-03',true,'999999-2025'),
      (${c},887741003,${a},0.0034,0.01,3,'2025-02-03',true,'999999-2025')`;
    await sql`insert into app.monitoring_refreshes(id,kind,status,completed_at,source_coverage,validation)
      values(${checkpoint},'baseline','ready',now(),'{}','{"fixture":true}')`;
  });
  afterAll(async () => {
    if (!sql) return;
    await sql`delete from app.monitoring_refreshes where id=any(${fixtureIds}::uuid[])`;
    await sql`delete from marts.contract_transactions where contract_id=${c}`;
    await sql`delete from marts.da_transactions where authority_id in (${a},${b})`;
    await sql`delete from core.entities where id in (${a},${b}) or id between 887741001 and 887741024`;
    await sql.end();
  });
  it("sums exact supplier allocations and distinguishes records from distinct contracts", async () => {
    const result = await getConnections(input(), sql);
    expect(result.summary).toEqual({ totalExact: "126.0131", daRows: 26, contractRows: 3, distinctContracts: 1,
      firstDate: "2024-06-01", lastDate: "2025-02-03", undatedRows: 1, partnerCount: 24 });
    expect(result.excluded).toEqual({ rowCount: 2, totalExact: "14", selfRows: 1 });
    expect(result.items[0]).toMatchObject({ entity: { id: s, cui: "88774101" }, totalExact: "103.0064", daRows: 3, contractRows: 1, distinctContracts: 1 });
    expect(result.items[0]?.spec).toMatchObject({ block: "stat", measure: "value", dataset: "all", filters: { authorityId: Number(a), supplierId: Number(s) } });
    expect(result.checkpoint.id).toBe(checkpoint);
  });
  it("follows a supplier into its other authorities and omits the return edge consistently", async () => {
    const identity = (await readConnectionEntity(sql, s, "supplier")).identity;
    const result = await getConnections({ ...input(), entityId: s, role: "supplier", identity, checkpointId: checkpoint }, sql);
    expect(result.summary).toMatchObject({ partnerCount: 2, totalExact: "153.0064", daRows: 4, contractRows: 1 });
    const others = await getConnections({ ...input(), entityId: s, role: "supplier", identity, excludeEntityId: a }, sql);
    expect(others.summary).toMatchObject({ partnerCount: 1, totalExact: "50", daRows: 1, contractRows: 0 });
    expect(others.items[0]?.entity.id).toBe(b);
    expect(others.items[0]?.spec.filters).toMatchObject({ authorityId: Number(b), supplierId: Number(s) });
  });
  it("paginates deterministically with full filtered totals, no missing or duplicated partners", async () => {
    const first = await getConnections(input(), sql), second = await getConnections(input("&page=2"), sql), beyond = await getConnections(input("&page=3"), sql);
    expect(first.items).toHaveLength(20); expect(second.items).toHaveLength(4); expect(beyond.items).toHaveLength(0);
    expect(new Set([...first.items, ...second.items].map(row => row.entity.id)).size).toBe(24);
    expect(second.summary).toEqual(first.summary);
    expect(second.pagination).toEqual({ page: 2, pageSize: 20, totalPages: 2, totalPartners: 24, hasNext: false });
  });
  it("restores an exact pair beyond page one without relying on ambiguous name matching", async () => {
    const broad = await getConnections(input("&search=Furnizor"), sql);
    expect(broad.pagination.totalPartners).toBe(23);
    expect(broad.items.some(item => item.entity.id === "887741024")).toBe(false);
    const exact = await getConnections(input("&partnerId=887741024"), sql);
    expect(exact.items).toHaveLength(1);
    expect(exact.items[0]?.entity.id).toBe("887741024");
    expect(exact.summary).toMatchObject({ partnerCount: 1, totalExact: "1", daRows: 1, contractRows: 0 });
    expect(exact.filters.partnerId).toBe("887741024");
    expect((await getConnections(input("&partnerId=887741024&excludeEntityId=887741024"), sql)).items).toHaveLength(0);
    expect((await getConnections({ ...input("&partnerId=887740002"), entityId: s, role: "supplier" }, sql)).items[0]?.entity.id).toBe(b);
  });
  it("honors channel, inclusive year and accent-insensitive literal name/CUI filters", async () => {
    expect((await getConnections(input("&dataset=contracts"), sql)).summary).toMatchObject({ totalExact: "0.01", daRows: 0, contractRows: 3, distinctContracts: 1 });
    expect((await getConnections(input("&dataset=da&yearFrom=2024&yearTo=2024"), sql)).summary).toMatchObject({ totalExact: "24", daRows: 24, undatedRows: 0 });
    expect((await getConnections(input("&yearFrom=2025&yearTo=2025"), sql)).summary).toMatchObject({ totalExact: "100.0101", daRows: 1, contractRows: 3, undatedRows: 0 });
    expect((await getConnections(input("&search=SANTIER"), sql)).summary).toMatchObject({ partnerCount: 1, totalExact: "103.0064" });
    expect((await getConnections(input("&search=88774101"), sql)).items[0]?.entity.id).toBe(s);
    expect((await getConnections(input("&search=%25"), sql)).items).toHaveLength(0);
    expect((await getConnections(input("&yearFrom=2026"), sql)).summary.totalExact).toBe("0");
  });
  it("reports self-identity source anomalies instead of displaying an unverifiable relationship", async () => {
    const authority = await getConnections(input(`&partnerId=${a}`), sql);
    expect(authority.items).toHaveLength(0);
    expect(authority.summary.partnerCount).toBe(0);
    expect(authority.excluded).toEqual({ rowCount: 2, totalExact: "14", selfRows: 1 });
    const supplier = await getConnections({ ...input(), role: "supplier" }, sql);
    expect(supplier.items).toHaveLength(0);
    expect(supplier.excluded).toEqual({ rowCount: 1, totalExact: "6.75", selfRows: 1 });
  });
  it("reconciles every displayed pair to the shared complete source compiler", async () => {
    for (const filter of ["", "&dataset=contracts", "&yearFrom=2025&yearTo=2025"]) {
      const result = await getConnections(input(filter), sql);
      for (const item of result.items) {
        const rows = await runRows(sql, item.spec, {
          authority: { query: a, entityId: a, nameDisplay: result.entity.name, county: "Cluj", alternatives: [] },
          supplier: { query: item.entity.id, entityId: item.entity.id, nameDisplay: item.entity.name, county: "Cluj", alternatives: [] },
        }, 0);
        if ("error" in rows) throw new Error(rows.error);
        expect(rows.total).toBe(item.daRows + item.contractRows);
        expect(sumDecimalStrings([rows.value, `-${item.totalExact}`])).toMatch(/^0\.0+$/);
        expect(new Set(rows.rows.filter(row => row.src === "contracts").map(row => row.refId)).size).toBe(item.distinctContracts);
      }
    }
  });
  it("fails closed on stale identities, missing parties, checkpoint drift and in-progress writers", async () => {
    const identity = (await readConnectionEntity(sql, a, "authority")).identity;
    await sql`update core.entities set cui_canonical='88774999' where id=${a}`;
    await expect(getConnections({ ...input(), identity }, sql)).rejects.toMatchObject({ status: 409 });
    await sql`update core.entities set cui_canonical='88774001' where id=${a}`;
    await expect(getConnections({ ...input(), entityId: "887740099" }, sql)).rejects.toMatchObject({ status: 404 });
    await expect(getConnections({ ...input(), checkpointId: randomUUID() }, sql)).rejects.toMatchObject({ status: 409 });
    const writer = await sql.reserve();
    try {
      await writer`select pg_advisory_lock(${MONITORING_GATE[0]},${MONITORING_GATE[1]})`;
      await expect(getConnections(input(), sql)).rejects.toMatchObject({ status: 503 });
    } finally { await writer`select pg_advisory_unlock(${MONITORING_GATE[0]},${MONITORING_GATE[1]})`; writer.release(); }
    const failed = randomUUID(); fixtureIds.push(failed);
    await sql`insert into app.monitoring_refreshes(id,kind,status,completed_at) values(${failed},'baseline','failed',now())`;
    await expect(getConnections(input(), sql)).rejects.toMatchObject({ status: 503 });
  });
});

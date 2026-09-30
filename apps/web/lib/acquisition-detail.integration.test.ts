import { afterAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { getAcquisitionDetail } from "./acquisition-detail";
import { getContractDetail } from "./marts";

const url = process.env.TEST_DETAIL_DATABASE_URL;
if (url && new URL(url).pathname !== "/seap_test_detail_calendar") throw Error("Dedicated detail test database required");
const q = url ? createDb(url).sql : null;
afterAll(async () => { await q?.end(); });

describe.skipIf(!q)("acquisition context without an archived title", () => {
  it("retains CPV, exact money, state and Romanian calendar dates without a raw document", async () => {
    const rollback = Error("rollback details fixture");
    await expect(q!.begin(async tx => {
      await tx`insert into core.cpv_codes(code,name_ro,revision,division) values('30125100-2','Cartuşe de toner','Rev.2','30')`;
      const [a] = await tx`insert into core.entities(name_display,name_normalized) values('Școală exemplu','scoala exemplu') returning id`;
      await tx`insert into core.direct_acquisitions(sicap_da_id,da_code,authority_entity_id,cpv_code,state,closing_value,publication_date,finalization_date)
        values(99001,'DA99001',${a!.id},'30125100-2','Oferta acceptata',9007199254740993.012340,'2025-12-31T21:55:00Z','2025-12-31T22:15:00Z')`;
      const d = await getAcquisitionDetail("99001", tx as unknown as DbSql);
      expect(d).toMatchObject({ title: null, cpvName: "Cartuşe de toner", cpvCode: "30125100-2", value: "9007199254740993.012340",
        estimate: null, state: "Oferta acceptata", publishedAt: "2025-12-31 23:55", finalizedAt: "2026-01-01 00:15", supplier: null });
      const [r] = await tx`insert into raw.raw_documents(source,external_id,endpoint_version,payload,content_hash)
        values('sicap','detail-test','test','{"directAcquisitionName":"  Titlul din sursă  "}','detail-fixture') returning id`;
      await tx`update core.direct_acquisitions set raw_id=${r!.id} where sicap_da_id=99001`;
      expect((await getAcquisitionDetail("99001", tx as unknown as DbSql))?.title).toBe("Titlul din sursă");
      await tx`update raw.raw_documents set payload='{"directAcquisitionName":"  "}' where id=${r!.id}`;
      expect((await getAcquisitionDetail("99001", tx as unknown as DbSql))?.title).toBeNull();
      throw rollback;
    })).rejects.toBe(rollback);
  });
  it("returns no record for missing or malformed identifiers", async () => {
    expect(await getAcquisitionDetail("99002", q!)).toBeNull();
    expect(await getAcquisitionDetail("1;select 1", q!)).toBeNull();
  });
  it("keeps a contract's Romanian signing date, inherited CPV and exact allocated shares", async () => {
    const globals = globalThis as unknown as { __seapSql?: DbSql };
    const previous = globals.__seapSql;
    const rollback = Error("rollback contract fixture");
    try {
      await expect(q!.begin(async tx => {
        globals.__seapSql = tx as unknown as DbSql;
        await tx`insert into core.cpv_codes(code,name_ro,revision,division) values('30125100-2','Cartuşe de toner','Rev.2','30')`;
        const [a] = await tx`insert into core.entities(name_display,name_normalized) values('Autoritate test','autoritate test') returning id`;
        const [s] = await tx`insert into core.entities(name_display,name_normalized) values('Furnizor test','furnizor test') returning id`;
        const [raw] = await tx`insert into raw.raw_documents(source,external_id,endpoint_version,payload,content_hash) values('sicap','contract-fixture','test','{}','contract-fixture') returning id`;
        await tx`insert into core.awards(raw_id,ca_notice_id,authority_entity_id,cpv_code) values(${raw!.id},99001,${a!.id},'30125100-2')`;
        const [c] = await tx`insert into core.contracts(raw_id,ca_notice_contract_id,ca_notice_id,title,contract_date,contract_value,currency)
          values(${raw!.id},99001,99001,'Contract test','2025-07-15T21:00:00Z',1234567.012340,'RON') returning id`;
        await tx`insert into core.contract_winners(contract_id,entity_id) values(${c!.id},${s!.id})`;
        await tx`insert into marts.contract_transactions(contract_id,supplier_id,authority_id,closing_value,n_winners)
          values(${c!.id},${s!.id},${a!.id},1234567.012340,1)`;
        const d = await getContractDetail("99001");
        expect(d).toMatchObject({ contractDate: "2025-07-16", contractValueExact: "1234567.012340", cpvCode: "30125100-2", cpvName: "Cartuşe de toner", cpvFromNotice: true });
        expect(d?.winners[0]?.shareRonExact).toBe("1234567.012340");
        throw rollback;
      })).rejects.toBe(rollback);
    } finally {
      if (previous) globals.__seapSql = previous; else delete globals.__seapSql;
    }
  });
});

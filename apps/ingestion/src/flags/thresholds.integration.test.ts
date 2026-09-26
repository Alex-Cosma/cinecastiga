import { afterAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { DA_CEILING_SEED_ROWS } from "@seap/domain";
import { daSlicingSelectSql } from "./radiografie.js";
import { confirmedSingleBidAwardsSql } from "./competition.js";
import { daThresholdDateSql, daThresholdKeySql } from "./thresholds.js";

/** SELECT-only fixtures. No inserts, schema changes, or derived-data rebuilds. */
const { sql } = createDb();
afterAll(() => sql.end());
const limits = { minValue: 1_000_000, maxValue: 1_000_000_000, severityReference: 10_000_000 };
const thresholds = (q: DbSql) => q`select * from jsonb_to_recordset(${JSON.stringify(DA_CEILING_SEED_ROWS.map((r) => ({
  key: r.key, valid_from: `${r.validFrom}T00:00:00Z`, valid_to: r.validTo ? `${r.validTo}T00:00:00Z` : null, value_num: r.valueNum,
})))}::jsonb) as r(key text, valid_from timestamptz, valid_to timestamptz, value_num numeric)`;

describe("threshold and competition SQL (read-only fixtures)", () => {
  it("uses initiation-date proxy, Romanian civil dates and explicit types, leaving unknown unclassified", async () => {
    await sql.begin("read only", async (tx) => {
      const q = tx as unknown as DbSql;
      const cases = [
        { id: 1, cpv: "45000000-7", typ: null, publication: "2022-09-09T12:00:00Z", finalization: "2022-09-11T12:00:00Z" },
        { id: 2, cpv: "44110000-4", typ: "Lucrari", publication: "2022-09-10T12:00:00Z", finalization: "2022-09-11T12:00:00Z" },
        { id: 3, cpv: null, typ: null, publication: null, finalization: "2022-09-10T12:00:00Z" },
        { id: 4, cpv: "45000000-7", typ: "Unknown", publication: null, finalization: "2022-09-10T12:00:00Z" },
        { id: 5, cpv: "45000000-7", typ: null, publication: "2022-09-09T21:00:00Z", finalization: "2022-09-10T12:00:00Z" },
        { id: 6, cpv: "03111800-9", typ: null, publication: null, finalization: "2016-05-25T12:00:00Z" },
      ];
      const date = daThresholdDateSql(q, q`d.publication`, q`d.finalization`);
      const key = daThresholdKeySql(q, q`d.cpv`, q`d.typ`);
      const rows = await q`
        with th as (${thresholds(q)}), d as (
          select * from jsonb_to_recordset(${JSON.stringify(cases)}::jsonb)
            as r(id int, cpv text, typ text, publication timestamptz, finalization timestamptz)
        ) select d.id, th.value_num::text ceiling from d
          left join th on th.key = ${key} and (th.valid_from at time zone 'UTC')::date <= ${date}
            and (th.valid_to is null or (th.valid_to at time zone 'UTC')::date > ${date})
        order by d.id
      `;
      expect(rows.map((r) => r["ceiling"])).toEqual(["450200", "900400", null, null, "900400", null]);
    });
  });

  it("uses the largest applicable window ceiling and excludes wrong types, unknowns and above-ceiling purchases", async () => {
    await sql.begin("read only", async (tx) => {
      const q = tx as unknown as DbSql;
      let id = 0;
      const fixtures: Record<string, unknown>[] = [];
      const add = (supplier: number, dates: string[], value: number, cpv = "03111800-9", typ: string | null = null) => {
        for (const d of dates) fixtures.push({ sicap_da_id: ++id, authority_id: 1, supplier_id: supplier,
          supplier_name: `Supplier ${supplier}`, cpv_code: cpv, cpv_name: "Fixture", acquisition_type: typ,
          publication_date: `${d}T10:00:00Z`, finalization_date: `${d} 12:00`, closing_value: value, value_suspect: false });
      };
      const crossEra = ["2022-09-01", "2022-09-05", "2022-09-11"];
      add(10, crossEra, 100_000); // 300k exceeds the higher 270120 ceiling.
      add(11, crossEra, 80_000); // 240k must NOT be compared with September 1's lower ceiling.
      const old = ["2020-01-01", "2020-01-02", "2020-01-03"];
      add(12, old, 100_000, "45000000-7"); // Works: 300k <450200, not goods ceiling135060.
      add(13, old, 200_000, "45000000-7"); // Works:600k >450200.
      add(14, old, 50_000, "00000000-0"); // Unknown CPV and no explicit type.
      add(15, old, 50_000, "03111800-9", "Unsupported");
      add(16, old.slice(0, 2), 60_000); add(16, old.slice(2), 140_000); // Third purchase is already over its ceiling.
      add(17, old.slice(0, 2), 60_000); add(17, old.slice(2), 60_000, "03111800-9", "Lucrari"); // Do not mix types.
      add(18, ["2018-06-01", "2018-06-02", "2018-06-03"], 44_200); //132600 >132519 before June4.
      const rows = await q`
        with fixtures as (
          select * from jsonb_to_recordset(${JSON.stringify(fixtures)}::jsonb) as r(
            sicap_da_id bigint, authority_id bigint, supplier_id bigint, supplier_name text, cpv_code text,
            cpv_name text, acquisition_type text, publication_date text, finalization_date text,
            closing_value numeric, value_suspect boolean)
        ), acquisitions as (
          select sicap_da_id, cpv_code, acquisition_type, publication_date::timestamptz publication_date,
            (finalization_date || '+00')::timestamptz finalization_date from fixtures
        ), thresholds as (${thresholds(q)})
        select * from (${daSlicingSelectSql(q, { transactions: q`fixtures`, acquisitions: q`acquisitions`, thresholds: q`thresholds` })}) slices
      `;
      const bySupplier = new Map(rows.map((r) => [String(r["supplier_id"]), r]));
      expect([...bySupplier.keys()].sort()).toEqual(["10", "13", "18"]);
      expect(String(bySupplier.get("10")?.["ceiling"])).toBe("270120");
      expect(String(bySupplier.get("10")?.["sum_window"])).toBe("300000");
      expect(String(bySupplier.get("13")?.["ceiling"])).toBe("450200");
      expect(String(bySupplier.get("18")?.["ceiling"])).toBe("132519");
    });
  });

  it("does not infer a single tender from equal prices, unknown counts, invalid counts or weak matches", async () => {
    await sql.begin("read only", async (tx) => {
      const q = tx as unknown as DbSql;
      const counts = [1, 2, null, 1, 0, 1, 1];
      const awards = counts.map((_, i) => ({ id: i + 1, ca_notice_id: i + 100,
        state_date: "2026-01-01T00:00:00Z", procedure_type: "Licitatie deschisa",
        ron_contract_value: 2_000_000, cpv_code: "45000000-7", lowest_offer_value: 2_000_000, highest_offer_value: 2_000_000 }));
      const contracts = awards.map((r) => ({ id: r.id, ca_notice_id: r.ca_notice_id, ca_notice_contract_id: r.id + 1000 }));
      contracts.push({ id: 8, ca_notice_id: 100, ca_notice_contract_id: 1008 }); // Additional unknown lot in first notice.
      const competition = counts.map((n, i) => ({ contract_id: i + 1, ted_lot_result_id: i + 500,
        match_score: i === 3 ? 0.85 : i === 6 ? 0.9 : 0.95, tenders_received: n, is_single_bidder: i === 5 ? false : n === 1 }));
      const rows = await q`
        with awards as (select * from jsonb_to_recordset(${JSON.stringify(awards)}::jsonb) as r(
          id bigint, ca_notice_id bigint, state_date timestamptz, procedure_type text, ron_contract_value numeric,
          cpv_code text, lowest_offer_value numeric, highest_offer_value numeric)),
        contracts as (select * from jsonb_to_recordset(${JSON.stringify(contracts)}::jsonb) as r(
          id bigint, ca_notice_id bigint, ca_notice_contract_id bigint)),
        competition as (select * from jsonb_to_recordset(${JSON.stringify(competition)}::jsonb) as r(
          contract_id bigint, ted_lot_result_id bigint, match_score real, tenders_received int, is_single_bidder boolean))
        ${confirmedSingleBidAwardsSql(q, limits, { awards: q`awards`, contracts: q`contracts`, competition: q`competition` })}
      `;
      expect(rows.map((r) => String(r["id"])).sort()).toEqual(["1", "7"]);
      const evidence = rows.find((r) => String(r["id"]) === "1")!["evidence"] as { confirmed_contract_count: number; value_scope: string; contracts: { contract_id: string }[] };
      expect(evidence.confirmed_contract_count).toBe(1);
      expect(evidence.value_scope).toBe("notice");
      expect(evidence.contracts.map((c) => c.contract_id)).toEqual(["1001"]);
    });
  });
});

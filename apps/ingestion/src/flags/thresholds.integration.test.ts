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

  const singleBid = (q: DbSql, awards: Record<string, unknown>[], contracts: Record<string, unknown>[], competition: Record<string, unknown>[]) => q`
    with awards as (select * from jsonb_to_recordset(${JSON.stringify(awards)}::jsonb) as r(
      id bigint, ca_notice_id bigint, state_date timestamptz, procedure_type text, ron_contract_value numeric,
      cpv_code text, lowest_offer_value numeric, highest_offer_value numeric)),
    contracts as (select * from jsonb_to_recordset(${JSON.stringify(contracts)}::jsonb) as r(
      id bigint, raw_id bigint, ca_notice_id bigint, ca_notice_contract_id bigint, contract_no text, title text,
      source_contract_type int, contract_type_raw_id bigint, amount_status text, amount_raw_id bigint,
      value_ron numeric, currency text, contract_value numeric)),
    competition as (select * from jsonb_to_recordset(${JSON.stringify(competition)}::jsonb) as r(
      contract_id bigint, ted_lot_result_id bigint, match_score real, tenders_received int, is_single_bidder boolean))
    select * from (${confirmedSingleBidAwardsSql(q, limits, { awards: q`awards`, contracts: q`contracts`, competition: q`competition` })}) single_bid
  `;
  /** Contract without an archived SEAP type or money audit: legacy title rules and RON currency. */
  const legacyContract = (id: number, notice: number, value: number | null = 500_000, title = "Contract de lucrari"): Record<string, unknown> => ({
    id, raw_id: id, ca_notice_id: notice, ca_notice_contract_id: id + 1000, contract_no: `C${id}`, title,
    source_contract_type: null, contract_type_raw_id: null, amount_status: null, amount_raw_id: null,
    value_ron: null, currency: value === null ? null : "RON", contract_value: value });

  it("does not infer a single tender from equal prices, unknown counts, invalid counts or weak matches", async () => {
    await sql.begin("read only", async (tx) => {
      const q = tx as unknown as DbSql;
      const counts = [1, 2, null, 1, 0, 1, 1];
      const awards = counts.map((_, i) => ({ id: i + 1, ca_notice_id: i + 100,
        state_date: "2026-01-01T00:00:00Z", procedure_type: "Licitatie deschisa",
        ron_contract_value: 2_000_000, cpv_code: "45000000-7", lowest_offer_value: 2_000_000, highest_offer_value: 2_000_000 }));
      const contracts = awards.map((r) => legacyContract(r.id, r.ca_notice_id));
      contracts.push(legacyContract(8, 100)); // Additional unknown lot in first notice.
      const competition = counts.map((n, i) => ({ contract_id: i + 1, ted_lot_result_id: i + 500,
        match_score: i === 3 ? 0.85 : i === 6 ? 0.9 : 0.95, tenders_received: n, is_single_bidder: i === 5 ? false : n === 1 }));
      const rows = await singleBid(q, awards, contracts, competition);
      expect(rows.map((r) => String(r["id"])).sort()).toEqual(["1", "7"]);
      const evidence = rows.find((r) => String(r["id"]) === "1")!["evidence"] as { confirmed_contract_count: number; value_scope: string; value: number; notice_value: number; contracts: { contract_id: string }[] };
      expect(evidence.confirmed_contract_count).toBe(1);
      expect(evidence.value_scope).toBe("notice");
      expect(evidence.value).toBe(2_000_000);
      expect(evidence.notice_value).toBe(2_000_000);
      expect(evidence.contracts.map((c) => c.contract_id)).toEqual(["1001"]);
    });
  });

  // Audit F23: SEAP's award list carries 0 for about one notice in six. A 0 or
  // missing notice value is unknown, not "below 1 million"; it falls back to
  // the cited contracts/call-offs, never to framework ceilings or addenda.
  it("treats a 0 or missing notice value as unknown and falls back to cited contracts, not ceilings", async () => {
    await sql.begin("read only", async (tx) => {
      const q = tx as unknown as DbSql;
      const notice = (id: number, value: number | null) => ({ id, ca_notice_id: id + 100, state_date: "2026-01-01T00:00:00Z",
        procedure_type: "Licitatie deschisa", ron_contract_value: value, cpv_code: "45000000-7",
        lowest_offer_value: null, highest_offer_value: null });
      const typed = (id: number, award: number, type: number, value: number | null, title = "Contract") => ({
        ...legacyContract(id, award + 100, value, title), source_contract_type: type, contract_type_raw_id: id,
        amount_status: value === null ? "missing_value" : "ron", amount_raw_id: id, value_ron: value,
        currency: "RON", contract_value: value });
      const awards = [notice(11, 0), notice(12, 0), notice(13, null), notice(14, 0), notice(15, 9_263_922.09),
        notice(16, 0), notice(17, 0), notice(18, 0), notice(19, 500_000)];
      const contracts: Record<string, unknown>[] = [
        typed(21, 11, 1, 1_500_000), // Identified contract: the notice becomes evaluable.
        typed(22, 12, 2, 606_640_000, "Acord-cadru"), // Ceiling only: stays unevaluated.
        legacyContract(23, 113, 600_000), legacyContract(24, 113, 500_000, "Contract subsecvent nr. 2"),
        legacyContract(25, 113, 50_000_000, "Acord – cadru servicii"), // Cited, never the fallback.
        typed(26, 14, 1, 900_000), // Below the floor.
        typed(27, 15, 1, 22_551_839), // Positive notice value is kept; the excess is recorded.
        typed(28, 16, 1, 1_200_000), typed(29, 16, 1, null), // Unknown RON value counted, not guessed.
        legacyContract(30, 117, 1_200_000, "Act aditional nr. 1"), // An addendum is not a new order.
        typed(31, 18, 1, 1_500_000_000), // Above the plausibility cap.
        typed(32, 19, 1, 5_000_000), // A positive notice value is the source value, even when smaller.
      ];
      const competition = contracts.map((c, i) => ({ contract_id: c["id"], ted_lot_result_id: 900 + i,
        match_score: 0.95, tenders_received: 1, is_single_bidder: true }));
      const rows = await singleBid(q, awards, contracts, competition);
      const byId = new Map(rows.map((r) => [String(r["id"]), r]));
      expect([...byId.keys()].sort()).toEqual(["11", "13", "15", "16"]);
      const ev = (id: string) => byId.get(id)!["evidence"] as Record<string, unknown>;
      expect(ev("11")).toMatchObject({ value: 1_500_000, value_scope: "confirmed_contracts", notice_value: 0,
        cited_contracts_value: 1_500_000, cited_reportable_value: 1_500_000, cited_unknown_value_count: 0 });
      expect(Number(byId.get("11")!["least"])).toBeCloseTo(0.15);
      expect(ev("13")).toMatchObject({ value: 1_100_000, value_scope: "confirmed_contracts", notice_value: null,
        cited_contracts_value: 51_100_000, cited_reportable_value: 1_100_000, confirmed_contract_count: 3 });
      expect(ev("15")).toMatchObject({ value: 9_263_922.09, value_scope: "notice", notice_value: 9_263_922.09,
        cited_contracts_value: 22_551_839 });
      expect(ev("16")).toMatchObject({ value: 1_200_000, value_scope: "confirmed_contracts",
        cited_contracts_value: 1_200_000, cited_unknown_value_count: 1 });
    });
  });
});

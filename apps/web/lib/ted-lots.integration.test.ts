import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { getAwardNoticeDetail } from "./marts";
import { getNoticeLotsFacet } from "./notice-lots";
import { getTedAwards, getTedFacet } from "./ted-awards";
import { clearFacetCache } from "./table-filters/server/query";
import type { FilterState } from "./table-filters/types";

/*
 * The column filters of /supra-prag's TED awards and of an award notice's records on real PostgreSQL (owner decision
 * of 4 November 2026), migration 0098's indexes included. Fictive rows on a dedicated seap_test_* database, removed
 * afterwards.
 */

const url = process.env.TEST_DATABASE_URL;
if (url && !/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error("Table fixtures require a dedicated seap_test_* database");

const BUYER = "992290001", W1 = "992290002", W2 = "992290003", NOTICE = "992290100";

describe.skipIf(!url)("TED awards and notice records filters (isolated PostgreSQL)", () => {
  let sql: DbSql;
  const globals = globalThis as unknown as { __seapSql?: DbSql };
  beforeAll(async () => {
    sql = createDb(url).sql;
    const [existing] = await sql`select count(*)::int n from marts.ted_awards`;
    if (Number(existing?.n) !== 0) throw new Error("Expected an empty migrated test database");
    globals.__seapSql = sql;
    clearFacetCache();
    await sql`insert into core.entities (id, name_display, name_normalized) values
      (${BUYER}, 'SPITALUL TEST', 'spitalul test'), (${W1}, 'Siemens Test GmbH', 'siemens test gmbh'), (${W2}, 'ALFA SRL', 'alfa srl')`;
    const ted = (id: string, winners: string[], countries: string[], foreign: boolean, procedure: string, label: string, single: boolean | null, offers: number | null, value: number, currency: string) => sql`
      insert into marts.ted_awards (ted_lot_result_id, buyer_entity_id, buyer_name, winner_entity_ids, winner_names, winner_countries, is_foreign,
        procedure_type, label, is_single_bidder, tenders_received, awarded_value, currency, amount_kind, award_date)
      values (${id}, ${BUYER}, 'SPITALUL TEST', ${sql.array(winners)}::bigint[], ${sql.array(winners.map((w) => (w === W1 ? "Siemens Test GmbH" : "ALFA SRL")))}::text[],
        ${sql.array(countries)}::text[], ${foreign}, ${procedure}, ${label}, ${single}, ${offers}, ${value}, ${currency}, 'payable', '2025-01-01')`;
    await ted("992292001", [W1], ["DE"], true, "open", "ted-only", true, 1, 5_000_000, "RON");
    await ted("992292002", [W1, W2], ["DE", "RO"], true, "restricted", "also-in-seap", false, 3, 200_000, "EUR");
    await ted("992292003", [W2], ["RO"], false, "open", "possible-match", null, null, 80_000, "RON");
    await sql`insert into core.awards (raw_id, ca_notice_id, notice_no) values (${NOTICE}, ${NOTICE}, 'N992')`;
    const lot = (n: number, title: string, date: string, value: number) => sql`
      insert into core.contracts (id, raw_id, contract_type_raw_id, ca_notice_contract_id, ca_notice_id, contract_no, contract_date, contract_value, currency, title, source_contract_type)
      values (${992291000 + n}, ${992291000 + n}, ${992291000 + n}, ${992291000 + n}, ${NOTICE}, ${`C${n}`}, ${date}, ${value}, 'RON', ${title}, ${n === 1 ? 2 : 3})`;
    await lot(1, "Acord-cadru furnizare", "2020-01-10", 900_000);
    await lot(2, "Contract subsecvent 1", "2020-03-10", 50_000);
    await lot(3, "Contract subsecvent 2", "2021-02-10", 70_000);
    await sql`insert into core.contract_winners (contract_id, entity_id) values (992291001, ${W2}), (992291002, ${W2}), (992291003, ${W1})`;
  });
  afterAll(async () => {
    if (!sql) return;
    await sql`delete from core.contract_winners where contract_id between 992291001 and 992291003`;
    await sql`delete from core.contracts where ca_notice_id = ${NOTICE}`;
    await sql`delete from core.awards where ca_notice_id = ${NOTICE}`;
    await sql`delete from marts.ted_awards where ted_lot_result_id between 992292001 and 992292003`;
    await sql`delete from core.entities where id in (${BUYER}, ${W1}, ${W2})`;
    await sql.end();
  });

  const total = async (filters: FilterState, sort: "date" | "value" = "date") => (await getTedAwards({ filters, sort, page: 1, pageSize: 60 })).total;

  it("filters the TED awards by winner, country, match, offers, procedure and value in lei", async () => {
    expect(await total({})).toBe(3);
    expect(await total({ castigator: { kind: "pick", values: [W1] } })).toBe(2);
    expect(await total({ tara: { kind: "options", values: ["strain"] } })).toBe(2);
    expect(await total({ tara: { kind: "options", values: ["DE"] } })).toBe(2);
    expect(await total({ potrivire: { kind: "options", values: ["ted-only"] } })).toBe(1);
    expect(await total({ oferte: { kind: "options", values: ["unu"] } })).toBe(1);
    expect(await total({ oferte: { kind: "options", values: ["mai_multe", "necunoscut"] } })).toBe(2);
    expect(await total({ procedura: { kind: "options", values: ["restricted"] } })).toBe(1);
    // a value in lei only: the euro award never matches a value filter, nor the sort by value
    expect(await total({ valoare: { kind: "range", min: 100_000, max: null } })).toBe(1);
    expect(await total({}, "value")).toBe(2);
  });

  it("counts the TED funnels under the other filters, the countries on the foreign winners only", async () => {
    const countries = await getTedFacet("tara", {});
    expect(countries.kind === "options" && Object.fromEntries(countries.options.map((o) => [o.value, o.n]))).toEqual({ strain: 2, DE: 2 });
    const winners = await getTedFacet("castigator", { procedura: { kind: "options", values: ["open"] } });
    // equal counts by id: the names are read for the options shown, after the count
    expect(winners.kind === "pick" && winners.options.map((o) => [o.label, o.n])).toEqual([["Siemens Test GmbH", 1], ["ALFA SRL", 1]]);
    const searched = await getTedFacet("castigator", {}, { term: "siemens" });
    expect(searched.kind === "pick" && searched.options.map((o) => o.value)).toEqual([W1]);
  });

  it("filters a notice's records and keeps its totals whole", async () => {
    const all = await getAwardNoticeDetail(NOTICE);
    expect([all?.nLots, all?.nShown]).toEqual([3, 3]);
    const calloffs = await getAwardNoticeDetail(NOTICE, 1, 50, { tip: { kind: "options", values: ["calloff"] } });
    expect([calloffs?.nLots, calloffs?.nShown, calloffs?.lots.map((l) => l.title)]).toEqual([3, 2, ["Contract subsecvent 2", "Contract subsecvent 1"]]);
    const byWinner = await getAwardNoticeDetail(NOTICE, 1, 50, { castigator: { kind: "pick", values: [W1] } });
    expect(byWinner?.lots.map((l) => l.title)).toEqual(["Contract subsecvent 2"]);
    const in2020 = await getAwardNoticeDetail(NOTICE, 1, 50, { data: { kind: "dates", years: ["2020"], from: null, to: null } });
    expect(in2020?.nShown).toBe(2);
  });

  it("counts a notice's funnels", async () => {
    const kinds = await getNoticeLotsFacet(NOTICE, "tip", {});
    expect(kinds.kind === "options" && Object.fromEntries(kinds.options.map((o) => [o.value, o.n]))).toEqual({ calloff: 2, framework: 1 });
    const winners = await getNoticeLotsFacet(NOTICE, "castigator", { tip: { kind: "options", values: ["calloff"] } });
    expect(winners.kind === "pick" && winners.options.map((o) => [o.label, o.n])).toEqual([["Siemens Test GmbH", 1], ["ALFA SRL", 1]]);
  });
});

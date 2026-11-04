import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { getEntityTransactions, getEntityTxFacet } from "./entity-tx";
import type { FilterState } from "./table-filters/types";

/*
 * The entity table's column filters on real PostgreSQL (owner decision of 4 November 2026): every filter kind on the
 * rows, every funnel's counts under the other filters, the names looked up for the shown options only, and the
 * excluded direct acquisitions read only when the type funnel chooses them. Fictive rows on a dedicated seap_test_*
 * database, removed afterwards.
 */

const url = process.env.TEST_DATABASE_URL;
if (url && !/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error("Entity table fixtures require a dedicated seap_test_* database");

const A = "992270001", ALFA = "992270002", BETA = "992270003";
const years = (...y: string[]): FilterState => ({ data: { kind: "dates", years: y, from: null, to: null } });

describe.skipIf(!url)("entity table column filters (isolated PostgreSQL)", () => {
  let sql: DbSql;
  const globals = globalThis as unknown as { __seapSql?: DbSql };
  beforeAll(async () => {
    sql = createDb(url).sql;
    const [existing] = await sql`select count(*)::int n from marts.da_transactions`;
    if (Number(existing?.n) !== 0) throw new Error("Expected an empty migrated test database");
    globals.__seapSql = sql;
    await sql`insert into core.entities (id, name_display, name_normalized) values
      (${A}, 'PRIMARIA TEST', 'primaria test'), (${ALFA}, 'ALFA SRL', 'alfa srl'), (${BETA}, 'Beta Topografie SRL', 'beta topografie srl')`;
    await sql`insert into core.cpv_codes (code, name_ro, revision, division) values
      ('71621000-7', 'Servicii de analiză sau consultanţă tehnică', 'Rev.2', '71'),
      ('71351810-4', 'Servicii de topografie', 'Rev.2', '71'),
      ('45000000-7', 'Lucrări de construcţii', 'Rev.2', '45') on conflict do nothing`;
    const da = (id: number, supplier: string, name: string, cpv: string, value: string, date: string, flags: string[]) => sql`
      insert into marts.da_transactions (sicap_da_id, authority_id, authority_name, supplier_id, supplier_name, cpv_code, cpv_name, closing_value, finalization_date, da_flags, value_suspect)
      values (${id}, ${A}, 'PRIMARIA TEST', ${supplier}, ${name}, ${cpv}, 'din mart', ${value}, ${date}, ${sql.array(flags)}::text[], false)`;
    await da(992271001, ALFA, "ALFA SRL", "71621000-7", "3000", "2021-02-10 11:00", []);
    await da(992271002, ALFA, "ALFA SRL", "71621000-7", "5000", "2021-03-01 09:00", ["da_round"]);
    await da(992271003, BETA, "Beta Topografie SRL", "71351810-4", "20000", "2022-05-05 10:00", []);
    await da(992271004, BETA, "Beta Topografie SRL", "71351810-4", "0", "2022-06-01 10:00", []);
    await sql`insert into marts.contract_transactions (contract_id, supplier_id, authority_id, authority_name, supplier_name, cpv_code, cpv_name, closing_value, contract_value_full, n_winners, finalization_date, is_single_bidder)
      values (992272001, ${BETA}, ${A}, 'PRIMARIA TEST', 'Beta Topografie SRL', '45000000-7', 'Lucrări de construcţii', 100000, 100000, 1, '2022-07-01', true)`;
  });
  afterAll(async () => {
    if (!sql) return;
    await sql`delete from marts.contract_transactions where contract_id = 992272001`;
    await sql`delete from marts.da_transactions where sicap_da_id between 992271001 and 992271004`;
    await sql`delete from core.entities where id in (${A}, ${ALFA}, ${BETA})`;
    await sql.end();
  });

  const total = async (filters: FilterState) => (await getEntityTransactions(A, "authority", { filters, pageSize: 10 })).total;

  it("filters the rows by every kind of column", async () => {
    expect(await total({})).toBe(4); // three direct acquisitions in the total and the contract
    expect(await total(years("2021"))).toBe(2);
    expect(await total({ data: { kind: "dates", years: [], from: "2021-03", to: "2022-05" } })).toBe(2);
    expect(await total({ partener: { kind: "pick", values: [BETA] } })).toBe(2);
    expect(await total({ cpv: { kind: "pick", values: ["71621000-7"] } })).toBe(2);
    expect(await total({ valoare: { kind: "range", min: 4000, max: null } })).toBe(3);
    expect(await total({ tip: { kind: "options", values: ["contracte"] } })).toBe(1);
    expect(await total({ semnale: { kind: "options", values: ["da_round"] } })).toBe(1);
    expect(await total({ semnale: { kind: "options", values: ["un_ofertant"] } })).toBe(1);
    expect(await total({ semnale: { kind: "options", values: ["fara"] } })).toBe(2);
  });

  it("reads the excluded direct acquisitions only when chosen", async () => {
    const { rows, total: n } = await getEntityTransactions(A, "authority", { filters: { tip: { kind: "options", values: ["excluse"] } }, pageSize: 10 });
    expect(n).toBe(1);
    expect(rows[0]).toMatchObject({ sicapDaId: "992271004", src: "da" });
  });

  it("counts each funnel under the other filters, its own left out", async () => {
    expect(await getEntityTxFacet(A, "authority", "tip", {})).toEqual({
      kind: "options", more: false,
      options: [{ value: "directe", label: "achiziții directe", n: 3 }, { value: "contracte", label: "contracte", n: 1 }, { value: "excluse", label: "excluse din total", n: 1 }],
    });
    const partners = await getEntityTxFacet(A, "authority", "partener", years("2022"));
    expect(partners).toEqual({ kind: "pick", more: false, options: [{ value: BETA, label: "Beta Topografie SRL", n: 2 }] });
    // the chosen partner first, its own filter not narrowing its funnel
    const chosen = await getEntityTxFacet(A, "authority", "partener", { partener: { kind: "pick", values: [BETA] } });
    expect(chosen.kind === "pick" && chosen.options.map((o) => [o.label, o.n])).toEqual([["Beta Topografie SRL", 2], ["ALFA SRL", 2]]);
    const signals = await getEntityTxFacet(A, "authority", "semnale", {});
    expect(signals.kind === "options" && Object.fromEntries(signals.options.map((o) => [o.value, o.n]))).toEqual({ fara: 2, da_round: 1, un_ofertant: 1 });
  });

  it("searches a funnel by name or code, without diacritics", async () => {
    const byName = await getEntityTxFacet(A, "authority", "partener", {}, { term: "alfă" });
    expect(byName.kind === "pick" && byName.options.map((o) => o.label)).toEqual(["ALFA SRL"]);
    const cpv = await getEntityTxFacet(A, "authority", "cpv", {}, { term: "topografie" });
    expect(cpv.kind === "pick" && cpv.options).toEqual([{ value: "71351810-4", label: "Servicii de topografie", n: 1 }]);
    const code = await getEntityTxFacet(A, "authority", "cpv", {}, { term: "4500" });
    expect(code.kind === "pick" && code.options.map((o) => o.value)).toEqual(["45000000-7"]);
  });

  it("gives the months of the date funnel and the spread of the value funnel", async () => {
    const dates = await getEntityTxFacet(A, "authority", "data", { tip: { kind: "options", values: ["directe"] } });
    expect(dates).toEqual({ kind: "dates", undated: 0, months: [{ month: "2021-02", n: 1 }, { month: "2021-03", n: 1 }, { month: "2022-05", n: 1 }] });
    const values = await getEntityTxFacet(A, "authority", "valoare", {});
    expect(values.kind === "range" && [values.min, values.max, values.bins.reduce((n, b) => n + b.n, 0)]).toEqual([3000, 100000, 4]);
  });
});

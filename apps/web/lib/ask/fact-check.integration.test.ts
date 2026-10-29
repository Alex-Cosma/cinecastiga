import { afterAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { evidenceCsv, sumDecimalStrings } from "./evidence";
import { runRows, runSpec } from "./compile";
import { factCheckData, pairTx } from "./fact-check";
import type { FactCheckData } from "./fact-check-shared";
import { ground } from "./ground";
import { personFirms } from "./person-firms";
import type { PredicateCtx } from "./predicates";
import { validateSpec, type AskSpec } from "./spec";
import { testDatabaseUrl, withAskFixture } from "./test-fixture";

/*
 * fact_check-2 (F6a, plan §4.10, §6.2) on a rolled-back fixture of the
 * engine's tables: the profile adds up to the verdict's total (with the
 * undated contract); the answer, its sources and the CSV count the same
 * records, also by year, in association and with one offer; the rows outside
 * the sums (a direct acquisition above 2 mil. lei or without a positive value,
 * a contract of uncertain identity, above 1 mld. lei, of an unclear kind) say
 * "Da" and are never summed; a framework ceiling alone is "Acord-cadru"; a
 * narrower question says "Nu" with the whole relation; an empty pair names
 * the same-named entity that has records and each side's partners.
 */

const url = testDatabaseUrl("Verification fixtures");
const connection = url ? createDb(url, { max: 1 }) : null;
afterAll(async () => { await connection?.sql.end(); });

const BASE = 9_277_000_000;
const id = (n: number) => String(BASE + n);
const A = 1, S = 2, TWIN = 3, S_EXCLUDED = 4, S_FRAMEWORK = 5, S_NONE = 6, S_OTHER = 7, A_OTHER = 8, S_FOREIGN = 9;
const ENTITIES: [number, string, string | null][] = [
  [A, "Comuna Fixture", "Alba"], [S, "ALFA CONSTRUCT SRL", "Cluj"], [TWIN, "Comuna  Fixture", "Alba"], [S_EXCLUDED, "BETA STUDII SRL", null],
  [S_FRAMEWORK, "GAMA PROIECT SRL", "Bihor"], [S_NONE, "DELTA SRL", "Salaj"], [S_OTHER, "EPSILON SRL", "Alba"], [A_OTHER, "Orasul Fixture", "Alba"],
  [S_FOREIGN, "ZETA TRANSPORT SRL", "Alba"],
];

async function seed(q: DbSql): Promise<void> {
  const entities = ENTITIES.map(([n, name, county]) => ({ id: id(n), name, folded: name.toLowerCase().replace(/\s+/g, " "), county }));
  await q`insert into core.entities (id, name_display, name_normalized, cui_canonical, cui_valid, county, country_code, is_foreign)
    select (r->>'id')::bigint, r->>'name', r->>'folded', r->>'id', true, r->>'county', 'RO', false from jsonb_array_elements(${JSON.stringify(entities)}::jsonb) r`;
  const role = (n: number) => [A, TWIN, A_OTHER].includes(n) ? "authority" : "supplier";
  await q`insert into marts.entity_profile (entity_id, role, name_display, county, n_das, n_contracts, total_ron_full, total_ron_split, is_foreign)
    select (r->>'id')::bigint, r->>'role', r->>'name', r->>'county', 1, 0, 1000, 1000, false
    from jsonb_array_elements(${JSON.stringify(entities.map((e, i) => ({ ...e, role: role(ENTITIES[i]![0]) })))}::jsonb) r`;
  await q`insert into core.cpv_codes (code, name_ro) values ('45000000-7', 'Lucrări de construcţii'), ('71000000-8', 'Servicii de arhitectură')`;
  // Direct acquisitions: three in the sums (2024, 2024, 2025), one above 2 mil. lei and one of 0 lei outside them;
  // one above the filter of another firm (its only row); records of the twin and of other partners.
  const da = (ref: number, a: number, s: number, value: number, date: string, cpv = "71200000", estimated: number | null = null) => ({ ref, a: id(a), s: id(s), value, date, cpv, estimated });
  const das = [
    da(1, A, S, 100_000, "2024-03-01"), da(2, A, S, 50_000, "2024-07-01"), da(3, A, S, 30_000, "2025-02-01", "45200000"),
    da(4, A, S, 3_500_000, "2024-05-05", "71200000", 35_000), da(5, A, S, 0, "2025-06-01"),
    da(6, A, S_EXCLUDED, 135_000_000, "2023-06-22", "71200000", 135_000),
    da(7, TWIN, S_NONE, 9_000, "2019-01-01"), da(8, TWIN, S_NONE, 8_000, "2019-02-01"),
    da(9, A, S_OTHER, 400_000, "2024-01-01"), da(10, A_OTHER, S, 1_000_000, "2024-02-02"),
  ];
  await q`insert into marts.da_transactions (sicap_da_id, da_code, authority_id, authority_name, supplier_id, supplier_name, county, cpv_code, cpv_name,
      closing_value, estimated_value_ron, finalization_date, value_suspect)
    select (r->>'ref')::bigint, 'DA' || (r->>'ref'), (r->>'a')::bigint, 'A', (r->>'s')::bigint, 'S', 'Alba', r->>'cpv', 'Servicii', (r->>'value')::numeric,
      (r->>'estimated')::numeric, r->>'date', false
    from jsonb_array_elements(${JSON.stringify(das)}::jsonb) r`;
  // Contracts in the sums: one in association (half of 2 mil. lei), an open tender with one confirmed offer; one without a plausible date.
  await q`insert into marts.contract_transactions (contract_id, supplier_id, contract_no, ca_notice_id, authority_id, authority_name, supplier_name, county, cpv_code, cpv_name,
      procedure_type, closing_value, contract_value_full, n_winners, finalization_date, tenders_received, is_single_bidder, also_in_ted)
    values (101, ${id(S)}, 'C101', 1101, ${id(A)}, 'A', 'S', 'Alba', '45200000', 'Lucrări', 'Licitatie deschisa', 1000000, 2000000, 2, '2024-09-01', 1, true, true),
           (102, ${id(S)}, 'C102', 1102, ${id(A)}, 'A', 'S', 'Alba', '45200000', 'Lucrări', 'Procedura simplificata', 700000, 700000, 1, null, null, null, false)`;
  // The source contracts of the pair: the two above, a framework ceiling (title rule), one above 1 mld. lei, one of an unclear kind,
  // one of uncertain identity; and a firm with a framework ceiling only.
  const contract = (n: number, s: number, value: number, date: string, title: string, type: number | null = null, currency = "RON") =>
    ({ id: n, nid: 900_000 + n, notice: 1000 + n, s: id(s), value, date, title, type, currency });
  const contracts = [
    contract(101, S, 2_000_000, "2024-09-01", "Contract lucrari"), contract(102, S, 700_000, "2014-04-30", "Contract reparatii"),
    contract(103, S, 9_000_000, "2023-03-03", "Acord-cadru reparatii curente"), contract(104, S, 1_500_000_000, "2025-01-10", "Contract autostrada"),
    contract(105, S, 400_000, "2024-11-11", "Contract subsecvent nr 1", 2), contract(106, S, 600_000, "2024-12-12", "Contract dotari"),
    contract(107, S_FRAMEWORK, 28_160_000, "2024-08-01", "Acord-cadru proiectare"),
    // A firm whose only publications are legacy EUR amounts, never converted: a contract and a framework, no mart row.
    contract(108, S_FOREIGN, 8_785.11, "2019-04-02", "Contract transport", null, "EUR"), contract(109, S_FOREIGN, 21_013_946.58, "2019-04-02", "Acord-cadru transport", null, "EUR"),
  ];
  await q`insert into core.awards (id, ca_notice_id, notice_no, authority_entity_id, cpv_code, procedure_type)
    select (r->>'id')::bigint, (r->>'notice')::bigint, 'N' || (r->>'id'), ${id(A)}::bigint, '45200000-9', 'Licitatie deschisa' from jsonb_array_elements(${JSON.stringify(contracts)}::jsonb) r`;
  await q`insert into core.contracts (id, raw_id, ca_notice_contract_id, ca_notice_id, contract_no, contract_date, contract_value, currency, title, source_contract_type, contract_type_raw_id)
    select (r->>'id')::bigint, (r->>'id')::bigint, (r->>'nid')::bigint, (r->>'notice')::bigint, 'C' || (r->>'id'), (r->>'date')::timestamptz, (r->>'value')::numeric, r->>'currency',
      r->>'title', (r->>'type')::int, case when r->>'type' is not null then (r->>'id')::bigint end
    from jsonb_array_elements(${JSON.stringify(contracts)}::jsonb) r`;
  await q`insert into core.contract_winners (contract_id, entity_id) select (r->>'id')::bigint, (r->>'s')::bigint from jsonb_array_elements(${JSON.stringify(contracts)}::jsonb) r`;
  // The association's second winner.
  await q`insert into core.contract_winners (contract_id, entity_id) values (101, ${id(S_OTHER)})`;
  await q`insert into marts.contract_identity_exclusions (contract_id, candidate_id, fingerprint, snapshot_hash) values (106, 'x', 'f', 'h')`;
  await q`insert into marts.national_stats (kind, year) select k, y from unnest(array['da', 'award']) k cross join generate_series(2018, 2026) y`;
}

const pair = (s: number, a = A) => ({ authorityId: Number(id(a)), authorityName: "Comuna Fixture", supplierId: Number(id(s)), supplierName: "Firma" });
async function answer(q: DbSql, raw: Record<string, unknown>): Promise<{ spec: AskSpec; fact: FactCheckData }> {
  const spec = validateSpec({ block: "fact_check", measure: "value", ...raw });
  if ("error" in spec) throw new Error(spec.error);
  const result = await runSpec(q, spec, await ground(q, spec.filters, spec.population));
  if ("error" in result) throw new Error(result.error);
  if (result.data.block !== "fact_check") throw new Error("not a verification");
  return { spec, fact: result.data.fact };
}
async function sources(q: DbSql, spec: AskSpec, scope?: Record<string, unknown>) {
  const rows = await runRows(q, spec, await ground(q, spec.filters, spec.population), 0, { ...(scope ? { scope } : {}), limit: 1000 });
  if ("error" in rows) throw new Error(rows.error);
  return rows;
}

describe.runIf(Boolean(connection))("the verification (fact_check-2, isolated PostgreSQL)", () => {
  it("adds its profile up to the verdict, counted as its sources and CSV count them, by year, in association and with one offer", async () => {
    const out = await withAskFixture(connection!.sql, "fact_profile", seed, async (q) => {
      const { spec, fact } = await answer(q, { filters: pair(S) });
      const all = await sources(q, spec);
      const y2024 = await sources(q, spec, { years: [2024] });
      const consortium = await sources(q, spec, { consortium: true });
      const single = await sources(q, spec, { singleBid: true });
      const domain = await sources(q, spec, { cpvPrefixes: ["45"] });
      return { fact, all: { n: all.sourceTotal, v: all.sourceValue, csv: evidenceCsv(all.rows).trim().split("\r\n").length - 1 },
        y2024: { n: y2024.sourceTotal, v: y2024.sourceValue }, consortium: consortium.sourceTotal, single: single.sourceTotal, domain: domain.sourceTotal };
    });
    const f = out.fact;
    expect(f.version).toBe(2);
    expect(f.state).toBe("yes");
    // Three direct acquisitions and two contracts; the 3,5 mil. lei and the 0 lei ones stay out.
    expect(f.count).toBe(5);
    expect(f.value).toBe(1_880_000);
    expect(out.all).toEqual({ n: 5, v: "1880000.00", csv: 5 });
    // The profile adds up to the verdict: dated years plus the undated contract, both channels, every division.
    expect(f.undated).toEqual({ count: 1, value: 700_000 });
    expect(f.years).toEqual([{ year: 2024, count: 3, value: 1_150_000 }, { year: 2025, count: 1, value: 30_000 }]);
    expect(f.years!.reduce((n, y) => n + y.count, 0) + f.undated!.count).toBe(f.count);
    expect(f.channels).toEqual({ da: { count: 3, value: 180_000 }, contracts: { count: 2, value: 1_700_000 } });
    expect(f.domains!.reduce((n, d) => n + d.count, 0)).toBe(f.count);
    expect(f.domains![0]).toMatchObject({ code: "45", count: 3, name: "Lucrări de construcţii" });
    expect(out.y2024).toEqual({ n: f.years![0]!.count, v: "1150000.00" });
    expect(out.domain).toBe(3);
    // Association: the firm's share of the whole contract; one open tender with one known offer, the other contract unknown.
    expect(f.consortium).toEqual({ count: 1, share: 1_000_000, full: 2_000_000 });
    expect(out.consortium).toBe(1);
    expect(f.competition).toEqual({ single: 1, multiple: 0, unknown: 1 });
    expect(out.single).toBe(1);
    // Outside the sums: two direct acquisitions, then a contract above 1 mld., one of an unclear kind, one of uncertain identity; the ceiling apart.
    expect(f.excluded!.count).toBe(5);
    expect(f.excluded!.rows.map((r) => r.category).sort()).toEqual(["above_cap", "da_above", "da_nonpositive", "identity", "kind"]);
    expect(f.excluded!.rows.find((r) => r.category === "da_above")).toMatchObject({ code: "DA4", value: 3_500_000, estimated: 35_000 });
    expect(f.frameworks).toMatchObject({ count: 1, ceiling: 9_000_000, inSums: 0 });
    expect(f.frameworks!.rows[0]).toMatchObject({ nid: "900103", date: "2023-03-03" });
    // The weight: among the firm's clients (this one and Orasul Fixture), among the buyer's suppliers (with EPSILON's 0,4 mil. and its half).
    expect(f.share!.ofSupplier).toMatchObject({ rank: 1, of: 2 });
    expect(f.share!.ofAuthority).toMatchObject({ rank: 1, of: 2 });
    expect(f.authority).toMatchObject({ cui: id(A), county: "Alba" });
    // The list: the five largest and no other most recent one (there are five records).
    expect(f.samples.map((s) => s.value)).toEqual([1_000_000, 700_000, 100_000, 50_000, 30_000]);
    expect(f.samples[0]).toMatchObject({ src: "contracts", nWinners: 2, fullValue: 2_000_000, bids: 1, procedure: "Licitatie deschisa", kind: "contract", nid: "900101" });
    expect(f.relation).toBeNull();
    expect(sumDecimalStrings(["1150000.00", "700000.00", "30000.00"])).toBe(out.all.v);
  });

  it("says „Acord-cadru” for a ceiling alone, „Da · nu intră în sume” for a row outside them, „Nu” with the relation for a narrower question", async () => {
    const out = await withAskFixture(connection!.sql, "fact_states", seed, async (q) => ({
      framework: (await answer(q, { filters: pair(S_FRAMEWORK) })).fact,
      excluded: (await answer(q, { filters: pair(S_EXCLUDED) })).fact,
      in2023: (await answer(q, { filters: { ...pair(S), yearFrom: 2023, yearTo: 2023 } })).fact,
      in2026: (await answer(q, { filters: { ...pair(S), yearFrom: 2026, yearTo: 2026 } })).fact,
      da2025: (await answer(q, { dataset: "da", filters: { ...pair(S), yearFrom: 2025, yearTo: 2025 } })).fact,
      legacy: (await answer(q, { filters: pair(S), minimumRecords: { role: "supplier", count: 100 } })).fact,
      legacySources: (await sources(q, validateSpec({ block: "fact_check", measure: "value", filters: pair(S), minimumRecords: { role: "supplier", count: 100 } }) as AskSpec)).sourceTotal,
    }));
    expect(out.framework).toMatchObject({ state: "framework", verdict: false, count: 0, frameworks: { count: 1, ceiling: 28_160_000 } });
    expect(out.excluded).toMatchObject({ state: "yes", verdict: true, count: 0, excluded: { count: 1 } });
    expect(out.excluded.excluded!.rows[0]).toMatchObject({ category: "da_above", value: 135_000_000, estimated: 135_000, date: "2023-06-22" });
    // 2023 holds the framework ceiling of the pair, nothing else: "Acord-cadru" there, with the whole relation beside it.
    expect(out.in2023).toMatchObject({ state: "framework", restricted: true, relation: { count: 5, frameworks: 1, excluded: 5 } });
    expect(out.in2026).toMatchObject({ state: "no", reason: "choices", count: 0, relation: { count: 5, value: 1_880_000, yearFirst: 2024, yearLast: 2025 } });
    // Direct acquisitions of 2025: one in the sums; the 0 lei one is outside them, the contracts are not of this channel.
    expect(out.da2025).toMatchObject({ state: "yes", count: 1, value: 30_000, excluded: { count: 1 } });
    expect(out.da2025.excluded!.rows[0]!.category).toBe("da_nonpositive");
    // An old link's threshold applies as before (no firm has 100 records), with its reason and the relation.
    expect(out.legacy).toMatchObject({ state: "no", reason: "legacy", legacy: true, count: 0, relation: { count: 5 } });
    expect(out.legacySources).toBe(0);
  });

  it("never says „Nu” for a pair whose only publications have no value in lei: a contract outside the sums, a ceiling unknown", async () => {
    const fact = await withAskFixture(connection!.sql, "fact_foreign", seed, async (q) => (await answer(q, { filters: pair(S_FOREIGN) })).fact);
    expect(fact).toMatchObject({ state: "yes", verdict: true, count: 0, value: 0, excluded: { count: 1 }, frameworks: { count: 1, ceiling: 0, unknown: 1 } });
    expect(fact.excluded!.rows[0]).toMatchObject({ category: "no_ron_value", nid: "900108", value: null, currency: "EUR", date: "2019-04-02" });
    expect(fact.frameworks!.rows[0]).toMatchObject({ nid: "900109", value: null, currency: "EUR" });
    expect(fact.partners).toBeNull();
  });

  it("finds a firm through a person: the firms represented today that sell to institutions, never a liquidator's", async () => {
    const out = await withAskFixture(connection!.sql, "fact_person", seed, async (q) => {
      const rep = (cui: string, calitate: string, key = "popescu ion|1970-05-05|cluj") => ({ cui, calitate, key });
      const reps = [rep(id(S), "administrator"), rep(id(S_FRAMEWORK), "lichidator judiciar"), rep(id(S_OTHER), "Administrator Judiciar Provizoriu"),
        rep("99999999", "administrator"), rep(id(S_NONE), "administrator", "popescu ion|1910-01-01|cluj")];
      await q`insert into reference.company_reps (j_number, cui, person_name, calitate, birth_date, person_key, snapshot_date)
        select 'J1', r->>'cui', 'POPESCU ION', r->>'calitate', split_part(r->>'key', '|', 2)::date, r->>'key', '2026-07-08'
        from jsonb_array_elements(${JSON.stringify(reps)}::jsonb) r`;
      return { person: await personFirms(q, "popescu ion|1970-05-05|cluj"), placeholder: await personFirms(q, "popescu ion|1910-01-01|cluj") };
    });
    // ALFA (administrator) sells to institutions; the CUI without an entity is a firm without public purchases; the two insolvency mandates are left out.
    expect(out.person).toEqual({ firms: 2, suppliers: [{ entityId: id(S), name: "ALFA CONSTRUCT SRL", cui: id(S), county: "Cluj", role: "administrator" }] });
    // A placeholder birth date does not tell namesakes apart: no firm.
    expect(out.placeholder).toEqual({ firms: 0, suppliers: [] });
  });

  it("reads every condition of the question on the rows outside the sums, and none of them in the whole relation", async () => {
    const fact = await withAskFixture(connection!.sql, "fact_every", seed, async (q) => {
      // Field by field, never from a spread: a condition added to PredicateCtx must be given a value here, so the
      // source contracts (coreContracts: every column a condition reads) and the band (pairOnly) are read with it.
      const ctx: PredicateCtx = {
        sql: q,
        population: { operator: "and", groups: [{ operator: "and", conditions: [
          { field: "date", op: "gte", value: "2018-01-01" }, { field: "value", op: "lte", value: "10000000000" },
          { field: "county", op: "in", values: ["Alba"] }, { field: "cpv", op: "not_in", values: ["99"] },
          { field: "authority", op: "in", values: [id(A)] }, { field: "supplier", op: "not_in", values: [id(S_OTHER)] },
        ] }] },
        minimumRecords: { role: "supplier", count: 1 }, cpvPrefixes: ["45", "71"], cpvExclude: ["4599"], county: "Alba", kind: "comuna", kindIds: [id(A)],
        authorityId: id(A), supplierId: id(S), uatSiruta: 1017, uatAuthorityIds: [id(A)], singleBidder: true, minEmployees: 1, maxEmployees: 9,
        yearFrom: 2019, yearTo: 2025, monthFrom: 2, monthTo: 11, trendMonths: null, seriesMonths: [2, 11], adminSupplierIds: [id(S)], plafond: "da-branch", comparison: null,
        // F3's common selection and F4's seat (merge of F6a with S4): each holds a condition the rows outside the sums read too.
        purchaseKind: "lucrari", procedure: "deschisa", purchaseValueMin: 0, purchaseValueMax: 1e12, firmSeat: "same", seatCounty: "Alba", seatColumn: false,
        shared: [id(A)],
        // F5's ranked winners are a ranking's, never a verification's (WINNERS_RULES): none here.
        newFirms: null, mainClient: false, dominantSupplier: false, buyerIds: [], winners: null,
      };
      const spec = validateSpec({ block: "fact_check", measure: "value", filters: { ...pair(S), county: "Alba" } });
      if ("error" in spec) throw new Error(spec.error);
      return factCheckData(q, {
        spec, ctx, dataset: "all", agg: pairTx(q), coverage: null,
        authority: { entityId: id(A), name: "Comuna Fixture" }, supplier: { entityId: id(S), name: "ALFA CONSTRUCT SRL" },
      });
    });
    // No firm of the fixture has a filing or a single offer: nothing is selected, not even outside the sums.
    expect(fact).toMatchObject({ state: "no", reason: "legacy", count: 0, excluded: { count: 0 }, frameworks: { count: 0 } });
    // The band is the pair alone: every record, ceiling and row outside the sums of the relation.
    expect(fact.relation).toEqual({ count: 5, value: 1_880_000, yearFirst: 2024, yearLast: 2025, frameworks: 1, excluded: 5 });
  });

  it("„Nu” in the whole archive names the same-named entity with records and each side's partners, never a similar name", async () => {
    const fact = await withAskFixture(connection!.sql, "fact_none", seed, async (q) => (await answer(q, { filters: pair(S_NONE) })).fact);
    expect(fact).toMatchObject({ state: "no", reason: "none", count: 0, relation: null });
    expect(fact.twins).toEqual([{ role: "authority", entityId: id(TWIN), name: "Comuna  Fixture", cui: id(TWIN), county: "Alba", count: 2, yearFirst: 2019, yearLast: 2019 }]);
    // The buyer's suppliers in the sums (ALFA, EPSILON; BETA's only row is outside them), the firm's buyers (the twin only).
    expect(fact.partners).toEqual({ authoritySuppliers: 2, supplierAuthorities: 1 });
  });
});

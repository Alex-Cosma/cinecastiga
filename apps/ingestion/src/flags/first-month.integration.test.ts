import { afterAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { DA_CEILING_SEED_ROWS } from "@seap/domain";
import { FIRST_MONTH, firstMonthCasesSql } from "./first-month.js";

/** SELECT-only fixtures. No inserts, schema changes, or derived-data rebuilds. */
const { sql } = createDb();
afterAll(() => sql.end());

const thresholds = (q: DbSql) => q`select * from jsonb_to_recordset(${JSON.stringify(DA_CEILING_SEED_ROWS.map((r) => ({
  key: r.key, valid_from: `${r.validFrom}T00:00:00Z`, valid_to: r.validTo ? `${r.validTo}T00:00:00Z` : null, value_num: r.valueNum,
})))}::jsonb) as r(key text, valid_from timestamptz, valid_to timestamptz, value_num numeric)`;

interface Award { supplier: number; authority: number; value: number; published: string | null; finalized?: string; cpv?: string; state?: string }

async function cases(q: DbSql, fixture: {
  firms: [id: number, registered: string | null][];
  awards: Award[];
  /** Institutions that count (the direct-award rules bind them). */
  buyers: number[];
  representatives?: [person: string, firm: number, firms: number][];
  names?: [id: number, name: string][];
}) {
  const acquisitions = fixture.awards.map((a, i) => ({
    sicap_da_id: 9000 + i, authority_entity_id: a.authority, supplier_entity_id: a.supplier, state: a.state ?? "Oferta acceptata",
    closing_value: a.value, publication_date: a.published, finalization_date: a.finalized ?? a.published, cpv_code: a.cpv ?? "79400000-8", acquisition_type: null,
  }));
  const rows = await q`
    with acquisitions as (select * from jsonb_to_recordset(${JSON.stringify(acquisitions)}::jsonb) as r(
      sicap_da_id bigint, authority_entity_id bigint, supplier_entity_id bigint, state text, closing_value numeric,
      publication_date timestamptz, finalization_date timestamptz, cpv_code text, acquisition_type text)),
    registrations as (select * from jsonb_to_recordset(${JSON.stringify(fixture.firms.map(([entity_id, registered_on]) => ({ entity_id, registered_on })))}::jsonb)
      as r(entity_id bigint, registered_on date)),
    representatives as (select * from jsonb_to_recordset(${JSON.stringify((fixture.representatives ?? []).map(([person_key, sid, firms]) => ({ person_key, sid, firms })))}::jsonb)
      as r(person_key text, sid bigint, firms int)),
    entities as (select * from jsonb_to_recordset(${JSON.stringify((fixture.names ?? []).map(([id, name_display]) => ({ id, name_display })))}::jsonb)
      as r(id bigint, name_display text)),
    thresholds as (${thresholds(q)})
    select c.side, c.subject_id::int subject, c.partner_id::int partner, c.period, c.severity::float8 severity, c.evidence
    from (${firstMonthCasesSql(q, { maxPlausible: 2_000_000, buyers: q`select value::bigint eid from jsonb_array_elements_text(${JSON.stringify(fixture.buyers)}::jsonb)` }, {
      acquisitions: q`acquisitions`, registrations: q`registrations`, thresholds: q`thresholds`,
      representatives: q`select * from representatives`, entities: q`entities`,
    })}) c
    order by c.side, c.subject_id, c.partner_id`;
  return rows as unknown as { side: string; subject: number; partner: number; period: string; severity: number; evidence: Record<string, unknown> }[];
}

const read = <T>(work: (q: DbSql) => Promise<T>) => sql.begin("read only", (tx) => work(tx as unknown as DbSql));

describe("contracte în prima lună de la înființare (rf-2026.24, read-only fixtures)", () => {
  it("counts the firm from 100,000 lei in its first 30 days, and the institution only when it alone reaches the sum", async () => {
    await read(async (q) => {
      const rows = await cases(q, {
        firms: [[10, "2023-08-02"], [11, "2023-10-05"], [12, "2023-08-02"]],
        buyers: [1, 2, 3],
        awards: [
          // 10: two institutions together reach the sum; neither does alone.
          { supplier: 10, authority: 1, value: 60_000, published: "2023-08-08T09:00:00Z" },
          { supplier: 10, authority: 2, value: 50_000, published: "2023-08-22T09:00:00Z" },
          { supplier: 10, authority: 2, value: 500_000, published: "2023-10-22T09:00:00Z" }, // after the window
          // 11: one work just under the ceiling of its day (900,400 lei), from the firm's only institution.
          { supplier: 11, authority: 3, value: 890_000, published: "2023-10-27T09:00:00Z", cpv: "45233141-9" },
          // 12: one leu short.
          { supplier: 12, authority: 1, value: 99_999, published: "2023-08-10T09:00:00Z" },
        ],
      });
      expect(rows.map((r) => [r.side, r.subject, r.partner, r.period])).toEqual([
        // A firm's partner is its institution only when the window has a single one.
        ["authority", 3, 11, "2023"], ["supplier", 10, null, "2023"], ["supplier", 11, 3, "2023"],
      ]);
      const ten = rows.find((r) => r.side === "supplier" && r.subject === 10)!.evidence;
      expect(ten).toMatchObject({ total: 110_000, count: 2, buyers: 2, buyers_all: 2, registered_on: "2023-08-02", first_award_on: "2023-08-08",
        last_award_on: "2023-08-22", age_days: 6, window_days: 30, top_buyer: 1, top_buyer_total: 60_000, near_ceiling: false, date_fallback_count: 0 });
      expect(ten["source_ids"]).toEqual(["9000", "9001"]);
      expect(ten["closest_value"]).toBe(60_000);
      expect(ten["closest_ceiling"]).toBe(270_120);
      expect(ten).not.toHaveProperty("older_firm");
      const eleven = rows.find((r) => r.side === "supplier" && r.subject === 11)!;
      expect(eleven.evidence).toMatchObject({ total: 890_000, count: 1, buyers: 1, buyers_all: 1, age_days: 22, closest_value: 890_000, closest_ceiling: 900_400, near_ceiling: true });
      expect(eleven.severity).toBeCloseTo(0.89, 5);
      const buyer = rows.find((r) => r.side === "authority")!.evidence;
      expect(buyer).toMatchObject({ total: 890_000, count: 1, firm_total: 890_000, firm_buyers: 1, buyers_all: 1, registered_on: "2023-10-05",
        first_award_on: "2023-10-27", age_days: 22, near_ceiling: true });
      expect(buyer["source_ids"]).toEqual(["9003"]);
      expect(FIRST_MONTH.minTotal).toBe(100_000);
      expect(FIRST_MONTH.days).toBe(30);
    });
  });

  it("reads the day in Romanian time, falls back to the finalization, and ignores what is not an accepted award of a counted institution", async () => {
    await read(async (q) => {
      const rows = await cases(q, {
        firms: [[20, "2023-08-02"], [21, "2023-08-02"], [22, "2023-08-02"], [23, "2023-08-02"], [24, "2023-08-02"], [25, "2023-08-02"], [26, null], [27, "2018-03-20"]],
        buyers: [1, 27],
        awards: [
          // 20: 21:30 UTC on 31 August is 1 September in Romania, day 30: counted.
          { supplier: 20, authority: 1, value: 100_000, published: "2023-08-31T21:30:00Z" },
          // 21: one day later is day 31: outside.
          { supplier: 21, authority: 1, value: 100_000, published: "2023-09-01T21:30:00Z" },
          // 22: no publication day; the finalization stands in and the evidence says so.
          { supplier: 22, authority: 1, value: 120_000, published: null, finalized: "2023-08-20T09:00:00Z" },
          // 23: a refused offer is not an award.
          { supplier: 23, authority: 1, value: 300_000, published: "2023-08-10T09:00:00Z", state: "Oferta refuzata" },
          // 24: an association or a private company (not among the counted institutions).
          { supplier: 24, authority: 9, value: 300_000, published: "2023-08-10T09:00:00Z" },
          // 25: an award before the registration: the registration day cannot be the real one.
          { supplier: 25, authority: 1, value: 300_000, published: "2023-08-10T09:00:00Z" },
          { supplier: 25, authority: 9, value: 10, published: "2023-07-01T09:00:00Z" },
          // 26: no registration day in the register.
          { supplier: 26, authority: 1, value: 300_000, published: "2023-08-10T09:00:00Z" },
          // 27: an institution recorded as its own supplier is not a supplier.
          { supplier: 27, authority: 27, value: 300_000, published: "2018-04-10T09:00:00Z" },
          // above the plausibility bound
          { supplier: 21, authority: 1, value: 2_500_000, published: "2023-08-10T09:00:00Z" },
        ],
      });
      expect(rows.map((r) => [r.side, r.subject, r.partner])).toEqual([["authority", 1, 20], ["authority", 1, 22], ["supplier", 20, 1], ["supplier", 22, 1]]);
      expect(rows.find((r) => r.side === "supplier" && r.subject === 20)!.evidence).toMatchObject({ first_award_on: "2023-09-01", age_days: 30, date_fallback_count: 0 });
      expect(rows.find((r) => r.side === "supplier" && r.subject === 22)!.evidence).toMatchObject({ first_award_on: "2023-08-20", age_days: 18, date_fallback_count: 1 });
    });
  });

  it("names an older supplier firm of the same representative, on the firm and on the institution it had sold to", async () => {
    await read(async (q) => {
      const rows = await cases(q, {
        firms: [[30, "2024-03-06"], [31, "2015-05-05"], [32, "2019-01-01"], [33, "2024-03-06"], [34, "2010-01-01"], [35, "2024-06-01"]],
        buyers: [5, 6],
        awards: [
          { supplier: 30, authority: 5, value: 120_000, published: "2024-03-16T09:00:00Z" },
          { supplier: 30, authority: 6, value: 110_000, published: "2024-03-18T09:00:00Z" },
          // 31 and 32: older firms of the same person; 31 had sold to institution 5, 32 more but elsewhere.
          { supplier: 31, authority: 5, value: 40_000, published: "2022-02-02T09:00:00Z" },
          { supplier: 32, authority: 8, value: 900_000, published: "2021-02-02T09:00:00Z" },
          { supplier: 31, authority: 5, value: 999_000, published: "2024-05-05T09:00:00Z" }, // after the new firm's first award
          // 33: its representative has 16 firms: a professional administrator names no older firm.
          { supplier: 33, authority: 5, value: 130_000, published: "2024-03-20T09:00:00Z" },
          { supplier: 34, authority: 5, value: 70_000, published: "2020-02-02T09:00:00Z" },
          // 35: a younger firm of the same person is not an older one.
          { supplier: 35, authority: 5, value: 5_000, published: "2024-06-10T09:00:00Z" },
        ],
        representatives: [["ion|1970-01-01|iasi", 30, 4], ["ion|1970-01-01|iasi", 31, 4], ["ion|1970-01-01|iasi", 32, 4], ["ion|1970-01-01|iasi", 35, 4],
          ["ana|1980-02-02|cluj", 33, 16], ["ana|1980-02-02|cluj", 34, 16]],
        names: [[31, "FIRMA VECHE SRL"], [32, "FIRMA DE ALTUNDEVA SRL"], [34, "FIRMA ADMINISTRATORULUI SRL"]],
      });
      const firm = rows.find((r) => r.side === "supplier" && r.subject === 30)!.evidence;
      // The one that had sold to the same institution comes first, although the other had sold more.
      expect(firm).toMatchObject({ older_firm: 31, older_firm_name: "FIRMA VECHE SRL", older_firm_same_buyer: true, top_buyer: 5 });
      expect(rows.find((r) => r.side === "authority" && r.subject === 5 && r.partner === 30)!.evidence).toMatchObject({ older_firm: 31, older_firm_name: "FIRMA VECHE SRL", firm_total: 230_000, firm_buyers: 2 });
      expect(rows.find((r) => r.side === "authority" && r.subject === 6 && r.partner === 30)!.evidence).not.toHaveProperty("older_firm");
      const administered = rows.find((r) => r.side === "supplier" && r.subject === 33)!.evidence;
      expect(administered).not.toHaveProperty("older_firm");
      expect(administered).not.toHaveProperty("older_firm_same_buyer");
      expect(FIRST_MONTH.maxPersonFirms).toBe(15);
    });
  });
});

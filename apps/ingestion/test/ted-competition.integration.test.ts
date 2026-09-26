import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "@seap/db";
import { tedCompetitionRows } from "../src/normalize/ted-mart.js";

// Read-only integration tests. VALUES fixtures never write tables or need a replay.
const { sql } = createDb();
afterAll(() => sql.end());
async function counts(values: string) {
  return sql.begin("read only", async (q) => {
    const links = q`(select * from (values (10::bigint, 100::bigint, 1::bigint, 0.95::real, true),
      (10::bigint, 100::bigint, 2::bigint, 0.9::real, true)) x(contract_id, ca_notice_id, ted_lot_result_id, match_score, is_primary))`;
    const results = q.unsafe(`(select * from (values ${values}) x(id, tenders_received, currency, amount_kind, amount_details))`);
    return q`${tedCompetitionRows(q, { links, results })}`;
  });
}
const row = (id: number, n: number | null, currency = "RON", kind = "payable", eligible = true) =>
  `(${id}::bigint,${n ?? "null"}::integer,'${currency}'::text,'${kind}'::text,'{"matchEligible":${eligible}}'::jsonb)`;

describe("TED competition inheritance (read only)", () => {
  it("uses actual consistent counts and preserves the highest confidence source", async () => {
    const r = await counts(`${row(1, 1)},${row(2, 1)}`);
    expect(r).toHaveLength(1);
    expect(r[0]!.tenders_received).toBe(1);
    expect(String(r[0]!.ted_lot_result_id)).toBe("1");
  });
  it("withholds contradictory confirmed counts", async () => {
    expect(await counts(`${row(1, 1)},${row(2, 2)}`)).toHaveLength(0);
  });
  it("does not assume a missing competing count agrees", async () => {
    expect(await counts(`${row(1, 1)},${row(2, null)}`)).toHaveLength(0);
  });
  it("does not transfer counts from different currencies or framework ceilings", async () => {
    expect(await counts(`${row(1, 1, "EUR")},${row(2, 1, "RON", "framework_ceiling")}`)).toHaveLength(0);
  });
  it("withholds ambiguous mapping and malformed negative counts", async () => {
    expect(await counts(`${row(1, 1, "RON", "payable", false)},${row(2, -1)}`)).toHaveLength(0);
  });
});

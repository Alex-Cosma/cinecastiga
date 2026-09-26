import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "@seap/db";
import { TED_COUNTRY_UNRESOLVED, tedCountryFilter, tedCountryNeedsReview } from "../../web/lib/ted.js";

const { sql } = createDb();
afterAll(() => sql.end());

// VALUES only, in a read-only transaction. The live headline and browse query
// both use this exact predicate; no fixture tables or shared records are written.
describe("TED country disclosure (read-only SQL)", () => {
  it("keeps count, exact filtered rows and row labels aligned for missing and contradictory countries", async () => {
    await sql.begin("read only", async q => {
      const source = q`(values
        (1,true,array['RO']::text[]), (2,true,array[null]::text[]),
        (3,true,array[]::text[]), (4,true,null::text[]),
        (5,true,array['ro',' ','']::text[]),
        (6,true,array['RO','DE']::text[]), (7,true,array['DE','FR']::text[]),
        (8,false,array['RO']::text[]), (9,false,array[null]::text[])
      ) as fixture(id,is_foreign,winner_countries)`;
      const rows = await q`select id,is_foreign,to_jsonb(winner_countries) as winner_countries from ${source} where ${tedCountryFilter(q, TED_COUNTRY_UNRESOLVED)} order by id`;
      const [count] = await q`select count(*)::int n from ${source} where ${tedCountryFilter(q, TED_COUNTRY_UNRESOLVED)}`;
      expect(rows.map(r=>r["id"])).toEqual([1,2,3,4,5]);
      expect(count?.["n"]).toBe(rows.length);
      const all = await q`select id,is_foreign,to_jsonb(winner_countries) as winner_countries from ${source} order by id`;
      expect(all.filter(r=>tedCountryNeedsReview(r["is_foreign"],r["winner_countries"]??[])).map(r=>r["id"]))
        .toEqual(rows.map(r=>r["id"]));
      // Ordinary country filtering remains an exact ISO bucket and includes
      // consortium membership; the reserved review token is never a country.
      const german = await q`select id from ${source} where ${tedCountryFilter(q,"DE")} order by id`;
      expect(german.map(r=>r["id"])).toEqual([6,7]);
      expect(await q`select id from ${source} where ${tedCountryFilter(q)}`).toHaveLength(9);
    });
  });
});

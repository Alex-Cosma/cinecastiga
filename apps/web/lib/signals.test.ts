import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { parseSignalState, signalUrl, signalPopulation, readSignalPage, readSignalOverview, readSignalRiskGroup } from "./signals";

/** Captures parameterized queries, without reading or mutating a database. */
function database(total = 125) {
  const statements: string[] = [], values: unknown[] = [];
  class Fragment {
    constructor(public text: string) {}
    then(resolve: (value: unknown[]) => unknown) {
      statements.push(this.text);
      if (this.text.includes("select count(*)::text n")) return Promise.resolve(resolve([{ n: String(total) }]));
      return Promise.resolve(resolve([]));
    }
  }
  const sql = ((chunks: TemplateStringsArray, ...params: unknown[]) => new Fragment(chunks.reduce((query, text, i) => {
    if (i >= params.length) return query + text;
    const value = params[i];
    if (value instanceof Fragment) return query + text + value.text;
    values.push(value); return query + text + `?${values.length}`;
  }, ""))) as unknown as DbSql;
  Object.assign(sql, { begin: async (_options: string, run: (q: DbSql) => Promise<unknown>) => run(sql) });
  return { sql, statements, values };
}

describe("signal navigation", () => {
  it("preserves county and role when switching signal type and clears the previous band/page", () => {
    const state = parseSignalState({ tip: "da_rapid", rol: "supplier", jud: "cluj", p: "12", criMin: "0.1", criMax: "0.2" });
    const url = new URL(signalUrl(state, { code: "fin_tiny_staff", band: null }), "http://local");
    expect(Object.fromEntries(url.searchParams)).toEqual({ tip: "fin_tiny_staff", rol: "supplier", jud: "Cluj" });
  });
  it("preserves a full CRI selection and sorting while paging", () => {
    const state = parseSignalState({ rol: "supplier", jud: "Bucuresti", criMin: "0.2", criMax: "0.3", sort: "name", dir: "asc" });
    const decoded = parseSignalState(Object.fromEntries(new URL(signalUrl(state, { page: 3 }), "http://local").searchParams));
    expect(decoded).toEqual({ ...state, page: 3 });
    expect(parseSignalState(Object.fromEntries(new URL(signalUrl(decoded, { county: "Cluj" }), "http://local").searchParams)).page).toBe(0);
  });
  it.each(["-2", "0.5", "Infinity", "NaN", "9999999999999999999999999"])("rejects unsafe page %s", (p) => {
    expect(parseSignalState({ p }).page).toBe(0);
  });
  it("rejects malformed bands without discarding valid role/county", () => {
    const state = parseSignalState({ criMin: "0.9", criMax: "0.1", rol: "supplier", jud: "Buzau", tip: "toString" });
    expect(state).toMatchObject({ band: null, role: "supplier", county: "Buzău", code: "da_split" });
    expect(parseSignalState({ criMin: "-1", criMax: "2" }).band).toBeNull();
  });
  it("keeps an unknown county as an explicit zero-result filter instead of silently showing the nation", () => {
    const state = parseSignalState({ jud: "Județ inexistent" });
    expect(state.county).toBe("Județ inexistent");
    expect(signalUrl(state)).toContain("jud=");
  });
});

describe("complete signal population", () => {
  it("reads triggered core occurrences beyond the sample mart and applies supplier county to the supplier endpoint", async () => {
    const db = database();
    await signalPopulation(db.sql, { role: "supplier", county: "Cluj" }, "da_rapid");
    const query = db.statements[0]!;
    expect(query).toContain("core.flags");
    expect(query).not.toContain("flag_instances");
    expect(query).not.toMatch(/limit\s+500/i);
    expect(query.match(/f\.triggered/g)).toHaveLength(3);
    expect(query).toContain("then f.partner_id else f.subject_id end");
    expect(query).toContain("county_entity.id = da.supplier_entity_id");
    expect(db.values).toContain("Cluj");
    expect(query).not.toContain("Cluj");
  });
  it("selects supplier award membership with EXISTS rather than multiplying one signal per winner", async () => {
    const db = database();
    await signalPopulation(db.sql, { role: "supplier", county: "Cluj" }, "award_single_bid");
    const query = db.statements[0]!;
    expect(query).toContain("exists (select 1 from core.contracts c join core.contract_winners cw");
    expect(query).toContain("county_entity.id = cw.entity_id");
    expect(query).toContain("aw.ron_contract_value");
    expect(query).not.toMatch(/limit\s+1\b/i);
  });
  it("preserves totals and clamps a page beyond the final complete page", async () => {
    const db = database(625);
    const result = await readSignalPage(db.sql, parseSignalState({ p: "99999", tip: "da_rapid" }));
    expect(result).toMatchObject({ total: 625, page: 12, pageSize: 50 });
    const page = db.statements.find((q) => q.includes("select selected.*"))!;
    expect(page).toContain("order by total_ron desc nulls last, severity desc nulls last, id");
    expect(page).toContain("jsonb_agg(winner order by winner.entity_id)");
    expect(db.values).toContain(600);
    expect(db.values).not.toContain(99999 * 50);
  });
  it("returns page zero for an empty population", async () => {
    const db = database(0);
    expect(await readSignalPage(db.sql, parseSignalState({ p: "30" }))).toMatchObject({ total: 0, page: 0 });
  });
  it("scopes both the profile histogram and the leaderboard to role/county without changing CRI rules", async () => {
    const db = database();
    await readSignalOverview(db.sql, parseSignalState({ rol: "supplier", jud: "Cluj" }));
    const profiles = db.statements.filter((q) => q.includes("marts.entity_flags"));
    expect(profiles).toHaveLength(2);
    for (const q of profiles) {
      expect(q).toContain("where role = ?");
      expect(q).toContain("lower(unaccent(county)) = lower(unaccent(?");
    }
    expect(profiles[0]).toContain("n_das >= 10");
    expect(profiles[1]).toContain("cri > 0");
  });
  it("drills histogram bins using the identical bucket expression, including boundary-valued CRIs", async () => {
    const db = database(243);
    const result = await readSignalRiskGroup(db.sql, parseSignalState({ criMin: "0.1", criMax: "0.2", p: "99999", jud: "Cluj" }));
    expect(result).toMatchObject({ total: 243, page: 24, pageSize: 10 });
    const queries = db.statements.filter((q) => q.includes("marts.entity_flags"));
    for (const query of queries) expect(query).toContain("width_bucket(coalesce(cri, 0), 0, 1.0000001, 10) between");
    expect(db.values).toContain(2);
  });
});

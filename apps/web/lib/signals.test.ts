import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { parseSignalState, signalUrl, signalPopulation, readSignalPage, readRiskScoreDistribution, readSignalRiskGroup, readEntitySignalCounts, readSignalTypeCounts, signalTypeCountLabel } from "./signals";

/** Captures parameterized queries, without reading or mutating a database. */
function database(total = 125, bins: { bin: number; n: string }[] = []) {
  const statements: string[] = [], values: unknown[] = [];
  class Fragment {
    constructor(public text: string) {}
    then(resolve: (value: unknown[]) => unknown) {
      statements.push(this.text);
      if (this.text.includes("select count(*)::text n")) return Promise.resolve(resolve([{ n: String(total) }]));
      if (this.text.includes("score / 10")) return Promise.resolve(resolve(bins));
      return Promise.resolve(resolve([]));
    }
  }
  // sql("ef") names an identifier (lib/ask/entity-card.ts riskActive); a template is a statement or a fragment.
  const sql = ((chunks: TemplateStringsArray | string, ...params: unknown[]) => typeof chunks === "string" ? new Fragment(`"${chunks}"`) : new Fragment(chunks.reduce((query, text, i) => {
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
    const state = parseSignalState({ tip: "da_round", rol: "supplier", jud: "cluj", p: "12", criMin: "0.1", criMax: "0.2" });
    const url = new URL(signalUrl(state, { code: "fin_tiny_staff", band: null }), "http://local");
    expect(Object.fromEntries(url.searchParams)).toEqual({ tip: "fin_tiny_staff", rol: "supplier", jud: "Cluj" });
  });
  it("opens an old link to the retired \"Finalizare rapidă\" on the default signal, keeping its role and county", () => {
    expect(parseSignalState({ tip: "da_rapid", rol: "supplier", jud: "cluj" })).toMatchObject({ code: "da_split", role: "supplier", county: "Cluj", view: "signals" });
  });
  it("preserves a full risk selection and sorting while paging", () => {
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
  it("reads the complete published population beyond the sample mart and applies supplier county to the supplier endpoint", async () => {
    const db = database();
    await signalPopulation(db.sql, { role: "supplier", county: "Cluj" }, "da_round");
    const query = db.statements[0]!;
    expect(query).toContain("marts.signal_lookup");
    expect(query).not.toContain("flag_instances");
    expect(query).not.toMatch(/limit\s+500/i);
    expect(query).toContain("then f.partner_id else f.entity_id end");
    expect(query).toContain("county_entity.id = case when f.subject_type");
    expect(db.values).toContain("Cluj");
    expect(query).not.toContain("Cluj");
  });
  it("selects supplier award membership with EXISTS rather than multiplying one signal per winner", async () => {
    const db = database();
    await signalPopulation(db.sql, { role: "supplier", county: "Cluj" }, "award_single_bid");
    const query = db.statements[0]!;
    expect(query).toContain("exists (select 1 from core.contracts c join core.contract_winners cw");
    expect(query).toContain("county_entity.id = cw.entity_id");
    expect(query).toContain("f.total_ron");
    expect(query).not.toMatch(/limit\s+1\b/i);
  });
  it("preserves totals and clamps a page beyond the final complete page", async () => {
    const db = database(625);
    const result = await readSignalPage(db.sql, parseSignalState({ p: "99999", tip: "da_round" }));
    expect(result).toMatchObject({ total: 625, page: 62, pageSize: 10 });
    const page = db.statements.find((q) => q.includes("select selected.*"))!;
    expect(page).toContain("order by total_ron desc nulls last, severity desc nulls last, id");
    expect(page).toContain("order by winner.cited_value desc nulls last, winner.won desc nulls last, winner.entity_id");
    expect(page).toContain("winner where winner.cited or not exists");
    expect(db.values).toContain(620);
    expect(db.values).not.toContain(99999 * 10);
  });
  it("returns page zero for an empty population", async () => {
    const db = database(0);
    expect(await readSignalPage(db.sql, parseSignalState({ p: "30" }))).toMatchObject({ total: 0, page: 0 });
  });
  it("bins the risk score of the role's profiles (≥ 10 DAs) by tenths, 0 alone and 90–100 together", async () => {
    const db = database(0, [{ bin: 0, n: "9205" }, { bin: 20, n: "2686" }, { bin: 90, n: "3" }]);
    expect(await readRiskScoreDistribution(db.sql, parseSignalState({ view: "cri", rol: "supplier", jud: "Cluj" })))
      .toEqual([{ bin: 0, n: 9205 }, { bin: 20, n: 2686 }, { bin: 90, n: 3 }]);
    const [query] = db.statements.filter((q) => q.includes("marts.entity_flags"));
    expect(query).toContain("case when score = 0 then 0 when score < 10 then 1 else least(score / 10, 9) * 10 end bin");
    expect(query).toContain("where role = ?");
    expect(query).toContain("n_das >= 10");
    expect(query).toContain("lower(unaccent(county)) = lower(unaccent(?");
    expect(db.values).toEqual(expect.arrayContaining(["supplier", "Cluj"]));
  });
  it("drills a histogram bar as a range of the score; the last includes 100", async () => {
    const db = database(243);
    const result = await readSignalRiskGroup(db.sql, parseSignalState({ criMin: "0.4", criMax: "0.5", p: "99999", jud: "Cluj" }));
    expect(result).toMatchObject({ total: 243, page: 24, pageSize: 10 });
    const queries = db.statements.filter((q) => q.includes("marts.entity_flags"));
    for (const query of queries) expect(query).toMatch(/score >= \?\d+ and score < \?\d+/);
    expect(db.values).toEqual(expect.arrayContaining([40, 50]));
    // Ordered by the displayed score, then the value (the same percentage reads as a tie).
    expect(queries.at(-1)).toContain("order by score desc, total_ron desc nulls last, entity_id");
    const top = database(3);
    await readSignalRiskGroup(top.sql, parseSignalState({ criMin: "0.9", criMax: "1" }));
    for (const query of top.statements.filter((q) => q.includes("marts.entity_flags"))) {
      expect(query).toMatch(/score >= \?\d+/);
      expect(query).not.toContain("score <");
    }
    expect(top.values).toContain(90);
  });
  it("selects a number of patterns met, not a band", async () => {
    const db = database(12);
    await readSignalRiskGroup(db.sql, parseSignalState({ view: "cri", criteria: "2" }));
    for (const query of db.statements.filter((q) => q.includes("marts.entity_flags"))) {
      expect(query).toMatch(/n_flags = \?\d+/);
      expect(query).not.toContain("score >=");
    }
    expect(db.values).toContain(2);
  });
});

describe("the ranking leaves out the inactive profiles (owner, 16 November 2026, UX audit Z6-01)", () => {
  it("lists and bins only the profiles with a record in 24 months, and counts the others for the line", async () => {
    const db = database(14321);
    const result = await readSignalRiskGroup(db.sql, parseSignalState({ view: "cri" }));
    const queries = db.statements.filter((q) => q.includes("marts.entity_flags ef"));
    const [total, left, page] = queries;
    expect(total).toContain("and exists (\n  select 1 from marts.entity_profile ep where ep.entity_id = \"ef\".entity_id");
    expect(left).toContain("and not exists (");
    expect(page).toContain("last_activity >=");
    expect(page).not.toContain(" historic");
    expect(result.inactive).toBe(0);
    const bins = database(0, []);
    await readRiskScoreDistribution(bins.sql, parseSignalState({ view: "cri" }));
    expect(bins.statements.find((q) => q.includes("score / 10"))).toContain("marts.entity_profile ep");
  });
  it("lists them with their last day when asked, and keeps the choice while paging, not on the signals' tab", async () => {
    const state = parseSignalState({ view: "cri", inactive: "1" });
    expect(state.inactive).toBe(true);
    const db = database(15730);
    await readSignalRiskGroup(db.sql, state);
    const queries = db.statements.filter((q) => q.includes("marts.entity_flags ef"));
    expect(queries[0]).not.toContain("entity_profile");
    expect(queries.at(-1)).toContain("end historic");
    const bins = database(0, []);
    await readRiskScoreDistribution(bins.sql, state);
    expect(bins.statements.find((q) => q.includes("score / 10"))).not.toContain("entity_profile");
    const next = new URL(signalUrl(state, { page: 2 }), "http://local").searchParams;
    expect(next.get("inactive")).toBe("1");
    expect(new URL(signalUrl(state, { view: "signals" }), "http://local").searchParams.has("inactive")).toBe(false);
    expect(parseSignalState({ inactive: "1" }).inactive).toBe(false);
    expect(new URL(signalUrl(state, { inactive: false }), "http://local").searchParams.has("inactive")).toBe(false);
  });
});

describe("the national list of „Adunate, trec de plafon” leaves out the groups under 1,2× (owner, 16 November 2026, Z6-04)", () => {
  it("lists only the groups above 1,2× its ceiling, counts the others, and its count in the chooser is the list's", async () => {
    const db = database(11767);
    const result = await readSignalPage(db.sql, parseSignalState({ tip: "da_split" }));
    const [total] = db.statements.filter((q) => q.includes("select count(*)::text n from"));
    expect(total).toContain("where (select (sf.evidence->>'total')::numeric / nullif((sf.evidence->>'ceiling')::numeric, 0)");
    expect(db.statements.some((q) => q.includes("where not (select (sf.evidence"))).toBe(true);
    expect(db.values).toContain(1.2);
    expect(result.under).toBe(0);
    const counts = database();
    await readSignalTypeCounts(counts.sql, parseSignalState({ tip: "da_concentration" }));
    expect(counts.statements.at(-1)).toContain("(flag_code <> 'da_split' or (select");
  });
  it("lists them on request (sub=1), only for this pattern, and never filters a case page", async () => {
    const state = parseSignalState({ tip: "da_split", sub: "1" });
    expect(state.under).toBe(true);
    expect(parseSignalState({ tip: "da_round", sub: "1" }).under).toBe(false);
    expect(new URL(signalUrl(state, { page: 4 }), "http://local").searchParams.get("sub")).toBe("1");
    expect(new URL(signalUrl(state, { code: "da_round" }), "http://local").searchParams.has("sub")).toBe(false);
    const db = database(17615);
    await readSignalPage(db.sql, state);
    expect(db.statements.find((q) => q.includes("select count(*)::text n from"))).not.toContain("sf.evidence");
    const entity = database(52);
    const page = await readSignalPage(entity.sql, { ...parseSignalState({ tip: "da_split" }), entity: "2135987" });
    expect(entity.statements.some((q) => q.includes("sf.evidence"))).toBe(false);
    expect(page.under).toBeUndefined();
  });
});

describe("entity signal type badge", () => {
  it("uses the singular for exactly one signal type", () => {
    expect(signalTypeCountLabel(1)).toBe("1 tip");
    expect(signalTypeCountLabel(2)).toBe("2 tipuri");
    expect(signalTypeCountLabel(13)).toBe("13 tipuri");
  });
});

describe("redesigned signal navigation", () => {
  it("normalizes exclusive signal roles without presenting a false zero population", () => {
    expect(parseSignalState({tip:"fin_tiny_staff"})).toMatchObject({view:"signals",role:"supplier"});
    expect(parseSignalState({tip:"da_concentration",rol:"supplier"})).toMatchObject({role:"authority"});
    expect(parseSignalState({tip:"da_concentration",rol:"supplier",view:"cri"})).toMatchObject({view:"cri",role:"supplier"});
  });
  it("switches to a compatible signal when explicitly changing role", () => {
    const href=signalUrl(parseSignalState({tip:"fin_tiny_staff",jud:"Buzau",p:"3"}),{role:"authority"});
    expect(parseSignalState(Object.fromEntries(new URL(href,"http://local").searchParams))).toMatchObject({code:"da_concentration",role:"authority",county:"Buzău",page:0});
  });
  it("retains the explicit risk list without requiring a band", () => {
    const state=parseSignalState({view:"cri",rol:"supplier",sort:"name",dir:"asc"});
    expect(parseSignalState(Object.fromEntries(new URL(signalUrl(state,{page:4}),"http://local").searchParams))).toEqual({...state,page:4});
  });
  it("preserves criteria selection across pagination and discards it on role change", () => {
    const state=parseSignalState({view:"cri",criteria:"3",jud:"Cluj"});
    expect(parseSignalState(Object.fromEntries(new URL(signalUrl(state,{page:2}),"http://local").searchParams))).toMatchObject({criteria:3,page:2,county:"Cluj"});
    expect(parseSignalState(Object.fromEntries(new URL(signalUrl(state,{role:"supplier"}),"http://local").searchParams))).toMatchObject({criteria:null,page:0});
  });
  it.each(["-1","1.5","Infinity","6"])("rejects invalid criteria %s", criteria=>{
    expect(parseSignalState({view:"cri",criteria}).criteria).toBeNull();
  });
  it("caps the number of patterns at the role's criteria (5 institutions, 4 firms)",()=>{
    expect(parseSignalState({view:"cri",rol:"supplier",criteria:"5"}).criteria).toBeNull();
    expect(parseSignalState({view:"cri",criteria:"0"}).criteria).toBe(0);
  });
});

describe("signals of one entity (audit F24)", () => {
  it("links one entity's signals to its own page, /entitati/{id}/semnale (owner, 6 November 2026), through type changes and paging", () => {
    const state = parseSignalState({ tip: "fin_tiny_staff", rol: "supplier", ent: "1967166", p: "2" });
    expect(state).toMatchObject({ entity: "1967166", role: "supplier", page: 2 });
    // The entity page's reading of an address: its id from the path, the rest from the query.
    const read = (href: string) => {
      const url = new URL(href, "http://local");
      expect(url.pathname).toBe("/entitati/1967166/semnale");
      expect(url.searchParams.has("ent")).toBe(false);
      return parseSignalState({ ...Object.fromEntries(url.searchParams), ent: "1967166" });
    };
    expect(new URL(signalUrl(state), "http://local").searchParams.get("rol")).toBe("furnizor");
    expect(read(signalUrl(state, { code: "fin_public_reliance" }))).toMatchObject({ entity: "1967166", code: "fin_public_reliance", page: 0 });
    expect(read(signalUrl(state, { page: 5 }))).toEqual({ ...state, page: 5 });
    const cleared = new URL(signalUrl(state, { entity: null }), "http://local");
    expect(cleared.pathname).toBe("/semnale");
    expect(cleared.searchParams.has("ent")).toBe(false);
    expect(cleared.searchParams.has("p")).toBe(false);
  });
  it.each(["0", "-1", "12a", "1.5", "1".repeat(19), ""])("ignores the invalid entity id %j", (ent) => {
    expect(parseSignalState({ ent }).entity).toBeNull();
  });
  it("does not carry the entity into the risk list", () => {
    expect(parseSignalState({ view: "cri", ent: "5" }).entity).toBeNull();
    expect(signalUrl(parseSignalState({ ent: "5" }), { view: "cri" })).not.toContain("ent=");
  });
  it("restricts a supplier to its own endpoint and to the award notices it won, without changing the population", async () => {
    const db = database();
    await signalPopulation(db.sql, { role: "supplier", county: null, entity: "1967166" });
    const query = db.statements[0]!;
    // the exact endpoint test appears in both non-award branches; the OR is only an index hint
    expect(query.match(/then f\.partner_id else f\.entity_id end = \?\d+ and \(f\.entity_id = \?\d+ or f\.partner_id = \?\d+\)/g)).toHaveLength(2);
    expect(query).toMatch(/own_cw\.entity_id = \?\d+/);
    expect(query).toContain("exists (select 1 from core.contracts c join core.contract_winners cw");
    expect(db.values.length).toBeGreaterThan(0);
    expect(db.values.every((v) => v === "1967166" || v === "supplier")).toBe(true);
  });
  it("restricts an authority's award signals to its own notices", async () => {
    const db = database();
    await signalPopulation(db.sql, { role: "authority", county: null, entity: "2146146" });
    const query = db.statements[0]!;
    expect(query).toMatch(/f\.subject_type = 'award'\s+and f\.entity_id is not null\s+and f\.entity_id = \?\d+/);
    expect(query).not.toContain("own_cw");
  });
  it("leaves the national population untouched without an entity", async () => {
    const db = database();
    await signalPopulation(db.sql, { role: "supplier", county: null });
    expect(db.statements[0]).not.toContain("own_cw");
    expect(db.statements[0]).not.toMatch(/f\.partner_id = \?/);
  });
  it("counts every signal type of the profile with the same population, and rejects malformed ids without a query", async () => {
    const db = database();
    await readEntitySignalCounts(db.sql, "1967166", "supplier");
    const counts = db.statements.find((q) => q.includes("group by flag_code"))!;
    expect(counts).toContain("marts.signal_lookup");
    expect(counts).toMatch(/own_cw\.entity_id = \?\d+/);
    const none = database();
    expect(await readEntitySignalCounts(none.sql, "1; drop", "supplier")).toEqual({});
    expect(none.statements).toHaveLength(0);
  });
});

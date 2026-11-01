import { afterAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { forgetAuthorityKinds } from "./authority-kind";
import { runRows, runSpec, type DistributionDataV3 } from "./compile";
import { ground } from "./ground";
import { forgetPeerPopulations, peerDialog, peerMembers } from "./peer-groups";
import { peerKey, peerTicks } from "./peer-groups-shared";
import { validateSpec, type AskSpec } from "./spec";
import { testDatabaseUrl, withAskFixture } from "./test-fixture";
import { RISK_WEIGHT } from "../risk-score";

/*
 * distribution-3 (rf-2026.18; the group of F6a, plan §4.11, §6.2) on a
 * rolled-back fixture of the engine's tables: the position is on the displayed
 * risk score, not on the number of patterns; higher + equal + lower are the
 * others; the bands and a bar's members are the same members; an old link's
 * tenth of the index and an old bar's number of criteria still select; a
 * commune enters a town's group by population, not by rank; an ambiguous town
 * hall enters no group; the sector town halls compare among themselves; a
 * group under 5 is the empty state; a tick the entity cannot form is refused;
 * the window's size, the answer's group and the sources' profiles are the same
 * members.
 */

const url = testDatabaseUrl("Distribution groups");
const connection = url ? createDb(url, { max: 1 }) : null;
afterAll(async () => { await connection?.sql.end(); });

const BASE = 9_188_000_000;
/** offset, name, county, accepted direct acquisitions, the strength x of each pattern met (institutions). */
const AUTHORITIES: [number, string, string, number, Record<string, number>][] = [
  [1, "Orasul Lipova", "Arad", 300, { da_split: 1, da_year_end: 1 }], // 10,040 inhabitants: the band is 5,020–20,080; 36%
  [2, "Comuna Ighiu", "Alba", 120, { da_split: 1 }], // 20%
  [3, "Comuna Jidvei", "Alba", 90, {}], // 5,020: on the band's lower bound; 0%
  [4, "Comuna Sasciori", "Alba", 80, { da_split: 1, da_year_end: 1, da_round: 1 }], // 49%
  [5, "Comuna Macea", "Arad", 5, { da_split: 1 }], // in the band, under the profile's threshold
  [6, "Comuna Secusigiu", "Arad", 70, { da_year_end: 1 }], // 20%
  [7, "Comuna Siria", "Arad", 60, {}],
  [8, "Comuna Vladimirescu", "Arad", 200, { da_split: 1, da_year_end: 1 }], // 36%: level with Lipova
  [9, "Orasul Costesti", "Arges", 150, { da_split: 3 }], // a town of the band; one pattern at full strength: 60%, above Lipova's two
  [10, "Comuna Vinga", "Arad", 50, {}], // two identities of one town hall: neither is placed
  [11, "Comuna Vinga", "Arad", 40, {}],
  [12, "Comuna Albac", "Alba", 100, { da_split: 1 }], // 1,846: outside the band
  ...[1, 2, 3, 4, 5, 6].map((n): [number, string, string, number, Record<string, number>] => [20 + n, `Sectorul ${n} al Municipiului Bucuresti`, "Bucuresti", 500 + n, n % 2 ? { da_split: 1 } : {}]),
  ...[1, 2, 3].map((n): [number, string, string, number, Record<string, number>] => [30 + n, `Spitalul Fixture ${n}`, "Cluj", 1_000 * n, n === 1 ? { da_split: 1 } : {}]),
  [40, "Directia Fixture de Asistenta", "Arad", 400, {}], // no sure type
];
const id = (offset: number) => String(BASE + offset);
/** The score of the strengths (packages/db profile-flags), unrounded. */
const scoreRaw = (parts: Record<string, number>) => 100 * (1 - Object.values(parts).reduce((p, x) => p * (1 - (RISK_WEIGHT * x) / 3), 1));

async function seed(q: DbSql): Promise<void> {
  const rows = AUTHORITIES.map(([o, name, county, nDas, parts]) => {
    const raw = scoreRaw(parts), score = Math.round(raw);
    return { id: id(o), name, folded: name.toLowerCase(), county, nDas, flags: Object.keys(parts), n: Object.keys(parts).length, score, raw, cri: score / 100,
      parts: Object.fromEntries(Object.entries(parts).map(([code, x]) => [code, { x }])) };
  });
  await q`insert into core.entities (id, name_display, name_normalized, cui_canonical, cui_valid, county, country_code, is_foreign)
    select (r->>'id')::bigint, r->>'name', r->>'folded', r->>'id', true, r->>'county', 'RO', false from jsonb_array_elements(${JSON.stringify(rows)}::jsonb) r`;
  await q`insert into marts.entity_profile (entity_id, role, name_display, county, n_das, n_contracts, total_ron_full, total_ron_split, is_foreign)
    select (r->>'id')::bigint, 'authority', r->>'name', r->>'county', (r->>'nDas')::int, 0, 1000, 1000, false from jsonb_array_elements(${JSON.stringify(rows)}::jsonb) r`;
  await q`insert into marts.entity_flags (entity_id, role, name_display, county, n_das, total_ron, cri, n_flags, flags, score, score_raw, score_parts)
    select (r->>'id')::bigint, 'authority', r->>'name', r->>'county', (r->>'nDas')::int, 1000, (r->>'cri')::numeric, (r->>'n')::int, r->'flags',
           (r->>'score')::smallint, (r->>'raw')::real, r->'parts'
    from jsonb_array_elements(${JSON.stringify(rows)}::jsonb) r`;
  // The counties a filter grounds to (ground.ts reads them from spend_by_county).
  await q`insert into marts.spend_by_county (county, role, n, total_ron) values ('Alba', 'authority', 1, 1), ('Arad', 'authority', 1, 1)`;
  forgetPeerPopulations(); forgetAuthorityKinds();
}

async function answer(q: DbSql, raw: Record<string, unknown>): Promise<DistributionDataV3 | { error: string }> {
  const spec = validateSpec({ block: "distribution", measure: "value", ...raw });
  if ("error" in spec) return spec;
  const result = await runSpec(q, spec, await ground(q, spec.filters));
  if ("error" in result) return { error: result.error };
  if (result.data.block !== "distribution" || result.data.distribution.version !== 3) throw new Error("not a distribution-3");
  return result.data.distribution;
}
const ok = (d: DistributionDataV3 | { error: string }): DistributionDataV3 => { if ("error" in d) throw new Error(d.error); return d; };
const count = (rows: Awaited<ReturnType<typeof runRows>>) => "error" in rows ? rows.error : rows.profileCount;

describe.runIf(Boolean(connection))("the distribution's group (distribution-3, isolated PostgreSQL)", () => {
  it("places a town among the town halls of its population band by score, counted as the answer, the window, a bar and the sources count them", async () => {
    const out = await withAskFixture(connection!.sql, "dist_population", seed, async (q) => {
      const lipova = { filters: { authorityId: Number(id(1)), authorityName: "Orasul Lipova" }, peers: { similar: true } };
      const d = ok(await answer(q, lipova));
      const dialog = await peerDialog(q, "authority", id(1), { filters: {}, peers: { similar: true } });
      const spec = validateSpec({ block: "distribution", measure: "value", ...lipova }) as AskSpec;
      const grounding = await ground(q, spec.filters);
      const sources = await runRows(q, spec, grounding, 0);
      // A bar of the chart (a band of the score), and an old link's bar of distribution-2 (a number of criteria).
      const bar = await runRows(q, spec, grounding, 0, { scope: { score: { from: 20, to: 29 } } });
      const oldBar = await runRows(q, spec, grounding, 0, { scope: { criteria: 1 } });
      const national = ok(await answer(q, { filters: lipova.filters }));
      // A bar's members (above 50 the chart's bars open them), ten at a time.
      const members = await peerMembers(q, "authority", id(1), { filters: {}, peers: { similar: true } }, { from: 20, to: 29 }, 0);
      const page2 = await peerMembers(q, "authority", id(1), { filters: {}, peers: { similar: true } }, { from: 20, to: 29 }, 10);
      const oldMembers = await peerMembers(q, "authority", id(1), { filters: {}, peers: { similar: true } }, 1, 0);
      // An old link's bar (distribution-1, riskBucket, no ticks) keeps its population, the entity's own profile included:
      // its tenth 0,3–0,4 is now the score's 30–39%.
      const nationalSpec = validateSpec({ block: "distribution", measure: "value", filters: lipova.filters }) as AskSpec;
      const legacyBar = await runRows(q, nationalSpec, await ground(q, nationalSpec.filters), 0, { scope: { riskBucket: { from: 0.3, to: 0.4 } } });
      return { d, dialog, sources, bar, oldBar, national, members, page2, oldMembers, legacyBar };
    });
    const { d, dialog, sources, bar, oldBar, national, members, page2, oldMembers, legacyBar } = out;
    expect(d.status).toBe("ok");
    expect(d.group.facts.similar).toEqual({ rule: "population", value: 10_040, min: 5_020, max: 20_080 });
    // Communes and a town together, by population; the lower bound inclusive; not the one under 10 records,
    // not the ambiguous Vinga, not Albac outside the band. By score, then direct acquisitions.
    expect(d.members!.map((m) => [m.name, m.score])).toEqual([
      ["Orasul Costesti", 60], ["Comuna Sasciori", 49], ["Comuna Vladimirescu", 36], ["Comuna Ighiu", 20], ["Comuna Secusigiu", 20], ["Comuna Jidvei", 0], ["Comuna Siria", 0],
    ]);
    expect(d.group.others).toBe(7);
    expect(d.focal).toMatchObject({ score: 36, parts: { da_split: { x: 1 }, da_year_end: { x: 1 } }, nFlags: 2, inGroup: true, population: 10_040 });
    // On the score, not the number of patterns: Costești's one strong pattern is above Lipova's two.
    expect(d.position).toEqual({ higher: 2, equal: 1, lower: 4 });
    expect(d.position!.higher + d.position!.equal + d.position!.lower).toBe(d.group.others);
    expect(d.hist!.filter((h) => h.n).map((h) => [h.from, h.n])).toEqual([[0, 2], [20, 2], [30, 1], [40, 1], [60, 1]]);
    expect(d.hist!.reduce((sum, h) => sum + h.n, 0)).toBe(7);
    expect(d.perCriterion!.find((c) => c.code === "da_split")).toEqual({ code: "da_split", others: 4, country: 10 });
    expect(d.criteria).toEqual(["da_split", "da_round", "da_year_end", "da_concentration", "da_above_ceiling"]);
    expect(d.members!.map((m) => m.population)).toContain(9_460);
    expect(d.group.populationVersion).toBeTruthy();
    // The window's size is the answer's group; the sources are its profiles; a bar its members in that band.
    expect(dialog!.sizes[peerKey(peerTicks({ filters: {}, peers: { similar: true } }, dialog!.facts))]).toBe(7);
    expect(count(sources)).toBe(7);
    expect(count(bar)).toBe(d.hist!.find((h) => h.from === 20)!.n);
    expect(count(oldBar)).toBe(3); // Ighiu, Secusigiu, Costești: one pattern each
    // The bar's list: the same members as the answer's list in that band, by score then direct acquisitions, with their population.
    if (!members || "error" in members) throw new Error("no members");
    expect(members.total).toBe(d.hist!.find((h) => h.from === 20)!.n);
    expect(members.members.map((m) => [m.name, m.score])).toEqual(d.members!.filter((m) => m.score >= 20 && m.score <= 29).map((m) => [m.name, m.score]));
    expect(members.members.every((m) => m.population !== null && m.entityId !== id(1))).toBe(true);
    expect(page2 && !("error" in page2) ? page2.members : null).toEqual([]);
    // An answer stored before (distribution-2) still opens its bar by number of criteria, by direct acquisitions.
    expect(oldMembers && !("error" in oldMembers) ? oldMembers.members.map((m) => m.name) : oldMembers).toEqual(["Orasul Costesti", "Comuna Ighiu", "Comuna Secusigiu"]);
    expect(count(legacyBar)).toBe(2); // Lipova and Vladimirescu, both 36%
    // The whole country: every other profile of the role.
    expect(national.group.others).toBe(AUTHORITIES.filter(([o, , , nDas]) => o !== 1 && nDas >= 10).length);
  });

  it("compares the sector town halls among themselves, and says a group under 5 is too small", async () => {
    const out = await withAskFixture(connection!.sql, "dist_sectors", seed, async (q) => ({
      sector: ok(await answer(q, { filters: { authorityId: Number(id(23)), authorityName: "Sectorul 3 al Municipiului Bucuresti" }, peers: { similar: true } })),
      hospitals: ok(await answer(q, { filters: { authorityId: Number(id(31)), authorityName: "Spitalul Fixture 1" }, peers: { similar: true } })),
      untyped: await answer(q, { filters: { authorityId: Number(id(40)), authorityName: "Directia Fixture de Asistenta" }, peers: { similar: true } }),
      below: ok(await answer(q, { filters: { authorityId: Number(id(5)), authorityName: "Comuna Macea" }, peers: { similar: true } })),
      activity: ok(await answer(q, { filters: { authorityId: Number(id(40)), authorityName: "Directia Fixture de Asistenta" }, peers: { activity: true } })),
    }));
    expect(out.sector).toMatchObject({ status: "ok", focal: { score: 20 }, group: { others: 5, facts: { similar: { rule: "sectors" } } }, position: { higher: 0, equal: 2, lower: 3 } });
    expect(out.sector.members!.every((m) => m.name.startsWith("Sectorul"))).toBe(true);
    // Two other hospitals: the empty state, not a position in a group it cannot read.
    expect(out.hospitals).toMatchObject({ status: "small", group: { others: 2 } });
    expect(out.hospitals.position).toBeUndefined();
    expect(out.untyped).toEqual({ error: "Tipul lui Directia Fixture de Asistenta nu se poate stabili sigur. Scoate „același tip” sau alege altă instituție." });
    // Under 10 accepted direct acquisitions: no position in a group it is not part of; its own score still read.
    expect(out.below).toMatchObject({ status: "below", focal: { nDas: 5, score: 20 } });
    // Activity ½–2× of 400: 200–800 (the sectors and Vladimirescu).
    expect(out.activity.group.facts.activity).toEqual({ min: 200, max: 800 });
    expect(out.activity.members!.map((m) => m.name).sort())
      .toEqual(["Comuna Vladimirescu", "Orasul Lipova", ...[1, 2, 3, 4, 5, 6].map((n) => `Sectorul ${n} al Municipiului Bucuresti`)].sort());
  });

  it("keeps an old link's other county: the entity outside the group, every member counted", async () => {
    const d = await withAskFixture(connection!.sql, "dist_legacy", seed, async (q) =>
      ok(await answer(q, { filters: { authorityId: Number(id(1)), authorityName: "Orasul Lipova", county: "Alba" } })));
    expect(d.focal.inGroup).toBe(false);
    expect(d.group.legacy).toEqual({ county: "Alba" });
    expect(d.group.ticks).toEqual([]);
    expect(d.group.others).toBe(4); // Ighiu, Jidvei, Săsciori, Albac: fewer than 5, the empty state
    expect(d.status).toBe("small");
  });
});

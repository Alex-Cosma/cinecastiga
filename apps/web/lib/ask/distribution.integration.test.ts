import { afterAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { forgetAuthorityKinds } from "./authority-kind";
import { runRows, runSpec, type DistributionData } from "./compile";
import { ground } from "./ground";
import { forgetPeerPopulations, peerDialog } from "./peer-groups";
import { peerKey, peerTicks } from "./peer-groups-shared";
import { validateSpec, type AskSpec } from "./spec";
import { testDatabaseUrl, withAskFixture } from "./test-fixture";

/*
 * distribution-2 (F6a, plan §4.11, §6.2) on a rolled-back fixture of the
 * engine's tables: the histogram is the other members; more + same + fewer
 * are the others; a commune enters a town's group by population, not by rank;
 * an ambiguous town hall enters no group; the sector town halls compare among
 * themselves; a group under 5 is the empty state; a tick the entity cannot
 * form is refused; the window's size, the answer's group and the sources'
 * profiles are the same members.
 */

const url = testDatabaseUrl("Distribution groups");
const connection = url ? createDb(url, { max: 1 }) : null;
afterAll(async () => { await connection?.sql.end(); });

const BASE = 9_188_000_000;
/** offset, name, county, accepted direct acquisitions, criteria met (institutions). */
const AUTHORITIES: [number, string, string, number, string[]][] = [
  [1, "Orasul Lipova", "Arad", 300, ["da_split", "da_year_end"]], // 10,040 inhabitants: the band is 5,020–20,080
  [2, "Comuna Ighiu", "Alba", 120, ["da_split"]],
  [3, "Comuna Jidvei", "Alba", 90, []], // 5,020: on the band's lower bound
  [4, "Comuna Sasciori", "Alba", 80, ["da_split", "da_year_end", "da_rapid"]],
  [5, "Comuna Macea", "Arad", 5, ["da_split"]], // in the band, under the profile's threshold
  [6, "Comuna Secusigiu", "Arad", 70, ["da_year_end"]],
  [7, "Comuna Siria", "Arad", 60, []],
  [8, "Comuna Vladimirescu", "Arad", 200, ["da_split", "da_year_end"]],
  [9, "Orasul Costesti", "Arges", 150, ["da_split"]], // a town of the band: towns and communes together
  [10, "Comuna Vinga", "Arad", 50, []], // two identities of one town hall: neither is placed
  [11, "Comuna Vinga", "Arad", 40, []],
  [12, "Comuna Albac", "Alba", 100, ["da_split"]], // 1,846: outside the band
  ...[1, 2, 3, 4, 5, 6].map((n): [number, string, string, number, string[]] => [20 + n, `Sectorul ${n} al Municipiului Bucuresti`, "Bucuresti", 500 + n, n % 2 ? ["da_split"] : []]),
  ...[1, 2, 3].map((n): [number, string, string, number, string[]] => [30 + n, `Spitalul Fixture ${n}`, "Cluj", 1_000 * n, n === 1 ? ["da_split"] : []]),
  [40, "Directia Fixture de Asistenta", "Arad", 400, []], // no sure type
];
const id = (offset: number) => String(BASE + offset);

async function seed(q: DbSql): Promise<void> {
  const rows = AUTHORITIES.map(([o, name, county, nDas, flags]) => ({ id: id(o), name, folded: name.toLowerCase(), county, nDas, flags, n: flags.length }));
  await q`insert into core.entities (id, name_display, name_normalized, cui_canonical, cui_valid, county, country_code, is_foreign)
    select (r->>'id')::bigint, r->>'name', r->>'folded', r->>'id', true, r->>'county', 'RO', false from jsonb_array_elements(${JSON.stringify(rows)}::jsonb) r`;
  await q`insert into marts.entity_profile (entity_id, role, name_display, county, n_das, n_contracts, total_ron_full, total_ron_split, is_foreign)
    select (r->>'id')::bigint, 'authority', r->>'name', r->>'county', (r->>'nDas')::int, 0, 1000, 1000, false from jsonb_array_elements(${JSON.stringify(rows)}::jsonb) r`;
  await q`insert into marts.entity_flags (entity_id, role, name_display, county, n_das, total_ron, cri, n_flags, flags)
    select (r->>'id')::bigint, 'authority', r->>'name', r->>'county', (r->>'nDas')::int, 1000, (r->>'n')::numeric / 5, (r->>'n')::int, r->'flags'
    from jsonb_array_elements(${JSON.stringify(rows)}::jsonb) r`;
  // The counties a filter grounds to (ground.ts reads them from spend_by_county).
  await q`insert into marts.spend_by_county (county, role, n, total_ron) values ('Alba', 'authority', 1, 1), ('Arad', 'authority', 1, 1)`;
  forgetPeerPopulations(); forgetAuthorityKinds();
}

async function answer(q: DbSql, raw: Record<string, unknown>): Promise<DistributionData | { error: string }> {
  const spec = validateSpec({ block: "distribution", measure: "value", ...raw });
  if ("error" in spec) return spec;
  const result = await runSpec(q, spec, await ground(q, spec.filters));
  if ("error" in result) return { error: result.error };
  if (result.data.block !== "distribution") throw new Error("not a distribution");
  return result.data.distribution;
}
const ok = (d: DistributionData | { error: string }): DistributionData => { if ("error" in d) throw new Error(d.error); return d; };

describe.runIf(Boolean(connection))("the distribution's group (distribution-2, isolated PostgreSQL)", () => {
  it("places a town among the town halls of its population band, counted as the answer, the window and the sources count them", async () => {
    const out = await withAskFixture(connection!.sql, "dist_population", seed, async (q) => {
      const lipova = { filters: { authorityId: Number(id(1)), authorityName: "Orasul Lipova" }, peers: { similar: true } };
      const d = ok(await answer(q, lipova));
      const dialog = await peerDialog(q, "authority", id(1), { filters: {}, peers: { similar: true } });
      const spec = validateSpec({ block: "distribution", measure: "value", ...lipova }) as AskSpec;
      const grounding = await ground(q, spec.filters);
      const sources = await runRows(q, spec, grounding, 0);
      const bar = await runRows(q, spec, grounding, 0, { scope: { criteria: 1 } });
      const national = ok(await answer(q, { filters: lipova.filters }));
      return { d, dialog, sources, bar, national };
    });
    const { d, dialog, sources, bar, national } = out;
    expect(d.status).toBe("ok");
    expect(d.group.facts.similar).toEqual({ rule: "population", value: 10_040, min: 5_020, max: 20_080 });
    // Communes and a town together, by population; the lower bound inclusive; not the one under 10 records,
    // not the ambiguous Vinga, not Albac outside the band.
    expect(d.members!.map((m) => m.name).sort()).toEqual(["Comuna Ighiu", "Comuna Jidvei", "Comuna Sasciori", "Comuna Secusigiu", "Comuna Siria", "Comuna Vladimirescu", "Orasul Costesti"]);
    expect(d.group.others).toBe(7);
    expect(d.hist!.reduce((sum, h) => sum + h.n, 0)).toBe(7);
    expect(d.position).toEqual({ more: 1, same: 1, fewer: 5 });
    expect(d.position!.more + d.position!.same + d.position!.fewer).toBe(d.group.others);
    expect(d.perCriterion!.find((c) => c.code === "da_split")).toEqual({ code: "da_split", others: 4, country: 10 });
    expect(d.members!.map((m) => m.population)).toContain(9_460);
    expect(d.group.populationVersion).toBeTruthy();
    expect(d.focal).toMatchObject({ nFlags: 2, inGroup: true, population: 10_040 });
    // The window's size is the answer's group; the sources are its profiles; a bar its members with that many criteria.
    expect(dialog!.sizes[peerKey(peerTicks({ filters: {}, peers: { similar: true } }, dialog!.facts))]).toBe(7);
    expect("error" in sources ? sources.error : sources.profileCount).toBe(7);
    expect("error" in bar ? bar.error : bar.profileCount).toBe(d.hist!.find((h) => h.k === 1)!.n);
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
    expect(out.sector).toMatchObject({ status: "ok", group: { others: 5, facts: { similar: { rule: "sectors" } } } });
    expect(out.sector.members!.every((m) => m.name.startsWith("Sectorul"))).toBe(true);
    // Two other hospitals: the empty state, not a position in a group it cannot read.
    expect(out.hospitals).toMatchObject({ status: "small", group: { others: 2 } });
    expect(out.hospitals.position).toBeUndefined();
    expect(out.untyped).toEqual({ error: "Tipul lui Directia Fixture de Asistenta nu se poate stabili sigur. Scoate „același tip” sau alege altă instituție." });
    // Under 10 accepted direct acquisitions: no position in a group it is not part of.
    expect(out.below).toMatchObject({ status: "below", focal: { nDas: 5 } });
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

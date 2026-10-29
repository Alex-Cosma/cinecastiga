import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createDb, type DbSql } from "@seap/db";
import { AUTHORITY_KINDS, type AskSpec, type AuthorityKind } from "./spec";
import { authorityPeerKind, forgetAuthorityKinds, readAuthorityKinds } from "./authority-kind";
import { runRows, runSpec } from "./compile";
import { getPeers, parsePeerInput } from "../peers";
import { testDatabaseUrl } from "./test-fixture";

/*
 * D1 (plan §5, §6.2): an institution has one kind, the same on Întreabă's
 * answers and sources (runSpec, runRows), on its risk profiles and on the peer
 * groups (/api/peers: the activity cohort of lib/peers-legacy.ts and the focal
 * kind of lib/peers.ts). Town halls come from the locality registry, the rest
 * from strict names. Rows are committed on the dedicated seap_test_* database
 * and deleted after.
 */

const url = testDatabaseUrl("Institution kinds");
const BASE = 887760000, SUPPLIER = "887760500";
/** id offset → name, county, legacy code, the kind D1 gives it. */
const AUTHORITIES: [number, string, string | null, number | null, AuthorityKind | null][] = [
  [1, "PRIMARIA   ARSURA", "Vaslui", 162149, "comuna"], // a town by today's patterns, a commune in the registry
  [2, "Primaria comunei Patulele", "Mehedinti", 112879, "comuna"],
  [3, "COMUNA BANEASA", "Constanta", 61069, "oras_municipiu"], // a town since 2004
  [4, "Municipiul Cluj-Napoca", "Cluj", 54975, "oras_municipiu"],
  [5, "INSTITUTUL CLINIC FUNDENI", "Bucuresti", null, "spital"], // a clinical institute
  [6, "Spitalul Judetean de Urgenta Fixture", "Cluj", null, "spital"],
  [7, "Comuna Vânători (Primaria Vinatori)", "Vrancea", 113849, "comuna"], // a code of another county: its name decides
  [8, "Comuna Școala Nouă", "Brasov", null, null], // two kinds by name: none
  [9, "Sectorul 2 al Municipiului Bucuresti", "Bucuresti", -2, "oras_municipiu"],
  [10, "CLUBUL COPIILOR SECTOR 3", "Bucuresti", -3, null],
  [11, "Primăria Ghimpați", "Giurgiu", null, "comuna"], // no code: the exact name and county
  [12, "Comuna Fixture Unu", "Cluj", null, "comuna"],
  [13, "Scoala Gimnaziala Patulele", "Mehedinti", 112879, "scoala"], // its locality's code, still a school
  [14, "JUDETUL CLUJ (CONSILIUL JUDETEAN)", "Cluj", -100, "consiliu_judetean"],
  [15, "Comuna Fixture Doi", "Cluj", null, "comuna"],
  [16, "Comuna Fixture Trei", "Cluj", null, "comuna"],
];
const UNITS: [number, string, string, string][] = [
  [162149, "ARSURA", "vaslui", "3"], [112879, "PĂTULELE", "mehedinti", "3"], [61069, "ORAŞ BANEASA", "constanta", "2"],
  [54975, "MUNICIPIUL CLUJ-NAPOCA", "cluj", "1"], [113849, "VÂNATORI", "mehedinti", "3"], [103238, "GHIMPAȚI", "giurgiu", "3"],
];
const id = (offset: number) => String(BASE + offset);
const expected = new Map(AUTHORITIES.map(([offset, , , , kind]) => [id(offset), kind]));
const ofKind = (kind: AuthorityKind) => AUTHORITIES.filter(([, , , , k]) => k === kind).map(([offset]) => id(offset));
const ours = (ids: Iterable<string>) => [...ids].filter((x) => expected.has(x)).sort();

describe.skipIf(!url)("the kind of an institution, the same on every page (isolated PostgreSQL)", () => {
  let sql: DbSql;
  const checkpoint = randomUUID();
  let insertedUnits: number[] = [];
  beforeAll(async () => {
    sql = createDb(url).sql;
    await sql`insert into core.entities (id, name_display, name_normalized, cui_canonical, cui_valid, county, country_code)
      select (v->>0)::bigint, v->>1, lower(v->>1), (v->>0), true, v->>2, 'RO' from jsonb_array_elements(${JSON.stringify(AUTHORITIES.map(([o, n, c]) => [id(o), n, c]))}::jsonb) v`;
    await sql`insert into core.entities (id, name_display, name_normalized, cui_canonical, cui_valid, county, country_code) values (${SUPPLIER}, 'Furnizor Fixture', 'furnizor fixture', '88776050', true, 'Cluj', 'RO')`;
    insertedUnits = (await sql`insert into reference.uat (siruta, name, county, tip) select * from jsonb_to_recordset(${JSON.stringify(UNITS.map(([s, n, c, t]) => ({ siruta: s, name: n, county: c, tip: t })))}::jsonb)
      as u(siruta integer, name text, county text, tip text) on conflict do nothing returning siruta`).map((r) => Number(r.siruta));
    const codes = AUTHORITIES.filter(([, , , code]) => code !== null).map(([o, , , code]) => ({ entity_id: id(o), uat_siruta: code }));
    await sql`insert into reference.authority_uat (entity_id, uat_siruta) select * from jsonb_to_recordset(${JSON.stringify(codes)}::jsonb) as a(entity_id bigint, uat_siruta integer)`;
    await sql`insert into marts.entity_profile (entity_id, role, name_display, county, n_das, n_contracts, total_ron_full, total_ron_split)
      select entity_id, 'authority', name_display, county, 4, 0, 400, 400 from (select id entity_id, name_display, county from core.entities where id between ${BASE + 1} and ${BASE + 99}) e`;
    // Four direct acquisitions each, in 2021 and CPV 39 (apart from the other fixtures): every institution is in every other's activity band.
    await sql`insert into marts.da_transactions (sicap_da_id, authority_id, authority_name, supplier_id, supplier_name, county, closing_value, finalization_date, cpv_code)
      select ${BASE} + e.id % 1000 * 10 + r, e.id, e.name_display, ${SUPPLIER}::bigint, 'Furnizor Fixture', e.county, 100, '2021-06-0' || r, '39000000-2'
      from core.entities e cross join generate_series(1, 4) r where e.id between ${BASE + 1} and ${BASE + 99}`;
    await sql`insert into marts.entity_flags (entity_id, role, name_display, county, n_das, total_ron, cri, n_flags, flags)
      select id, 'authority', name_display, county, 20, 400, 0.5, 1, '[]' from core.entities where id between ${BASE + 1} and ${BASE + 99}`;
    await sql`insert into app.monitoring_refreshes (id, kind, status, completed_at, source_coverage, validation) values (${checkpoint}, 'baseline', 'ready', now(), '{}', '{"fixture":true}')`;
    forgetAuthorityKinds();
  });
  afterAll(async () => {
    if (!sql) return;
    await sql`delete from app.monitoring_refreshes where id = ${checkpoint}`;
    await sql`delete from marts.entity_flags where entity_id between ${BASE} and ${BASE + 999}`;
    await sql`delete from marts.da_transactions where authority_id between ${BASE} and ${BASE + 999}`;
    await sql`delete from marts.entity_profile where entity_id between ${BASE} and ${BASE + 999}`;
    await sql`delete from reference.authority_uat where entity_id between ${BASE} and ${BASE + 999}`;
    if (insertedUnits.length) await sql`delete from reference.uat where siruta = any(${insertedUnits}::integer[])`;
    await sql`delete from core.entities where id between ${BASE} and ${BASE + 999}`;
    forgetAuthorityKinds();
    await sql.end();
  });

  it("classifies town halls from the registry, the rest by name, an ambiguous name nowhere", async () => {
    const kinds = await readAuthorityKinds(sql);
    expect(Object.fromEntries([...expected.keys()].map((x) => [x, kinds.byId.get(x) ?? null]))).toEqual(Object.fromEntries(expected));
    for (const kind of AUTHORITY_KINDS) expect([kind, ours(kinds.ids[kind])]).toEqual([kind, ofKind(kind).sort()]);
    for (const x of expected.keys()) expect(await authorityPeerKind(sql, x)).toBe(expected.get(x));
  });

  it("selects the same institutions in the answer, its sources and the risk profiles", async () => {
    for (const kind of AUTHORITY_KINDS) {
      // Months keep the answer on its live query (the rollups keep whole years).
      const spec: AskSpec = { block: "table", dim: "authority", measure: "value", dataset: "da", topN: 50,
        filters: { authorityKind: kind, yearFrom: 2021, yearTo: 2021, monthFrom: 1, monthTo: 12 } };
      const answer = await runSpec(sql, spec, {});
      if ("error" in answer || answer.data.block !== "table") throw new Error(`${kind}: ${"error" in answer ? answer.error : answer.data.block}`);
      expect([kind, ours(answer.data.rows.map((r) => String(r.entityId)))]).toEqual([kind, ofKind(kind).sort()]);
      const sources = await runRows(sql, spec, {}, 0);
      if ("error" in sources) throw new Error(`${kind}: ${sources.error}`);
      expect([kind, sources.total]).toEqual([kind, 4 * ofKind(kind).length]);
      const scatter = await runSpec(sql, { block: "scatter", dim: "authority", measure: "value", filters: { authorityKind: kind } }, {});
      if ("error" in scatter || scatter.data.block !== "scatter") throw new Error(`${kind}: ${"error" in scatter ? scatter.error : scatter.data.block}`);
      // scatter-2: a group of at least 10 is a cloud of points; a smaller one is listed whole (final scatter §4.4).
      const cloud = "scatter" in scatter.data ? scatter.data.scatter : null;
      if (!cloud) throw new Error(`${kind}: the old shape`);
      const ids = cloud.group.small ? cloud.list.map((r) => r.entityId) : "points" in cloud.cloud ? cloud.cloud.points.map((p) => p.id) : [];
      expect([kind, ours(ids)]).toEqual([kind, ofKind(kind).sort()]);
    }
  });

  it("gives the peer groups the same kind and the same members", async () => {
    const peers = (offset: number, method: "activity" | "population") =>
      getPeers(parsePeerInput(new URLSearchParams(`entityId=${id(offset)}&role=authority&method=${method}&dataset=da&year=2021&cpv=39`)), sql);
    // Arsura: a commune by the registry; its group is the other communes, never Băneasa (a town) or the ambiguous name.
    const communes = await peers(1, "activity");
    expect(communes.methodology.version).toBe("peers-2");
    expect(communes.cohort).toMatchObject({ authorityKind: "comuna", count: ofKind("comuna").length - 1, excludedUnknownType: 2 });
    expect(ours(communes.members.map((m) => m.entity.id))).toEqual(ofKind("comuna").filter((x) => x !== id(1)).sort());
    // Fundeni: a hospital with the clinical institutes.
    const hospitals = await peers(5, "activity");
    expect(hospitals.cohort.authorityKind).toBe("spital");
    expect(ours(hospitals.members.map((m) => m.entity.id))).toEqual([id(6)]);
    // A name of two kinds has no group.
    expect((await peers(8, "activity")).cohort.status).toBe("unknown_authority_type");
    // The population method names the same kind for its focal administration (lib/peers.ts).
    expect((await peers(4, "population")).cohort.authorityKind).toBe("oras_municipiu");
    expect((await peers(1, "population")).cohort.authorityKind).toBe("comuna");
  });
});

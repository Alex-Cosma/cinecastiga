import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createDb, type DbSql } from "@seap/db";
import { createMonitoringWatch, getMonitoringRun } from "./monitoring";
import { evaluateMonitoringWatch } from "./monitoring-engine";
import { MONITORING_METHODOLOGY_CHANGED_NOTE, monitoringRunTag } from "./monitoring-shared";
import { readConnectionEntity } from "./connections";
import { bindPeerEvidence } from "./peers-evidence";
import type { PeerEvidenceSelection } from "./peers-evidence-shared";
import { processCapture, queueCapture } from "./evidence-captures";
import { validateCaptureRequest } from "./evidence-capture-input";
import { KEY_VERSIONS } from "./ask/answer-core";
import { forgetAuthorityKinds } from "./ask/authority-kind";
import { testDatabaseUrl } from "./ask/test-fixture";
import type { AskSpec, AuthorityKind } from "./ask/spec";

/*
 * D1 on what a user keeps (plan §2.8, §6): the release that corrects the kind
 * of institution alerts once, with a methodology alert, only the watches whose
 * question has a kind, and never as a second "recalculated"; a comparison
 * capture bound before it is refused rather than saved with the corrected
 * group. The release before D1 is emulated as it ran: KEY_VERSIONS without
 * kind-2, and the kind of 2853759 (KIND_PATTERNS on the name: in Întreabă a
 * name matching any pattern of a kind is of that kind, in the comparisons only
 * a name matching one kind) in place of lib/ask/authority-kind.ts's lists.
 * Rows are committed on the dedicated seap_test_* database and deleted after.
 */

const release = vi.hoisted(() => {
  const PATTERNS: Record<string, readonly string[]> = {
    comuna: ["comuna %"],
    oras_municipiu: ["oras%", "orș%", "oraș%", "munici%", "primaria %", "primăria %"],
    consiliu_judetean: ["judetul %", "județul %", "consiliul judetean%", "consiliul județean%"],
    spital: ["spital%"],
    scoala: ["%scoala%", "%școala%", "liceul%", "colegiul%", "gradinita%", "grădinița%"],
  };
  const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const like = (name: string, pattern: string) =>
    new RegExp(`^${fold(pattern).split("%").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "su").test(fold(name));
  return {
    beforeD1: false,
    /** The kinds of 2853759 on the authorities of marts.entity_profile, in the shape of readAuthorityKinds. */
    async kinds(q: DbSql) {
      const rows = await q`select entity_id::text id, name_display name from marts.entity_profile where role = 'authority' and name_display is not null order by entity_id`;
      const ids = Object.fromEntries(Object.keys(PATTERNS).map((kind) => [kind, [] as string[]]));
      const byId = new Map<string, string>();
      for (const row of rows) {
        const kinds = Object.keys(PATTERNS).filter((kind) => PATTERNS[kind]!.some((p) => like(String(row.name), p)));
        for (const kind of kinds) ids[kind]!.push(String(row.id));
        if (kinds.length === 1) byId.set(String(row.id), kinds[0]!);
      }
      return { byId, ids };
    },
  };
});

vi.mock("./ask/authority-kind", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ask/authority-kind")>();
  const read = (q: DbSql) => (release.beforeD1 ? release.kinds(q) : actual.readAuthorityKinds(q)) as ReturnType<typeof actual.readAuthorityKinds>;
  return {
    ...actual,
    readAuthorityKinds: read,
    authorityKindIds: async (q: DbSql, kind: AuthorityKind | null | undefined) => (kind ? (await read(q)).ids[kind] : null),
    authorityPeerKind: async (q: DbSql, id: string) => (await read(q)).byId.get(String(id)) ?? null,
  };
});

const url = testDatabaseUrl("D1 on the watches");
const BASE = 886650000, SUPPLIER = String(BASE + 500);
/** id offset → name; three direct acquisitions of 100 lei each in March 2019 (CPV 33), in Harghita (apart from the other fixtures). */
const AUTHORITIES: [number, string][] = [
  [1, "Spitalul Municipal Fixture Harghita"], // a hospital before and after D1
  [2, "Institutul Oncologic Fixture Harghita"], // a clinical institute: a hospital from D1
  [3, "Comuna Fixture Harghita"], // a commune before and after D1
  [4, "Spitalul Orasenesc Fixture Harghita"], // a hospital before and after D1
];
const id = (offset: number) => String(BASE + offset);
const ours = (ids: Iterable<string>) => [...ids].filter((x) => Number(x) > BASE && Number(x) < BASE + 100).sort();
// Months keep the answers on their live queries (the rollups keep whole years).
const PLACE = { county: "Harghita", yearFrom: 2019, yearTo: 2019, monthFrom: 1, monthTo: 12 };
const HOSPITALS: AskSpec = { block: "stat", measure: "value", filters: { ...PLACE, authorityKind: "spital" } };
const EVERYONE: AskSpec = { block: "stat", measure: "value", filters: PLACE };

describe.skipIf(!url)("D1 on watches and captures: one methodology alert, only on a question with a kind (isolated PostgreSQL)", () => {
  let sql: DbSql, checkpointId: string, insertedCounty = false;
  const uid = `monitoring-kind-${randomUUID()}`, inv = randomUUID();
  const checkpoints: string[] = [];
  const declared = KEY_VERSIONS.kind!;
  async function checkpoint() {
    const value = randomUUID();
    checkpoints.push(value);
    await sql`insert into app.monitoring_refreshes (id, kind, status, methodology, source_coverage, validation, completed_at)
      values (${value}, 'baseline', 'ready', ${JSON.stringify({ version: "fixture-v1", fixture: uid })}::jsonb, '{}', '{}', now())`;
    checkpointId = value;
  }
  const run = async (watchId: string) => {
    const runId = (await evaluateMonitoringWatch(watchId, checkpointId, sql))!;
    return (await getMonitoringRun(uid, watchId, runId, sql))!;
  };
  /** A comparison bound as the sources and captures bind it, in a transaction of its own. */
  const bind = (selection: PeerEvidenceSelection) => sql.begin((q) => bindPeerEvidence(q as unknown as DbSql, selection));
  /** The release before D1 for `work`: its kinds, no key version. */
  async function beforeD1<T>(work: () => Promise<T>): Promise<T> {
    release.beforeD1 = true; delete KEY_VERSIONS.kind;
    try { return await work(); } finally { release.beforeD1 = false; KEY_VERSIONS.kind = declared; forgetAuthorityKinds(); }
  }

  beforeAll(async () => {
    sql = createDb(url).sql;
    (globalThis as typeof globalThis & { __seapAskSql?: DbSql }).__seapAskSql = sql;
    await sql`insert into auth.users (id, name, email, email_verified) values (${uid}, 'Kind watch owner', ${uid + "@example.invalid"}, true)`;
    await sql`insert into app.investigations (id, owner_user_id, title) values (${inv}, ${uid}, 'D1 comparison fixture')`;
    await sql`insert into core.entities (id, name_display, name_normalized, cui_canonical, cui_valid, county, country_code)
      select (v->>0)::bigint, v->>1, lower(v->>1), v->>0, true, 'Harghita', 'RO'
      from jsonb_array_elements(${JSON.stringify([...AUTHORITIES.map(([o, n]) => [id(o), n]), [SUPPLIER, "Furnizor Fixture Tip"]])}::jsonb) v`;
    await sql`insert into marts.entity_profile (entity_id, role, name_display, county, n_das, n_contracts, total_ron_full, total_ron_split)
      select id, 'authority', name_display, county, 3, 0, 300, 300 from core.entities where id between ${BASE + 1} and ${BASE + 99}`;
    await sql`insert into marts.da_transactions (sicap_da_id, da_code, authority_id, authority_name, supplier_id, supplier_name, county, closing_value, finalization_date, cpv_code)
      select ${BASE} + e.id % 1000 * 10 + r, 'DA kind ' || e.id || '-' || r, e.id, e.name_display, ${SUPPLIER}::bigint, 'Furnizor Fixture Tip', 'Harghita', 100, '2019-03-0' || r, '33600000-6'
      from core.entities e cross join generate_series(1, 3) r where e.id between ${BASE + 1} and ${BASE + 99}`;
    // The county a question names is grounded on the counties of the marts.
    insertedCounty = (await sql`insert into marts.spend_by_county (county, role, n, total_ron) values ('Harghita', 'authority', 0, 0) on conflict do nothing returning county`).length > 0;
    forgetAuthorityKinds();
  });
  afterAll(async () => {
    if (!sql) return;
    release.beforeD1 = false; KEY_VERSIONS.kind = declared;
    await sql`delete from auth.users where id = ${uid}`;
    await sql`delete from app.monitoring_refreshes where id = any(${checkpoints}::uuid[])`;
    await sql`delete from marts.da_transactions where authority_id between ${BASE} and ${BASE + 999}`;
    await sql`delete from marts.entity_profile where entity_id between ${BASE} and ${BASE + 999}`;
    await sql`delete from core.entities where id between ${BASE} and ${BASE + 999}`;
    if (insertedCounty) await sql`delete from marts.spend_by_county where county = 'Harghita' and role = 'authority'`;
    forgetAuthorityKinds();
    delete (globalThis as typeof globalThis & { __seapAskSql?: DbSql }).__seapAskSql;
    await sql.end();
  });

  it("a stat watch without a kind: no alert; with hospitals: exactly one methodology alert, no false recalculated", async () => {
    // The release before D1 takes the baselines.
    const [withKind, without] = await beforeD1(async () => {
      await checkpoint();
      const watches = [(await createMonitoringWatch(uid, { spec: HOSPITALS, title: "Spitalele din Harghita" }, sql)).id,
        (await createMonitoringWatch(uid, { spec: EVERYONE, title: "Toate instituțiile din Harghita" }, sql)).id] as const;
      expect((await run(watches[0])).run).toMatchObject({ kind: "baseline", hasAlert: false, rowCount: 6, totalExact: "600" });
      expect((await run(watches[1])).run).toMatchObject({ kind: "baseline", hasAlert: false, rowCount: 12, totalExact: "1200" });
      return watches;
    });

    // D1: the clinical institute is a hospital. The first check after it.
    await checkpoint();
    const d1 = await run(withKind);
    expect(d1.run).toMatchObject({ kind: "update", hasAlert: true, methodologyChanged: true, resultChanged: true,
      rowCount: 9, totalExact: "900", counts: { added: 3, removed: 0, changed: 0 } });
    expect(d1.methodology.answer).toEqual({ question: "stat-1", conditions: { kind: "kind-2" } });
    // A methodology alert, with what changed; the records it brought in are not presented as new data or a recalculation.
    expect(monitoringRunTag(d1.run)).toBe("Metodologie modificată");
    expect(d1.run.notes).toContain(MONITORING_METHODOLOGY_CHANGED_NOTE);
    // Without a kind the same institutions are counted: the same result, the same methodology, no alert.
    const plain = await run(without);
    expect(plain.run).toMatchObject({ kind: "unchanged", hasAlert: false, methodologyChanged: false, resultChanged: false, rowCount: 12, totalExact: "1200" });
    expect(plain.methodology).not.toHaveProperty("answer");
    expect(plain.run.notes).not.toContain(MONITORING_METHODOLOGY_CHANGED_NOTE);

    // The next check: nothing more on either watch, so one alert in all.
    await checkpoint();
    for (const watch of [withKind, without])
      expect((await run(watch)).run).toMatchObject({ kind: "unchanged", hasAlert: false, methodologyChanged: false, resultChanged: false });
    const [alerts] = await sql`select count(*) filter (where has_alert)::int n, count(*)::int runs from app.monitoring_runs where watch_id = ${withKind}`;
    expect(alerts).toEqual({ n: 1, runs: 3 });
  });

  it("a watch that follows only recalculations: the corrected kind changed its records, so it is no recalculation", async () => {
    // "Recalculated" is a result that changed on the same records; here the institute's records entered ("added", not followed).
    const watch = await beforeD1(async () => {
      await checkpoint();
      const created = (await createMonitoringWatch(uid, { spec: HOSPITALS, title: "Doar recalculări",
        preferences: { types: ["recalculated"], minimumValueExact: "0", digest: false } }, sql)).id;
      await run(created);
      return created;
    });
    await checkpoint();
    expect((await run(watch)).run).toMatchObject({ kind: "update", methodologyChanged: true, resultChanged: true, hasAlert: false, counts: { added: 3 } });
  });

  it("a comparison capture queued before D1 is refused, not saved with the corrected group", async () => {
    await checkpoint();
    const entity = await readConnectionEntity(sql, id(1), "authority");
    const selection: PeerEvidenceSelection = { version: "peer-evidence-1", checkpointId, entityId: id(1), identity: entity.identity, role: "authority",
      dataset: "all", year: 2019, cpv: "33", selection: { kind: "comparison" } };
    const capture = await beforeD1(async () => {
      // The activity group before D1: the other hospital only.
      const bound = await bind(selection);
      expect(bound.comparison.cohort.authorityKind).toBe("spital");
      expect(ours(bound.comparison.members.map((m) => m.entity.id))).toEqual([id(4)]);
      const request = validateCaptureRequest("query", null, { block: "stat", measure: "value", filters: {} }, { peer: selection, evidenceOptions: {}, title: "Comparația spitalului" });
      if ("error" in request) throw new Error(request.error);
      const clipId = randomUUID();
      return sql.begin(async (q) => {
        await q`insert into app.clips (id, investigation_id, kind, spec, snapshot, created_by) values (${clipId}, ${inv}, 'query', ${JSON.stringify(request.spec)}::jsonb, ${JSON.stringify({ peer: request.peer })}::jsonb, ${uid})`;
        return queueCapture(q as unknown as DbSql, uid, inv, clipId, request);
      });
    });
    // D1: the institute joins the group, on the same checkpoint.
    const corrected = await bind(selection);
    expect(ours(corrected.comparison.members.map((m) => m.entity.id))).toEqual([id(2), id(4)]);
    expect(corrected.comparison.methodology.version).toBe("peers-2");
    await processCapture(uid, inv, capture.id, sql);
    const [job] = await sql`select status, error, (select count(*)::int from app.evidence_capture_rows r where r.capture_id = c.id) n from app.evidence_captures c where id = ${capture.id}`;
    expect(job).toMatchObject({ status: "failed", n: 0 });
    expect(String(job!.error)).toContain("Membrii sau datele comparației s-au schimbat");
  });
});

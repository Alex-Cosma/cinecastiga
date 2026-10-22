import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@seap/db";
import { interpretQuestion } from "../intent/server";
import { suggestCpv } from "../intent/vocabulary-queries";
import { ground } from "./ground";

/**
 * Migration 0080 (beginner vocabulary) and the CPV grounding it feeds, on a
 * dedicated seap_test_* database: the pre-0080 seed, then the migration
 * (twice: it is idempotent), then the same reading the engine and the
 * interpreter do. Run with TEST_DATABASE_URL=postgres://…/seap_test_b_<name>.
 */
const testUrl = process.env["TEST_DATABASE_URL"];
if (testUrl && !/^seap_test_[a-z0-9_]+$/.test(new URL(testUrl).pathname.slice(1))) throw new Error("Synonym fixtures require a dedicated seap_test_* database");
const connection = testUrl ? createDb(testUrl, { max: 2 }) : null;
const root = new URL("../../../../packages/db/", import.meta.url);
const seed = readFileSync(new URL("seeds/cpv-synonyms.sql", root), "utf8");
const migration = readFileSync(new URL("migrations/0080_cpv_synonym_beginner_terms.sql", root), "utf8");
const MARKER = "-- Beginner vocabulary (22 October 2026).";
const NOW = new Date("2026-10-22T12:00:00Z");

const CATALOG: [string, string][] = [
  ["31500000-1", "Aparatură de iluminat şi lămpi electrice"], ["31522000-1", "Ghirlande luminoase pentru pomul de Crăciun"],
  ["34928500-3", "Echipament de iluminat stradal"], ["34928510-6", "Stâlpi de iluminat stradal"], ["34993000-4", "Iluminat stradal"],
  ["39298500-2", "Ornamente"], ["45316000-5", "Lucrări de instalare de sisteme de iluminare şi de semnalizare"],
  ["45316110-9", "Instalare de echipament de iluminare stradală"], ["50232000-0", "Servicii de întreţinere a instalaţiilor de iluminare publică şi a semafoarelor"],
  ["50232100-1", "Servicii de întreţinere a iluminatului public"], ["41000000-9", "Apă colectată şi purificată"],
  ["65100000-4", "Distribuţie de apă şi servicii conexe"], ["45232150-8", "Lucrări pentru conducte de alimentare cu apă"],
  ["15981000-8", "Apă minerală"], ["33100000-1", "Echipamente medicale"], ["60000000-8", "Servicii de transport"],
  ["60130000-8", "Servicii de transport rutier specializat de pasageri"], ["34114400-3", "Microbuze"], ["30213100-6", "Computere portabile"],
];

beforeAll(async () => {
  if (!connection) return;
  const sql = connection.sql;
  await sql.unsafe(`
    create extension if not exists unaccent; create extension if not exists pg_trgm;
    create schema if not exists core; create schema if not exists reference; create schema if not exists marts;
    drop table if exists core.cpv_codes, reference.cpv_synonym, reference.uat, marts.entity_profile, reference.company_reps;
    create table core.cpv_codes (code text primary key, name_ro text, division text);
    create table reference.uat (siruta integer primary key, name text, county text, tip text, population integer);
    create table marts.entity_profile (entity_id bigint not null, role text not null, name_display text, county text, total_ron_full numeric, primary key (entity_id, role));
    create table reference.company_reps (person_key text, person_name text, birth_date date, snapshot_date date, birth_locality text, cui text);
  `);
  for (const [code, name] of CATALOG) await sql`insert into core.cpv_codes (code, name_ro) values (${code}, ${name})`;
  // production before 0080: the seed as it was (everything before the new block)
  await sql.unsafe(seed.slice(0, seed.indexOf(MARKER)));
});
afterAll(async () => { await connection?.sql.end(); });

const prefixes = async (term: string) => (await ground(connection!.sql, { cpvTerm: term })).cpv?.prefixes.slice().sort();
const rows = async () => (await connection!.sql`select term, cpv_prefix, note from reference.cpv_synonym order by term, cpv_prefix`).map((r) => `${r.term}|${r.cpv_prefix}|${r.note ?? ""}`);

describe.runIf(Boolean(connection))("migration 0080: beginner CPV vocabulary (dedicated seap_test_* fixture)", () => {
  it("was the old meaning before: iluminat = lamps only, apa caught medical equipment", async () => {
    expect(await rows()).toHaveLength(99);
    expect(await prefixes("iluminat")).toEqual(["315"]);
    // exact rows first: "apa" no longer picks up "aparatura medicala" or "apa minerala"
    expect(await prefixes("apa")).toEqual(["41"]);
  });

  it("adds rows only, idempotently, and the seed reproduces the migrated state", async () => {
    const sql = connection!.sql;
    const before = await rows();
    for (const run of [1, 2]) for (const statement of migration.split("--> statement-breakpoint")) await sql.unsafe(statement);
    const after = await rows();
    expect(after).toHaveLength(99 + 84);
    expect(before.every((r) => after.includes(r))).toBe(true);
    await sql.unsafe(seed);
    expect(await rows()).toEqual(after);
  });

  it("grounds a term to all of its own rows, without crowding or letter-containment", async () => {
    expect(await prefixes("iluminat")).toEqual(["315", "349285", "34993", "45316", "50232"]);
    expect(await prefixes("iluminat public")).toEqual(["349285", "34993", "45316", "50232"]);
    expect(await prefixes("apa")).toEqual(["41", "4523215", "651"]);
    expect(await prefixes("transport elevi")).toEqual(["341144", "6013"]);
    expect(await prefixes("laptop")).toEqual(["302131"]);
    // road rehabilitation stays in "reabilitare" and the whole of 45233 in "reabilitare drumuri"
    expect(await prefixes("reabilitare")).toEqual(["4523314", "45321", "45453"]);
    expect(await prefixes("reabilitare drumuri")).toEqual(["45233", "4523314"]);
    expect(await prefixes("alimentare cu apa")).toEqual(["41", "4523215"]);
    // a term without rows of its own still falls back to containment
    expect(await prefixes("transport public")).toEqual(["60"]);
    // …and keeps every row of the term it falls back to
    expect(await prefixes("iluminat stradal")).toEqual(["315", "349285", "34993", "45316", "50232"]);
  });

  it("carries every row note to the people who read the answer", async () => {
    const sql = connection!.sql;
    const notes = async (term: string) => (await ground(sql, { cpvTerm: term })).cpv?.notes;
    expect(await notes("iluminat")).toEqual([expect.stringMatching(/^Include și semnalizarea rutieră \(semafoare, balizaj\).*aproximativ 7% din valoare\.$/)]);
    expect(await notes("iluminat public")).toHaveLength(1);
    expect(await notes("iluminat festiv")).toEqual([]);
    // notes of older rows are surfaced the same way
    expect(await notes("lemne")).toEqual(["lemn de foc"]);
  });

  it("is the vocabulary the interpreter and the home search read", async () => {
    const sql = connection!.sql;
    expect((await suggestCpv(sql, "iluminat public")).map((r) => r.term)).toContain("iluminat public");
    const festiv = await interpretQuestion(sql, "iluminat festiv", { now: NOW });
    expect(festiv.interpretation.subjects[0]).toMatchObject({ term: "iluminat festiv", source: "synonym" });
    expect(festiv.spec?.filters.cpvTerm).toBe("iluminat festiv");
    const gropi = await interpretQuestion(sql, "gropi", { now: NOW });
    expect(gropi.interpretation.subjects[0]?.term).toBe("gropi");
  });
});

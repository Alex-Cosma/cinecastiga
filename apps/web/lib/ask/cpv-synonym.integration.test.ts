import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@seap/db";
import { interpretQuestion } from "../intent/server";
import { suggestCpv } from "../intent/vocabulary-queries";
import { ground } from "./ground";

/**
 * Migrations 0080 (beginner vocabulary) and 0081 (exclusions and the audit's
 * changes) and the CPV grounding they feed, on a dedicated seap_test_*
 * database: the seed as it was before 0080, then each migration twice (they
 * are idempotent), then a re-seed, which must give the same rows, then the
 * same reading the engine and the interpreter do.
 * Run with TEST_DATABASE_URL=postgres://…/seap_test_b_<name>.
 */
const testUrl = process.env["TEST_DATABASE_URL"];
if (testUrl && !/^seap_test_[a-z0-9_]+$/.test(new URL(testUrl).pathname.slice(1))) throw new Error("Synonym fixtures require a dedicated seap_test_* database");
const connection = testUrl ? createDb(testUrl, { max: 2 }) : null;
const root = new URL("../../../../packages/db/", import.meta.url);
const seed = readFileSync(new URL("seeds/cpv-synonyms.sql", root), "utf8");
const before0080 = readFileSync(new URL("./fixtures/cpv-synonyms-before-0080.sql", import.meta.url), "utf8");
const migration = (name: string) => readFileSync(new URL(`migrations/${name}.sql`, root), "utf8");
const NOW = new Date("2026-10-22T12:00:00Z");
const ILUMINAT_NOTE = "Include și semnalizarea rutieră (semafoare, balizaj), clasificată în aceleași coduri CPV cu iluminatul public. La nivel național e circa 8% din valoare, dar în unele județe mult mai mult.";

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
  // production before 0080: the seed as it was then, with its 13 curator labels in `note`
  await sql.unsafe(before0080);
});
afterAll(async () => { await connection?.sql.end(); });

const grounded = async (term: string) => (await ground(connection!.sql, { cpvTerm: term })).cpv;
const prefixes = async (term: string) => (await grounded(term))?.prefixes.slice().sort();
const rows = async () => (await connection!.sql`select term, cpv_prefix, note, exclude from reference.cpv_synonym order by term, cpv_prefix`)
  .map((r) => `${r.term}|${r.cpv_prefix}|${r.note ?? ""}|${r.exclude ? "exclude" : ""}`);
const apply = async (name: string) => { for (const run of [1, 2]) for (const statement of migration(name).split("--> statement-breakpoint")) await connection!.sql.unsafe(statement); };

describe.runIf(Boolean(connection))("migrations 0080 and 0081: CPV vocabulary (dedicated seap_test_* fixture)", () => {
  it("starts from the old meaning: iluminat = lamps only, 13 curator labels in the notes", async () => {
    const [counts] = await connection!.sql`select count(*)::int n, count(note)::int noted from reference.cpv_synonym` as unknown as { n: number; noted: number }[];
    expect([counts!.n, counts!.noted]).toEqual([99, 13]);
    expect(await prefixes("iluminat")).toEqual(["315"]);
  });

  it("0080 adds 84 rows and blanks the curator labels, idempotently", async () => {
    const sql = connection!.sql;
    const before = (await sql`select term, cpv_prefix from reference.cpv_synonym`).map((r) => `${r.term}|${r.cpv_prefix}`);
    await apply("0080_cpv_synonym_beginner_terms");
    const after = (await sql`select term, cpv_prefix from reference.cpv_synonym`).map((r) => `${r.term}|${r.cpv_prefix}`);
    expect(after).toHaveLength(99 + 84);
    expect(before.every((k) => after.includes(k))).toBe(true);
    expect((await sql`select term from reference.cpv_synonym where note is not null order by term`).map((r) => r.term)).toEqual(["iluminat", "iluminat", "iluminat public", "iluminat public"]);
  });

  it("0081 adds exclusions, removes the audited rows only, and the seed reproduces the result", async () => {
    const sql = connection!.sql;
    await apply("0081_cpv_synonym_exclusions");
    const after = await rows();
    expect(after).toHaveLength(290);
    expect(after.filter((r) => r.endsWith("|exclude"))).toHaveLength(50);
    expect(after.some((r) => r.startsWith("lucrari|") || r.startsWith("programe|") || r.startsWith("mese|"))).toBe(false);
    expect(after.some((r) => r.startsWith("iluminat|31500000|"))).toBe(false);
    await sql.unsafe(seed);
    expect(await rows()).toEqual(after);
  });

  it("grounds every term to its own rows minus its exclusions", async () => {
    expect(await prefixes("iluminat")).toEqual(["315272", "349285", "34993", "45316", "50232"]);
    expect(await prefixes("iluminat public")).toEqual(["315272", "349285", "34993", "45316", "50232"]);
    expect(await grounded("medicamente")).toMatchObject({ prefixes: ["336"], excludePrefixes: ["33682", "33683", "33696"] });
    expect(await grounded("uniforme")).toMatchObject({ excludePrefixes: ["1814"] });
    expect(await prefixes("uniforme")).toEqual(["181", "358111", "358112", "358113"]);
    expect(await grounded("autoturisme")).toMatchObject({ prefixes: ["3411"], excludePrefixes: ["3411411", "3411412", "3411421", "341144"] });
    expect(await prefixes("apa")).toEqual(["41", "4523215", "651"]);
    expect(await prefixes("transport elevi")).toEqual(["6013"]);
    expect(await prefixes("reabilitare")).toEqual(["4523314", "45321", "45453"]);
    expect(await prefixes("reabilitare drumuri")).toEqual(["45233139", "4523314", "45233223", "45233251"]);
    expect(await prefixes("alimentare cu apa")).toEqual(["41", "4523215", "45252126", "65111", "6513"]);
    expect(await prefixes("laptop")).toEqual(["302131"]);
    // a text without rows of its own still falls back to containment, with the picked term's exclusions
    expect(await prefixes("transport public")).toEqual(["60"]);
    expect(await grounded("medicamentele")).toMatchObject({ prefixes: ["336"], excludePrefixes: ["33682", "33683", "33696"] });
    // the retired words are offered as choices, never fuzzy-matched
    for (const term of ["lucrari", "mese", "programe"]) expect(await grounded(term), term).toMatchObject({ prefixes: [], retired: expect.anything() });
    const mese = await interpretQuestion(connection!.sql, "mese calde scoala", { now: NOW });
    expect(mese.spec).toBeNull();
    expect(mese.alternatives.map((a) => a.spec.filters.cpvTerm)).toEqual(["catering", "39121200"]);
    // an exclusion never removes what another term of the same text includes
    expect((await grounded("medicamente reactivi"))?.excludePrefixes ?? []).toEqual(["33682", "33683"]);
  });

  it("carries the reviewed notes to the people who read the answer", async () => {
    const notes = async (term: string) => (await grounded(term))?.notes;
    expect(await notes("iluminat")).toEqual([ILUMINAT_NOTE]);
    expect(await notes("iluminat public")).toEqual([ILUMINAT_NOTE]);
    expect(await notes("iluminat festiv")).toEqual([]);
    expect(await notes("masini")).toEqual(["Înseamnă autoturisme; utilajele și mașinile de birou sunt alte domenii."]);
    expect(await notes("scoala")).toHaveLength(1);
    expect(await notes("lemne")).toEqual([]);
    expect(await notes("apa")).toEqual([]);
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

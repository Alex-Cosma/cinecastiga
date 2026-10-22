import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@seap/db";
import { catalogUatSource } from "./places";
import { interpretQuestion } from "./server";
import { loadSharedLists, resetSharedLists, sqlVocabulary } from "./vocabulary-sql";
import { entityCandidates, personsByExactName, suggestAuthorities, suggestCpv, suggestPersons, suggestSuppliers, suggestUat } from "./vocabulary-queries";

/**
 * SQL lookups of the interpreter (the /api/suggest queries) on a dedicated
 * seap_test_* database: the fixture creates only the reference tables it
 * needs. Run with TEST_DATABASE_URL=postgres://…/seap_test_i_<name>.
 */
const testUrl = process.env["TEST_DATABASE_URL"];
if (testUrl && !/^seap_test_[a-z0-9_]+$/.test(new URL(testUrl).pathname.slice(1))) throw new Error("Intent fixtures require a dedicated seap_test_* database");
const connection = testUrl ? createDb(testUrl, { max: 2 }) : null;
const NOW = new Date("2026-10-22T12:00:00Z");

beforeAll(async () => {
  if (!connection) return;
  const sql = connection.sql;
  await sql.unsafe(`
    create extension if not exists unaccent;
    create extension if not exists pg_trgm;
    create schema if not exists core; create schema if not exists reference; create schema if not exists marts;
    drop table if exists core.cpv_codes, reference.cpv_synonym, reference.uat, marts.entity_profile, reference.company_reps;
    create table core.cpv_codes (code text primary key, name_ro text, division text);
    create table reference.cpv_synonym (term text not null, cpv_prefix text not null, note text, primary key (term, cpv_prefix));
    create table reference.uat (siruta integer primary key, name text, county text, tip text, population integer);
    create table marts.entity_profile (entity_id bigint not null, role text not null, name_display text, county text, total_ron_full numeric, primary key (entity_id, role));
    create table reference.company_reps (person_key text, person_name text, birth_date date, snapshot_date date, birth_locality text, cui text);
    create index on reference.company_reps using gin (person_name gin_trgm_ops);
  `);
  await sql`insert into core.cpv_codes (code, name_ro) values
    ('34993000-4','Iluminat stradal'), ('31527200-8','Iluminat exterior'), ('31500000-1','Echipament de iluminat şi lămpi electrice'),
    ('90620000-9','Servicii de deszăpezire'), ('44113620-7','Asfalt'), ('45233140-2','Lucrări de drumuri'), ('39298910-9','Pom de Crăciun'),
    ('79953000-9','Servicii de organizare de festivaluri'), ('33600000-6','Produse farmaceutice'), ('30213100-6','Computere portabile')`;
  await sql`insert into reference.cpv_synonym (term, cpv_prefix) values
    ('iluminat','31500000'), ('asfalt','45233000'), ('drumuri','45233000'), ('medicamente','33600000'), ('laptopuri','30213100'), ('lemn de foc','03413000')`;
  // reference.uat stores folded counties and registry names in mixed orthography
  const uats = catalogUatSource().filter((u) => ["buzau", "ialomita", "dambovita", "prahova"].includes(u.county ?? ""));
  for (const u of uats) {
    const name = u.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^ORAS /, "ORAŞ ");
    await sql`insert into reference.uat (siruta, name, county, tip) values (${u.siruta}, ${name}, ${u.county}, ${u.siruta === 44818 ? "1" : u.tip})`;
  }
  await sql`insert into marts.entity_profile (entity_id, role, name_display, county, total_ron_full) values
    (2144364,'authority','MUNICIPIUL BUZAU','Buzau',1600000000), (2144001,'authority','JUDETUL BUZAU','Buzau',900000000),
    (2144002,'authority','SPITALUL JUDETEAN DE URGENTA BUZAU','Buzau',700000000), (2146023,'authority','MUNICIPIUL RIMNICU SARAT','Buzau',300000000),
    (9000001,'supplier','CONSTRUCTII ERBASU S.A.','Bucuresti',3000000000), (9000002,'supplier','S.C. ERBASU EDIL CONSTRUCT S.A.','Bucuresti',200000000),
    (9000006,'supplier','CRACIUN IMPEX SRL','Cluj',1000000),
    (2108930,'authority','COMPANIA DE UTILITATI PUBLICE','Vaslui',30000000), (2128336,'authority','Compania de Utilitati Publice','Vrancea',50000000),
    (2020739,'supplier','PROACTIV','Neamt',5000000), (2089443,'supplier','PROACTIV','Hunedoara',8000000),
    (2146819,'authority','Consiliul Judetean Buzau','Buzau',800000000), (2146193,'authority','INSTITUTIA PREFECTULUI JUDETUL BUZAU','Buzau',5000000),
    (2144818,'authority','JUDETUL IASI','Iasi',900000000), (2145026,'authority','MUNICIPIUL BRAILA','Braila',1200000000)`;
  await sql`insert into reference.company_reps (person_key, person_name, birth_date, snapshot_date, birth_locality, cui) values
    ('matei ioan|1957', 'MATEI IOAN', '1957-03-04', '2025-01-01', 'Sat Batin', '111'),
    ('matei ioan|1957', 'MATEI IOAN', '1957-03-04', '2025-01-01', 'Sat Batin', '222'),
    ('popescu ion|1960', 'POPESCU ION', '1960-01-01', '2025-01-01', 'Buzău', '333'),
    ('popescu ion|1975', 'POPESCU ION', '1975-05-05', '2025-01-01', 'Iași', '444'),
    ('placeholder|1900', 'MATEI IOAN', '1900-01-01', '2025-01-01', null, '555'),
    ('stefan ion|1970', 'ŞTEFAN  ION', '1970-02-02', '2025-01-01', 'Iași', '666'),
    ('serban popescu|1971', 'ŞERBAN  POPESCU', '1971-02-02', '2025-01-01', 'Iași', '667'),
    ('popescu marian|1970', 'POPESCU MARIAN', '1970-01-01', '2025-01-01', 'Pitești', '777'),
    ('popescu-ionescu maria|1980', 'POPESCU-IONESCU MARIA', '1980-01-01', '2025-01-01', 'Brăila', '888')`;
});
afterAll(async () => { await connection?.sql.end(); });

describe.runIf(Boolean(connection))("intent vocabulary SQL (dedicated seap_test_* fixture)", () => {
  it("shares the /api/suggest lookups: catalogue + synonyms, localities, institutional aliases, firms, persons", async () => {
    const sql = connection!.sql;
    expect((await suggestCpv(sql, "iluminat")).map((r) => r.term)).toEqual(["iluminat", "34993000-4", "31527200-8", "31500000-1"]);
    expect((await suggestCpv(sql, "34993")).map((r) => r.term)).toEqual(["34993000-4"]);
    expect((await suggestUat(sql, "salcioara", "")).map((r) => [r.siruta, r.county])).toEqual([[68789, "dambovita"], [94330, "ialomita"]]);
    expect((await suggestUat(sql, "salcioara", "ialomita")).map((r) => r.siruta)).toEqual([94330]);
    expect((await suggestAuthorities(sql, "primaria buzau"))[0]).toMatchObject({ entity_id: "2144364", name_display: "MUNICIPIUL BUZAU" });
    expect((await suggestSuppliers(sql, "erbasu")).map((r) => r.name_display)).toEqual(["CONSTRUCTII ERBASU S.A.", "S.C. ERBASU EDIL CONSTRUCT S.A."]);
    const persons = await suggestPersons(sql, "matei ioan");
    expect(persons).toEqual([expect.objectContaining({ person_key: "matei ioan|1957", nf: "2" })]);
  });

  it("builds the gazetteer from reference.uat with official names and sectors", async () => {
    const vocab = sqlVocabulary(connection!.sql, await loadSharedLists(connection!.sql, { cache: false }));
    const places = await vocab.places();
    expect(places.find((p) => p.siruta === 44818)).toMatchObject({ name: "Municipiul Buzău", county: "Buzău", tip: "municipiu" });
    expect(places.filter((p) => p.key === "salcioara").map((p) => p.label).sort()).toEqual(["Comuna Sălcioara (Dâmbovița)", "Comuna Sălcioara (Ialomița)"]);
    expect(places.filter((p) => p.tip === "sector")).toHaveLength(6);
    expect(await vocab.synonyms()).toContain("lemn de foc");
  });

  it("interprets beginner questions end to end inside a read-only, time-bounded transaction", async () => {
    const sql = connection!.sql;
    const iluminat = await interpretQuestion(sql, "cine face iluminatul în buzău și cât costă", { now: NOW });
    expect(iluminat.spec).toEqual({ block: "table", dim: "supplier", measure: "value", topN: 10, filters: { cpvTerm: "iluminat", county: "Buzău" } });
    expect(iluminat.alternatives[0]).toMatchObject({ label: "Doar primăria Municipiului Buzău", spec: { filters: { uatSiruta: 44818 } } });

    const rs = await interpretQuestion(sql, "pe ce cheltuie primăria din Râmnicu Sărat", { now: NOW });
    expect(rs.spec).toMatchObject({ block: "breakdown", filters: { uatSiruta: 44845 } });

    const salcioara = await interpretQuestion(sql, "Sălcioara", { now: NOW });
    expect(salcioara.spec).toBeNull();
    expect(salcioara.alternatives.map((a) => a.spec.filters.uatSiruta).sort()).toEqual([68789, 94330]);

    const hospital = await interpretQuestion(sql, "ce e suspect la Spitalul Judetean de Urgenta Buzau", { now: NOW });
    expect(hospital.spec).toMatchObject({ block: "distribution", filters: { authorityId: 2144002 } });

    const firm = await interpretQuestion(sql, "cu cine lucreaza constructii erbasu anul trecut", { now: NOW });
    expect(firm.spec).toMatchObject({ block: "table", dim: "authority", filters: { supplierId: 9000001, yearFrom: 2025, yearTo: 2025 } });

    // one word carried by two firms, two buyers with the same name: choices, never a pick
    const erbasu = await interpretQuestion(sql, "cu cine lucreaza erbasu", { now: NOW });
    expect(erbasu.spec).toBeNull();
    expect(erbasu.alternatives.map((a) => a.spec.filters.supplierId)).toEqual([9000001, 9000002]);
    const cup = await interpretQuestion(sql, "Compania de Utilitati Publice", { now: NOW });
    expect(cup.spec).toBeNull();
    expect(cup.alternatives.map((a) => a.spec.filters.authorityId)).toEqual([2128336, 2108930]);
    const proactiv = await interpretQuestion(sql, "cine cumpara de la firma Proactiv", { now: NOW });
    expect(proactiv.alternatives.map((a) => a.spec.filters.supplierId)).toEqual([2089443, 2020739]);

    const person = await interpretQuestion(sql, "firmele lui Ion Popescu", { now: NOW });
    expect(person.spec).toBeNull();
    expect(person.alternatives.map((a) => a.label)).toEqual(["POPESCU ION (n. 1960, Buzău)", "POPESCU ION (n. 1975, Iași)"]);

    // exact names only: "Maria" is never "Marian"; diacritics and double spaces in ONRC still match
    const maria = await interpretQuestion(sql, "firmele lui Maria Popescu", { now: NOW });
    expect(maria.spec).toBeNull();
    expect(maria.alternatives).toEqual([]);
    // diacritics and double spaces in ONRC are matched when the index can search the name tolerantly
    const serban = await interpretQuestion(sql, "firmele lui Popescu Serban", { now: NOW });
    expect(serban.interpretation.person?.key).toBe("serban popescu|1971");
    // "Ion Stefan" is all short or a/i/s/t-letter words: searched as written only, never a silent pick
    const stefan = await interpretQuestion(sql, "firmele lui Ion Stefan", { now: NOW });
    expect(stefan.interpretation.person).toBeNull();

    const hyphen = await interpretQuestion(sql, "firmele lui Maria Popescu-Ionescu", { now: NOW });
    expect(hyphen.interpretation.person?.key).toBe("popescu-ionescu maria|1980");

    // a county council is a named buyer, registered as "Consiliul Judetean X" or "JUDETUL X"
    // two registry entities for one council ("JUDETUL BUZAU" and "Consiliul Judetean Buzau") are a choice
    const cjBuzau = await interpretQuestion(sql, "ce cumpara Consiliul Judetean Buzau", { now: NOW });
    expect(cjBuzau.spec).toBeNull();
    expect(cjBuzau.alternatives.map((a) => a.spec.filters.authorityId).sort()).toEqual([2144001, 2146819]);
    expect((await interpretQuestion(sql, "ce cumpara consiliul judetean iasi", { now: NOW })).spec).toMatchObject({ filters: { authorityId: 2144818 } });

    // two places are not comparable entities: town halls (or councils) are offered, never another question
    const places = await interpretQuestion(sql, "compara Buzau cu Braila", { now: NOW });
    expect(places.spec).toBeNull();
    expect(places.alternatives[0]).toMatchObject({ spec: { block: "compare", filters: { authorityId: 2144364, compareWithId: 2145026 } } });

    const craciun = await interpretQuestion(sql, "iluminat festiv de craciun", { now: NOW });
    expect(craciun.interpretation.supplier).toBeNull();
    expect(craciun.interpretation.leftover).toEqual(["festiv"]);
  });

  it("interpreter lookups never collapse same-named entities and count every match", async () => {
    const sql = connection!.sql;
    const rows = await entityCandidates(sql, "authority", "compania de utilitati publice");
    expect(rows.map((r) => r.entity_id)).toEqual(["2128336", "2108930"]);
    expect(rows.every((r) => Number(r.total) === 2)).toBe(true);
    const people = await personsByExactName(sql, ["ion popescu", "popescu ion"]);
    expect(people.map((r) => r.person_key).sort()).toEqual(["popescu ion|1960", "popescu ion|1975"]);
    expect(Number(people[0]!.total)).toBe(2);
    expect(await personsByExactName(sql, ["maria popescu", "popescu maria"])).toEqual([]);
  });

  it("answers quickly for typical questions once the gazetteer is cached", async () => {
    const sql = connection!.sql;
    await interpretQuestion(sql, "primăria Buzău", { now: NOW });
    const started = performance.now();
    await interpretQuestion(sql, "cine face iluminatul în buzău și cât costă", { now: NOW });
    expect(performance.now() - started).toBeLessThan(300);
  });

  it("never deadlocks its pool: six concurrent cold questions on a 2-connection pool all answer", async () => {
    const small = createDb(testUrl!, { max: 2 });
    try {
      resetSharedLists();
      const qs = ["cine castiga in buzau", "asfalt buzau", "ce cumpara primaria buzau", "deszapezire buzau", "medicamente spitale", "iluminat salcioara ialomita"];
      const results = await Promise.all(qs.map(async (q) => {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            interpretQuestion(small.sql, q, { now: NOW, signal: controller.signal }).then(() => "ok"),
            new Promise<string>((resolve) => { timer = setTimeout(() => { controller.abort(); resolve("timeout"); }, 4000); }),
          ]);
        } finally { clearTimeout(timer); }
      }));
      expect(results).toEqual(qs.map(() => "ok"));
      await expect(interpretQuestion(small.sql, "cine castiga in braila", { now: NOW })).resolves.toBeTruthy();
    } finally {
      await small.sql.end();
    }
  });

  it("does not cache a failed reference load", async () => {
    resetSharedLists();
    const broken = createDb(testUrl!.replace(/\/seap_test_[a-z0-9_]+$/, "/seap_test_i_missing_db"), { max: 1 });
    try {
      await expect(loadSharedLists(broken.sql)).rejects.toBeTruthy();
    } finally {
      await broken.sql.end();
    }
    const lists = await loadSharedLists(connection!.sql);
    expect(lists.places.length).toBeGreaterThan(40);
  });
});

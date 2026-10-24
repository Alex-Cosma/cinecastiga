import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "@seap/db";
import { AUTHORITY_KINDS } from "./spec";
import { authorityKindCond, authorityKindExpression, authorityPeerKind, KIND_PATTERNS } from "./authority-kind";
import { testDatabaseUrl } from "./test-fixture";

/*
 * The same institution has the same kind in JavaScript (the peer group's own
 * kind, authorityPeerKind) and in SQL (the peer cohort, authorityKindExpression;
 * Întreabă's condition, authorityKindCond), as PostgreSQL folds the name with
 * lower(unaccent()). Read only: the names are a literal list, no table is read.
 */

const url = testDatabaseUrl("Institution kinds");
const connection = url ? createDb(url, { max: 1 }) : null;
afterAll(async () => { await connection?.sql.end(); });

const NAMES = [
  "COMUNA MĂGURA", "Comuna Vânători", "comuna x", "COMUNA", "Primăria Comunei Y", "Primaria comunei Patulele",
  "ORAȘUL SLĂNIC MOLDOVA", "ORASUL SLANIC MOLDOVA", "Oraş Buhuşi", "MUNICIPIUL CLUJ-NAPOCA", "Municipiul Buzău", "Primăria Buzău", "PRIMARIA MUNICIPIULUI PITESTI",
  "JUDEȚUL ALBA", "Judetul Prahova", "CONSILIUL JUDEȚEAN SUCEAVA", "Consiliul Judetean Prahova", "Consiliul Local Aiud",
  "SPITALUL JUDETEAN DE URGENTA SATU MARE", "Spitalul Clinic Județean", "Institutul Clinic Fundeni",
  "Școala Gimnazială nr. 1", "SCOALA GIMNAZIALA NR 2", "Liceul Teoretic", "COLEGIUL NATIONAL", "Grădinița cu Program Prelungit", "GRADINITA NR 5",
  "Comuna Școala Nouă", "Municipiul Spitalului", "Ministerul Educației", "SELGROS CASH&CARRY SRL", " Comuna cu spațiu", "",
];
const like = (name: string, pattern: string) => {
  const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return new RegExp(`^${fold(pattern).split("%").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "u").test(fold(name));
};

describe.runIf(Boolean(connection))("the kind of an institution in JavaScript and in SQL", () => {
  it("is the same for the peer groups (exactly one kind) and for Întreabă (any kind matched)", async () => {
    const sql = connection!.sql;
    const rows = await sql.begin("read only", async (tx) => {
      const q = tx as unknown as typeof sql;
      return await q`
        select n.name, ${authorityKindExpression(q, q`n.name`)} peer_kind,
               ${AUTHORITY_KINDS.map((kind) => q`${authorityKindCond(q, kind, q`n.name`)}`).reduce((a, b) => q`${a}, ${b}`)}
        from unnest(${q.array(NAMES)}::text[]) with ordinality n(name, i) order by n.i`.values();
    }) as unknown as [string, string | null, ...boolean[]][];
    expect(rows.map(([name, peer]) => [name, peer])).toEqual(NAMES.map((name) => [name, authorityPeerKind(name)]));
    expect(rows.map(([name, , ...kinds]) => [name, kinds])).toEqual(NAMES.map((name) => [name, AUTHORITY_KINDS.map((kind) => KIND_PATTERNS[kind].some((p) => like(name, p)))]));
    // The list covers each kind, an ambiguous name and names of no kind.
    expect(new Set(NAMES.map(authorityPeerKind))).toEqual(new Set([...AUTHORITY_KINDS, null]));
  });
});

import type { DbSql } from "@seap/db";
import { AUTHORITY_KINDS, type AuthorityKind } from "./spec";

/*
 * The kind of a buying institution (plan §2.5, D1): one module for the
 * answers, their sources, the risk profiles and the peer groups, so a change
 * of classification (D1: town halls from the locality registry, hospitals
 * with the clinical institutes) is made here once and means the same thing
 * on every page. Today the kind is a name pattern, with two rules that this
 * module keeps exactly as they were:
 *
 * - Întreabă (authorityKindCond): a name matching any pattern of the kind is
 *   of that kind. A name can match two kinds ("Comuna Școala Nouă" is a
 *   commune and a school), and then counts in both.
 * - Peer groups (authorityPeerKind, authorityKindExpression): exactly one
 *   kind. A name matching two kinds has no kind and is left out of the group.
 */

/** SQL LIKE patterns on the institution's name, folded like `lower(unaccent(name))`. */
export const KIND_PATTERNS: Record<AuthorityKind, string[]> = {
  comuna: ["comuna %"],
  oras_municipiu: ["oras%", "orș%", "oraș%", "munici%", "primaria %", "primăria %"],
  consiliu_judetean: ["judetul %", "județul %", "consiliul judetean%", "consiliul județean%"],
  spital: ["spital%"],
  scoala: ["%scoala%", "%școala%", "liceul%", "colegiul%", "gradinita%", "grădinița%"],
};

/** The kind in the "avansat" SQL text and in its comments. */
export const KIND_LABEL: Record<AuthorityKind, string> = {
  comuna: "comune",
  oras_municipiu: "orașe/municipii",
  consiliu_judetean: "consilii județene / județe",
  spital: "spitale",
  scoala: "școli/licee/grădinițe",
};

/** Lower case without diacritics, as unaccent() and lower() fold the name. */
const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** The patterns of one kind on `column`, joined with `or` (no parentheses). */
export function authorityKindMatch(sql: DbSql, kind: AuthorityKind, column: ReturnType<DbSql>): ReturnType<DbSql> {
  return KIND_PATTERNS[kind]
    .map((pattern): ReturnType<DbSql> => sql`lower(unaccent(${column})) like ${fold(pattern)}`)
    .reduce((a, b) => sql`${a} or ${b}`);
}

/** Întreabă's condition: `column` (an institution's name) matches any pattern of `kind`. */
export function authorityKindCond(sql: DbSql, kind: AuthorityKind, column: ReturnType<DbSql>): ReturnType<DbSql> {
  return sql`(${authorityKindMatch(sql, kind, column)})`;
}

/** The peer groups' kind of `column` in SQL: the only kind it matches, or null. Same rule as authorityPeerKind. */
export function authorityKindExpression(sql: DbSql, column: ReturnType<DbSql>): ReturnType<DbSql> {
  const matchCount = AUTHORITY_KINDS.map((kind) => sql`case when (${authorityKindMatch(sql, kind, column)}) then 1 else 0 end`).reduce((a, b) => sql`${a}+${b}`);
  const cases = AUTHORITY_KINDS.map((kind) => sql`when (${authorityKindMatch(sql, kind, column)}) then ${kind}`).reduce((a, b) => sql`${a} ${b}`);
  return sql`case when (${matchCount})=1 then case ${cases} else null end else null end`;
}

const PATTERN_REGEX = Object.fromEntries(AUTHORITY_KINDS.map((kind) => [kind, KIND_PATTERNS[kind].map((pattern) =>
  new RegExp(`^${fold(pattern).split("%").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "u"))])) as Record<AuthorityKind, RegExp[]>;

/** The peer groups' kind of an institution's name in JavaScript: the only kind it matches, or null. */
export function authorityPeerKind(name: string): AuthorityKind | null {
  const matches = AUTHORITY_KINDS.filter((kind) => PATTERN_REGEX[kind].some((pattern) => pattern.test(fold(name))));
  // A name matching two existing categories is not a reliable classification.
  return matches.length === 1 ? matches[0]! : null;
}

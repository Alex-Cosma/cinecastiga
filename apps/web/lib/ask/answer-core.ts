import { namedKind, type AskSpec, type AuthorityKind, type Block } from "./spec";

/*
 * What a watch compares between two checks (plan §2.8), and what a frozen
 * result says it was computed with: the version of the answer and its core.
 * Plain TypeScript for the server (lib/monitoring-engine.ts, captures) and
 * for the page that shows a change (app/urmariri/ResultComparison.tsx).
 *
 * A version is "<id>-<n>". An id without one reads "<id>-1": the meaning of a
 * block or key before any release changed it. A run stored before versions
 * existed therefore compares equal to a run of today, and a release that bumps
 * one block or key alerts once, only the watches whose question has it.
 */

/** A block whose answer a release changed for the same spec (F2: trend: "trend-2"). Absent: "<block>-1". */
export const ANSWER_VERSIONS: Partial<Record<Block, string>> = {};

/** A key whose meaning a release changed, on the questions that carry it. */
export interface KeyVersion {
  /** "<id>-<n>", n ≥ 2. */
  version: string;
  /** What changed, in Romanian, for "Ce s-a schimbat în metodologie". */
  label: string;
  /** The spec paths that bring it (any of them present). */
  paths: readonly string[];
  /** The blocks it applies to; every block when absent. */
  blocks?: readonly Block[];
  /** A narrower rule ("a ranking of firms"). */
  when?(spec: AskSpec): boolean;
}
/**
 * Keyed by id. D1: kind (town halls from the locality registry, hospitals with
 * the clinical institutes, lib/ask/authority-kind.ts); F3: "table:employees"
 * (the employees of a firm ranking become a group, plan §2.6).
 */
export const KEY_VERSIONS: Record<string, KeyVersion> = {
  // Only the kinds D1 corrected: schools and county councils keep their institutions and records
  // (0 in, 0 out locally), and a newer value (local_admin, F5) is refused before it runs.
  kind: { version: "kind-2", label: "Tipul instituției", paths: ["filters.authorityKind"], when: (spec) => KIND_2.has(namedKind(spec.filters.authorityKind) ?? "") },
};
const KIND_2: ReadonlySet<string> = new Set<AuthorityKind>(["comuna", "oras_municipiu", "spital"]);

/** What changed in the methodology with each key version, for "Ce s-a schimbat" (plan §2.6). */
export const KEY_VERSION_NOTES: Record<string, string> = {
  "kind-2": "Tipul instituției a fost corectat (primăriile din registrul localităților, spitalele cu institutele clinice).",
};

/**
 * The notes of the key versions a question carries (plan §2.6 "Ce se schimbă"):
 * what a restored link, saved recipe or local question now computes
 * differently. A link stores no version, so every restored spec with the key
 * gets the note.
 */
export function keyVersionNotes(spec: AskSpec): string[] {
  return Object.values(answerVersion(spec).conditions).map((version) => KEY_VERSION_NOTES[version]).filter((note): note is string => Boolean(note));
}

/** The version of a question's answer: its block's, and those of the keys it carries. */
export interface AnswerVersion {
  question: string;
  conditions: Record<string, string>;
}

const presentPaths = (spec: AskSpec): Set<string> => {
  const paths = new Set<string>();
  for (const [key, value] of Object.entries(spec)) {
    if (value === undefined) continue;
    paths.add(key);
    if (key !== "filters" && key !== "population" && key !== "minimumRecords" && value && typeof value === "object" && !Array.isArray(value))
      for (const sub of Object.keys(value)) paths.add(`${key}.${sub}`);
  }
  for (const [key, value] of Object.entries(spec.filters)) if (value !== undefined && value !== null && value !== "") paths.add(`filters.${key}`);
  return paths;
};

export function answerVersion(spec: AskSpec): AnswerVersion {
  const present = presentPaths(spec);
  const conditions: Record<string, string> = {};
  for (const [id, key] of Object.entries(KEY_VERSIONS)) {
    if (key.blocks && !key.blocks.includes(spec.block)) continue;
    if (!key.paths.some((path) => present.has(path)) || key.when && !key.when(spec)) continue;
    conditions[id] = key.version;
  }
  return { question: ANSWER_VERSIONS[spec.block] ?? `${spec.block}-1`, conditions };
}

/** "<block>-1" with no condition: what a missing version reads as, so a watch need not store it. */
export function isFirstAnswerVersion(version: AnswerVersion, block: string): boolean {
  return version.question === `${block}-1` && Object.keys(version.conditions).length === 0;
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
/** A stored version, read with the rule above: missing (a run from before F0) is "<block>-1". */
export function readAnswerVersion(stored: unknown, block: string): AnswerVersion {
  const question = object(stored) && typeof stored.question === "string" ? stored.question : `${block}-1`;
  const conditions = object(stored) && object(stored.conditions)
    ? Object.fromEntries(Object.entries(stored.conditions).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : {};
  return { question, conditions };
}
/** Both versions over the same condition ids, each missing one as "<id>-1", so a reader sees what changed and from what. */
export function alignAnswerVersions(before: AnswerVersion, after: AnswerVersion): [AnswerVersion, AnswerVersion] {
  const ids = [...new Set([...Object.keys(before.conditions), ...Object.keys(after.conditions)])].sort();
  const fill = (version: AnswerVersion): AnswerVersion =>
    ({ question: version.question, conditions: Object.fromEntries(ids.map((id) => [id, version.conditions[id] ?? `${id}-1`])) });
  return [fill(before), fill(after)];
}
export function sameAnswerVersion(before: AnswerVersion, after: AnswerVersion): boolean {
  const [a, b] = alignAnswerVersions(before, after);
  return canonicalJson(a) === canonicalJson(b);
}

/**
 * The part of an answer a watch compares and "Ce s-a schimbat" lists (plan
 * §2.8). Today the whole answer. F2 narrows it per block (the chosen group of
 * a trend or a network; row facts in `data.rowFacts` stay out).
 */
export function answerCore(_block: string, data: unknown): unknown {
  return data;
}
/** The two cores are equal as stored JSON (jsonb: key order does not count, array order does). */
export function sameAnswerCore(block: string, before: unknown, after: unknown): boolean {
  return canonicalJson(answerCore(block, before)) === canonicalJson(answerCore(block, after));
}

/** JSON with object keys sorted at every depth: equal for two values jsonb stores as equal. */
export function canonicalJson(value: unknown): string {
  const sorted = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sorted)
      : object(v) ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, sorted(v[key])]))
        : v;
  return JSON.stringify(sorted(JSON.parse(JSON.stringify(value ?? null))));
}

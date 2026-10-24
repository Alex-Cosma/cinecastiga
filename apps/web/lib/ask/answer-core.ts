import type { AskSpec, Block } from "./spec";

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
 * Keyed by id. None in F0. D1: kind ("Tipul instituției", filters.authorityKind);
 * F3: "table:employees" (the employees of a firm ranking become a group, plan §2.6).
 */
export const KEY_VERSIONS: Record<string, KeyVersion> = {};

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

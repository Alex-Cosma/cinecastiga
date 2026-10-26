import type { DbSql } from "@seap/db";
import type { PredicateCtx, TrendGroup } from "./predicates";
import type { TrendMemberPart, TrendPart, TrendPartition, TrendPartSources } from "./trend-partition";

/*
 * The members of a trend's groups, kept from the answer (plan §2.5, "Cache
 * umplut de răspuns"). The answer groups every entity (or county) of the
 * selection once (trendPartition); the same statement gives the members of
 * each group and, per channel, their records, value and first and last day.
 * They are kept here, so a group's source drawer neither groups the selection
 * again nor scans its members' rows for its totals: it lists the first page of
 * their records on the id index. A drawer that finds nothing (another process,
 * an entry dropped, the marts rebuilt) groups again with the same statement in
 * its own transaction, and keeps the result.
 *
 * The key is the selection (the conditions of PredicateCtx, the two years and
 * the executed months, the role or county) and the marts build: the relation
 * file nodes of the transaction marts and of entity_profile, which every
 * rebuild replaces (TRUNCATE). A rebuild therefore never serves the ids of the
 * previous data over the new rows, whatever the order in which the checkpoint
 * is published (plan §2.5, "Cache și reconstruirea marts"). Bounded by the
 * number of ids held (TREND_GROUP_ID_LIMIT, typed arrays, not objects) and by
 * age (10 minutes): a national partition holds about 100 thousand ids.
 */

/** Ids held at most, over every entry: about ten national partitions. */
export const TREND_GROUP_ID_LIMIT = 1_000_000;
export const TREND_GROUP_TTL_MS = 600_000;

export interface TrendGroupEntry {
  dim: "authority" | "supplier" | "county";
  /** Each part's members: entity ids ascending, or county names. */
  members: Partial<Record<TrendMemberPart, Float64Array | readonly string[]>>;
  /** Each part's records per channel; `all` is every group with the equal ones (with an attribute, the firms of its band). */
  sources: Partial<Record<TrendPart, TrendPartSources>>;
  /**
   * The selection a group's drawer says it is part of („… din S”): with an attribute (the firms'
   * employees, R-employees-group) every firm of the two years, not only those of the band; else `sources.all`.
   */
  selection?: TrendPartSources;
  /** The base the growths in percent were counted from (`eligible`), null without that order. */
  eligibleBase: number | null;
  /** Ids held, for the bound. */
  size: number;
}

/** The part a trend's group lists (its members, its sources). */
export function trendMemberPart(group: TrendGroup): TrendMemberPart | null {
  switch (group.change) {
    case "up": return group.order === "percent" ? "eligible" : "up";
    case "new": return group.firstOnly ? "first" : "new";
    case "down": case "gone": return group.change;
    case "all": return null;
  }
}

/** What the answer's partition gives the drawers of its groups. */
export function trendGroupEntry(partition: TrendPartition, o: { dim: TrendGroupEntry["dim"]; group: TrendGroup }): TrendGroupEntry {
  const members: TrendGroupEntry["members"] = {};
  let size = 0;
  for (const [part, ids] of Object.entries(partition.members) as [TrendMemberPart, string[]][]) {
    members[part] = o.dim === "county" ? ids : Float64Array.from(ids, Number);
    size += ids.length;
  }
  // `all` stays the partition's (the records „Toate” lists: with an attribute, those of the band, as its rows);
  // the selection a group's drawer names beside its own figures is every firm of the two years.
  return {
    dim: o.dim, members, sources: partition.sources, ...(partition.selection ? { selection: partition.selection.sources } : {}),
    eligibleBase: o.group.order === "percent" ? o.group.minBase : null, size,
  };
}

/** The records of the selection a group is part of (the drawer header's „din S”), or null when the entry does not know them. */
export const entrySelection = (entry: TrendGroupEntry): TrendPartSources | null => entry.selection ?? entry.sources.all ?? null;

/** The entry's members of a group, or null when it does not hold them (the growths in percent from another base). */
export function entryMembers(entry: TrendGroupEntry, group: TrendGroup): Float64Array | readonly string[] | null {
  const part = trendMemberPart(group);
  if (!part || (part === "eligible" && entry.eligibleBase !== group.minBase)) return null;
  return entry.members[part] ?? null;
}

/** Members as the text of a bigint[] or text[] parameter. */
export const memberList = (members: Float64Array | readonly string[]): string[] =>
  members instanceof Float64Array ? Array.from(members, (id) => String(id)) : [...members];

/** Whether `id` is a member (binary search over the ascending ids, or a county name). */
export function hasMember(members: Float64Array | readonly string[], id: string): boolean {
  if (!(members instanceof Float64Array)) return members.includes(id);
  const target = Number(id);
  let lo = 0, hi = members.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (members[mid] === target) return true;
    if (members[mid]! < target) lo = mid + 1; else hi = mid - 1;
  }
  return false;
}

/**
 * The key of a selection's partition: the stamp of the marts build, the role
 * (or county), the two years, and every condition of the context except the
 * period bounds the two years replace (with the executed months).
 */
export function trendGroupKey(ctx: PredicateCtx, o: { stamp: string; dim: TrendGroupEntry["dim"]; yearA: number; yearB: number }): string {
  const { sql: _sql, yearFrom: _from, yearTo: _to, ...conditions } = ctx;
  return JSON.stringify([o.stamp, o.dim, o.yearA, o.yearB, conditions]);
}

/**
 * The marts build an entry belongs to: the database and the file nodes of the
 * transaction marts and of entity_profile (new at every TRUNCATE of a build).
 * Read in the caller's transaction; null when a relation is missing, and then
 * nothing is kept or reused.
 */
export async function trendCacheStamp(sql: DbSql): Promise<string | null> {
  const [row] = (await sql`
    select current_database() db, pg_relation_filenode(to_regclass('marts.da_transactions'))::text da,
           pg_relation_filenode(to_regclass('marts.contract_transactions'))::text ct, pg_relation_filenode(to_regclass('marts.entity_profile'))::text ep
  `) as unknown as { db: string; da: string | null; ct: string | null; ep: string | null }[];
  return row?.da && row.ct && row.ep ? `${row.db}:${row.da}:${row.ct}:${row.ep}` : null;
}

const entries = new Map<string, { entry: TrendGroupEntry; at: number }>();
let held = 0;
let stats = { kept: 0, hits: 0, misses: 0 };

/** Keep an entry (the newest last), dropping the oldest while more ids than the bound are held. */
export function rememberTrendGroups(key: string, entry: TrendGroupEntry): void {
  const old = entries.get(key);
  if (old) { entries.delete(key); held -= old.entry.size; }
  if (entry.size > TREND_GROUP_ID_LIMIT) return;
  entries.set(key, { entry, at: Date.now() });
  held += entry.size;
  stats.kept++;
  for (const [oldest, { entry: e }] of entries) {
    if (held <= TREND_GROUP_ID_LIMIT) break;
    entries.delete(oldest);
    held -= e.size;
  }
}

/** The entry of a key, younger than TREND_GROUP_TTL_MS (and now the newest), or null. */
export function trendGroupsFor(key: string): TrendGroupEntry | null {
  const found = entries.get(key);
  if (!found || Date.now() - found.at > TREND_GROUP_TTL_MS) {
    if (found) { entries.delete(key); held -= found.entry.size; }
    stats.misses++;
    return null;
  }
  entries.delete(key);
  entries.set(key, found);
  stats.hits++;
  return found.entry;
}

/** Tests and measurements: what the cache holds and how often it answered. */
export const trendGroupStats = () => ({ ...stats, entries: entries.size, held });
/** Tests only: an empty cache. */
export function forgetTrendGroups(): void { entries.clear(); held = 0; stats = { kept: 0, hits: 0, misses: 0 }; }

/** A row of the source drawer's totals (runRows), per state: records, value, the same after the drawer's filters, first and last date. */
export interface SourceTotalsRow { state: string | null; n: string; v: string; fn: string; fv: string; date_from: string | null; date_to: string | null }

/**
 * A group's totals from its records per channel, as runRows' totals query
 * gives them, when the drawer filters by nothing but the channel or the state
 * (both are a channel here: a direct acquisition is 'Oferta acceptata', a
 * contract has no state). Null when a channel with records has no days (a
 * rollup built before them): the caller counts the rows.
 */
export function groupSourceTotals(sources: TrendPartSources, local: { stream?: "da" | "contracts"; state?: string }): SourceTotalsRow[] | null {
  const rows: SourceTotalsRow[] = [];
  for (const src of ["da", "contracts"] as const) {
    const c = sources[src];
    if (c.n === 0) continue;
    if (!c.first || !c.last) return null;
    const state = src === "da" ? "Oferta acceptata" : null;
    const kept = (!local.stream || local.stream === src)
      && (local.state === undefined || (local.state === "__unknown" ? state === null : local.state === state));
    rows.push({ state, n: String(c.n), v: c.v, fn: kept ? String(c.n) : "0", fv: kept ? c.v : "0", date_from: c.first, date_to: c.last });
  }
  return rows;
}

import { ASK_EMPLOYEE_BANDS, type DbSql } from "@seap/db";
import { ROLLUP_CTX_KEYS, type RollupCtx } from "./rollups";
import { procedureCond, purchaseKindCond } from "./predicates";
import { sizeRanges } from "./purchase";

export { sizeRanges };

/**
 * The F3 rollups of the nightly build (packages/db/src/ask-rollups.ts
 * buildAskMixRollups; owner-D2-rollups: each live national query was over the
 * speed bar), read where they answer a selection exactly:
 * - agg_months (src, y, m, county, cpv2, v, n, mx): the evolution (plan §4.3)
 *   by year or month, split by channel or CPV division, on the same months of
 *   every year, with each bar's largest record;
 * - agg_national_mix (src, y, county, cpv2, procedure_type, size, offers, v, n):
 *   the composition of a total, stat's „Din care” (plan §4.1).
 * Both hold every row an Ask aggregate counts (closing_value > 0, DAs up to the
 * 2M lei ceiling), so a sum over their rows is the live sum to the last
 * decimal (rollups.integration.test.ts and the ingestion build test prove it
 * on fixtures). They keep no entity: a selection with a named or grouped
 * institution or firm, a domain term, a record threshold or a precise
 * selection is answered live. Like the other rollups they are not
 * migration-owned and are probed before use (mixRollupReady).
 */

type Fragment = ReturnType<DbSql>;

let ready: { ok: boolean; at: number } | null = null;
/** Both F3 rollups present (built by the same build). Cached 10 minutes per process; call with the pool, before sql.begin. */
export async function mixRollupReady(sql: DbSql): Promise<boolean> {
  if (ready && Date.now() - ready.at < 600_000) return ready.ok;
  const [row] = (await sql`
    select to_regclass('marts.agg_months') is not null and to_regclass('marts.agg_national_mix') is not null ok
  `) as unknown as { ok: boolean }[];
  ready = { ok: Boolean(row?.ok), at: Date.now() };
  return ready.ok;
}
/** Tests only: forget the probe. */
export function forgetMixRollupReady(): void { ready = null; }

/**
 * The conditions each rollup reads; any other one holding a value sends the question live (fail closed, as planRollup).
 * seatColumn is no condition: which column the seat keys read (F4); the seat keys themselves are not kept.
 */
const MONTHS_KEYS = new Set(["sql", "plafond", "county", "purchaseKind", "yearFrom", "yearTo", "monthFrom", "monthTo", "seriesMonths", "seatColumn"]);
const MIX_KEYS = new Set(["sql", "plafond", "county", "purchaseKind", "procedure", "purchaseValueMin", "purchaseValueMax", "singleBidder", "yearFrom", "yearTo", "seatColumn"]);
const holds = (value: unknown) => value !== null && value !== undefined && value !== false && !(Array.isArray(value) && value.length === 0);

function refusal(ctx: RollupCtx & { sql?: unknown }, known: ReadonlySet<string>, table: string): string | null {
  for (const [key, value] of Object.entries(ctx)) {
    if (known.has(key) || !holds(value)) continue;
    // A key the planners of rollups.ts know by name, which this table does not keep; or one added later.
    return `${key}: not in ${table}${(ROLLUP_CTX_KEYS as readonly string[]).includes(key) ? "" : " (a condition the rollups do not know)"}`;
  }
  return null;
}

const DATASET = { "da-branch": null, strict: "da", none: "contracts" } as const;

/** The period on a rollup with y (and m): whole years, or from/to a month (rowPredicates' continuous months). */
function periodOn(sql: DbSql, ctx: RollupCtx, alias: string, months: boolean): Fragment[] {
  const p = (column: string): Fragment => sql`${sql(alias)}.${sql(column)}`;
  const parts: Fragment[] = [];
  const month = (year: number, m: number) => `${year}-${String(m).padStart(2, "0")}`;
  if (ctx.yearFrom !== null) parts.push(months && ctx.monthFrom !== null ? sql`(${p("y")} || '-' || ${p("m")}) >= ${month(ctx.yearFrom, ctx.monthFrom)}` : sql`${p("y")} >= ${String(ctx.yearFrom)}`);
  if (ctx.yearTo !== null) parts.push(months && ctx.monthTo !== null ? sql`(${p("y")} || '-' || ${p("m")}) <= ${month(ctx.yearTo, ctx.monthTo)}` : sql`${p("y")} <= ${String(ctx.yearTo)}`);
  return parts;
}

/** The selection on agg_months (alias `alias`), or why agg_months cannot answer it. */
export function monthsWhere(sql: DbSql, ctx: RollupCtx, alias = "p"): { where: Fragment } | { reason: string } {
  const refused = refusal(ctx, MONTHS_KEYS, "agg_months");
  if (refused) return { reason: refused };
  const p = (column: string): Fragment => sql`${sql(alias)}.${sql(column)}`;
  const parts: Fragment[] = [];
  const src = DATASET[ctx.plafond];
  if (src) parts.push(sql`${p("src")} = ${src}`);
  if (ctx.county) parts.push(sql`${p("county")} = ${ctx.county}`);
  // The kind is a function of the division (purchase.ts divisionKind), the condition the same on its two digits.
  if (ctx.purchaseKind) parts.push(purchaseKindCond(sql, ctx.purchaseKind, p("cpv2")));
  parts.push(...periodOn(sql, ctx, alias, true));
  if (ctx.seriesMonths) parts.push(sql`${p("m")} between ${String(ctx.seriesMonths[0]).padStart(2, "0")} and ${String(ctx.seriesMonths[1]).padStart(2, "0")}`);
  return { where: parts.length ? parts.reduce((a, b) => sql`${a} and ${b}`) : sql`true` };
}

/** The selection on agg_national_mix (alias `alias`), or why it cannot answer it (months, a size typed in, an entity…). */
export function mixWhere(sql: DbSql, ctx: RollupCtx, alias = "p"): { where: Fragment } | { reason: string } {
  const refused = refusal(ctx, MIX_KEYS, "agg_national_mix");
  if (refused) return { reason: refused };
  const ranges = ctx.purchaseValueMin !== null || ctx.purchaseValueMax !== null ? sizeRanges(ctx.purchaseValueMin, ctx.purchaseValueMax) : null;
  if ((ctx.purchaseValueMin !== null || ctx.purchaseValueMax !== null) && !ranges) return { reason: "size: bounds typed in, not the ranges of agg_national_mix" };
  const p = (column: string): Fragment => sql`${sql(alias)}.${sql(column)}`;
  const parts: Fragment[] = [];
  const src = DATASET[ctx.plafond];
  if (src) parts.push(sql`${p("src")} = ${src}`);
  if (ctx.county) parts.push(sql`${p("county")} = ${ctx.county}`);
  if (ctx.purchaseKind) parts.push(purchaseKindCond(sql, ctx.purchaseKind, p("cpv2")));
  if (ctx.procedure) parts.push(procedureCond(sql, ctx.procedure, p("procedure_type")));
  if (ranges) parts.push(sql`${p("size")} = any(${sql.array(ranges)}::smallint[])`);
  if (ctx.singleBidder) parts.push(sql`${p("offers")} = true`);
  parts.push(...periodOn(sql, ctx, alias, false));
  return { where: parts.length ? parts.reduce((a, b) => sql`${a} and ${b}`) : sql`true` };
}

/**
 * agg_mix_employees (S6 over-bar, packages/db buildAskMixRollups): agg_national_mix with the firm's employee band, of
 * the same build (its comment names agg_national_mix's oid, a new table each night; a revert's build leaves an older
 * one behind, not read). Until the first build with it „Din care” of firms of a size waits on PRECOMPUTE.md as before.
 * Cached 10 minutes per process; call with the pool, before sql.begin.
 */
let employeesReady: { ok: boolean; at: number } | null = null;
export async function mixEmployeesReady(sql: DbSql): Promise<boolean> {
  if (employeesReady && Date.now() - employeesReady.at < 600_000) return employeesReady.ok;
  const [row] = (await sql`
    select obj_description(to_regclass('marts.agg_mix_employees'), 'pg_class') = 'agg_national_mix ' || to_regclass('marts.agg_national_mix')::oid::text ok
  `) as unknown as { ok: boolean | null }[];
  employeesReady = { ok: Boolean(row?.ok), at: Date.now() };
  return employeesReady.ok;
}
/** Tests only: forget the probe. */
export function forgetMixEmployeesReady(): void { employeesReady = null; }

/** The kit's employee bands (filters/words.ts EMPLOYEE_BAND_FROM/TO): band i holds [FROM[i], TO[i]]. */
const BAND_FROM = [0, 1, 10, 50, 250] as const;
const BAND_TO = [...ASK_EMPLOYEE_BANDS, Infinity] as const;
/**
 * The bands of agg_mix_employees a range of employees is the union of (min and max as employeesBounds reads them:
 * `employees >= min`, `<= max`, a firm without a filing in none), or null for a range off the kit's bands.
 */
export function employeeBands(min: number | null, max: number | null): number[] | null {
  const lo = min ?? 0, hi = max ?? Infinity;
  if (!(BAND_FROM as readonly number[]).includes(lo) || !(BAND_TO as readonly number[]).includes(hi)) return null;
  const bands = BAND_FROM.map((from, i) => i).filter((i) => BAND_FROM[i]! >= lo && BAND_TO[i]! <= hi);
  return bands.length ? bands : null;
}

/**
 * „Din care” of a total of firms of a size (S6 over-bar): the selection mixWhere reads, with the employees of the kit's
 * bands, on agg_mix_employees (alias `alias`), or why not. Live it read every direct acquisition with the firms'
 * semi-join (6.9 s nationally).
 */
export function mixEmployeesWhere(sql: DbSql, ctx: RollupCtx, alias = "p"): { where: Fragment } | { reason: string } {
  if (ctx.minEmployees === null && ctx.maxEmployees === null) return { reason: "employees: no band" };
  const bands = employeeBands(ctx.minEmployees, ctx.maxEmployees);
  if (!bands) return { reason: "employees: a range off the kit's bands" };
  const rest = mixWhere(sql, { ...ctx, minEmployees: null, maxEmployees: null }, alias);
  if ("reason" in rest) return { reason: rest.reason.replace("agg_national_mix", "agg_mix_employees") };
  return { where: sql`${rest.where} and ${sql(alias)}.emp = any(${sql.array(bands)}::smallint[])` };
}

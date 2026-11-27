import { createDb, type DbSql } from "@seap/db";
import { composeFact, factChart, type FactChart, type FactWords } from "./fact-words";

/*
 * „Știați că” (owner, 26 November 2026; migration 0118): the facts a processing run proposes (app.facts) and an
 * administrator publishes from Admin → Știați că. A fact is public when it is approved and its day has come, by the
 * Romanian calendar; a proposal nobody touches stays unpublished.
 */
export type FactStatus = "proposed" | "approved" | "rejected" | "withdrawn";
/** `kind`: the fact's recipe, so a board can mix its kinds. */
export interface PublicFact extends FactWords { id: string; day: string; kind: string; chart: FactChart | null }
export interface AdminFact extends FactWords {
  id: string; key: string; recipe: string; kind: string; status: FactStatus;
  /** The day it is, or will be, public; `published`: that day has come. */
  publishOn: string | null; published: boolean;
  checkStatus: "ok" | "look"; checkNote: string | null;
  /** The words were corrected by hand (they no longer follow the numbers of a later run). */
  edited: boolean;
  /** Another approved fact names one of the same institutions or firms within 30 days of this one's day. */
  repeats: boolean;
  decidedBy: string | null; createdAt: string;
}
export const FACT_POOL_MAX = 300;
export const FACT_TEXT_MAX = 320;

/** The order of the proposals in the console: what is about the whole country before what names one institution. */
const RECIPE_ORDER = ["firms_one_client", "institutions_one_firm", "top_firms_share", "year_total", "december", "da_per_day", "first_month", "single_bidder",
  "archive_value", "archive_records", "year_vs_past", "da_share_count", "top_buyers_share", "firms_active", "foreign_share", "no_notice", "zero_staff", "new_firms",
  "busiest_day_contracts", "busiest_day_da", "local_firms", "signal", "domain_year", "foreign_country",
  "biggest_buyer", "largest_contract", "one_firm_majority", "most_da", "many_buyers", "pair_contracts", "per_capita_town"];
const db = (): DbSql => createDb().sql;
const today = (q: DbSql) => q`(now() at time zone 'Europe/Bucharest')::date`;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** The saved words of a row, or the defaults composed from its numbers. Null when neither exists. */
function wordsOf(r: Record<string, unknown>): FactWords | null {
  const composed = composeFact(String(r.recipe), (r.data as Record<string, unknown>) ?? {});
  const figure = text(r.figure) ?? composed?.figure, statement = text(r.statement) ?? composed?.statement;
  if (!figure || !statement) return null;
  const saved = text(r.figure) !== null;
  return {
    figure, statement,
    // Once the words are saved, an emptied unit or context stays empty.
    unit: saved ? text(r.unit) : composed?.unit ?? null, context: saved ? text(r.context) : composed?.context ?? null,
    linkHref: text(r.link_href) ?? composed?.linkHref ?? null, linkLabel: text(r.link_label) ?? composed?.linkLabel ?? null,
  };
}

/** The small chart of a row, drawn from the run's numbers. */
const chartOf = (r: Record<string, unknown>): FactChart | null => factChart(String(r.recipe), (r.data as Record<string, unknown>) ?? {});

/**
 * The public facts, newest first: the pool „Alte fapte” deals from (owner, 27 November 2026: the page shows a draw of
 * them and no list of them all). At most FACT_POOL_MAX, the newest.
 */
export async function publicFacts(q: DbSql = db()): Promise<PublicFact[]> {
  const rows = await q`
    select f.id::text id, to_char(f.publish_on, 'YYYY-MM-DD') pub_day, f.recipe, f.data, f.figure, f.unit, f.statement, f.context, f.link_href, f.link_label
    from app.facts f where f.status = 'approved' and f.publish_on <= ${today(q)}
    order by f.publish_on desc, f.id desc limit ${FACT_POOL_MAX}`;
  return rows.flatMap((r) => { const w = wordsOf(r); return w ? [{ id: String(r.id), day: String(r.pub_day), kind: String(r.recipe), chart: chartOf(r), ...w }] : []; });
}

/** One public fact by its number; null when there is none or it is not public. */
export async function publicFact(id: string, q: DbSql = db()): Promise<PublicFact | null> {
  if (!/^\d{1,12}$/.test(id)) return null;
  const [r] = await q`
    select f.id::text id, to_char(f.publish_on, 'YYYY-MM-DD') pub_day, f.recipe, f.data, f.figure, f.unit, f.statement, f.context, f.link_href, f.link_label
    from app.facts f where f.id = ${id} and f.status = 'approved' and f.publish_on <= ${today(q)}`;
  const w = r ? wordsOf(r) : null;
  return r && w ? { id: String(r.id), day: String(r.pub_day), kind: String(r.recipe), chart: chartOf(r), ...w } : null;
}

/** Every fact for the console: what waits for a choice first, then the scheduled, the published, the rest. */
export async function adminFacts(q: DbSql = db()): Promise<{ facts: AdminFact[]; today: string }> {
  const rows = await q`
    select f.id::text id, f.key, f.recipe, f.kind, f.status, to_char(f.publish_on, 'YYYY-MM-DD') pub_day, f.publish_on <= ${today(q)} published,
      f.check_status, f.check_note, f.data, f.figure, f.unit, f.statement, f.context, f.link_href, f.link_label, f.decided_by,
      to_char(f.created_at at time zone 'Europe/Bucharest', 'YYYY-MM-DD') created_day, to_char(${today(q)}, 'YYYY-MM-DD') today,
      exists (select 1 from app.facts o where o.id <> f.id and o.status = 'approved' and o.entity_ids && f.entity_ids
        and abs(o.publish_on - coalesce(f.publish_on, ${today(q)})) <= 30) repeats
    from app.facts f
    -- Proposals: the country-wide facts first, then the named ones, the largest first within each recipe.
    order by case f.status when 'proposed' then 0 when 'approved' then 1 else 2 end,
      case when f.status = 'approved' then f.publish_on end desc,
      coalesce(array_position(${q.array(RECIPE_ORDER)}::text[], f.recipe), 99),
      coalesce((f.data->>'value')::numeric, (f.data->>'total')::numeric, (f.data->>'n')::numeric, 0) desc, f.id desc
    limit 600`;
  const facts = rows.flatMap((r): AdminFact[] => {
    const w = wordsOf(r);
    if (!w) return [];
    return [{
      id: String(r.id), key: String(r.key), recipe: String(r.recipe), kind: String(r.kind), status: r.status as FactStatus,
      publishOn: (r.pub_day as string | null) ?? null, published: r.published === true,
      checkStatus: r.check_status === "look" ? "look" : "ok", checkNote: text(r.check_note), edited: text(r.figure) !== null && r.status === "proposed",
      repeats: r.repeats === true, decidedBy: text(r.decided_by), createdAt: String(r.created_day), ...w,
    }];
  });
  const [now] = rows.length > 0 ? rows : await q`select to_char(${today(q)}, 'YYYY-MM-DD') today`;
  return { facts, today: String(now!.today) };
}

export type FactAction = "publish" | "schedule" | "reject" | "withdraw" | "restore" | "edit";
export interface FactChange { publishOn?: string; figure?: string; unit?: string; statement?: string; context?: string }

/**
 * An administrator's choice on one fact. „publish” makes it public today, „schedule” on a later day; both save the
 * words shown (the corrected ones, or the defaults). „reject” and „withdraw” take it out; „restore” makes it a
 * proposal again; „edit” saves corrected words. False when the fact is gone or the choice does not fit its state.
 */
export async function decideFact(id: string, action: FactAction, change: FactChange, by: string, q: DbSql = db()): Promise<boolean> {
  if (!/^\d{1,12}$/.test(id)) return false;
  const [r] = await q`select f.status, f.recipe, f.data, f.figure, f.unit, f.statement, f.context, f.link_href, f.link_label from app.facts f where f.id = ${id}`;
  if (!r) return false;
  const current = wordsOf(r);
  const clean = (v: string | undefined, fallback: string | null) => (v === undefined ? fallback : text(v)?.slice(0, FACT_TEXT_MAX) ?? null);
  const words = current && {
    figure: clean(change.figure, current.figure), unit: clean(change.unit, current.unit),
    statement: clean(change.statement, current.statement), context: clean(change.context, current.context),
  };
  if (action === "publish" || action === "schedule") {
    if (!words?.figure || !words.statement || (r.status !== "proposed" && r.status !== "approved")) return false;
    if (action === "schedule" && !/^\d{4}-\d{2}-\d{2}$/.test(change.publishOn ?? "")) return false;
    const rows = await q`
      update app.facts set status = 'approved', publish_on = ${action === "publish" ? today(q) : q`greatest(${change.publishOn!}::date, ${today(q)})`},
        figure = ${words.figure}, unit = ${words.unit}, statement = ${words.statement}, context = ${words.context},
        link_href = ${current!.linkHref}, link_label = ${current!.linkLabel}, decided_by = ${by}, decided_at = clock_timestamp()
      where id = ${id} returning 1`;
    return rows.length === 1;
  }
  if (action === "edit") {
    if (!words?.figure || !words.statement) return false;
    const rows = await q`
      update app.facts set figure = ${words.figure}, unit = ${words.unit}, statement = ${words.statement}, context = ${words.context},
        link_href = ${current!.linkHref}, link_label = ${current!.linkLabel}, decided_by = ${by}, decided_at = clock_timestamp()
      where id = ${id} returning 1`;
    return rows.length === 1;
  }
  const next = action === "reject" ? { from: ["proposed"], to: "rejected" }
    : action === "withdraw" ? { from: ["approved"], to: "withdrawn" } : { from: ["rejected", "withdrawn"], to: "proposed" };
  const rows = await q`
    update app.facts set status = ${next.to}, publish_on = null, decided_by = ${by}, decided_at = clock_timestamp()
    where id = ${id} and status = any(${q.array(next.from)}::text[]) returning 1`;
  return rows.length === 1;
}

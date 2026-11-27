import { sql } from "drizzle-orm";
import { bigint, bigserial, check, date, index, jsonb, text, timestamp, unique } from "drizzle-orm/pg-core";
import { appSchema } from "./app.js";

/**
 * „Știați că” (owner, 26 November 2026; migration 0118): the facts a processing run proposes and an administrator
 * publishes. Public when status = 'approved' and publish_on has come; a proposal nobody touches stays unpublished.
 */
export const facts = appSchema.table("facts", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  /** What the fact is about (recipe, period, entity): a run proposes it once. */
  key: text("key").notNull(),
  /** Which recipe of the processing run found it (apps/ingestion/src/facts/build.ts). */
  recipe: text("recipe").notNull(),
  kind: text("kind").notNull(),
  /** The large figure of the card („17,6%”, „354”, „6,63”) and what follows it in small („mld. lei”). The words are
   * NULL until an administrator publishes or edits the fact: the site composes them from `data` (lib/fact-words.ts). */
  figure: text("figure"),
  unit: text("unit"),
  statement: text("statement"),
  context: text("context"),
  linkHref: text("link_href"),
  linkLabel: text("link_label"),
  /** The run's own check: 'look' asks the administrator to read the note before publishing. */
  checkStatus: text("check_status").notNull().default("ok"),
  checkNote: text("check_note"),
  /** The institutions and firms the fact names. */
  entityIds: bigint("entity_ids", { mode: "bigint" }).array().notNull().default(sql`'{}'`),
  /** The numbers behind the words, for the record. */
  data: jsonb("data").notNull().default(sql`'{}'::jsonb`),
  status: text("status").notNull().default("proposed"),
  publishOn: date("publish_on"),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("facts_key_unique").on(t.key),
  check("facts_kind", sql`${t.kind} in ('share','count','sum','record','pattern')`),
  check("facts_check_status", sql`${t.checkStatus} in ('ok','look')`),
  check("facts_status", sql`${t.status} in ('proposed','approved','rejected','withdrawn')`),
  check("facts_publish_on", sql`${t.status} <> 'approved' or (${t.publishOn} is not null and ${t.figure} is not null and ${t.statement} is not null)`),
  index("facts_public_idx").on(t.publishOn.desc(), t.id.desc()).where(sql`${t.status} = 'approved'`),
]);

import { sql } from "drizzle-orm";
import { check, integer, text, timestamp } from "drizzle-orm/pg-core";
import { appSchema } from "./app.js";

/** cinecastiga.ro/l/<code> → a path of the site (migration 0100). The code is derived from the target; no identity kept. */
export const shortLinks = appSchema.table("short_links", {
  code: text("code").primaryKey(),
  target: text("target").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  opens: integer("opens").notNull().default(0),
}, t => [check("short_links_code_check", sql`${t.code} ~ '^[0-9A-Za-z]{8,12}$'`),
  check("short_links_target_check", sql`length(${t.target}) <= 4096 and ${t.target} like '/%' and ${t.target} not like '//%'`)]);

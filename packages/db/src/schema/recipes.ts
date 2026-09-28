import { sql } from "drizzle-orm";
import { check, index, uniqueIndex, integer, jsonb, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { appSchema } from "./app.js";
import { authUsers } from "./auth.js";

/** Private reusable questions; revisions preserve the query, not a result snapshot. */
export const queryRecipes = appSchema.table("query_recipes", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: text("owner_user_id").notNull().references(() => authUsers.id, { onDelete:"cascade" }),
  title: text("title").notNull(),
  currentVersion: integer("current_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone:true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone:true }).notNull().defaultNow(),
}, t => [index("query_recipes_owner_updated_idx").on(t.ownerUserId, t.updatedAt),
  uniqueIndex("query_recipes_owner_title_unique").on(t.ownerUserId, sql`lower(btrim(regexp_replace(${t.title}, '[[:space:]]+', ' ', 'g')))`),
  check("query_recipes_title_check", sql`length(${t.title}) between 1 and 160`),
  check("query_recipes_current_version_check", sql`${t.currentVersion} > 0`)]);

export const queryRecipeVersions = appSchema.table("query_recipe_versions", {
  recipeId: uuid("recipe_id").notNull().references(() => queryRecipes.id, { onDelete:"cascade" }),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  note: text("note"),
  spec: jsonb("spec").notNull(),
  createdAt: timestamp("created_at", { withTimezone:true }).notNull().defaultNow(),
}, t => [primaryKey({ columns:[t.recipeId, t.version] }),
  check("query_recipe_versions_version_check", sql`${t.version} > 0`),
  check("query_recipe_versions_title_check", sql`length(${t.title}) between 1 and 160`),
  check("query_recipe_versions_note_check", sql`length(${t.note}) <= 1000`)]);

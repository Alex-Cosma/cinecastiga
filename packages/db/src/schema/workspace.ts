import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { appSchema, clips, investigations } from "./app.js";
import { authUsers } from "./auth.js";

export const investigationMembers = appSchema.table("investigation_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  investigationId: uuid("investigation_id").notNull().references(() => investigations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("investigation_members_user_uq").on(t.investigationId, t.userId), index("investigation_members_lookup_idx").on(t.userId), check("investigation_members_role", sql`${t.role} in ('editor','viewer')`)]);

export const investigationInvites = appSchema.table("investigation_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  investigationId: uuid("investigation_id").notNull().references(() => investigations.id, { onDelete: "cascade" }),
  email: text("email").notNull(), role: text("role").notNull(), tokenHash: text("token_hash").notNull(),
  createdBy: text("created_by").references(() => authUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }), revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, t => [uniqueIndex("investigation_invites_token_uq").on(t.tokenHash), index("investigation_invites_parent_idx").on(t.investigationId), check("investigation_invites_role", sql`${t.role} in ('editor','viewer')`)]);

export const workspaceEntries = appSchema.table("workspace_entries", {
  id: uuid("id").primaryKey().defaultRandom(), investigationId: uuid("investigation_id").notNull().references(() => investigations.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), title: text("title").notNull(), body: text("body").notNull().default(""),
  alternative: text("alternative").notNull().default(""), status: text("status").notNull().default("open"),
  occurredOn: text("occurred_on"), revision: integer("revision").notNull().default(1),
  createdBy: text("created_by").references(() => authUsers.id, { onDelete: "set null" }),
  updatedBy: text("updated_by").references(() => authUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(), deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, t => [index("workspace_entries_parent_idx").on(t.investigationId, t.kind), check("workspace_entries_kind", sql`${t.kind} in ('question','note','task','event')`), check("workspace_entries_status", sql`${t.status} in ('open','checking','done')`)]);

export const workspaceRevisions = appSchema.table("workspace_revisions", {
  id: uuid("id").primaryKey().defaultRandom(), entryId: uuid("entry_id").notNull().references(() => workspaceEntries.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(), content: jsonb("content").notNull(),
  actorId: text("actor_id").references(() => authUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("workspace_revisions_number_uq").on(t.entryId, t.revision)]);

export const questionEvidence = appSchema.table("question_evidence", {
  investigationId: uuid("investigation_id").notNull().references(() => investigations.id, { onDelete: "cascade" }),
  questionId: uuid("question_id").notNull().references(() => workspaceEntries.id, { onDelete: "cascade" }),
  clipId: uuid("clip_id").notNull().references(() => clips.id, { onDelete: "cascade" }),
  stance: text("stance").notNull(), note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.questionId, t.clipId] }), index("question_evidence_parent_idx").on(t.investigationId), check("question_evidence_stance", sql`${t.stance} in ('supports','contradicts','check')`)]);

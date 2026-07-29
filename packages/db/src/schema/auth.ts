import { boolean, index, integer, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Authentication tables (better-auth managed shapes: core + admin + twoFactor
 * plugins). Isolated in the `auth` Postgres schema — never touched by
 * ingestion rebuilds. Column set must stay in sync with the better-auth
 * version pinned in apps/web; verify with `npx @better-auth/cli generate`
 * after upgrades.
 */
export const authSchema = pgSchema("auth");

export const authUsers = authSchema.table("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // admin plugin
  role: text("role"),
  banned: boolean("banned"),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  // twoFactor plugin
  twoFactorEnabled: boolean("two_factor_enabled"),
});

export const authSessions = authSchema.table(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    // admin plugin
    impersonatedBy: text("impersonated_by"),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);

export const authAccounts = authSchema.table(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_accounts_user_idx").on(t.userId)],
);

export const authVerifications = authSchema.table(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_verifications_identifier_idx").on(t.identifier)],
);

export const authTwoFactors = authSchema.table(
  "two_factors",
  {
    id: text("id").primaryKey(),
    secret: text("secret"),
    backupCodes: text("backup_codes"),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [index("auth_two_factors_user_idx").on(t.userId)],
);

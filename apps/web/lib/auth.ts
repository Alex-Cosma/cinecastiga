import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, twoFactor } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import {
  createDb,
  authAccounts,
  authSessions,
  authTwoFactors,
  authUsers,
  authVerifications,
  type Db,
} from "@seap/db";
import { sendAuthCode } from "./mail";

/**
 * better-auth server instance. Accounts are admin-created only (signup
 * disabled); every login is password + emailed one-time code (twoFactorEnabled
 * is set on all users at creation). Tables live in the `auth` Postgres schema
 * (packages/db/src/schema/auth.ts).
 */
const g = globalThis as unknown as { __seapAuthDb?: Db };
export function authDb(): Db {
  if (!g.__seapAuthDb) g.__seapAuthDb = createDb().db;
  return g.__seapAuthDb;
}

export const auth = betterAuth({
  appName: "cinecâștigă?",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  database: drizzleAdapter(authDb(), {
    provider: "pg",
    schema: {
      user: authUsers,
      session: authSessions,
      account: authAccounts,
      verification: authVerifications,
      twoFactor: authTwoFactors,
    },
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 10,
    revokeSessionsOnPasswordReset: true,
  },
  plugins: [
    twoFactor({
      skipVerificationOnEnable: true,
      otpOptions: {
        digits: 6,
        async sendOTP({ user, otp }) {
          await sendAuthCode(user.email, otp);
        },
      },
    }),
    admin({ defaultRole: "watchdog", adminRoles: ["admin"] }),
    nextCookies(),
  ],
  rateLimit: { enabled: true },
});

export type Session = typeof auth.$Infer.Session;

/**
 * 2FA is mandatory, but better-auth only honors it when the user has a
 * twoFactor record (normally created by the self-service enable flow, which
 * needs the user's own session). Admin-created accounts never run that flow,
 * so this replicates it: random TOTP secret + backup codes, encrypted the
 * same way the plugin does, plus the user flag. Idempotent.
 */
export async function forceTwoFactor(userId: string): Promise<void> {
  const { symmetricEncrypt } = await import("better-auth/crypto");
  const { randomBytes, randomUUID } = await import("node:crypto");
  const { eq } = await import("drizzle-orm");
  const ctx = await auth.$context;
  const db = authDb();
  const existing = await db
    .select({ id: authTwoFactors.id })
    .from(authTwoFactors)
    .where(eq(authTwoFactors.userId, userId));
  if (existing.length === 0) {
    const secret = await symmetricEncrypt({
      key: ctx.secret,
      data: randomBytes(20).toString("hex"),
    });
    const backupCodes = await symmetricEncrypt({
      key: ctx.secret,
      data: JSON.stringify(
        Array.from({ length: 10 }, () => randomBytes(5).toString("hex")),
      ),
    });
    await db
      .insert(authTwoFactors)
      .values({ id: randomUUID(), secret, backupCodes, userId });
  }
  await db
    .update(authUsers)
    .set({ twoFactorEnabled: true })
    .where(eq(authUsers.id, userId));
}

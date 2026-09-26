import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, twoFactor } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { createAuthMiddleware } from "better-auth/api";
import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
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

// Bind successful email OTP verification to the address that actually received
// that code. A user lookup after verification alone would also verify an address
// changed by an administrator between sending and entering the code.
async function emailProofKey(userId: string, code: string, ctx: {
  context: {
    secret: string;
    session?: { session: { id: string }; user: { id: string } } | null;
    createAuthCookie: (name: string) => { name: string };
  };
  getSignedCookie: (name: string, secret: string) => Promise<string | false | null>;
}): Promise<string | null> {
  const session = ctx.context.session;
  const challenge = session?.user.id === userId
    ? `${userId}!${session.session.id}`
    : await ctx.getSignedCookie(ctx.context.createAuthCookie("two_factor").name, ctx.context.secret);
  if (!challenge) return null;
  return `seap-email-proof:${userId}:${createHmac("sha256", ctx.context.secret)
    .update(JSON.stringify([challenge, code])).digest("hex")}`;
}

const createAuth = () => betterAuth({
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
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/two-factor/verify-otp") return;
      const result = ctx.context.returned as {
        token?: unknown;
        user?: { id?: unknown; email?: unknown; emailVerified?: boolean };
      } | null;
      // Only the plugin's successful response establishes that the one-time
      // challenge was consumed for this user. Failed/replayed codes have no user.
      if (typeof result?.token !== "string" || typeof result.user?.id !== "string" ||
          typeof result.user.email !== "string" || typeof ctx.body?.code !== "string") return;
      const key = await emailProofKey(result.user.id, ctx.body.code, ctx);
      if (!key) return;
      const proof = await ctx.context.internalAdapter.consumeVerificationValue(key);
      if (!proof || proof.value !== result.user.email) return;
      const updated = await authDb().update(authUsers)
        .set({ emailVerified: true, updatedAt: new Date() })
        .where(and(eq(authUsers.id, result.user.id), eq(authUsers.email, proof.value)))
        .returning({ id: authUsers.id });
      if (!updated.length) return;
      result.user.emailVerified = true;
      // Session cookies contain no cached user data in this configuration.
      if (ctx.context.newSession?.user.id === result.user.id) ctx.context.newSession.user.emailVerified = true;
      if (ctx.context.session?.user.id === result.user.id) ctx.context.session.user.emailVerified = true;
    }),
  },
  plugins: [
    twoFactor({
      skipVerificationOnEnable: true,
      otpOptions: {
        digits: 6,
        period: 3,
        storeOTP: "hashed",
        async sendOTP({ user, otp }, ctx) {
          await sendAuthCode(user.email, otp);
          // This callback is server-only. Never accept a recipient supplied by
          // the browser, and never mark an admin-created address verified here.
          const key = ctx ? await emailProofKey(user.id, otp, ctx) : null;
          if (ctx && key) await ctx.context.internalAdapter.createVerificationValue({
            identifier: key,
            value: user.email,
            expiresAt: new Date(Date.now() + 3 * 60 * 1000),
          });
        },
      },
    }),
    admin({ defaultRole: "watchdog", adminRoles: ["admin"] }),
    nextCookies(),
  ],
  rateLimit: { enabled: true },
});

// Route discovery during a clean build must not initialize authentication with
// absent runtime secrets. The first actual auth operation constructs it once.
let authInstance: ReturnType<typeof createAuth> | undefined;
export const auth = new Proxy({} as ReturnType<typeof createAuth>, {
  has(_target, property) {
    authInstance ??= createAuth();
    return Reflect.has(authInstance, property);
  },
  get(_target, property) {
    authInstance ??= createAuth();
    return Reflect.get(authInstance, property);
  },
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

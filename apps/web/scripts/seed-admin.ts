/**
 * One-time admin bootstrap. Usage (from apps/web):
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm seed:admin
 * Idempotent — exits if the email already has an account.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

try {
  const env = readFileSync(resolve(import.meta.dirname, "../.env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
  }
} catch {
  /* no .env.local — rely on ambient env */
}

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) {
  console.error("ADMIN_EMAIL și ADMIN_PASSWORD sunt obligatorii.");
  process.exit(1);
}
if (password.length < 10) {
  console.error("Parola trebuie să aibă minim 10 caractere.");
  process.exit(1);
}

const { auth, forceTwoFactor } = await import("../lib/auth");
const ctx = await auth.$context;

const existing = await ctx.internalAdapter.findUserByEmail(email);
if (existing) {
  await forceTwoFactor(existing.user.id);
  console.log(`Cont existent pentru ${email} — 2FA asigurat, nimic altceva de făcut.`);
  process.exit(0);
}

const user = await ctx.internalAdapter.createUser({
  email,
  name: "Administrator",
  emailVerified: true,
  role: "admin",
});
const hash = await ctx.password.hash(password);
await ctx.internalAdapter.linkAccount({
  userId: user.id,
  providerId: "credential",
  accountId: user.id,
  password: hash,
});
await forceTwoFactor(user.id);
console.log(`Admin creat: ${email} (id ${user.id}). Login cu 2FA pe email activ.`);
process.exit(0);

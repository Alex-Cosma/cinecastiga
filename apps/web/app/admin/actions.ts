"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, forceTwoFactor } from "@/lib/auth";
import type { AccountError, AccountSuccess } from "./oameni/messages";

/*
 * The account commands of Oameni (owner, 7 November 2026). Each one ends with a redirect to the accounts list the
 * admin was on (its filters and page, sent by the form as `lista`) carrying a short outcome code, ?ok=… or ?err=…
 * (and ?la=<account> for a row's command), which the page turns into Romanian text (oameni/messages.ts). A redirect is
 * never called inside a try block.
 */

const PAGE = "/admin/oameni";

async function requireAdmin() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session || (session.user as { role?: string }).role !== "admin") {
    redirect("/login");
  }
  return { h, me: session.user.id };
}

function back(formData: FormData, outcome: { ok: AccountSuccess } | { err: AccountError }): never {
  const raw = String(formData.get("lista") ?? "");
  const query = new URLSearchParams(raw.length <= 1000 ? raw : "");
  for (const key of ["ok", "err", "la"]) query.delete(key);
  if ("ok" in outcome) query.set("ok", outcome.ok);
  else query.set("err", outcome.err);
  // A row's command names its account, so the page can give the focus back to that row.
  const userId = String(formData.get("userId") ?? "");
  if (userId && userId.length <= 64) query.set("la", userId);
  revalidatePath(PAGE);
  redirect(`${PAGE}?${query.toString()}#conturi-lista`);
}

/** better-auth's error code (APIError.body.code), or "". */
function codeOf(e: unknown): string {
  const body = (e as { body?: { code?: unknown } } | null)?.body;
  return typeof body?.code === "string" ? body.code : "";
}

export async function createWatchdog(formData: FormData) {
  const { h } = await requireAdmin();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || email;
  const password = String(formData.get("password") ?? "");
  if (!email || !password) back(formData, { err: "creare-date" });
  // The admin plugin's createUser does not check the length itself.
  if (password.length < 10) back(formData, { err: "creare-parola" });
  if (password.length > 128) back(formData, { err: "creare-parola-lunga" });
  let userId = "";
  let failure: AccountError | null = null;
  try {
    // role omitted → admin plugin defaultRole ("watchdog") applies
    const created = await auth.api.createUser({
      body: { email, name, password },
      headers: h,
    });
    userId = created.user.id;
  } catch (e) {
    const code = codeOf(e);
    failure = code.startsWith("USER_ALREADY_EXISTS")
      ? "creare-exista"
      : code === "INVALID_EMAIL"
        ? "creare-email"
        : code === "PASSWORD_TOO_SHORT"
          ? "creare-parola"
          : code === "PASSWORD_TOO_LONG"
            ? "creare-parola-lunga"
            : "creare";
  }
  if (failure) back(formData, { err: failure });
  let coded = true;
  try {
    await forceTwoFactor(userId);
  } catch {
    coded = false;
  }
  if (!coded) {
    // Never leave a password-only account behind: it stays disabled until the emailed code can be required.
    const disabled = await auth.api
      .banUser({ body: { userId, banReason: "Cod pe email neactivat la creare" }, headers: h })
      .then(() => true, () => false);
    back(formData, { err: disabled ? "creare-cod" : "creare-cod-activ" });
  }
  back(formData, { ok: "creat" });
}

export async function setUserPassword(formData: FormData) {
  const { h, me } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  if (!userId) back(formData, { err: "cont-negasit" });
  // The admin's own password changes on /cont, with the current one.
  if (userId === me) back(formData, { err: "contul-tau" });
  if (newPassword.length < 10) back(formData, { err: "parola-scurta" });
  if (newPassword.length > 128) back(formData, { err: "parola-lunga" });
  let failure: AccountError | null = null;
  try {
    await auth.api.setUserPassword({ body: { userId, newPassword }, headers: h });
  } catch (e) {
    const code = codeOf(e);
    failure = code === "PASSWORD_TOO_SHORT"
      ? "parola-scurta"
      : code === "PASSWORD_TOO_LONG"
        ? "parola-lunga"
        : code === "USER_NOT_FOUND"
          ? "cont-negasit"
          : "parola";
  }
  if (failure) back(formData, { err: failure });
  let closed = true;
  try {
    await auth.api.revokeUserSessions({ body: { userId }, headers: h });
  } catch {
    closed = false;
  }
  back(formData, closed ? { ok: "parola" } : { err: "parola-sesiuni" });
}

export async function toggleBan(formData: FormData) {
  const { h, me } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const banned = formData.get("banned") === "true";
  if (!userId) back(formData, { err: "cont-negasit" });
  if (userId === me) back(formData, { err: "contul-tau" });
  let failure: AccountError | null = null;
  try {
    if (banned) {
      await auth.api.unbanUser({ body: { userId }, headers: h });
    } else {
      await auth.api.banUser({
        body: { userId, banReason: "Dezactivat de administrator" },
        headers: h,
      });
    }
  } catch (e) {
    const code = codeOf(e);
    failure = code === "USER_NOT_FOUND" ? "cont-negasit" : code === "YOU_CANNOT_BAN_YOURSELF" ? "contul-tau" : "actiune";
  }
  if (failure) back(formData, { err: failure });
  if (banned) back(formData, { ok: "reactivat" });
  let closed = true;
  try {
    await auth.api.revokeUserSessions({ body: { userId }, headers: h });
  } catch {
    closed = false;
  }
  back(formData, closed ? { ok: "dezactivat" } : { err: "dezactivat-sesiuni" });
}

export async function revokeSessions(formData: FormData) {
  const { h, me } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) back(formData, { err: "cont-negasit" });
  if (userId === me) back(formData, { err: "contul-tau" });
  let failure: AccountError | null = null;
  try {
    await auth.api.revokeUserSessions({ body: { userId }, headers: h });
  } catch (e) {
    failure = codeOf(e) === "USER_NOT_FOUND" ? "cont-negasit" : "deconectare";
  }
  if (failure) back(formData, { err: failure });
  back(formData, { ok: "deconectat" });
}

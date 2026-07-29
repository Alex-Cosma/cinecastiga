"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, forceTwoFactor } from "@/lib/auth";

async function requireAdmin() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session || (session.user as { role?: string }).role !== "admin") {
    redirect("/login");
  }
  return h;
}

function fail(msg: string): never {
  redirect(`/admin?err=${encodeURIComponent(msg)}`);
}

export async function createWatchdog(formData: FormData) {
  const h = await requireAdmin();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || email;
  const password = String(formData.get("password") ?? "");
  if (!email || !password) fail("Email și parolă obligatorii.");
  if (password.length < 10) fail("Parola trebuie să aibă minim 10 caractere.");
  let userId: string;
  try {
    // role omitted → admin plugin defaultRole ("watchdog") applies
    const created = await auth.api.createUser({
      body: { email, name, password },
      headers: h,
    });
    userId = created.user.id;
  } catch (e) {
    fail(e instanceof Error ? e.message : "Nu am putut crea contul.");
  }
  await forceTwoFactor(userId);
  revalidatePath("/admin");
}

export async function setUserPassword(formData: FormData) {
  const h = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  if (newPassword.length < 10) fail("Parola trebuie să aibă minim 10 caractere.");
  try {
    await auth.api.setUserPassword({ body: { userId, newPassword }, headers: h });
    await auth.api.revokeUserSessions({ body: { userId }, headers: h });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Nu am putut schimba parola.");
  }
  revalidatePath("/admin");
}

export async function toggleBan(formData: FormData) {
  const h = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const banned = formData.get("banned") === "true";
  try {
    if (banned) {
      await auth.api.unbanUser({ body: { userId }, headers: h });
    } else {
      await auth.api.banUser({
        body: { userId, banReason: "Dezactivat de administrator" },
        headers: h,
      });
      await auth.api.revokeUserSessions({ body: { userId }, headers: h });
    }
  } catch (e) {
    fail(e instanceof Error ? e.message : "Operațiune eșuată.");
  }
  revalidatePath("/admin");
}

export async function revokeSessions(formData: FormData) {
  const h = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  try {
    await auth.api.revokeUserSessions({ body: { userId }, headers: h });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Operațiune eșuată.");
  }
  revalidatePath("/admin");
}

import { headers } from "next/headers";
import { auth } from "./auth";

/** Current logged-in user id (watchdog or admin), or null. Server-only. */
export async function sessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

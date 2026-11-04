import type { headers } from "next/headers";
import { auth } from "../auth";
import type { AccountRow } from "./table-columns";

/*
 * Every account, for the accounts table's column filters (owner, 4 November 2026): a watchdog team is tens of
 * accounts, so the table filters and counts them in memory (lib/table-filters/memory.ts) over one read of the auth
 * API, up to ACCOUNTS_READ.
 */
export const ACCOUNTS_READ = 1000;

type Headers = Awaited<ReturnType<typeof headers>>;

/** The signed-in admin, or null. */
export async function adminSession(h: Headers) {
  const session = await auth.api.getSession({ headers: h });
  return session && (session.user as { role?: string }).role === "admin" ? session : null;
}

/** Every account, newest first. */
export async function allAccounts(h: Headers): Promise<AccountRow[]> {
  const res = (await auth.api.listUsers({
    query: { limit: ACCOUNTS_READ, offset: 0, sortBy: "createdAt", sortDirection: "desc" },
    headers: h,
  })) as { users: AccountRow[] };
  return res.users;
}

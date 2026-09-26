import { createDb, type DbSql } from "@seap/db";

export type InvestigationRole = "owner" | "editor" | "viewer";
export type InvestigationPermission = "read" | "edit" | "manage";
export interface InvestigationAccess { role: InvestigationRole; canEdit: boolean; canManage: boolean }
const globalDb = globalThis as unknown as { __workspaceSql?: DbSql };
export const workspaceDatabase = () => globalDb.__workspaceSql ??= createDb().sql;
export const isWorkspaceId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function permits(role: InvestigationRole | null, permission: InvestigationPermission): boolean {
  return role === "owner" || role === "editor" && permission !== "manage" || role === "viewer" && permission === "read";
}

/** Identity comes from the authenticated server session, never a request body. */
export async function getInvestigationAccess(userId: string, id: string, sql: DbSql = workspaceDatabase()): Promise<InvestigationAccess | null> {
  if (!userId || !isWorkspaceId(id)) return null;
  const [row] = await sql`select case when i.owner_user_id = ${userId} then 'owner' else m.role end role
    from app.investigations i left join app.investigation_members m on m.investigation_id=i.id and m.user_id=${userId}
    where i.id=${id} and (i.owner_user_id=${userId} or m.user_id is not null)`;
  const role = row?.role as InvestigationRole | undefined;
  return role && ["owner", "editor", "viewer"].includes(role) ? { role, canEdit: permits(role, "edit"), canManage: permits(role, "manage") } : null;
}

/** Serialize edits with revocation. Membership changes touch the locked parent,
 * so a waiting repeatable-read transaction cannot authorize a stale membership.
 * The callback must use q, including all evidence queries that need this snapshot. */
export async function withInvestigationAccess<T>(userId: string, id: string, permission: InvestigationPermission,
  work: (q: DbSql, access: InvestigationAccess) => Promise<T>, sql: DbSql = workspaceDatabase()): Promise<T | null> {
  if (!userId || !isWorkspaceId(id)) return null;
  return sql.begin("isolation level repeatable read", async transaction => {
    const q = transaction as unknown as DbSql;
    // Acquire before reading membership, not after authorizing a separate query.
    const rows = permission === "read"
      ? await q`select id from app.investigations where id=${id} for share`
      : await q`select id from app.investigations where id=${id} for update`;
    if (!rows.length) return null;
    const access = await getInvestigationAccess(userId, id, q);
    if (!access || !permits(access.role, permission)) return null;
    return work(q, access);
  }) as Promise<T | null>;
}

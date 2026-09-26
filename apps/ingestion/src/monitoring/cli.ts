import { withMonitoringWrite, type DbSql } from "@seap/db";

/** Always releases the publication gate before closing its connection pool. */
export async function runMonitoredCli<T>(sql: DbSql, action: string, work: () => Promise<T>, writes = true): Promise<T> {
  try { return writes ? await withMonitoringWrite(sql, action, work) : await work(); }
  finally { await sql.end(); }
}

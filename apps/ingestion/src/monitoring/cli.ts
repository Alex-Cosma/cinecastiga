import { withMonitoringWrite, type DbSql } from "@seap/db";

/** Release the publication gate before bounded cleanup. A lifetime-expired reserved
 * postgres.js connection can otherwise leave pool shutdown waiting indefinitely. */
export async function runMonitoredCli<T>(sql: DbSql, action: string, work: () => Promise<T>, writes = true): Promise<T> {
  try { return writes ? await withMonitoringWrite(sql, action, work) : await work(); }
  finally { await sql.end({ timeout: 10 }); }
}

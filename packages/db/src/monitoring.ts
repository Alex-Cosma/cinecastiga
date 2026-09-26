import { AsyncLocalStorage } from "node:async_hooks";
import type { DbSql } from "./client.js";

/** Two-key session lock: every analytic writer and monitoring snapshot shares it. */
export const MONITORING_GATE = [1397047632, 3] as const;
export interface MonitoringCheckpoint {
  id: string;
  /** Decimal string: never coerce the monotonic bigint sequence to Number. */
  version: string;
  kind: "coordinated" | "baseline" | "manual";
  status: "running" | "ready" | "failed";
  startedAt: string;
  completedAt: string | null;
  sourceCoverage: Record<string, unknown>;
  methodology: Record<string, unknown>;
  validation: Record<string, unknown>;
  error: string | null;
}
export type MonitoringUnavailableReason = "unpublished" | "refreshing" | "failed" | "superseded";
export class MonitoringRefreshUnavailableError extends Error {
  constructor(public readonly reason: MonitoringUnavailableReason, public readonly checkpoint: MonitoringCheckpoint | null = null) {
    super(reason === "unpublished" ? "Nu există încă o actualizare verificată a datelor."
      : reason === "refreshing" ? "Datele sunt în curs de actualizare; verificarea va putea fi reluată după finalizare."
        : reason === "superseded" ? "Versiunea datelor s-a schimbat. Reia verificarea cu versiunea disponibilă acum."
          : "Ultima actualizare nu a fost validată. Monitorizarea așteaptă o actualizare completă.");
    this.name = "MonitoringRefreshUnavailableError";
  }
}
async function latest(sql: DbSql, readyOnly = false): Promise<MonitoringCheckpoint | null> {
  const rows = await sql`select id, version::text, kind, status, started_at::text "startedAt", completed_at::text "completedAt",
    source_coverage "sourceCoverage", methodology, validation, error
    from app.monitoring_refreshes r where (not ${readyOnly} or status = 'ready') order by r.version desc limit 1`;
  return (rows[0] as unknown as MonitoringCheckpoint | undefined) ?? null;
}
export async function getMonitoringRefreshStatus(sql: DbSql) {
  // One SQL snapshot prevents a mixed current/last-ready status during publication.
  return sql.begin("isolation level repeatable read read only", async tx => {
    const current = await latest(tx as unknown as DbSql);
    const lastReady = current?.status === "ready" ? current : await latest(tx as unknown as DbSql, true);
    return { current, lastReady, available: current?.status === "ready" };
  });
}

/** Lock BEFORE BEGIN: waiting for a lock inside RR can retain a pre-refresh snapshot. */
export async function withMonitoringSnapshot<T>(sql: DbSql,
  work: (q: DbSql, checkpoint: MonitoringCheckpoint) => Promise<T>, expectedCheckpointId?: string): Promise<T> {
  const connection = await sql.reserve();
  let locked = false, transaction = false;
  try {
    const [gate] = await connection`select pg_try_advisory_lock_shared(${MONITORING_GATE[0]}, ${MONITORING_GATE[1]}) acquired`;
    locked = gate?.["acquired"] === true;
    if (!locked) throw new MonitoringRefreshUnavailableError("refreshing");
    // postgres.js reserves a physical session but its runtime ReservedSql has no
    // .begin method (despite the declaration). Explicit transaction commands are
    // safe here because every command uses this exclusively reserved connection.
    await connection`begin isolation level repeatable read`; transaction = true;
    const checkpoint = await latest(connection);
    if (!checkpoint) throw new MonitoringRefreshUnavailableError("unpublished");
    if (checkpoint.status !== "ready") throw new MonitoringRefreshUnavailableError(checkpoint.status === "running" ? "refreshing" : "failed", checkpoint);
    if (expectedCheckpointId && checkpoint.id !== expectedCheckpointId) throw new MonitoringRefreshUnavailableError("superseded", checkpoint);
    const result = await work(connection, checkpoint);
    await connection`commit`; transaction = false;
    return result;
  } finally {
    try { if (transaction) await connection`rollback`; }
    finally {
      try { if (locked) await connection`select pg_advisory_unlock_shared(${MONITORING_GATE[0]}, ${MONITORING_GATE[1]})`; }
      finally { connection.release(); }
    }
  }
}

const writer = new AsyncLocalStorage<{ sql: DbSql }>();
function safeError(error: unknown): string {
  // SQL errors can contain source records, credentials or query parameters.
  const code = error && typeof error === "object" && "code" in error && /^[A-Z0-9]{5}$/.test(String(error.code)) ? String(error.code) : null;
  return code ? `Actualizarea a eșuat (SQLSTATE ${code}). Datele necesită o verificare completă.`
    : "Actualizarea sau validarea nu s-a încheiat. Datele necesită o verificare completă.";
}
async function lifecycle<T>(sql: DbSql, kind: MonitoringCheckpoint["kind"], methodology: Record<string, unknown>,
  work: () => Promise<{ result: T; sourceCoverage: Record<string, unknown>; validation: Record<string, unknown> }>) {
  const connection = await sql.reserve();
  let locked = false, id: string | null = null;
  try {
    await connection`select pg_advisory_lock(${MONITORING_GATE[0]}, ${MONITORING_GATE[1]})`; locked = true;
    const [created] = await connection`insert into app.monitoring_refreshes (kind, methodology) values (${kind}, ${JSON.stringify(methodology)}::jsonb) returning id`;
    id = String(created!["id"]);
    const outcome = await writer.run({ sql }, work);
    const error = kind === "manual" ? "Modificare separată a datelor. Este necesară o actualizare coordonată și validată înainte de monitorizare." : null;
    await connection`update app.monitoring_refreshes set status = ${kind === "manual" ? "failed" : "ready"}, completed_at = now(),
      source_coverage = ${JSON.stringify(outcome.sourceCoverage)}::jsonb, validation = ${JSON.stringify(outcome.validation)}::jsonb, error = ${error} where id = ${id}`;
    const checkpoint = await latest(connection);
    return { result: outcome.result, checkpoint: checkpoint! };
  } catch (error) {
    if (id) await connection`update app.monitoring_refreshes set status = 'failed', completed_at = now(), error = ${safeError(error)} where id = ${id}`;
    throw error;
  } finally {
    try { if (locked) await connection`select pg_advisory_unlock(${MONITORING_GATE[0]}, ${MONITORING_GATE[1]})`; }
    finally { connection.release(); }
  }
}

/** Supported manual mutation entry points invalidate readiness even when they succeed. */
export async function withMonitoringWrite<T>(sql: DbSql, action: string, work: () => Promise<T>): Promise<T> {
  if (writer.getStore()?.sql === sql) return work();
  return (await lifecycle(sql, "manual", { action }, async () => ({ result: await work(), sourceCoverage: {}, validation: { coordinatedRefreshRequired: true } }))).result;
}

/** Publication is allowed only after all stages and validation return successfully. */
export async function publishMonitoringRefresh(sql: DbSql, kind: "coordinated" | "baseline", methodology: Record<string, unknown>,
  work: () => Promise<{ sourceCoverage: Record<string, unknown>; validation: Record<string, unknown> }>): Promise<MonitoringCheckpoint> {
  if (writer.getStore()) throw new Error("Cannot publish a nested monitoring refresh");
  return (await lifecycle(sql, kind, methodology, async () => ({ result: undefined, ...await work() }))).checkpoint;
}

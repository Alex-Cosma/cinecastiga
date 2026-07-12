import type { Task } from "graphile-worker";
import { createDb } from "@seap/db";

/**
 * Dev-loop proof job: logs liveness and the raw archive row count,
 * confirming worker → Postgres wiring end to end.
 */
export const heartbeat: Task = async (_payload, helpers) => {
  const { sql: pg } = createDb();
  try {
    const [row] = await pg<
      { count: number }[]
    >`select count(*)::int as count from raw.raw_documents`;
    helpers.logger.info(`heartbeat: alive, raw_documents=${row?.count ?? 0}`);
  } finally {
    await pg.end();
  }
};

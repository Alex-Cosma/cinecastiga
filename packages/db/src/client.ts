import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export const DEFAULT_DATABASE_URL =
  "postgres://seap:seap_dev@localhost:5432/seap";

export function createDb(url?: string, options?: {max?:number}) {
  const connectionString =
    url ?? process.env["DATABASE_URL"] ?? DEFAULT_DATABASE_URL;
  const sql = postgres(connectionString, {max:options?.max??10});
  return { db: drizzle(sql, { schema }), sql };
}

export type Db = ReturnType<typeof createDb>["db"];
export type DbSql = ReturnType<typeof createDb>["sql"];

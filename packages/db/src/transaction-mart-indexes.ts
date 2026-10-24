import type { DbSql } from "./client.js";

type Query = DbSql | Parameters<Parameters<DbSql['begin']>[1]>[0];

/**
 * Covering county/CPV indexes of the two transaction marts (perf work 1745f5a:
 * Ask by county or CPV answers from them index-only; without them the same
 * questions scan 20M rows, 8–17 s). Drizzle cannot declare INCLUDE, so they
 * are outside the schema files. Until migration 0084 they were created by hand
 * and survived only because the builds TRUNCATE instead of dropping: a
 * database built from migrations lacked them, without any error.
 *
 * Owned twice, with the same text: migration 0084 creates them on every
 * database built from migrations, and the builds create any that are missing
 * (ensureTransactionMartIndexes). Each definition is exactly what
 * pg_get_indexdef returned on production and on the local copy on
 * 24 October 2026, so tests compare it character for character. Changing one
 * takes a new migration, this list and the 0084 test together.
 */
export const TRANSACTION_MART_INDEXES = [
  { table: "da_transactions", name: "da_tx_county_date_idx",
    definition: "CREATE INDEX da_tx_county_date_idx ON marts.da_transactions USING btree (county, finalization_date text_pattern_ops) INCLUDE (closing_value)" },
  { table: "da_transactions", name: "da_tx_county_ent_idx",
    definition: "CREATE INDEX da_tx_county_ent_idx ON marts.da_transactions USING btree (county) INCLUDE (authority_id, supplier_id, closing_value, finalization_date)" },
  { table: "da_transactions", name: "da_tx_cpv_idx",
    definition: "CREATE INDEX da_tx_cpv_idx ON marts.da_transactions USING btree (cpv_code text_pattern_ops)" },
  { table: "da_transactions", name: "da_tx_cpv_val_idx",
    definition: "CREATE INDEX da_tx_cpv_val_idx ON marts.da_transactions USING btree (cpv_code text_pattern_ops) INCLUDE (closing_value, finalization_date)" },
  { table: "contract_transactions", name: "ctx_county_idx",
    definition: "CREATE INDEX ctx_county_idx ON marts.contract_transactions USING btree (county) INCLUDE (closing_value, finalization_date)" },
  { table: "contract_transactions", name: "ctx_county_ent_idx",
    definition: "CREATE INDEX ctx_county_ent_idx ON marts.contract_transactions USING btree (county) INCLUDE (authority_id, supplier_id, closing_value, finalization_date)" },
  { table: "contract_transactions", name: "ctx_cpv_idx",
    definition: "CREATE INDEX ctx_cpv_idx ON marts.contract_transactions USING btree (cpv_code text_pattern_ops)" },
  { table: "contract_transactions", name: "ctx_cpv_val_idx",
    definition: "CREATE INDEX ctx_cpv_val_idx ON marts.contract_transactions USING btree (cpv_code text_pattern_ops) INCLUDE (closing_value, finalization_date)" },
] as const;

export type TransactionMartTable = (typeof TRANSACTION_MART_INDEXES)[number]["table"];

/** Create the covering indexes of `table` that do not exist; returns their
 * names (none after migration 0084, so a name in the stage log means the
 * environment had lost them). Call inside the build transaction after loading:
 * the TRUNCATE already holds the table exclusively, and one sort of the loaded
 * rows is cheaper than maintaining the index row by row. An index of the same
 * name is kept as it is; the 0084 integration test compares definitions. */
export async function ensureTransactionMartIndexes(q: Query, table: TransactionMartTable): Promise<string[]> {
  const wanted = TRANSACTION_MART_INDEXES.filter(index => index.table === table);
  const rows = await q`
    select name from unnest(${wanted.map(index => index.name)}::text[]) name
    where to_regclass('marts.' || name) is null`;
  const missing = new Set(rows.map(row => String(row['name'])));
  const created: string[] = [];
  for (const index of wanted) {
    if (!missing.has(index.name)) continue;
    await q.unsafe(index.definition);
    created.push(index.name);
  }
  return created;
}

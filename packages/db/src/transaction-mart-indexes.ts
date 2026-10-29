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

/**
 * Covering twins of da_tx_supplier_idx / da_tx_authority_idx: the same keys
 * plus every column of Ask's slim union (txAggFragment), so a question about
 * one or two named entities aggregates from the index alone. Measured on
 * SELGROS + DEDEMAN (927k rows): 1.25–1.4 s per compare query with a heap
 * scan, 0.12 s index-only (local copy, 24 October 2026).
 *
 * Owned by the build only, unlike the list above: dropped before the nightly
 * load and built after it (on a 10% sample, loading with both maintained took
 * 10.6 s and left them 45% larger; loading without them and building after,
 * 4.5 s), so no migration creates them and none is needed to remove them:
 * delete them here and drop them once. About 1.7 GB each on 19.6M rows.
 *
 * They also carry sicap_da_id (F2 review): the source page of a trend group
 * (thousands of members, up to 2.5M records) takes its first rows' keys from
 * the index in any order and reads only those rows, instead of every member
 * record's heap row (a 2.18M-record group sorted by value: 0.8 s index-only
 * against 9.7 s; 56k records: 45 ms against 120 ms; +10% size, measured on a
 * copy of 2024–2025, 25 October 2026). The web probes for the column
 * (coverRefReady) and keeps its plans until the first build with it.
 *
 * da_tx_flagged_idx holds only the rows that carry a flag (2.56M of 19.6M,
 * after the da_split stamp), with both parties, the key, the value, the date
 * and the flags: the sources of a signal on the risk cloud (scatter-records.ts
 * flaggedRecordKeys) read their keys and totals from it alone. Without it a
 * national signal scanned the whole mart twice, past the drawer's 20 s limit
 * (possible split on the institutions, rapid on the firms); with it 0.1–0.6 s.
 * 269 MB, built in 7.7 s on a copy of the local mart (F6b review, 30 Oct 2026).
 * The query repeats its predicate word for word, so the planner can use it.
 */
export const TRANSACTION_MART_BUILD_INDEXES = [
  { table: "da_transactions", name: "da_tx_supplier_cover_idx",
    definition: "CREATE INDEX da_tx_supplier_cover_idx ON marts.da_transactions USING btree (supplier_id, finalization_date) INCLUDE (authority_id, closing_value, cpv_code, county, sicap_da_id)" },
  { table: "da_transactions", name: "da_tx_authority_cover_idx",
    definition: "CREATE INDEX da_tx_authority_cover_idx ON marts.da_transactions USING btree (authority_id, finalization_date) INCLUDE (supplier_id, closing_value, cpv_code, county, sicap_da_id)" },
  { table: "da_transactions", name: "da_tx_flagged_idx",
    definition: "CREATE INDEX da_tx_flagged_idx ON marts.da_transactions USING btree (authority_id) INCLUDE (supplier_id, sicap_da_id, closing_value, finalization_date, da_flags) WHERE (cardinality(da_flags) > 0)" },
] as const;

/** Before loading da_transactions (inside the build transaction, which holds the table). */
export async function dropTransactionMartBuildIndexes(q: Query): Promise<void> {
  await q.unsafe(`drop index if exists ${TRANSACTION_MART_BUILD_INDEXES.map(index => `marts.${index.name}`).join(", ")}`);
}

/** After loading: one sorted build per index. Returns the names created. */
export async function createTransactionMartBuildIndexes(q: Query): Promise<string[]> {
  for (const index of TRANSACTION_MART_BUILD_INDEXES) await q.unsafe(index.definition);
  return TRANSACTION_MART_BUILD_INDEXES.map(index => index.name);
}

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

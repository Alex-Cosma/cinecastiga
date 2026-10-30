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
 * The third is the same slim union by CPV code (S5, PRE-trend): a domain with
 * an entity ranking or trend nationally ("medicamente" noi, 2024 → 2025; the
 * firms or institutions of a domain) read either every row (a sequential scan
 * of 19.6M rows, 1.1–1.3 s) or the whole authority twin filtered on the code
 * (1.78 s at the production planner costs), because da_tx_cpv_val_idx has no
 * entity ids. With them, the domain's own range of the index answers alone
 * (CPV 336: 1.46M of the 19.6M entries); the date after the code bounds a
 * list of codes to a period (a drawer's search by a CPV name, source-search.ts
 * in the web: the codes' records of the two years, not of every year). It
 * replaces the CPV × entity rollup
 * of PRECOMPUTE.md (agg_cpv_entity_year: 12.3M rows, a third pass over the
 * union each night) with no new table and no new path in the engine: the live
 * queries are unchanged, so their answers are too.
 */
export const TRANSACTION_MART_BUILD_INDEXES = [
  { table: "da_transactions", name: "da_tx_supplier_cover_idx",
    definition: "CREATE INDEX da_tx_supplier_cover_idx ON marts.da_transactions USING btree (supplier_id, finalization_date) INCLUDE (authority_id, closing_value, cpv_code, county, sicap_da_id)" },
  { table: "da_transactions", name: "da_tx_authority_cover_idx",
    definition: "CREATE INDEX da_tx_authority_cover_idx ON marts.da_transactions USING btree (authority_id, finalization_date) INCLUDE (supplier_id, closing_value, cpv_code, county, sicap_da_id)" },
  { table: "da_transactions", name: "da_tx_cpv_cover_idx",
    definition: "CREATE INDEX da_tx_cpv_cover_idx ON marts.da_transactions USING btree (cpv_code text_pattern_ops, finalization_date) INCLUDE (authority_id, supplier_id, closing_value, county, sicap_da_id)" },
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

/** The build indexes as the build makes them, between two builds: each one
 * missing is created, and one of another definition (pg_get_indexdef, as the
 * tests compare) is built under a new name and then takes the old one's place;
 * returns their names. For a database whose last build predates one of them
 * (the first deploy of a new one): until the next nightly build the web reads
 * without it. Each build takes a SHARE lock on da_transactions (reads go on,
 * the nightly build waits); a replacement ends with the drop's exclusive lock,
 * held until the commit that follows. Run it outside the nightly window. */
export async function ensureTransactionMartBuildIndexes(q: Query): Promise<string[]> {
  const rows = await q`
    select i.name, pg_get_indexdef(to_regclass('marts.' || i.name)) definition
    from unnest(${TRANSACTION_MART_BUILD_INDEXES.map(index => index.name)}::text[]) i(name)`;
  const current = new Map(rows.map(row => [String(row['name']), row['definition'] as string | null]));
  const created: string[] = [];
  for (const index of TRANSACTION_MART_BUILD_INDEXES) {
    const definition = current.get(index.name);
    if (definition === index.definition) continue;
    if (!definition) await q.unsafe(index.definition);
    else {
      const next = `${index.name}_next`;
      await q.unsafe(`drop index if exists marts.${next}`);
      await q.unsafe(index.definition.replace(`CREATE INDEX ${index.name} `, `CREATE INDEX ${next} `));
      await q.unsafe(`drop index marts.${index.name}`);
      await q.unsafe(`alter index marts.${next} rename to ${index.name}`);
    }
    created.push(index.name);
  }
  return created;
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

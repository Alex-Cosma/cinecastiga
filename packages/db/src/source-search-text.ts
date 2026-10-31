import type { DbSql } from "./client.js";

/**
 * The stored text of the source drawers' free search („Caută în surse”, S6;
 * owner, 30 October 2026: the names-first search of S5 missed the bar on
 * number fragments, 5 s, and on texts of common words, the reason after 6 s).
 *
 * marts.source_search holds one row per row of the drawers' union (the two
 * transaction marts, apps/web/lib/ask/compile.ts txFragment): src as the
 * union writes it ('da', 'contracts'), ref_id (sicap_da_id, contract_id), sid
 * (the contract's winner, 0 on a direct acquisition, whose key is its own),
 * y (the year of finalization_date, null when undated) and t, the folded text
 * the drawer's condition reads today, written once:
 * lower(unaccent(concat_ws(' ', code, institution, firm, CPV name, CPV code,
 * county, key))). A trigram GIN on t answers `t like '%text%'`, which is
 * `strpos(t, text) > 0` (the same bytes, % and _ escaped), on the index; a
 * BRIN on y (the rows are written in year order) keeps a period's pages only.
 *
 * Owned by this build, outside the nightly 503 window: the processing runner
 * calls it after the site reopens (infra/prod/process-nightly.sh), while
 * readers keep the names-first search. It is never stale: the state row
 * (marts.source_search_state) names the file nodes of both marts it read
 * (TRUNCATE gives a table a new one, so the next night's load makes it not
 * ready at once) and the table it wrote, which the web checks in each
 * drawer's own snapshot (apps/web/lib/ask/source-search.ts) before reading it.
 * Built beside the live table and swapped in one short transaction. Unlogged,
 * as the state: a crash empties both (then not ready, never wrong), and they
 * write no WAL; the nightly dump leaves out its rows (rebuilt each night).
 */
export const SOURCE_SEARCH_TABLE = "source_search";

/** The folded text of a row, per mart: the drawer's condition of today, column for column of the union. */
export const SOURCE_SEARCH_TEXT = {
  da: "lower(unaccent(concat_ws(' ', da_code, authority_name, supplier_name, cpv_name, cpv_code, county, sicap_da_id::text)))",
  contracts: "lower(unaccent(concat_ws(' ', contract_no, authority_name, supplier_name, cpv_name, cpv_code, county, contract_id::text)))",
} as const;

export interface SourceSearchReport {
  rows: number;
  fillMs: number;
  trigramMs: number;
  brinMs: number;
  analyzeMs: number;
  swapMs: number;
  tableBytes: number;
  trigramBytes: number;
  brinBytes: number;
}

const year = (column: string) => `case when ${column} ~ '^[0-9]{4}' then substr(${column}, 1, 4)::smallint end`;

/**
 * Builds marts.source_search from the marts as they are, then swaps it in.
 * Reads both marts under a SHARE lock (readers go on; a load waits), so the
 * file nodes in the state are those of the rows written. The swap takes
 * ACCESS EXCLUSIVE on the state and the old table for a moment; a reader in
 * the middle of a drawer holds them, so the swap waits for it (lock_timeout,
 * retried). Never inside the nightly window: run it with the site open.
 */
export async function buildSourceSearch(sql: DbSql, opts: { log?: (message: string) => void } = {}): Promise<SourceSearchReport> {
  const log = opts.log ?? (() => {});
  const ms = (started: number) => Date.now() - started;
  await sql`drop table if exists marts.source_search_next`;
  let started = Date.now();
  const nodes = await sql.begin("isolation level repeatable read", async (q) => {
    await q`lock table marts.da_transactions, marts.contract_transactions in share mode`;
    await q.unsafe(`
      create unlogged table marts.source_search_next (
        src text not null, ref_id bigint not null, sid bigint not null, y smallint, t text not null
      )`);
    // Year order, for the BRIN; within a year by CPV code, so the records of a code's digits (the usual number
    // fragment) lie on few pages: a search reads every row of each page that holds one (the BRIN's pages are lossy).
    await q.unsafe(`
      insert into marts.source_search_next (src, ref_id, sid, y, t)
      select src, ref_id, sid, y, t from (
        select 'da'::text src, sicap_da_id ref_id, 0::bigint sid, ${year("finalization_date")} y, cpv_code, ${SOURCE_SEARCH_TEXT.da} t
        from marts.da_transactions
        union all
        select 'contracts', contract_id, supplier_id, ${year("finalization_date")}, cpv_code, ${SOURCE_SEARCH_TEXT.contracts}
        from marts.contract_transactions
      ) x order by y nulls first, cpv_code nulls first, src, ref_id, sid`);
    const [row] = await q`
      select pg_relation_filenode('marts.da_transactions')::text da, pg_relation_filenode('marts.contract_transactions')::text ctx,
             (select count(*) from marts.source_search_next)::text n`;
    return row as unknown as { da: string; ctx: string; n: string };
  });
  const fillMs = ms(started);
  log(`source search: ${nodes.n} rows in ${fillMs} ms`);
  started = Date.now();
  await sql.unsafe(`create index source_search_next_trgm_idx on marts.source_search_next using gin (t gin_trgm_ops) with (fastupdate = off)`);
  const trigramMs = ms(started);
  log(`source search: trigram index ${trigramMs} ms`);
  started = Date.now();
  await sql.unsafe(`create index source_search_next_y_idx on marts.source_search_next using brin (y)`);
  const brinMs = ms(started);
  started = Date.now();
  await sql`analyze marts.source_search_next`;
  const analyzeMs = ms(started);
  started = Date.now();
  for (let attempt = 1; ; attempt++) {
    try {
      await sql.begin(async (q) => {
        await q`set local lock_timeout = '5s'`;
        await q.unsafe(`
          create unlogged table if not exists marts.source_search_state (
            search_rel oid not null, da_node oid not null, ctx_node oid not null, rows bigint not null, built_at timestamptz not null
          )`);
        await q`lock table marts.source_search_state in access exclusive mode`;
        await q`drop table if exists marts.source_search`;
        await q`alter table marts.source_search_next rename to source_search`;
        await q`alter index marts.source_search_next_trgm_idx rename to source_search_trgm_idx`;
        await q`alter index marts.source_search_next_y_idx rename to source_search_y_idx`;
        await q`delete from marts.source_search_state`;
        await q`
          insert into marts.source_search_state (search_rel, da_node, ctx_node, rows, built_at)
          values ('marts.source_search'::regclass, ${nodes.da}::oid, ${nodes.ctx}::oid, ${nodes.n}::bigint, clock_timestamp())`;
      });
      break;
    } catch (e) {
      if (attempt >= 12 || !(e instanceof Error) || !/lock timeout/.test(e.message)) throw e;
      log(`source search: swap waits for a reader (attempt ${attempt})`);
    }
  }
  const swapMs = ms(started);
  const [size] = await sql`
    select pg_relation_size('marts.source_search')::text t, pg_relation_size('marts.source_search_trgm_idx')::text g,
           pg_relation_size('marts.source_search_y_idx')::text b`;
  const report = { rows: Number(nodes.n), fillMs, trigramMs, brinMs, analyzeMs, swapMs,
    tableBytes: Number(size!.t), trigramBytes: Number(size!.g), brinBytes: Number(size!.b) };
  log(`source search: ${JSON.stringify(report)}`);
  return report;
}

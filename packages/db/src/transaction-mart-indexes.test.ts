import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { TRANSACTION_MART_BUILD_INDEXES, TRANSACTION_MART_INDEXES } from './transaction-mart-indexes.js';

const migrations = new URL('../migrations/', import.meta.url);
const statements = (file: string) => readFileSync(new URL(file, migrations), 'utf8')
  .split('--> statement-breakpoint')
  .map(part => part.split('\n').filter(line => !line.startsWith('--')).join('\n').trim())
  .filter(Boolean);

describe('covering indexes of the transaction marts (marts audit, 24 October 2026)', () => {
  it('keeps the eight production names, one table each', () => {
    // pg_stat_user_indexes on production, 24 October 2026 (scratchpad marts-audit q04).
    expect(TRANSACTION_MART_INDEXES.map(index => index.name)).toEqual([
      'da_tx_county_date_idx', 'da_tx_county_ent_idx', 'da_tx_cpv_idx', 'da_tx_cpv_val_idx',
      'ctx_county_idx', 'ctx_county_ent_idx', 'ctx_cpv_idx', 'ctx_cpv_val_idx',
    ]);
    for (const index of TRANSACTION_MART_INDEXES)
      expect(index.definition.startsWith(`CREATE INDEX ${index.name} ON marts.${index.table} USING btree (`)).toBe(true);
  });

  it('creates in migration 0084 exactly what the builds recreate', () => {
    expect(statements('0084_transaction_mart_covering_indexes.sql')).toEqual(
      TRANSACTION_MART_INDEXES.map(index => `${index.definition.replace(/^CREATE INDEX /, 'CREATE INDEX IF NOT EXISTS ')};`));
  });

  it('runs 0084 after every applied migration', () => {
    const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', migrations), 'utf8')) as
      { entries: { idx: number; tag: string; when: number }[] };
    const at = journal.entries.findIndex(entry => entry.tag === '0084_transaction_mart_covering_indexes');
    expect(journal.entries[at]?.idx).toBe(84);
    // The migrator skips a migration older than the newest applied one.
    expect(journal.entries[at]!.when).toBeGreaterThan(journal.entries[at - 1]!.when);
  });

  it('keeps the covering twins out of the migrations: the DA build drops and builds them', () => {
    expect(TRANSACTION_MART_BUILD_INDEXES.map(index => index.name)).toEqual(['da_tx_supplier_cover_idx', 'da_tx_authority_cover_idx', 'da_tx_cpv_cover_idx', 'da_tx_value_desc_idx', 'da_tx_flagged_idx']);
    for (const index of TRANSACTION_MART_BUILD_INDEXES)
      expect(index.definition.startsWith(`CREATE INDEX ${index.name} ON marts.${index.table} USING btree (`)).toBe(true);
    const names = [...TRANSACTION_MART_INDEXES, ...TRANSACTION_MART_BUILD_INDEXES].map(index => index.name);
    expect(new Set(names).size).toBe(names.length);
    for (const file of readdirSync(migrations).filter(name => name.endsWith('.sql')))
      for (const index of TRANSACTION_MART_BUILD_INDEXES)
        expect(readFileSync(new URL(file, migrations), 'utf8')).not.toContain(index.name);
  });

  it('keys the value index on the negated value, so only the queries that write it read it (S5 PRE-sources)', () => {
    const value = TRANSACTION_MART_BUILD_INDEXES.find(index => index.name === 'da_tx_value_desc_idx')!;
    // pg_get_indexdef's text on the local copy (30 October 2026); not partial, so ANALYZE keeps the expression's statistics.
    expect(value.definition).toBe('CREATE INDEX da_tx_value_desc_idx ON marts.da_transactions USING btree (((- closing_value)), sicap_da_id) INCLUDE (authority_id, supplier_id)');
    expect(value.definition).not.toContain(' WHERE ');
  });

  it('adds log_total_ron in 0085, after 0084', () => {
    expect(statements('0085_entity_flags_log_total_ron.sql')).toEqual([
      'ALTER TABLE "marts"."entity_flags" ADD COLUMN "log_total_ron" numeric GENERATED ALWAYS AS (log(greatest(coalesce(total_ron, 0), 1))) STORED;']);
    const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', migrations), 'utf8')) as
      { entries: { idx: number; tag: string; when: number }[] };
    const at = journal.entries.findIndex(entry => entry.tag === '0085_entity_flags_log_total_ron');
    expect(journal.entries[at]?.idx).toBe(85);
    expect(journal.entries[at]!.when).toBeGreaterThan(journal.entries[at - 1]!.when);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AGG_MAP_COUNTY_SEAT_COLUMNS, SEAT_CLASSES } from './firm-seat.js';

const migrations = new URL('../migrations/', import.meta.url);
const statements = (file: string) => readFileSync(new URL(file, migrations), 'utf8')
  .split('--> statement-breakpoint')
  .map(part => part.split('\n').filter(line => !line.startsWith('--')).join('\n').trim())
  .filter(Boolean);

describe('firm seat, registration year and main CPV division (plan F5, 24 October 2026)', () => {
  it('splits agg_map_county by five seat classes, value and records, with and without the DA ceiling', () => {
    expect(SEAT_CLASSES).toEqual(['same', 'other', 'bucuresti', 'foreign', 'unknown']);
    expect(AGG_MAP_COUNTY_SEAT_COLUMNS.slice(0, 4)).toEqual(['v_plaf_same', 'n_plaf_same', 'v_plaf_other', 'n_plaf_other']);
    expect(AGG_MAP_COUNTY_SEAT_COLUMNS).toHaveLength(20);
    expect(AGG_MAP_COUNTY_SEAT_COLUMNS.at(-1)).toBe('n_all_unknown');
  });

  it('adds the four nullable columns in 0086, after 0085', () => {
    expect(statements('0086_firm_seat_registry_columns.sql')).toEqual([
      'ALTER TABLE "marts"."entity_flags" ADD COLUMN "main_cpv_div" text;',
      'ALTER TABLE "marts"."entity_profile" ADD COLUMN "registered_year" integer;',
      'ALTER TABLE "marts"."entity_profile" ADD COLUMN "seat_county" text;',
      'ALTER TABLE "marts"."entity_profile" ADD COLUMN "seat_source" text;',
    ]);
    const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', migrations), 'utf8')) as
      { entries: { idx: number; tag: string; when: number }[] };
    const at = journal.entries.findIndex(entry => entry.tag === '0086_firm_seat_registry_columns');
    expect(journal.entries[at]?.idx).toBe(86);
    // The migrator skips a migration older than the newest applied one.
    expect(journal.entries[at]!.when).toBeGreaterThan(journal.entries[at - 1]!.when);
  });
});

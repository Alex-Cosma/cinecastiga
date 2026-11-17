import { describe, expect, it } from 'vitest';
import { COUNTIES } from '../counties';
import { COUNTY_NEIGHBOURS, placesAround } from './around';
import type { UatRow } from './places';

// Owner, 17 November 2026 („varianta B”): the place's word offers the places around it. Rows as the registry writes them.
const ROWS: UatRow[] = [
  { siruta: 54975, name: 'MUNICIPIUL CLUJ-NAPOCA', county: 'cluj', tip: 1, population: 324576 },
  { siruta: 55259, name: 'MUNICIPIUL TURDA', county: 'cluj', tip: 4, population: 47744 },
  { siruta: 55008, name: 'MUNICIPIUL DEJ', county: 'cluj', tip: 4, population: 33497 },
  { siruta: 57706, name: 'FLOREŞTI', county: 'cluj', tip: 3, population: 22813 },
  { siruta: 55838, name: 'BACIU', county: 'cluj', tip: 3, population: null },
  { siruta: 133330, name: 'FLOREŞTI', county: 'prahova', tip: 3, population: 7000 },
  { siruta: 179132, name: 'MUNICIPIUL BUCUREŞTI', county: 'bucuresti', tip: 9, population: 0 },
];
const ids = (list: { id: string }[]) => list.map((p) => p.id);

describe('the counties beside a county', () => {
  it('names every county, each way round', () => {
    expect(Object.keys(COUNTY_NEIGHBOURS).sort()).toEqual([...COUNTIES].sort());
    for (const [a, list] of Object.entries(COUNTY_NEIGHBOURS)) {
      expect(list.length, a).toBeGreaterThan(0);
      for (const b of list) expect(COUNTY_NEIGHBOURS[b], `${a} – ${b}`).toContain(a);
    }
  });
  it('holds what the map shows', () => {
    expect(COUNTY_NEIGHBOURS['Cluj']).toEqual(['Alba', 'Bihor', 'Bistrița-Năsăud', 'Maramureș', 'Mureș', 'Sălaj']);
    expect(COUNTY_NEIGHBOURS['București']).toEqual(['Ilfov']);
    expect(COUNTY_NEIGHBOURS['Tulcea']).toEqual(['Brăila', 'Constanța', 'Galați']);
  });
});

describe('the places around a place', () => {
  it('offers a county its largest localities and the counties beside it', () => {
    const a = placesAround('county:cluj', ROWS, 3)!;
    expect(a.county).toBe('Cluj');
    expect(a.wider).toBeNull();
    expect(ids(a.inside)).toEqual(['uat:54975', 'uat:55259', 'uat:55008']);
    expect(ids(a.neighbours)).toEqual(['county:alba', 'county:bihor', 'county:bistrita-nasaud', 'county:maramures', 'county:mures', 'county:salaj']);
  });
  it('offers a locality its whole county and the other localities of it', () => {
    const a = placesAround('uat:55259', ROWS)!;
    expect(a.wider).toMatchObject({ id: 'county:cluj', name: 'Cluj', kind: 'county' });
    expect(ids(a.inside)).toEqual(['uat:54975', 'uat:55008', 'uat:57706', 'uat:55838']);
    expect(a.neighbours).toEqual([]);
  });
  it('does not narrow București, and says nothing for a place it does not know', () => {
    const b = placesAround('county:bucuresti', ROWS)!;
    expect(b.inside).toEqual([]);
    expect(ids(b.neighbours)).toEqual(['county:ilfov']);
    expect(placesAround('uat:1', ROWS)).toBeNull();
    expect(placesAround('county:nicaieri', ROWS)).toBeNull();
  });
});

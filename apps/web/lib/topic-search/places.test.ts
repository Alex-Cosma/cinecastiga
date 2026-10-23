import { describe, expect, it } from 'vitest';
import { bareName, isTie, matchKind, rankPlaces, silentChoice, withinOneEdit, type UatRow } from './places';
import type { Place } from './shared';

const counties: Place[] = ['Bihor', 'Brașov', 'Brăila', 'Buzău', 'Timiș', 'Ialomița', 'Călărași'].map((name) => ({ id: `county:${name}`, name, detail: 'Județ', kind: 'county' }));
const rows: UatRow[] = [
  { siruta: 26564, name: 'MUNICIPIUL ORADEA', county: 'bihor', tip: '1', population: 196367 },
  { siruta: 40198, name: 'MUNICIPIUL BRAŞOV', county: 'brasov', tip: '1', population: 253200 },
  { siruta: 155243, name: 'MUNICIPIUL TIMIŞOARA', county: 'timis', tip: '1', population: 250849 },
  { siruta: 44818, name: 'MUNICIPIUL BUZĂU', county: 'buzau', tip: '1', population: 115494 },
  { siruta: 45138, name: 'MĂRGĂRITEŞTI', county: 'buzau', tip: '3', population: 900 },
  { siruta: 94330, name: 'SĂLCIOARA', county: 'ialomita', tip: '3', population: 2200 },
  { siruta: 68789, name: 'SĂLCIOARA', county: 'dambovita', tip: '3', population: 2100 },
  { siruta: 100, name: 'ORADEA MICĂ', county: 'test', tip: '3', population: 10 },
];
const names = (term: string) => rankPlaces(term, counties, rows).map((p) => `${p.name}:${p.match}`);

describe('place names in "Unde cauți?"', () => {
  it('reads names without the type word and diacritics', () => {
    expect(bareName('MUNICIPIUL BRAŞOV')).toBe('brasov');
    expect(bareName('ORAŞ BUHUŞI')).toBe('buhusi');
    expect(bareName('Timiș')).toBe('timis');
  });

  it('accepts one edit and nothing more', () => {
    expect(withinOneEdit('oradia', 'oradea')).toBe(true); // substitution
    expect(withinOneEdit('timisora', 'timisoara')).toBe(true); // missing letter
    expect(withinOneEdit('brasovv', 'brasov')).toBe(true); // extra letter
    expect(withinOneEdit('bucurseti', 'bucuresti')).toBe(true); // swapped neighbours
    expect(withinOneEdit('oradiaa', 'oradea')).toBe(false);
    expect(withinOneEdit('arad', 'oradea')).toBe(false);
  });

  it('matches exact, prefix and diacritic-free spellings before anything else', () => {
    expect(matchKind('brasov', 'MUNICIPIUL BRAŞOV')).toBe('exact');
    expect(matchKind('brașov', 'MUNICIPIUL BRAŞOV')).toBe('exact');
    expect(matchKind('timisoara', 'MUNICIPIUL TIMIŞOARA')).toBe('exact');
    expect(matchKind('orad', 'MUNICIPIUL ORADEA')).toBe('prefix');
    expect(matchKind('oradia', 'MUNICIPIUL ORADEA')).toBe('fuzzy');
    expect(matchKind('xyz', 'MUNICIPIUL ORADEA')).toBeNull();
  });

  it('finds a place with a one-letter typo only when nothing matches better', () => {
    expect(names('oradia')).toEqual(['MUNICIPIUL ORADEA:fuzzy', 'ORADEA MICĂ:fuzzy']);
    expect(names('timisora')[0]).toBe('MUNICIPIUL TIMIŞOARA:fuzzy');
    // a real match hides the typo guesses
    expect(names('oradea')).toEqual(['MUNICIPIUL ORADEA:exact', 'ORADEA MICĂ:prefix']);
  });

  it('ranks the county first within a tier, then the localities of a named county', () => {
    expect(names('brasov')).toEqual(['Brașov:exact', 'MUNICIPIUL BRAŞOV:exact']);
    expect(names('buzau')).toEqual(['Buzău:exact', 'MUNICIPIUL BUZĂU:exact', 'MĂRGĂRITEŞTI:county']);
    expect(names('bra').slice(0, 2)).toEqual(['Brașov:prefix', 'Brăila:prefix']);
  });

  it('never picks silently between tied places or a typo guess', () => {
    const salcioara = rankPlaces('salcioara', counties, rows);
    expect(salcioara.map((p) => p.detail)).toEqual(['Comună · ialomita', 'Comună · dambovita']);
    expect(isTie(salcioara[0], salcioara[1])).toBe(true);
    expect(silentChoice(salcioara)).toBeNull();
    // county and city of the same name: both shown, none chosen by Enter alone
    expect(silentChoice(rankPlaces('brasov', counties, rows))).toBeNull();
    expect(silentChoice(rankPlaces('oradia', counties, rows))).toBeNull();
    expect(silentChoice(rankPlaces('oradea', counties, rows))?.name).toBe('MUNICIPIUL ORADEA');
  });
});

import { describe, expect, it } from 'vitest';
import { aliasQueries } from '../ask/entity-alias';
import { entityIntent } from './entity-intent';
import { titleTerms, titleTsquery } from './words';

// Owner probe, 10 November 2026: names, abbreviations and inflected words that found nothing.
describe('/cauta names and title words', () => {
  it('expands institution abbreviations, alone or before a place', () => {
    expect(aliasQueries('sju bacau')).toContain('spitalul judetean de urgenta bacau');
    expect(aliasQueries('dgaspc sector 2')).toContain('directia generala de asistenta sociala si protectia copilului sector 2');
    expect(aliasQueries('anaf')).toContain('agentia nationala de administrare fiscala');
    expect(aliasQueries('primaria capitalei')).toContain('municipiul bucuresti');
    expect(aliasQueries('primaria municipiului cluj napoca')).toContain('municipiul cluj napoca');
    expect(aliasQueries('primaria sectorului 1')).toContain('sectorul 1');
    // the month is not the interior ministry
    expect(aliasQueries('mai')).toEqual(['mai']);
  });

  it('reads a fiscal code written after „CUI” or „CIF”', () => {
    expect(entityIntent('CUI 6891914').cui).toBe('6891914');
    expect(entityIntent('cif RO13863739').cui).toBe('13863739');
    expect(entityIntent('Strabag').cui).toBeNull();
  });

  it('searches titles by the base of inflected words, with „sau” between alternatives', () => {
    const forms = (q: string) => titleTsquery(q).replace(/[()]/g, '').split(/ [|&] /);
    expect(forms('laptopul')).toEqual(expect.arrayContaining(['laptop', 'laptopul', 'laptopuri', 'laptopurile']));
    expect(forms('medicamentelor')).toEqual(expect.arrayContaining(['medicamente', 'medicamentele', 'medicament', 'medicamentul']));
    // explicit forms, never a prefix: „artificii” is not „artificiale”
    expect(forms('artificii')).toContain('artificii');
    expect(forms('artificii')).not.toContain('artificiale');
    expect(titleTsquery('laptopul')).not.toMatch(/:\*/);
    expect(titleTsquery('apă sau canalizare')).toMatch(/^\(apa\) \| \(\(canalizare/);
    // short words stay whole; only letters and digits reach the tsquery
    expect(titleTerms("pod & 'drop")).toEqual([[{ word: 'pod', prefix: false }, { word: 'drop', prefix: false }]]);
  });
});

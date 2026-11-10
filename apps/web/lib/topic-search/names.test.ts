import { describe, expect, it } from 'vitest';
import { aliasQueries } from '../ask/entity-alias';
import { entityIntent } from './entity-intent';
import { titleTerms, titleTsquery, trailingCounty } from './words';

// Owner probe, 10 November 2026: names, abbreviations and inflected words that found nothing.
describe('/cauta names and title words', () => {
  it('expands institution abbreviations, alone or before a place', () => {
    expect(aliasQueries('sju bacau')).toContain('spitalul judetean de urgenta bacau');
    expect(aliasQueries('dgaspc sector 2')).toContain('directia generala de asistenta sociala si protectia copilului sector 2');
    expect(aliasQueries('anaf')).toContain('agentia nationala de administrare fiscala');
    expect(aliasQueries('primaria capitalei')).toContain('municipiul bucuresti');
    expect(aliasQueries('primaria municipiului cluj napoca')).toContain('municipiul cluj napoca');
    expect(aliasQueries('primaria sectorului 1')).toContain('sectorul 1');
    // „MAI” is the interior ministry at the start of the words (the interpreter reads it only typed in capitals)
    expect(aliasQueries('mai')).toEqual(['mai', 'ministerul afacerilor interne']);
    // the shapes the registry writes: „Inspectoratul Școlar Județean Cluj”, „Inspectoratul Școlar al Jud Iași”
    expect(aliasQueries('isj iasi')).toContain('inspectoratul scolar iasi');
    // a sector's institution is registered without the city
    expect(aliasQueries('dgaspc sector 2 bucuresti')).toContain('directia generala de asistenta sociala si protectia copilului sector 2');
    // „primăria Cluj Napoca” is „MUNICIPIUL CLUJ-NAPOCA”
    expect(aliasQueries('primaria cluj napoca')).toContain('municipiul cluj-napoca');
  });

  it('reads a fiscal code written after „CUI” or „CIF”', () => {
    expect(entityIntent('CUI 6891914').cui).toBe('6891914');
    expect(entityIntent('cif RO13863739').cui).toBe('13863739');
    expect(entityIntent('Strabag').cui).toBeNull();
  });

  it('reads a county written after a name as where the name is', () => {
    expect(trailingCounty(['comuna', 'floresti', 'cluj'])).toEqual({ county: 'cluj', rest: ['comuna', 'floresti'] });
    expect(trailingCounty(['spitalul', 'judetean', 'satu', 'mare'])).toEqual({ county: 'satu mare', rest: ['spitalul', 'judetean'] });
    // the county alone, or with only a town hall's words („comuna iasi”, „municipiul iasi”), is the name searched
    expect(trailingCounty(['cluj'])).toBeNull();
    expect(trailingCounty(['comuna', 'iasi'])).toBeNull();
    expect(trailingCounty(['municipiul', 'iasi'])).toBeNull();
  });

  it('searches titles by the base of inflected words, with „sau” between alternatives', () => {
    const forms = (q: string) => titleTsquery(q).replace(/[()]/g, '').split(/ [|&] /);
    expect(forms('laptopul')).toEqual(expect.arrayContaining(['laptop', 'laptopul', 'laptopuri', 'laptopurile']));
    expect(forms('medicamentelor')).toEqual(expect.arrayContaining(['medicamente', 'medicamentele', 'medicament', 'medicamentul']));
    // explicit forms, never a prefix: „artificii” is not „artificiale”
    expect(forms('artificii')).toContain('artificii');
    expect(forms('artificii')).not.toContain('artificiale');
    expect(titleTsquery('laptopul')).not.toMatch(/:\*/);
    // a final vowel after a vowel is the word: „Buzău” is no „Buza”, „Sibiu” no „sibi”; the town hall no „școală primară”
    expect(forms('buzau')).not.toContain('buza');
    expect(forms('sibiu')).not.toContain('sibi');
    expect(forms('primaria')).toEqual(expect.arrayContaining(['primaria', 'primariei', 'primarii']));
    expect(forms('primaria')).not.toContain('primara');
    expect(forms('primaria')).not.toContain('primare');
    expect(titleTsquery('apă sau canalizare')).toMatch(/^\(apa\) \| \(\(canalizare/);
    // short words stay whole; only letters and digits reach the tsquery
    expect(titleTerms("pod & 'drop")).toEqual([[{ word: 'pod', prefix: false }, { word: 'drop', prefix: false }]]);
  });
});

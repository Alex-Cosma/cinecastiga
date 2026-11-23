import { describe, expect, it } from 'vitest';
import { countWords } from '../ask/answer-text';
import { countyHref, countyRows, entityNouns, mapTotal, type MapData } from './short-answer';

/* Owner, 23 November 2026: „Pe scurt” for the counties compared, and the number of firms or institutions asked. */
const MAP: MapData = {
  block: 'map',
  counties: [{ county: 'Bucuresti', value: 900, count: 30 }, { county: 'Cluj', value: 600, count: 50 }, { county: 'Sibiu', value: 500, count: 10 },
    { county: 'Prahova', value: 400, count: 40 }, { county: 'Tulcea', value: 0, count: 0 }],
  unknown: { value: 100, count: 5 },
  local: { population: { Bucuresti: 1800, Cluj: 600, Sibiu: 250, Prahova: 100 }, missing: ['Prahova'] },
};

describe('the counties compared, in „Pe scurt”', () => {
  it('ranks the first three by the measure asked', () => {
    expect(countyRows(MAP, 'value').map((c) => c.county)).toEqual(['Bucuresti', 'Cluj', 'Sibiu']);
    expect(countyRows(MAP, 'count').map((c) => c.county)).toEqual(['Cluj', 'Prahova', 'Bucuresti']);
    expect(countyRows(MAP, undefined).map((c) => c.county)).toEqual(['Bucuresti', 'Cluj', 'Sibiu']);
  });
  it('per inhabitant divides by the county population and leaves out a county whose council the list lacks', () => {
    const rows = countyRows(MAP, 'value_per_capita');
    expect(rows.map((c) => [c.county, c.metric])).toEqual([['Sibiu', 2], ['Cluj', 1], ['Bucuresti', 0.5]]);
    expect(countyRows({ block: 'map', counties: MAP.counties }, 'value_per_capita')).toEqual([]);
  });
  it('adds the counties up with the records no county is known for', () => {
    expect(mapTotal(MAP)).toEqual({ value: 2500, count: 135 });
    expect(mapTotal({ block: 'map', counties: [] })).toEqual({ value: 0, count: 0 });
  });
  it('links a county to its own search of the subject and the period; none without a subject', () => {
    expect(countyHref({ block: 'map', measure: 'value', filters: { cpvTerm: 'iluminat', yearFrom: 2024, yearTo: 2024 } }, 'Bistrița-Năsăud'))
      .toBe('/cauta?q=iluminat&place=county%3Abistrita-nasaud&from=2024&to=2024');
    expect(countyHref({ block: 'map', measure: 'value', filters: { cpvTerm: 'iluminat', yearFrom: 2024, yearTo: 2024, monthFrom: 12, monthTo: 12 } }, 'Satu Mare'))
      .toBe('/cauta?q=iluminat&place=county%3Asatu+mare&from=2024-12&to=2024-12');
    expect(countyHref({ block: 'map', measure: 'count', filters: {} }, 'Cluj')).toBeNull();
    expect(countyHref({ block: 'map', measure: 'value', filters: { cpvTerm: '45233000' } }, 'Cluj')).toBeNull();
  });
});

describe('how many firms or institutions, in „Pe scurt”', () => {
  it('names them by the buyers\' kind where the question names one', () => {
    expect(countWords(1019, ...entityNouns('supplier', undefined))).toBe('1.019 firme');
    expect(countWords(286, ...entityNouns('supplier', 'primarie'))).toBe('286 de firme');
    expect(countWords(1339, ...entityNouns('authority', 'primarie'))).toBe('1.339 de primării');
    expect(countWords(1, ...entityNouns('authority', 'spital'))).toBe('1 spital');
    expect(countWords(52, ...entityNouns('authority', undefined))).toBe('52 de instituții');
    expect(countWords(3, ...entityNouns('authority', 'local_admin'))).toBe('3 instituții');
  });
});

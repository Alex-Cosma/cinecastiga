import { describe, expect, it } from 'vitest';
import { memoryVocabulary } from '../intent/memory-vocabulary';
import { RulesInterpreter } from '../intent/rules';
import { FIXTURE } from '../intent/rules.fixture';
import { resultFor } from '../intent/to-spec';
import { applyInterpretation, placeId, placeMatchFor, remainingWords } from './interpretation';
import { parseTopicScope } from './shared';

const NOW = new Date('2026-10-22T12:00:00Z');
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
async function read(query: string, extra = '') {
  const scope = parseTopicScope(new URLSearchParams(`q=${encodeURIComponent(query)}${extra}`));
  const result = resultFor(await interpreter.interpret(scope.q, { now: NOW }));
  return { scope, result };
}

describe('interpretation → /cauta selection', () => {
  it('searches the subject words with the place from the words as the filter', async () => {
    const { scope, result } = await read('iluminat buzau');
    const t = applyInterpretation(scope, result);
    expect(t.applied).toEqual({ q: 'iluminat', place: 'county:buzau', from: '', to: '' });
    expect(t.fromWords.place).toEqual({ id: 'county:buzau', label: 'Județul Buzău', kind: 'county' });
    expect(t.subject).toMatchObject({ label: 'iluminat', source: 'synonym' });
    // the city is offered, never applied silently
    expect(t.placeChoices).toEqual([expect.objectContaining({ id: 'uat:44818', choice: 'Doar Municipiul Buzău', q: 'iluminat' })]);
    expect(t.sentence).toBe(result.sentence);
  });

  it('builds the short answer from the same reading, through Ask specs', async () => {
    const { scope, result } = await read('iluminat buzau');
    const t = applyInterpretation(scope, result);
    expect(t.answer?.total.spec).toMatchObject({ block: 'stat', measure: 'value', filters: { cpvTerm: 'iluminat', county: 'Buzău' } });
    expect(t.answer?.top.spec).toMatchObject({ block: 'table', dim: 'supplier', topN: 3, filters: { cpvTerm: 'iluminat', county: 'Buzău' } });
    expect(t.answer?.total.sentence).toBe('Cât valorează achizițiile pentru „iluminat” făcute de instituțiile din județul Buzău, în toți anii?');
    expect(t.answer?.href).toBe('/intreaba?q=iluminat%20buzau');
  });

  it('drops the connector before a removed place and applies a named year', async () => {
    const { scope, result } = await read('iluminat in municipiul buzau 2023');
    const t = applyInterpretation(scope, result);
    expect(t.applied).toEqual({ q: 'iluminat', place: 'uat:44818', from: '2023', to: '2023' });
    expect(t.fromWords.period).toEqual({ from: '2023', to: '2023', label: '2023' });
    expect(t.answer?.total.spec.filters).toMatchObject({ uatSiruta: 44818, yearFrom: 2023, yearTo: 2023 });
    // a locality can always widen to its county
    expect(t.placeChoices).toContainEqual(expect.objectContaining({ id: 'county:buzau', choice: 'Tot județul Buzău' }));
  });

  it('keeps a lone place or institution as a name search', async () => {
    for (const q of ['buzau', 'primaria buzau']) {
      const { scope, result } = await read(q);
      const t = applyInterpretation(scope, result);
      expect(t.applied).toEqual({ q, place: '', from: '', to: '' });
      expect(t.fromWords.place).toBeNull();
      expect(t.answer).toBeNull();
    }
  });

  it('never picks between localities of the same name', async () => {
    const { scope, result } = await read('iluminat salcioara');
    const t = applyInterpretation(scope, result);
    expect(t.placeAmbiguous).toBe(true);
    expect(t.applied.place).toBe('');
    expect(t.answer).toBeNull();
    expect(t.placeChoices.map((c) => c.id).sort()).toEqual(['uat:68789', 'uat:94330']);
    expect(t.placeChoices.every((c) => c.q === 'iluminat')).toBe(true);
  });

  it('respects a place chosen on the page and names it officially', async () => {
    const place = { id: 'uat:44818', name: 'MUNICIPIUL BUZAU', detail: 'Municipiu · buzau', kind: 'locality' as const };
    const { scope, result } = await read('asfalt', '&place=uat:44818');
    const t = applyInterpretation(scope, result, place);
    expect(t.applied).toEqual({ q: 'asfalt', place: 'uat:44818', from: '', to: '' });
    expect(t.fromWords.place).toBeNull();
    expect(t.explicitPlace).toEqual({ id: 'uat:44818', label: 'Municipiul Buzău (Buzău)', kind: 'locality' });
    expect(t.answer?.total.spec.filters).toMatchObject({ cpvTerm: 'asfalt', uatSiruta: 44818 });
    // explicit filters are not in the words: the full answer is the spec itself
    expect(t.answer?.href).toMatch(/^\/intreaba\?spec=/);
  });

  it('applies no place when other words are left unexplained or name a firm or institution', async () => {
    for (const q of ['drumuri si poduri buzau', 'drumuri si poduri', 'apa nova bucuresti', 'apa nova', 'spitalul judetean buzau', 'piata romana bucuresti']) {
      const { scope, result } = await read(q);
      const t = applyInterpretation(scope, result);
      expect(t.applied, q).toEqual({ q, place: '', from: '', to: '' });
      expect(t.fromWords.place, q).toBeNull();
      expect(t.answer, q).toBeNull();
      expect(t.placeChoices, q).toEqual([]);
    }
    // a firm read in the words, or unexplained words, leave no subject reading at all
    for (const q of ['apa nova bucuresti', 'spitalul judetean buzau', 'piata romana bucuresti']) {
      const { scope, result } = await read(q);
      expect(applyInterpretation(scope, result).subject, q).toBeNull();
    }
  });

  it('shows in chips every scope of the short answer, or gives no answer', async () => {
    const after = await read('iluminat dupa 2020');
    const t1 = applyInterpretation(after.scope, after.result, null, new Date('2026-10-22T12:00:00Z'));
    expect(t1.applied).toEqual({ q: 'iluminat', place: '', from: '2021', to: '2026' });
    expect(t1.fromWords.period?.label).toBe('din 2021');
    expect(t1.answer?.total.spec.filters).toMatchObject({ cpvTerm: 'iluminat', yearFrom: 2021 });
    expect(t1.answer?.total.spec.filters.yearTo).toBeUndefined();
    const sector = await read('iluminat sector 3');
    const t2 = applyInterpretation(sector.scope, sector.result);
    expect(t2.answer).toBeNull();
    expect(t2.note).toMatch(/Sectorul 3/);
    const schools = await read('laptopuri scoala');
    const t3 = applyInterpretation(schools.scope, schools.result);
    expect(t3.kind).toEqual({ label: 'școlile', withoutQ: 'laptopuri' });
    expect(t3.answer?.total.spec.filters).toMatchObject({ authorityKind: 'scoala' });
  });

  it('does not read a fragment of a catalogue word as a subject', async () => {
    const { result } = await read('iluminat');
    const scope = parseTopicScope(new URLSearchParams('q=construct'));
    const weak = { ...result, interpretation: { ...result.interpretation, text: 'construct', subjects: [{ term: '45247110-4', label: 'Construcţie de canale', cpvName: 'Construcţie de canale', source: 'catalog' as const, matched: { text: 'construct', from: 0, to: 1 } }] } };
    const t = applyInterpretation(scope, weak);
    expect(t.subject).toBeNull();
    expect(t.answer).toBeNull();
  });

  it('returns the words unchanged without an interpretation or for another text', async () => {
    const { scope, result } = await read('iluminat buzau');
    expect(applyInterpretation(scope, null).applied.q).toBe('iluminat buzau');
    const other = parseTopicScope(new URLSearchParams('q=drumuri'));
    expect(applyInterpretation(other, result).applied).toEqual({ q: 'drumuri', place: '', from: '', to: '' });
  });
});

describe('word plumbing', () => {
  it('removes spans with their leading connectors', () => {
    expect(remainingWords('iluminat în Buzău', [{ from: 2, to: 3 }])).toBe('iluminat');
    expect(remainingWords('asfaltare din judetul Buzau 2022', [{ from: 3, to: 4 }, { from: 4, to: 5 }])).toBe('asfaltare');
    expect(remainingWords('Buzău iluminat', [{ from: 0, to: 1 }])).toBe('iluminat');
    expect(remainingWords('medicamentele din Buzău', [{ from: 2, to: 3 }], { from: 0, to: 1, text: 'medicamente' })).toBe('medicamente');
  });
  it('maps places to /cauta filters; sectors have none', () => {
    expect(placeId({ kind: 'county', county: 'Caraș-Severin' })).toBe('county:caras-severin');
    expect(placeId({ kind: 'locality', county: 'Buzău', siruta: 44818, tip: 'municipiu' })).toBe('uat:44818');
    expect(placeId({ kind: 'locality', county: 'București', siruta: 179141, tip: 'sector' })).toBeNull();
  });
  it('names a picker place as the interpreter does', () => {
    expect(placeMatchFor({ id: 'county:bucuresti', name: 'București', detail: 'Municipiul București', kind: 'county' })).toMatchObject({ county: 'București', name: 'Municipiul București' });
    expect(placeMatchFor({ id: 'uat:94330', name: 'SALCIOARA', detail: 'Comună · ialomita', kind: 'locality' })).toMatchObject({ siruta: 94330, county: 'Ialomița', name: 'Comuna Sălcioara', label: 'Comuna Sălcioara (Ialomița)' });
  });
});

import { describe, expect, it } from 'vitest';
import type { AskSpec } from '../ask/spec';
import { narrowToPart, type TopicInterpretation } from './interpretation';
import { parseTopicScope, topicParams, withoutDomain } from './shared';

// Owner, 16 November 2026 („varianta B”): one domain of the subject kept alone in „Pe scurt”.
const total = { block: 'stat', measure: 'value', filters: { cpvTerm: 'iluminat', county: 'Cluj' } } as unknown as AskSpec;
const ranking = { block: 'table', measure: 'value', dim: 'supplier', topN: 3, filters: { cpvTerm: 'iluminat', county: 'Cluj' } } as unknown as AskSpec;
const base = {
  q: 'iluminat', applied: { q: 'iluminat', place: '', from: '', to: '' }, fromWords: { place: null, period: null }, kind: null, note: null, notes: [], explicitPlace: null,
  subject: { term: 'iluminat', label: 'iluminat', cpvName: null, source: 'synonym', notes: ['Include și semnalizarea rutieră.'] }, otherSubjects: [], placeChoices: [], placeAmbiguous: false,
  sentence: null, problem: null, confidence: 'high', hasEntity: false, question: null, trusted: true, askHref: null, entityChoice: false, alsoTry: [],
  answer: {
    total: { spec: total, sentence: 'Cât s-a contractat pentru „iluminat” în județul Cluj?' },
    top: { spec: ranking, sentence: 'Ce firme câștigă achizițiile pentru „iluminat” făcute de instituțiile publice din județul Cluj, în toți anii?', kind: 'suppliers' },
    href: '/intreaba?q=iluminat', evidenceHref: '/intreaba?q=iluminat&drill=1', empty: 'Niciun contract încadrat la „iluminat” în această selecție.', domains: null, cpv: [], cpvExcluded: [],
  },
} as unknown as TopicInterpretation;
const part = { code: '34993000-4', name: 'Iluminat stradal' };

describe('a domain of the subject kept alone', () => {
  const t = narrowToPart(base, part);
  it('counts the code instead of the subject, in the same place and period', () => {
    expect(t.answer!.total.spec.filters).toEqual({ cpvTerm: '34993000-4', county: 'Cluj' });
    expect(t.answer!.top!.spec.filters).toEqual({ cpvTerm: '34993000-4', county: 'Cluj' });
    expect(base.answer!.total.spec.filters.cpvTerm).toBe('iluminat');
  });
  it('names the domain in the sentences and in the empty answer', () => {
    expect(t.answer!.top!.sentence).toBe('Ce firme câștigă achizițiile pentru „Iluminat stradal” făcute de instituțiile publice din județul Cluj, în toți anii?');
    expect(t.answer!.total.sentence).toContain('„Iluminat stradal”');
    expect(t.answer!.empty).toContain('„Iluminat stradal”');
  });
  it('sends the code to Întreabă and to the records, never the typed words', () => {
    expect(t.answer!.href).toMatch(/^\/intreaba\?spec=/);
    expect(t.answer!.evidenceHref).toMatch(/^\/intreaba\?spec=.*&drill=1$/);
    expect(t.answer!.href).not.toContain('q=iluminat');
  });
  it('keeps the subject the words named and says which domain is kept', () => {
    expect(t.subject).toMatchObject({ term: 'iluminat', label: 'iluminat', chosen: '34993000-4' });
  });
  it('leaves a reading without a short answer as it is', () => {
    expect(narrowToPart({ ...base, answer: null }, part).subject?.chosen).toBeUndefined();
  });
});

describe('the domain in the address', () => {
  it('is read, written back and dropped for another search', () => {
    const scope = parseTopicScope(new URLSearchParams('q=iluminat&domeniu=34993000-4'));
    expect(scope.domain).toBe('34993000-4');
    expect(topicParams(scope).get('domeniu')).toBe('34993000-4');
    expect(topicParams(withoutDomain(scope)).has('domeniu')).toBe(false);
  });
  it('is refused when it is not a CPV code, and ignored without words', () => {
    expect(() => parseTopicScope(new URLSearchParams('q=iluminat&domeniu=abc'))).toThrow('Domeniul ales nu este un cod CPV.');
    expect(parseTopicScope(new URLSearchParams('domeniu=34993000-4')).domain).toBeUndefined();
  });
});

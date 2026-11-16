import { describe, expect, it } from 'vitest';
import { partNotes, partOf, relatedSubjects, subtreePrefix, type TermRow } from './subject-parts';

// Owner, 16 November 2026 („varianta B”): the word's menu says what the subject counts and what lies near it.
const row = (term: string, prefix: string, extra: Partial<TermRow> = {}): TermRow => ({ term, prefix, exclude: false, ...extra });
const NOTE = 'Include și semnalizarea rutieră.';
const ROWS: TermRow[] = [
  row('iluminat', '34993000'), row('iluminat', '34928500'), row('iluminat', '31527200'), row('iluminat', '45316000', { note: NOTE }), row('iluminat', '50232000', { note: NOTE }),
  row('iluminat public', '34993000'), row('iluminat public', '34928500'), row('iluminat public', '31527200'), row('iluminat public', '45316000'),
  row('iluminat festiv', '31522000'), row('iluminat de craciun', '31522000'), row('iluminat de sarbatori', '31522000'),
  row('semaforizare', '45316212'), row('semaforizare', '50232200'), row('semaforizare', '34996100'),
  row('sistem de semaforizare', '45316212'), row('sistem de semaforizare', '50232200'), row('sistem de semaforizare', '34996100'),
  row('drumuri', '45233000'), row('lucrari de drumuri', '45233000'), row('lucrari drumuri', '45233000'),
  row('reparatii drumuri', '45233141'), row('reparatii drumuri', '45233142'), row('reabilitare drumuri', '45233251'), row('reabilitare drumuri', '45233223'),
  row('deszapezire', '90620000'), row('lucrari de instalatii', '45300000'), row('medicamente', '33600000'), row('medicamente', '33690000', { exclude: true }),
];

describe('the domains of a subject', () => {
  it('reads a counted class as its name and code', () => {
    expect(partOf('Iluminat exterior (31527200-8)')).toEqual({ code: '31527200-8', name: 'Iluminat exterior', pick: true });
    expect(partOf('Iluminat exterior')).toBeNull();
  });
  it('does not let a domain be kept alone when a part of it is left out of the subject', () => {
    expect(partOf('Produse farmaceutice (33600000-6)', ['3369'])?.pick).toBe(false);
    expect(partOf('Iluminat stradal (34993000-4)', ['3369'])?.pick).toBe(true);
  });
  it('matches a code by its sub-tree', () => {
    expect(subtreePrefix('45233000-9')).toBe('45233');
    expect(subtreePrefix('50232200')).toBe('502322');
  });
  it('keeps for one domain only the notes written about it', () => {
    expect(partNotes('iluminat', partOf('Iluminat stradal (34993000-4)')!, ROWS)).toEqual([]);
    expect(partNotes('iluminat', partOf('Lucrări de instalare (45316000-5)')!, ROWS)).toEqual([NOTE]);
  });
});

describe('the subjects around a subject', () => {
  it('offers what overlaps it or carries its word, once per set of domains', () => {
    expect(relatedSubjects('iluminat', ROWS)).toEqual([{ term: 'iluminat festiv', kind: 'near' }, { term: 'semaforizare', kind: 'near' }]);
  });
  it('does not offer a selection of the domains it already lists', () => {
    expect(relatedSubjects('iluminat', ROWS).map((x) => x.term)).not.toContain('iluminat public');
  });
  it('offers the narrower subjects of a single domain, never its other names', () => {
    expect(relatedSubjects('drumuri', ROWS)).toEqual([{ term: 'reparatii drumuri', kind: 'narrower' }, { term: 'reabilitare drumuri', kind: 'narrower' }]);
  });
  it('does not relate subjects through a word every term has', () => {
    expect(relatedSubjects('lucrari de drumuri', ROWS).map((x) => x.term)).not.toContain('lucrari de instalatii');
  });
  it('does not take a longer word for a form of a shorter one', () => {
    const rows = [...ROWS, row('medic dentist', '85130000'), row('oxigen medical', '24111900')];
    expect(relatedSubjects('medicamente', rows)).toEqual([]);
  });
  it('says nothing for a word that is not a curated subject', () => {
    expect(relatedSubjects('altceva', ROWS)).toEqual([]);
  });
});

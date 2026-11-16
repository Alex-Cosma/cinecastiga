import { describe, expect, it } from 'vitest';
import { markParts, placeSentence, placeTexts } from './sentence';

describe('„Am înțeles” as one sentence (UX audit Z1-03)', () => {
  it('marks the subject, the place and the period where the interpreter wrote them', () => {
    const s = 'Ce firme câștigă achizițiile pentru „asfaltare” făcute de instituțiile publice din județul Buzău, în 2024?';
    const { segments, missing } = markParts(s, [
      { key: 'subject', texts: ['„asfaltare”'] },
      { key: 'place', texts: placeTexts('Județul Buzău') },
      { key: 'period', texts: ['2024'] },
    ]);
    expect(missing).toEqual([]);
    expect(segments.filter((x) => x.key).map((x) => [x.key, x.text])).toEqual([['subject', '„asfaltare”'], ['place', 'județul Buzău'], ['period', '2024']]);
    expect(segments.map((x) => x.text).join('')).toBe(s);
  });

  it('finds a locality after „primăria” or „instituțiile din”, and says which parts it could not find', () => {
    const s = 'Ce firme câștigă achizițiile pentru „drumuri” făcute de instituțiile din Cisnădie (Sibiu), în 2023?';
    const { segments, missing } = markParts(s, [
      { key: 'place', texts: placeTexts('Orașul Cisnădie (Sibiu)') },
      { key: 'kind', texts: ['școlile'] },
    ]);
    expect(segments.find((x) => x.key === 'place')?.text).toBe('Cisnădie (Sibiu)');
    expect(missing).toEqual(['kind']);
  });

  it('never marks the same words twice', () => {
    const { segments } = markParts('Buzău în Buzău', [{ key: 'a', texts: ['Buzău'] }, { key: 'b', texts: ['Buzău'] }]);
    expect(segments).toEqual([{ text: 'Buzău', key: 'a' }, { text: ' în ' }, { text: 'Buzău', key: 'b' }]);
  });

  it('says a place named alone as a statement', () => {
    expect(placeSentence('Cât valorează achizițiile făcute de instituțiile publice din județul Cluj, în toți anii?')).toBe('Achizițiile făcute de instituțiile publice din județul Cluj, în toți anii.');
    expect(placeSentence('Ce firme câștigă?')).toBeNull();
    expect(placeTexts('Municipiul București')).toEqual(['București']);
  });
});

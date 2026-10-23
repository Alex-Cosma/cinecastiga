import { describe, expect, it } from 'vitest';
import { relatedSubjects, relatedWord } from './related';

describe('"Subiect apropiat" suggestions', () => {
  it('never starts from a question or connector word', () => {
    expect(relatedWord('cine ia banii oradea')).toBe('oradea');
    expect(relatedWord('cât a costat podu oradea')).toBe('podu');
    expect(relatedWord('firme smechere oradea')).toBe('smechere');
    expect(relatedWord('cine cat ce unde ia a pe la din de firme strada primaria')).toBe('');
    expect(relatedWord('Primăria Brașov parcuri și spații verzi')).toBe('brasov');
    // too short to be a real word match
    expect(relatedWord('eco gardn')).toBe('gardn');
    expect(relatedWord('eco')).toBe('');
  });

  it('keeps only names with a word that starts with the typed word', () => {
    // "cine" is inside "Porcine", "Clavecine": not a match
    expect(relatedSubjects('cine', ['Porcine', 'Clavecine', 'Piele de porcine', 'Camere cinematografice'])).toEqual([]);
    expect(relatedSubjects('cat', ['Cătușe', 'Catifea'])).toEqual([]);
    // "eco" inside "decorticat" is not a match, and three letters are below the threshold
    expect(relatedSubjects('eco', ['Orez decorticat', 'Ecologizare'])).toEqual([]);
    expect(relatedSubjects('gardn', ['Orez decorticat', 'Garduri'])).toEqual([]);
    expect(relatedSubjects('ilumin', ['Iluminat stradal', 'Echipament de iluminat', 'Laminate'])).toEqual(['Iluminat stradal', 'Echipament de iluminat']);
    expect(relatedSubjects('spatii', ['Spații verzi', 'Spatule'])).toEqual(['Spații verzi']);
  });
});

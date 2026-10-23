import { STOPWORDS } from '../intent/text';
import { fold } from './shared';

/**
 * "Subiect apropiat" on an empty /cauta: subjects whose name shares a real
 * word with what was typed. Client-safe. Question and connector words never
 * lead a suggestion ("cine" → "Porcine", "cat" → "Cătușe"), and a catalogue
 * name qualifies only when one of its words starts with the typed word
 * ("eco" inside "decorticat" is not a match).
 */

/** Words that ask or connect, never a subject of their own. Folded (no diacritics). */
const NOT_A_SUBJECT = new Set([
  'cine', 'cat', 'cata', 'cate', 'cati', 'catu', 'ce', 'care', 'unde', 'cand', 'cum', 'de', 'ia', 'iau', 'luat', 'luate', 'primit', 'primesc',
  'castiga', 'castigat', 'castigate', 'castigatori', 'cheltuit', 'cheltuie', 'cheltuiesc', 'cheltuieli', 'costat', 'costa', 'costul', 'platit', 'plateste', 'facut', 'face', 'fac', 'dat', 'da', 'dau',
  'bani', 'banii', 'banilor', 'banul', 'lei', 'suma', 'sume', 'valoare', 'valoarea', 'total', 'totalul',
  'firma', 'firme', 'firmele', 'firmelor', 'firmei', 'companie', 'companii', 'companiile', 'furnizor', 'furnizori', 'furnizorii', 'societate', 'societati',
  'primaria', 'primariei', 'primarie', 'primarii', 'primariile', 'institutie', 'institutii', 'institutiile', 'consiliul', 'consiliu', 'judetul', 'judet', 'judetean', 'municipiul', 'municipiu', 'orasul', 'oras', 'comuna', 'sectorul', 'sector',
  'strada', 'str', 'strazi', 'anul', 'anii', 'an', 'luna', 'contract', 'contracte', 'contractele', 'contractul', 'achizitie', 'achizitii', 'achizitiile', 'licitatie', 'licitatii', 'licitatiile',
  'mai', 'mult', 'multi', 'multe', 'cel', 'cea', 'cei', 'cele', 'toate', 'toti', 'tot',
]);

/** The first typed word that can lead a subject suggestion, or '' when none can. */
export function relatedWord(q: string): string {
  for (const raw of fold(q).split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 4 || /^\d+$/.test(raw)) continue;
    if (NOT_A_SUBJECT.has(raw) || STOPWORDS.has(raw)) continue;
    return raw;
  }
  return '';
}

/**
 * Suggestions that pass the similarity threshold: a word of the name starts
 * with the typed word and the typed word covers at least half of it
 * ("ilumin" → "iluminat", never "cine" → "cinematografice").
 */
export function relatedSubjects(word: string, names: string[]): string[] {
  const w = fold(word).trim();
  if (w.length < 4 || NOT_A_SUBJECT.has(w) || STOPWORDS.has(w)) return [];
  return names.filter((name) => fold(name).split(/[^\p{L}\p{N}]+/u).some((part) => part.startsWith(w) && w.length * 2 >= part.length));
}

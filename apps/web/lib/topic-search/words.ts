import { STOPWORDS, fold as foldText, stems, tokenize } from '../intent/text';
import type { PlaceMatch, Span, SubjectMatch } from '../intent/types';
import { fold } from './shared';
import { COUNTIES } from '../counties';

/** Client-safe word plumbing shared by /cauta and the home search suggestions. */

/** Words left next to a removed place or period: "iluminat în Buzău" → "iluminat". */
const CONNECTOR = new Set(['in', 'din', 'la', 'pe', 'pentru', 'de', 'judetul', 'judet', 'anul', 'anii', 'intre', 'si', 'pana', 'incepand', 'dupa', 'inainte']);

/** /cauta place id for an interpreted place. București sectors have no /cauta filter: null. */
export function placeId(p: Pick<PlaceMatch, 'kind' | 'county' | 'siruta' | 'tip'>): string | null {
  if (p.kind === 'county') return `county:${fold(p.county)}`;
  if (p.tip === 'sector' || !p.siruta) return null;
  return `uat:${p.siruta}`;
}

/**
 * The question without the given spans and the connectors that led into them.
 * `base` rewrites one span with its base form ("medicamentele" → "medicamente"),
 * so the whole-word title search finds the subject as titles spell it.
 */
export function remainingWords(text: string, spans: Pick<Span, 'from' | 'to'>[], base?: Pick<Span, 'from' | 'to' | 'text'>): string {
  const tokens = tokenize(text);
  const removed = new Array<boolean>(tokens.length).fill(false);
  for (const s of spans) {
    for (let k = s.from; k < s.to && k < tokens.length; k++) removed[k] = true;
    for (let k = s.from - 1; k >= 0 && !removed[k] && CONNECTOR.has(tokens[k]!.f); k--) removed[k] = true;
  }
  if (base && base.to - base.from === 1 && base.from < tokens.length && !removed[base.from] && /^\p{L}+$/u.test(base.text))
    tokens[base.from] = { ...tokens[base.from]!, raw: base.text };
  const kept = tokens.filter((_, k) => !removed[k]);
  // a trailing connector ("iluminat in" once the place is gone) carries nothing
  while (kept.length && CONNECTOR.has(kept.at(-1)!.f)) kept.pop();
  while (kept.length && CONNECTOR.has(kept[0]!.f)) kept.shift();
  return kept.map((t) => t.raw).join(' ');
}

/** Question words the interpreter reads as the question itself, not as a subject or a name. */
const QUESTION_WORDS = new Set(['cine', 'cat', 'cata', 'cate', 'cati', 'cel', 'cea', 'mai', 'firme', 'firmele', 'firmelor', 'firma', 'companii', 'companiile', 'furnizori', 'furnizorii', 'institutii', 'institutiile', 'total', 'totalul']);

/**
 * The subject words of a question once its place/period spans are removed,
 * and whether that reading is clean: every other word is a connector or a
 * question word. "drumuri si poduri buzau" with the place "Poduri" leaves
 * "buzau" unexplained, so it is not clean and no place is applied.
 */
export function subjectWords(
  text: string,
  { remove, keep, base }: { remove: Pick<Span, 'from' | 'to'>[]; keep: Pick<Span, 'from' | 'to'>[]; base?: Pick<Span, 'from' | 'to' | 'text'> | undefined },
): { words: string; clean: boolean } {
  const tokens = tokenize(text);
  const removed = new Array<boolean>(tokens.length).fill(false);
  for (const s of remove) for (let k = s.from; k < s.to && k < tokens.length; k++) removed[k] = true;
  const covered = new Array<boolean>(tokens.length).fill(false);
  for (const s of keep) for (let k = s.from; k < s.to && k < tokens.length; k++) covered[k] = true;
  if (base && base.to - base.from === 1 && base.from < tokens.length && /^\p{L}+$/u.test(base.text))
    tokens[base.from] = { ...tokens[base.from]!, raw: base.text };
  let clean = true;
  const words: string[] = [];
  tokens.forEach((t, k) => {
    if (removed[k]) return;
    if (covered[k]) { words.push(t.raw); return; }
    // "și" joins two subjects ("drumuri și poduri"): what it joins is not a place to apply
    if (t.f === 'si' || (!CONNECTOR.has(t.f) && !STOPWORDS.has(t.f) && !QUESTION_WORDS.has(t.f))) clean = false;
  });
  return { words: words.join(' '), clean };
}

const wordsOf = (s: string) => foldText(s).split(/[^a-z0-9]+/).filter(Boolean);

/**
 * A catalogue subject matched only on a fragment of a word ("construct" →
 * "Construcţie de canale") is a weak reading: the person is more likely
 * typing a name. Curated synonyms, whole catalogue words and their
 * inflections ("medicamentele" → "medicamente") are not weak.
 */
export function weakSubject(s: Pick<SubjectMatch, 'source' | 'matched' | 'cpvName' | 'label'>): boolean {
  if (s.source !== 'catalog') return false;
  // a CPV code typed as such ("45233140", "45233140-2") is the person's own choice of domain
  if (/^\d{8}(?:[\s-]\d)?$/.test(s.matched.text.trim())) return false;
  // Both directions (search probe, 12 November 2026): the label's own inflection counts too, so „gunoi” is a whole
  // word of „colectarea gunoiului” and „pacienți” of „transportul pacienților”.
  const label = new Set(wordsOf(s.cpvName ?? s.label).flatMap((w) => stems(w)));
  return wordsOf(s.matched.text).some((w) => !typedForms(w).some((b) => label.has(b)));
}

/** A typed word and its bases, plus the singular of a plural in -i/-e („pacienti” → „pacient”), for weakSubject only. */
function typedForms(w: string): string[] {
  const out = stems(w);
  if (w.length >= 6 && /[ie]$/.test(w)) out.push(w.slice(0, -1));
  return out;
}

/**
 * The title search's words in whole-word mode: „ sau ” separates alternatives („apă sau canalizare”), and a word of
 * five letters or more matches by its shortest base as a prefix, so „laptopul” finds „laptop” and „laptopuri” and
 * „medicamentelor” finds „medicamente” (owner probe, 10 November 2026: inflected words found nothing). Folded,
 * letters and digits only, so the terms are safe inside a tsquery.
 */
/**
 * Words a title need not repeat (re-judging, 10 November 2026): „camere de supraveghere” required „de” and missed a
 * third of the titles („camere supraveghere video”), „lucrări de drumuri” 9%. Kept when they are all the words.
 */
const CONNECTORS = new Set(['de', 'din', 'si', 'cu', 'la', 'pe', 'pentru', 'in', 'a', 'al', 'ale', 'ai', 'prin', 'privind']);
const titleWords = (part: string): string[] => {
  const words = fold(part).split(/[^a-z0-9]+/).filter(Boolean);
  const content = words.filter((w) => !CONNECTORS.has(w));
  return content.length ? content : words;
};

export function titleTerms(q: string): { word: string; prefix: boolean }[][] {
  return q.split(/\s+sau\s+/i)
    .map((part) => titleWords(part).map((w) => {
      if (w.length < 5) return { word: w, prefix: false };
      const base = stems(w).reduce((a, b) => (b.length < a.length ? b : a));
      return { word: base.length >= 4 ? base : w, prefix: true };
    }))
    .filter((part) => part.length);
}

/** Words whose forms the endings would confuse with another word: the town hall („primăria”) is no „școală primară”. */
const IRREGULAR: string[][] = [
  ['primaria', 'primarie', 'primariei', 'primarii', 'primariile', 'primariilor'],
];

/** Romanian noun endings: a base and these are the forms a title may hold („laptop”, „laptopul”, „laptopuri”…). */
const ENDINGS = ['', 'a', 'e', 'i', 'ul', 'ului', 'le', 'lor', 'ele', 'elor', 'ii', 'ilor', 'uri', 'urile', 'urilor', 'ea', 'ei', 'ile', 'iei', 'ie'];

/**
 * The forms of one typed word that a title may hold: its bases (with and without a final vowel) and their endings.
 * Explicit forms, not a prefix: „artificii” must not find „artificiale” (owner probe re-judging, 10 November 2026).
 */
export function wordForms(word: string): string[] {
  // a short plural in -i is its singular too („pomi” → „Pom de Crăciun”; re-judging, 10 November 2026)
  if (word.length === 4 && /[^aeiou]i$/.test(word)) return [word, ...['', 'ul', 'ului', 'ii', 'ilor'].map((e) => word.slice(0, 3) + e)];
  if (word.length < 5) return [word];
  const irregular = IRREGULAR.find((forms) => forms.includes(word));
  if (irregular) return irregular;
  const bases = new Set<string>([word, ...stems(word)]);
  // a final vowel after a consonant is an ending („scoala” → „scoal”); after a vowel it is the word („Buzău”, „Sibiu”,
  // „Bacău” are not „buza”, „sibi”, „baca”; re-judging, 10 November 2026)
  for (const b of [...bases]) if (/[^aeiou][aeiu]$/.test(b) && b.length > 4) bases.add(b.slice(0, -1));
  const out = new Set<string>();
  for (const b of bases) for (const e of ENDINGS) if (b.length >= 4) out.add(b + e);
  return [...out];
}

/** `titleTerms` as a Postgres tsquery for the 'simple' configuration ('' when there is nothing to search). */
export function titleTsquery(q: string): string {
  return q.split(/\s+sau\s+/i)
    .map(titleWords)
    .filter((words) => words.length)
    .map((words) => `(${words.map((w) => { const forms = wordForms(w); return forms.length === 1 ? forms[0] : `(${forms.join(' | ')})`; }).join(' & ')})`)
    .join(' | ');
}

/** County names as name words („satu mare”, „bistrita nasaud”), folded, longest first. */
const COUNTY_WORDS = COUNTIES.map((c) => ({ county: fold(c).replace(/[^a-z]+/g, ' ').trim(), words: fold(c).split(/[^a-z]+/).filter(Boolean) })).sort((a, b) => b.words.length - a.words.length);
/**
 * „Primăria Florești Cluj”: the county written after a name is where it is, not a word of the name (registry names rarely
 * carry it): the name without it, in that county (re-judging, 10 November 2026: 179 near names, Florești Mehedinți first).
 */
export function trailingCounty(words: string[]): { county: string; rest: string[] } | null {
  for (const c of COUNTY_WORDS) {
    const n = c.words.length;
    if (words.length <= n || words.slice(-n).join(' ') !== c.words.join(' ')) continue;
    const rest = words.slice(0, -n);
    // „comuna Iași”, „municipiul Iași” (a town hall's registered shapes): the county is the name, not where it is
    return rest.some((w) => !GENERIC_NAME_WORDS.has(w)) ? { county: c.county, rest } : null;
  }
  return null;
}
/** Words of every institution's name: alone beside a county they name nothing in it. */
const GENERIC_NAME_WORDS = new Set(['comuna', 'municipiul', 'orasul', 'oras', 'primaria', 'judetul', 'consiliul', 'judetean', 'sectorul', 'sector', 'local']);

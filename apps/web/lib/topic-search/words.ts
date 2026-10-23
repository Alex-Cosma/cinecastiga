import { STOPWORDS, fold as foldText, stems, tokenize } from '../intent/text';
import type { PlaceMatch, Span, SubjectMatch } from '../intent/types';
import { fold } from './shared';

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
  const label = new Set(wordsOf(s.cpvName ?? s.label));
  return wordsOf(s.matched.text).some((w) => !label.has(w) && !stems(w).some((b) => label.has(b)));
}

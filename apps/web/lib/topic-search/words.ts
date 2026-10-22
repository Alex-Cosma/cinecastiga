import { tokenize } from '../intent/text';
import type { PlaceMatch, Span } from '../intent/types';
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

/** The question without the given spans and the connectors that led into them. */
export function remainingWords(text: string, spans: Pick<Span, 'from' | 'to'>[]): string {
  const tokens = tokenize(text);
  const removed = new Array<boolean>(tokens.length).fill(false);
  for (const s of spans) {
    for (let k = s.from; k < s.to && k < tokens.length; k++) removed[k] = true;
    for (let k = s.from - 1; k >= 0 && !removed[k] && CONNECTOR.has(tokens[k]!.f); k--) removed[k] = true;
  }
  const kept = tokens.filter((_, k) => !removed[k]);
  // a trailing connector ("iluminat in" once the place is gone) carries nothing
  while (kept.length && CONNECTOR.has(kept.at(-1)!.f)) kept.pop();
  while (kept.length && CONNECTOR.has(kept[0]!.f)) kept.shift();
  return kept.map((t) => t.raw).join(' ');
}

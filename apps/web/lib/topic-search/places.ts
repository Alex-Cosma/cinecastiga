import { fold, type Place, type PlaceMatchKind } from './shared';

/**
 * "Unde cauți?" suggestions. The catalogue is small (about 3,200 UATs and 42
 * counties), so names are matched in memory: without diacritics ("brasov" =
 * "Brașov"), exact and prefix matches first, and a one-letter typo
 * ("oradia" → Oradea) only when nothing matches better. Client-safe pure
 * functions; the server loads the rows.
 */

export interface UatRow { siruta: number | string; name: string; county: string; tip: string | number | null; population: number | string | null }

const TIER: Record<PlaceMatchKind, number> = { exact: 0, prefix: 1, word: 2, contains: 3, county: 4, fuzzy: 5 };
const LOCAL_LIMIT = 14;
const TIP_LABEL: Record<string, string> = { 1: 'Municipiu', 2: 'Oraș', 3: 'Comună', 4: 'Municipiu', 9: 'Municipiu' };

/** "MUNICIPIUL ORADEA" → "oradea", "ORAŞ BUHUŞI" → "buhusi", "Brașov" → "brasov". */
export function bareName(name: string): string {
  return fold(name).trim().replace(/\s+/g, ' ').replace(/^(municipiul|orasul|oras|comuna|sectorul) /, '');
}

/** True when one edit (insert, delete, substitute or swap two neighbours) turns a into b. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // substitution
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // swap
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

const words = (s: string) => s.split(/[\s-]+/).filter(Boolean);

/** How a typed word matches a place name, best first; null when it does not. */
export function matchKind(word: string, name: string): Exclude<PlaceMatchKind, 'county'> | null {
  const w = fold(word).trim().replace(/\s+/g, ' ');
  if (!w) return null;
  const bare = bareName(name), full = fold(name).trim();
  if (bare === w || full === w) return 'exact';
  if (bare.startsWith(w) || full.startsWith(w)) return 'prefix';
  if (words(bare).some((x) => x.startsWith(w))) return 'word';
  if (full.includes(w)) return 'contains';
  // a one-letter typo, on the whole name, one of its words, or what has been typed so far
  if (w.length >= 4) {
    const targets = [bare, ...words(bare)];
    if (w.length >= 5) targets.push(...[bare, ...words(bare)].map((x) => x.slice(0, w.length)));
    if (targets.some((x) => x.length >= 3 && withinOneEdit(w, x))) return 'fuzzy';
  }
  return null;
}

type Ranked = Place & { match: PlaceMatchKind; population: number; order: number };

const localPlace = (r: UatRow): Place => ({ id: `uat:${r.siruta}`, name: r.name, detail: `${TIP_LABEL[String(r.tip)] ?? 'Localitate'} · ${r.county}`, kind: 'locality' });

/**
 * Counties and localities for the typed text, best match first: exact, prefix,
 * a word of the name, anywhere in the name, every locality of a named county,
 * then one-letter typos (only when nothing matched better). Counties lead
 * within a tier. Same-tier places with the same name stay side by side; the
 * picker never chooses between them on its own (`isTie`).
 */
export function rankPlaces(term: string, counties: Place[], rows: UatRow[]): Place[] {
  const w = fold(term.trim()).slice(0, 100);
  if (w.length < 2) return counties.filter((p) => fold(p.name).includes(w)).slice(0, 8);
  const out: Ranked[] = [];
  counties.forEach((p, order) => {
    const m = matchKind(w, p.name);
    if (m) out.push({ ...p, match: m, population: Number.MAX_SAFE_INTEGER, order });
  });
  for (const r of rows) {
    const m = matchKind(w, r.name) ?? (fold(r.county) === w ? 'county' : null);
    if (m) out.push({ ...localPlace(r), match: m, population: Number(r.population ?? 0) || 0, order: Number(r.siruta) });
  }
  const strong = out.some((p) => TIER[p.match] <= TIER.word);
  const kept = strong ? out.filter((p) => p.match !== 'fuzzy') : out;
  kept.sort((a, b) => TIER[a.match] - TIER[b.match] || (a.kind === b.kind ? 0 : a.kind === 'county' ? -1 : 1) || b.population - a.population || a.order - b.order);
  const countyHits = kept.filter((p) => p.kind === 'county'), localHits = kept.filter((p) => p.kind === 'locality').slice(0, LOCAL_LIMIT);
  const shown = new Set([...countyHits, ...localHits]);
  return kept.filter((p) => shown.has(p)).map(({ population: _p, order: _o, ...p }) => p);
}

/**
 * Two suggestions the picker must not choose between by itself: the same
 * match quality and the same name (two "Sălcioara", or Brașov county and
 * city), or two typo guesses.
 */
export function isTie(a: Place | undefined, b: Place | undefined): boolean {
  if (!a || !b || a.match !== b.match) return false;
  return a.match === 'fuzzy' || bareName(a.name) === bareName(b.name);
}

/** Enter pressed before the list was seen: only a clear, untied, non-typo match is chosen. */
export function silentChoice(places: Place[]): Place | null {
  const [first, second] = places;
  if (!first || first.match === 'fuzzy' || isTie(first, second)) return null;
  return first;
}

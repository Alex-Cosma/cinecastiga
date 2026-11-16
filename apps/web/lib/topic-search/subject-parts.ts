/*
 * What a curated subject counts, and what lies near it (owner, 16 November 2026: the menu of a subject on /cauta said
 * only „Nu e un subiect: caută exact cuvintele scrise”, as if the reader had made a mistake by pressing our own
 * example). The word's menu now says which CPV domains the subject counts, lets the reader keep one of them, and offers
 * the curated subjects around it. Pure: the route reads the rows (app/api/topic-search/interpretation).
 */

/** One CPV domain a subject counts. `pick`: it can be counted alone by its code (no sub-tree of it is left out). */
export interface SubjectPart { code: string; name: string; pick: boolean }
/** A curated subject beside this one: inside one of its domains (`narrower`) or overlapping it / named like it (`near`). */
export interface RelatedSubject { term: string; label: string; kind: 'narrower' | 'near' }
/** A row of reference.cpv_synonym, its term folded. */
export interface TermRow { term: string; prefix: string; exclude: boolean; note?: string | null }

/** A code's sub-tree prefix: its digits without the trailing zeros („45233000-9” → „45233”), as the engine matches. */
export function subtreePrefix(code: string): string {
  const bare = code.split('-')[0]!, stripped = bare.replace(/0+$/, '');
  return stripped.length >= 2 ? stripped : bare.slice(0, 2);
}

/** „Iluminat exterior (31527200-8)”, as the engine names a counted class → its name and code. */
export function partOf(label: string, excludePrefixes: readonly string[] = []): SubjectPart | null {
  const m = /^(.*) \((\d{8}-\d)\)$/.exec(label);
  if (!m) return null;
  const prefix = subtreePrefix(m[2]!);
  return { code: m[2]!, name: m[1]!, pick: !excludePrefixes.some((x) => x.startsWith(prefix)) };
}

/** Words every other curated term has too: sharing one says nothing about the subject. */
const GENERIC = new Set([
  'lucrari', 'lucrare', 'servicii', 'serviciu', 'produse', 'produs', 'echipament', 'echipamente', 'material', 'materiale', 'reparatii', 'reparatie',
  'intretinere', 'reabilitare', 'modernizare', 'constructie', 'constructii', 'achizitie', 'achizitii', 'furnizare', 'sistem', 'sisteme', 'instalatii',
  'instalare', 'piese', 'public', 'publica', 'publice', 'pentru', 'altele', 'diverse',
]);
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const words = (term: string) => (fold(term).match(/\p{L}+/gu) ?? []).filter((w) => w.length >= 4 && !GENERIC.has(w));
/** „drumuri” and „drumul”, „iluminat” and „iluminare”: the same word in another form. */
const sameWord = (a: string, b: string) => {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  // the common start is the word, what follows is an ending („medic” is not „medicamente”)
  return n >= Math.min(5, a.length, b.length) && Math.max(a.length, b.length) - n <= 3;
};

/**
 * The curated subjects around `term`: those wholly inside one of its domains („reparații drumuri” for „drumuri”), and
 * those that overlap it or carry its word („semaforizare”, „iluminat festiv” for „iluminat”). Another name for the same
 * domains is not offered, nor a selection of the domains the menu already lists; terms that count the same thing are
 * offered once, by their shortest name.
 */
export function relatedSubjects(term: string, rows: readonly TermRow[], max = 4): Omit<RelatedSubject, 'label'>[] {
  const byTerm = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.exclude) continue;
    const set = byTerm.get(r.term) ?? new Set<string>();
    set.add(subtreePrefix(r.prefix));
    byTerm.set(r.term, set);
  }
  const key = fold(term), own = byTerm.get(key);
  if (!own) return [];
  const ownWords = words(key);
  const seen = new Map<string, { term: string; kind: 'narrower' | 'near'; named: boolean }>();
  for (const [other, set] of byTerm) {
    if (other === key) continue;
    const list = [...set];
    // the same domains, or some of the domains the menu lists already
    if (list.every((p) => own.has(p))) continue;
    const inside = (p: string) => [...own].some((o) => p.startsWith(o));
    const narrower = list.every(inside), overlaps = list.some(inside);
    const named = words(other).some((w) => ownWords.some((o) => sameWord(w, o)));
    if (!narrower && !overlaps && !named) continue;
    const kind = narrower ? 'narrower' as const : 'near' as const;
    const id = list.sort().join(','), had = seen.get(id);
    if (!had || (named && !had.named) || (named === had.named && other.length < had.term.length)) seen.set(id, { term: other, kind, named });
  }
  const rank = (a: { term: string; named: boolean }, b: { term: string; named: boolean }) => Number(b.named) - Number(a.named) || a.term.length - b.term.length || a.term.localeCompare(b.term);
  const all = [...seen.values()];
  return (['narrower', 'near'] as const).flatMap((kind) => all.filter((x) => x.kind === kind).sort(rank).slice(0, max).map((x) => ({ term: x.term, kind })));
}

/** The notes of the rows that count `part` (a domain kept alone says only what is about it). */
export function partNotes(term: string, part: SubjectPart, rows: readonly TermRow[]): string[] {
  const key = fold(term), prefix = subtreePrefix(part.code);
  return [...new Set(rows.filter((r) => r.term === key && !r.exclude && r.note && subtreePrefix(r.prefix) === prefix).map((r) => r.note!))];
}

/**
 * „Am înțeles” on /cauta is one sentence (UX audit Z1-03, 16 November 2026): the interpreter's own words, with the parts
 * the person can change (the subject, the place, the period, the buyers) marked in place. Pure: the page draws them.
 */

/** A run of the sentence: plain text, or the text of one part. */
export type Segment<K extends string> = { text: string; key?: K };

/**
 * The sentence cut at its parts. Each part lists the texts it may appear as, best first; the first occurrence that does
 * not overlap a part already found is taken. Parts not found are returned in `missing`, so the page can still offer them.
 */
export function markParts<K extends string>(sentence: string, parts: { key: K; texts: string[] }[]): { segments: Segment<K>[]; missing: K[] } {
  const taken: { from: number; to: number; key: K }[] = [];
  const missing: K[] = [];
  const free = (from: number, to: number) => taken.every((r) => to <= r.from || from >= r.to);
  for (const part of parts) {
    let hit: { from: number; to: number } | null = null;
    for (const text of part.texts) {
      if (!text) continue;
      for (let at = sentence.indexOf(text); at >= 0 && !hit; at = sentence.indexOf(text, at + 1)) if (free(at, at + text.length)) hit = { from: at, to: at + text.length };
      if (hit) break;
    }
    if (hit) taken.push({ ...hit, key: part.key });
    else missing.push(part.key);
  }
  taken.sort((a, b) => a.from - b.from);
  const segments: Segment<K>[] = [];
  let cursor = 0;
  for (const r of taken) {
    if (r.from > cursor) segments.push({ text: sentence.slice(cursor, r.from) });
    segments.push({ text: sentence.slice(r.from, r.to), key: r.key });
    cursor = r.to;
  }
  if (cursor < sentence.length) segments.push({ text: sentence.slice(cursor) });
  return { segments, missing };
}

const lowerFirst = (s: string) => s.charAt(0).toLocaleLowerCase('ro-RO') + s.slice(1);

/**
 * How a place's chip label appears in an interpreter sentence: „Județul Buzău” as „județul Buzău”; a locality
 * („Orașul Cisnădie (Sibiu)”) after „primăria” or „instituțiile din” as „Cisnădie (Sibiu)”, or its bare name.
 */
export function placeTexts(label: string): string[] {
  if (label === 'Municipiul București') return ['București'];
  const bare = label.replace(/^(?:Municipiul|Orașul|Comuna)\s+/, '');
  const name = bare.replace(/\s*\([^)]*\)$/, '');
  return [...new Set([lowerFirst(label), label, bare, name])];
}

/** A place named alone („Cluj”): what „Pe scurt” counts, as a statement („Achizițiile făcute de … , în toți anii.”). */
export function placeSentence(totalSentence: string): string | null {
  const m = /^Cât valorează achizițiile (făcute de .+)\?$/.exec(totalSentence);
  return m ? `Achizițiile ${m[1]}.` : null;
}

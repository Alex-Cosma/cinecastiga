/*
 * The written form of a subject stored without diacritics (bug of the UX audit, zone 2, 16 November 2026: the title
 * said „lucrari drumuri” while the interpretation said „lucrări de drumuri”). The curated synonyms are stored folded;
 * an answer brings the spelling of its subject's words (/api/ask `spelling`, from the CPV catalogue's labels,
 * lib/intent/spelling.ts) and the page keeps them, so the title, the builder's sentence and the pills write them.
 * No database import: client and server code share it.
 */

const known = new Map<string, string>();

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("ro-RO");

/** Keeps the written forms an answer brought (folded word → written word). */
export function learnTermSpelling(words: Readonly<Record<string, string>> | null | undefined): void {
  if (!words) return;
  for (const [key, written] of Object.entries(words)) if (fold(written) === key) known.set(key, written);
}

/** A term's words in their written form where known; a word typed with diacritics or in capitals stays as it is. */
export function spellTerm(text: string): string {
  if (!known.size) return text;
  return text.replace(/\p{L}+/gu, (word) => (word === fold(word) ? known.get(word) : undefined) ?? word);
}

/** The words of a term that have a written form in `spelling`, for an answer to bring. */
export function termSpelling(term: string, spelling: ReadonlyMap<string, string>): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const word of term.match(/\p{L}+/gu) ?? []) {
    const written = word === fold(word) ? spelling.get(word) : undefined;
    if (written) out[word] = written;
  }
  return Object.keys(out).length ? out : null;
}

/** Tests only. */
export function forgetTermSpelling(): void { known.clear(); }

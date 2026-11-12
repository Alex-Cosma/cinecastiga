import { STOPWORDS, fold } from "./intent/text";

/**
 * What the home box sends to the names search (search probe, 12 November 2026). Meilisearch drops words from the end of
 * the text until something matches, so the whole question „cine face cel mai mulți bani din psihoterapie” came back as
 * the firms named CINE…, and „servicii de psihoterapie” as every firm named „Servicii…”. A question, or a subject
 * phrase that starts with a generic head, is reduced to the words that could be part of a name and must match all of
 * them; plain text (a name being typed) goes as it is.
 */
const QUESTION_WORDS = new Set(["cine", "ce", "cat", "cata", "cati", "cate", "care", "unde", "cum", "cand", "cel", "cea", "cei", "cele", "mai"]);
const GENERIC_HEADS = new Set(["servicii", "serviciu", "lucrari", "lucrare", "produse", "produs", "furnizare", "livrare", "achizitie",
  "achizitii", "achizitionare", "cumparare", "echipamente", "materiale", "reparatii", "intretinere"]);
// The interpreter's stopwords (connectors, question verbs, generic procurement nouns) and a few forms they lack.
const FILLER = new Set([...STOPWORDS, "cheltuit", "cheltuita", "cheltuite", "platit", "platite", "castigat", "castigata", "mare", "mari",
  "firma", "firme", "firmele", "institutie", "institutii", "institutia"]);

export type NamesQuery = { q: string; allWords: boolean };

/** The names search for a typed text, or null when nothing in it could be part of a name. */
export function namesQuery(text: string): NamesQuery | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const folded = words.map((w) => fold(w).replace(/[^a-z0-9-]/g, ""));
  // „mai”, „cel”… alone are not a question (names hold them); a question word is.
  const question = text.includes("?") || folded.some((w) => ["cine", "ce", "cat", "cata", "cati", "cate", "care", "unde", "cum", "cand"].includes(w));
  const subjectPhrase = words.length >= 2 && GENERIC_HEADS.has(folded[0]!);
  if (!question && !subjectPhrase) return { q: text.trim(), allWords: false };
  const kept = words.filter((_, i) => {
    const w = folded[i]!;
    return w.length > 1 && !QUESTION_WORDS.has(w) && !GENERIC_HEADS.has(w) && !FILLER.has(w);
  });
  return kept.length ? { q: kept.join(" ").replace(/\?/g, ""), allWords: true } : null;
}

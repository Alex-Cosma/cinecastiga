/**
 * A name written all in capitals, as the source has it, in ordinary capitals (UX audit Z4-27, the comparison's title):
 * „ASOCIATIA DE DEZVOLTARE INTERCOMUNITARA” → „Asociatia de Dezvoltare Intercomunitara”. A name with any small letter
 * is kept as it is; a short one (an acronym) too. Display only: links and searches keep the source's name.
 */
const SMALL_WORDS = new Set(["de", "din", "a", "al", "ale", "și", "si", "la", "pe", "cu", "în", "in", "pentru", "lui", "sub"]);

export function softName(name: string): string {
  if (/\p{Ll}/u.test(name) || !/\p{Lu}{3}/u.test(name)) return name;
  return name.toLocaleLowerCase("ro-RO").replace(/(^|[\s\-("„])(\p{L}+)/gu, (all, sep: string, word: string, at: number) =>
    at > 0 && SMALL_WORDS.has(word) ? all : sep + word.charAt(0).toLocaleUpperCase("ro-RO") + word.slice(1));
}

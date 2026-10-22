import { lev } from "../ask/intent";

/**
 * Text plumbing for the rules interpreter. Every pattern is written in plain
 * ASCII over folded text ("până", "pînă" and "pana" are the same string by
 * the time a rule sees them), the convention of lib/ask/intent.ts.
 */

const COMBINING = /[̀-ͯ]/g;

/** Diacritic-fold + lowercase. ș/ş, ț/ţ, ă, â and î fold to their base letter. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(COMBINING, "").toLowerCase();
}

export interface Token {
  /** As typed. */
  raw: string;
  /** Folded, [a-z0-9] only. */
  f: string;
}

/** Words and numbers; punctuation and hyphens separate tokens ("s-a" → "s", "a"). */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const raw of text.split(/[^\p{L}\p{N}]+/u)) {
    if (!raw) continue;
    const f = fold(raw).replace(/[^a-z0-9]/g, "");
    if (f) out.push({ raw, f });
  }
  return out;
}

/**
 * Words with no subject meaning of their own: connectors, pronouns, auxiliary
 * verbs and the generic nouns of any procurement question. They are never
 * reported as "not understood".
 */
export const STOPWORDS = new Set([
  "a", "ai", "al", "ale", "am", "ar", "as", "au", "avea", "are", "aici", "acest", "aceasta", "acesta", "acestei", "acestui", "acolo", "acum",
  "asa", "asta", "astea", "atat", "atata", "atatea", "atatia", "ca", "care", "catre", "ce", "cea", "cei", "cel", "cele", "celor", "cu", "cum",
  "da", "dar", "daca", "de", "deci", "despre", "din", "dintre", "doar", "e", "ei", "el", "ea", "este", "eu", "fi", "fie", "fost", "i", "ii",
  "il", "imi", "in", "intr", "intre", "la", "le", "li", "lui", "mai", "ma", "mi", "mie", "mult", "multa", "multe", "multi", "multor",
  "ne", "nici", "noi", "nu", "o", "ori", "pe", "pentru", "prin", "sa", "se", "si", "sunt", "sau", "spre", "sub", "s", "te", "tot", "toata",
  "toate", "toti", "tu", "un", "una", "unei", "unor", "unui", "unde", "vreau", "vrea", "vreu", "va", "vor", "voi", "stiu", "aflu", "afla",
  "vad", "vezi", "arata", "aratami", "spune", "spunemi", "spuneti", "te", "rog", "va", "putea", "poti", "puteti", "pot", "ma", "intereseaza",
  "imi", "si", "nostru", "noastra", "nostri", "noastre", "meu", "mea", "mei", "mele", "lor", "sai", "sale", "sau", "lucru", "lucruri",
  // generic procurement nouns: the question is always about these
  "achizitie", "achizitii", "achizitiile", "achizitiilor", "achizitia", "achizitiei", "contract", "contracte", "contractele", "contractelor",
  "contractul", "contractului", "bani", "banii", "banilor", "banul", "public", "publici", "publice", "publica", "publicul", "statul", "stat",
  "lei", "ron", "euro", "suma", "sume", "sumele", "valoare", "valori", "valoarea", "date", "datele", "informatii", "lista", "listele",
  "chestii", "ceva", "fel", "tip", "tipuri", "anul", "ani", "anii", "anului", "luna", "luni", "perioada", "perioadei",
  "cumparat", "cumparate", "cumparata", "cumparati", "facut", "facute", "facuta", "dat", "date", "dati", "data", "luat", "luate",
  // verbs that only restate the question once its cue is understood
  "cumpara", "cumpar", "cumparam", "cheltuie", "cheltuiesc", "cheltuieste", "castiga", "castigat", "castigate", "primeste", "primesc",
  "primit", "livreaza", "vinde", "vand", "face", "fac", "ia", "iau", "lucreaza", "lucreza", "achizitioneaza", "plateste", "platit",
]);

/** Ordinal/cardinal words a person may spell out ("primele cinci", "ultimii trei ani"). */
export const NUMBER_WORDS: Record<string, number> = {
  unu: 1, unul: 1, una: 1, doi: 2, doua: 2, trei: 3, patru: 4, cinci: 5, sase: 6, sapte: 7, opt: 8, noua: 9, zece: 10,
  cincisprezece: 15, douazeci: 20, treizeci: 30, cincizeci: 50,
};

/**
 * Inflected Romanian noun → base forms worth trying against a vocabulary
 * ("iluminatul" → "iluminat", "medicamentele" → "medicamente",
 * "deszăpezirea" → "deszapezire"). Bounded, never shorter than 4 letters.
 */
export function stems(word: string): string[] {
  const out = new Set<string>([word]);
  const strip = (suffix: string, min = 4, add = "") => {
    if (word.endsWith(suffix) && word.length - suffix.length >= min) out.add(word.slice(0, -suffix.length) + add);
  };
  strip("urilor");
  strip("ilor");
  strip("elor", 4, "e");
  strip("ului");
  strip("ul");
  strip("lui");
  strip("le");
  strip("lor");
  strip("iei", 4, "ie");
  strip("ii", 4, "i");
  strip("ea", 4, "e");
  strip("a", 5);
  strip("ile", 4, "i");
  // plural -e: "lemne" → "lemn" (only as an extra candidate; the word itself is tried too)
  strip("e", 4);
  return [...out];
}

/**
 * Does a typed word name a vocabulary word? Exact, inflected (the typed word
 * extends the base by a short ending) or one/two typos on long words.
 */
export function wordMatches(typed: string, base: string): boolean {
  if (typed === base) return true;
  if (base.length >= 4 && typed.startsWith(base) && typed.length - base.length <= 4) return true;
  // "laptop" for "laptopuri"; "medicament" for "medicamente"
  if (typed.length >= 5 && base.startsWith(typed) && base.length - typed.length <= 3) return true;
  const budget = Math.min(typed.length, base.length) >= 9 ? 2 : Math.min(typed.length, base.length) >= 6 ? 1 : 0;
  if (!budget) return false;
  if (lev(typed, base, budget) <= budget) return true;
  // typo plus inflection: "iluminatu" ~ "iluminat", "medicamentel" ~ "medicamente"
  return typed.length > base.length && lev(typed.slice(0, base.length), base, budget) <= budget && typed.length - base.length <= 3;
}

/** Title-case a registry name, keeping Romanian diacritics ("MUNICIPIUL BUZĂU" → "Municipiul Buzău"). */
export function titleCase(name: string): string {
  return name
    .toLocaleLowerCase("ro-RO")
    .replace(/(^|[\s\-(])(\p{L})/gu, (_m, pre: string, ch: string) => pre + ch.toLocaleUpperCase("ro-RO"));
}

/** Join tokens [from, to) as typed, for display. */
export function rawSpan(tokens: Token[], from: number, to: number): string {
  return tokens.slice(from, to).map((t) => t.raw).join(" ");
}

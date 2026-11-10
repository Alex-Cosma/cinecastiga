import { fold } from "./text";

/**
 * Romanian spelling for words stored without diacritics (owner, 10 November 2026: /cauta wrote „Deszapezire”,
 * „Dializa”, „Paza”). The curated synonyms (reference.cpv_synonym) are stored folded; the label a person reads takes
 * each word's written form from the CPV catalogue (its most frequent form there, with ş/ţ written ș/ț), plus the few
 * words of the curated list the catalogue does not have. A word the catalogue writes mostly without diacritics
 * („paturi”, not „pături”) stays as it is.
 */
const NOT_IN_CATALOGUE: Record<string, string> = {
  mentenanta: "mentenanță",
  orasului: "orașului",
  sarbatori: "sărbători",
  scoala: "școala",
  scoli: "școli",
  strazi: "străzi",
  stapan: "stăpân",
  licente: "licențe",
  rasaduri: "răsaduri",
  avocatura: "avocatură",
};

const commaBelow = (w: string) => w.replace(/ş/g, "ș").replace(/Ş/g, "Ș").replace(/ţ/g, "ț").replace(/Ţ/g, "Ț");

/** Folded word → its written form, from catalogue labels (most frequent form; none when that is the folded one). */
export function buildSpelling(labels: Iterable<string>): Map<string, string> {
  const forms = new Map<string, Map<string, number>>();
  for (const label of labels) {
    for (const raw of label.toLocaleLowerCase("ro-RO").match(/\p{L}+/gu) ?? []) {
      const word = commaBelow(raw), key = fold(word);
      const seen = forms.get(key) ?? new Map<string, number>();
      seen.set(word, (seen.get(word) ?? 0) + 1);
      forms.set(key, seen);
    }
  }
  const out = new Map<string, string>(Object.entries(NOT_IN_CATALOGUE));
  for (const [key, seen] of forms) {
    const [best] = [...seen].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]!;
    if (best !== key) out.set(key, best);
  }
  return out;
}

/** The words of `text` written without diacritics take their Romanian spelling; anything else stays as typed. */
export function spell(text: string, spelling: ReadonlyMap<string, string>): string {
  if (!spelling.size) return text;
  return text.replace(/\p{L}+/gu, (word) => {
    const lower = word.toLocaleLowerCase("ro-RO");
    if (fold(lower) !== lower) return word;
    const written = spelling.get(lower);
    if (!written) return word;
    return word === lower ? written : word[0] === word[0]!.toLocaleUpperCase("ro-RO") && word.slice(1) === lower.slice(1) ? written[0]!.toLocaleUpperCase("ro-RO") + written.slice(1) : word;
  });
}

import type { Block } from "../ask/spec";
import type { SpecPath } from "../ask/filters/types";

/*
 * The lenses of the interpreter (plan §2.7): phrases that set an option of a
 * question once its block is chosen ("au crescut" → trend.change: up). The
 * table is per block, because the same words mean another thing on another
 * question ("firme noi": trend.change new here; table.newScope, network
 * partners in later stages). Phrases, never single words: "noi" is also a
 * pronoun ("la noi în județ") and "nu mai" opens "nu mai mult de".
 *
 * The rules (rules.ts) read every phrase after the cues, over the folded
 * question, and keep its words from being read as a subject or a name;
 * to-spec.ts applies those of the chosen block that its question offers
 * and says when one does not apply. Only the keys a stage implements are
 * listed: F2 the trend's (lib/ask/filters/defs/trend.ts), F4 a comparison's shared clients;
 * S5 the selection's own filters on any question (block "*": SEAT_LENSES, KIND_WORDS, AMOUNT_LENS).
 */

export interface LensPhrase {
  /** Over folded text ("câștigă" → "castiga"), as the rules' cues. */
  re: RegExp;
  path: SpecPath;
  value: unknown;
  /**
   * The words are a cue or a modifier that already serves the other questions
   * ("au crescut" is the evolution cue, "de câte ori" the number of records):
   * there, not applying the lens needs no note.
   */
  quiet?: true;
  /** The rows the phrase names ("firme noi", "clienți noi"), when the question names no other. */
  dim?: "supplier" | "authority";
}

/**
 * A lens found in a question: its block's table, the option, the words. A
 * filter of the selection the words say on any question ("firme străine",
 * "lucrări", "peste 1 milion de lei") has the block "*": every question that
 * offers it applies it, the others say they do not.
 */
export interface LensMatch {
  block: Block | "*";
  path: SpecPath;
  value: unknown;
  matched: { text: string; from: number; to: number };
  quiet?: true;
  dim?: "supplier" | "authority";
  /** A bound typed in words ("peste 500.000 de lei"): any value the filter's rule accepts, not only its window's presets. */
  typed?: true;
}

/** Firms named before a seat's words: the seat qualifies them ("firme străine", not "instituții străine"). */
const FIRMS = String.raw`(?:firm\w*|furnizor\w*|compani\w*|societat\w*|antreprenor\w*|constructor\w*)`;

/**
 * F4 (plan §2.7 „sediu”): the firm's seat against the buyer's county, on any
 * question that offers it (a ranking of firms, "Cine conduce?" by value, the
 * partners of an institution's network or flow). "din județ" only as a
 * phrase without a county's name after it: "firme din județul Cluj" stays the
 * buyers' place (R9: "din" is the institution's place). On "Cine conduce?"
 * and the cloud a named county is the seat (F6b, F6c): not read here.
 */
export const SEAT_LENSES: readonly LensPhrase[] = [
  { re: new RegExp(String.raw`\b${FIRMS} (?:locale|locali|din judet(?!ul\b)|din judetul (?:lor|respectiv|institutiei|institutiilor)|din acelasi judet|cu sediul in (?:acelasi judet|judetul (?:lor|respectiv|institutiei)))\b`), path: "filters.firmSeat", value: "same" },
  { re: /\b(?:din|cu sediul in|cu sediul din) (?:alt judet|alte judete|afara judetului)\b/, path: "filters.firmSeat", value: "other" },
  { re: new RegExp(String.raw`\b(?:${FIRMS} (?:straine|straini|din strainatate)|(?:cu sediul|cu sediul social) (?:in|din) strainatate)\b`), path: "filters.firmSeat", value: "abroad" },
];

/**
 * F3 (plan §2.7 „tip”): "lucrări", "servicii", "produse" on their own, beside
 * no subject ("lucrări de asfaltare" is the road works, rules.ts subjects):
 * the purchase kind. "lucrări" stays a retired domain (RETIRED_TERMS) for a
 * link's cpvTerm, so it is never a guessed domain.
 */
export const KIND_WORDS: Readonly<Record<string, "lucrari" | "servicii" | "produse">> = {
  lucrari: "lucrari", lucrare: "lucrari", lucrarile: "lucrari", lucrarilor: "lucrari",
  servicii: "servicii", serviciu: "servicii", serviciile: "servicii", serviciilor: "servicii",
  produse: "produse", produs: "produse", produsele: "produse", produselor: "produse",
};

/** "mii", "milion", "mld.": a magnitude's factor; plain lei without. */
const MAGNITUDE: Readonly<Record<string, number>> = {
  mie: 1e3, mii: 1e3, mil: 1e6, milion: 1e6, milioane: 1e6, milioanele: 1e6, mld: 1e9, miliard: 1e9, miliarde: 1e9,
};
const AMOUNT_NUMBER = String.raw`(\d{1,3}(?: \d{3})+|\d+(?: \d{1,2})?|un|o|una|doua|doi|trei|cinci|zece|suta)`;
const AMOUNT_WORDS: Readonly<Record<string, number>> = { un: 1, o: 1, una: 1, doi: 2, doua: 2, trei: 3, cinci: 5, zece: 10, suta: 100 };
/**
 * F3 (plan §2.7 „mărime”): the size of each purchase written in words, "peste
 * 1 milion de lei" (purchaseValueMin) or "sub 10.000 lei" (purchaseValueMax),
 * over the folded text, where "1.000.000" is "1 000 000" and "2,5" "2 5". A
 * number needs lei or a magnitude ("peste 2000" alone may be a year). An
 * entity's total is not a purchase's size: "au cheltuit peste 10 milioane",
 * "a câștigat peste …" are not read.
 */
export const AMOUNT_LENS = new RegExp(String.raw`(?<!\b(?:cheltuit|cheltuie|cheltuiesc|castigat|castiga|incasat|primit|totalizat|insumat|adunat)(?: \w+)?\s)\b(?:de )?(peste|mai mari de|mai mare de|de minimum|sub|mai mici de|mai mica de|de maximum)\s+${AMOUNT_NUMBER}(?:\s+(?:de\s+)?(mie|mii|mil|milion|milioane|mld|miliard|miliarde))?(?:\s+(?:de\s+)?(lei|ron))?\b`);

/** The bound in lei of an AMOUNT_LENS match, and which end it is; null without lei or a magnitude, or under 1 leu. */
export function amountBound(m: RegExpExecArray): { end: "min" | "max"; lei: number } | null {
  const [, word, number, magnitude, lei] = m;
  if (!magnitude && !lei) return null;
  const n = AMOUNT_WORDS[number!] ?? (/^\d+ \d{1,2}$/.test(number!) ? Number(number!.replace(" ", ".")) : Number(number!.replace(/ /g, "")));
  const value = Math.round(n * (magnitude ? MAGNITUDE[magnitude]! : 1));
  if (!Number.isFinite(value) || value < 1) return null;
  return { end: /^(?:sub|mai mic)/.test(word!) || word === "de maximum" ? "max" : "min", lei: value };
}

/**
 * "au apărut cel mai des" counts how often a firm appears (a ranking by number of records, rules.ts modifiers),
 * not the new ones: the trend cue and the lens of "au apărut" stop before these words.
 */
export const NOT_MOST_OFTEN = String.raw`(?!\s+(?:cel mai (?:des|frecvent|mult)|de cele mai multe ori|cele mai multe|mai des|des|frecvent|mereu)\b)`;
/** "au ieșit câștigătoare", "a ieșit pe primul loc", "au ieșit la licitație": the winners, never the gone ones. */
const NOT_WON = String.raw`(?!\s+(?:din tipar|castigat\w*|invingat\w*|pe primul loc|primul|primii|primele|prima|in top|in frunte|la)\b)`;

const ROWS_SUPPLIER = "firme|firmele|furnizori|furnizorii|companii|companiile|societati|societatile";
const ROWS_AUTHORITY = "institutii|institutiile|clienti|clientii|cumparatori|cumparatorii|autoritati|autoritatile";

export const LENS_PHRASES: Partial<Record<Block, readonly LensPhrase[]>> = {
  trend: [
    // The trend cues of rules.ts read the same words: the cue decides the question, the lens the group.
    { re: /\b(?:(?:a|au|s a|s au) crescut|cresterea?|cresterile|cresteri|cresc)\b/, path: "trend.change", value: "up", quiet: true },
    { re: /\b(?:(?:a|au|s a|s au) scazut|scaderea?|scaderile|scaderi|scad)\b/, path: "trend.change", value: "down", quiet: true },
    { re: new RegExp(`\\b(?:${ROWS_SUPPLIER}) noi\\b`), path: "trend.change", value: "new", dim: "supplier" },
    { re: new RegExp(`\\b(?:${ROWS_AUTHORITY}) noi\\b`), path: "trend.change", value: "new", dim: "authority" },
    { re: new RegExp(String.raw`\b(?:(?:a|au) aparut${NOT_MOST_OFTEN}|(?:a|au) intrat)\b`), path: "trend.change", value: "new" },
    { re: /\b(?:pentru )?prima (?:data|oara)\b/, path: "trend.firstOnly", value: true },
    { re: new RegExp(String.raw`\b(?:nu mai (?:apar|apare|castiga|cumpara|lucreaza)|(?:a|au) disparut|(?:a|au) iesit${NOT_WON})\b`), path: "trend.change", value: "gone" },
    { re: /\b(?:procentual\w*|in procente)\b/, path: "trend.order", value: "percent" },
    // Elsewhere "de câte ori" asks for the number of records (rules.ts modifiers): on a trend, for the order in percent.
    { re: /\bde cate ori\b/, path: "trend.order", value: "percent", quiet: true },
    { re: /\b(?:pe )?aceleasi luni\b/, path: "trend.months", value: "auto" },
  ],
  // F3 (plan §2.7, §4.3): the evolution month by month, where its period fits the months' bars (timeseriesGrain); else
  // the note says it does not apply. „Pe luni” only as a phrase: „luni” alone is also Monday.
  timeseries: [
    { re: /\b(?:luna de luna|pe luni|lunar|in fiecare luna|pe fiecare luna)\b/, path: "timeseries.grain", value: "month" },
  ],
  // S5 (plan §2.7 „rețea”): the network's groups against the last complete year, its order by years, „Cu semnale”.
  // The network cue reads the same words ("cu cine nu mai lucrează"): the cue decides the question, the lens the group.
  network: [
    { re: new RegExp(`\\b(?:(?:${ROWS_SUPPLIER}|${ROWS_AUTHORITY}|parteneri|partenerii) noi|(?:a|au) inceput sa lucreze|(?:a|au) inceput colaborarea)\\b`), path: "network.partners", value: "new" },
    { re: /\b(?:inca lucreaza|(?<!\bnu )mai lucreaza|lucreaza in continuare|continua sa lucreze|(?:a|au) continuat sa lucreze)\b/, path: "network.partners", value: "continuing" },
    { re: /\b(?:nu mai lucreaza|(?:a|au) incetat sa lucreze)\b/, path: "network.partners", value: "gone" },
    { re: /\bde (?:ani de zile|cei mai multi ani)\b/, path: "network.order", value: "years" },
    { re: /\b(?:cu semnale|cu semnal oficial)\b/, path: "network.signals", value: true },
  ],
  // F4 (plan §2.7, final compare §3.4): between two firms only; between institutions the note says it does not apply.
  compare: [
    { re: /\b(?:clienti(?:i|lor)? comuni|aceiasi clienti|acelorasi clienti)\b/, path: "filters.sharedPartners", value: true },
  ],
  // F6a: the distribution's group (final distribution §7.12). "față de" stays the comparison cue's word, so the
  // phrases are the rule's own; "din județul lui" and the whole country need the entity (lib/intent/server.ts).
  distribution: [
    { re: /\b(?:de (?:aceeasi )?marimea (?:lui|ei|sa)|de acelasi tip|cu (?:o )?populatie (?:apropiata|asemanatoare|similara))\b/, path: "peers.similar", value: { similar: true } },
    { re: /\bcu (?:o )?activitate (?:apropiata|asemanatoare|similara)\b/, path: "peers.activity", value: { activity: true } },
  ],
};

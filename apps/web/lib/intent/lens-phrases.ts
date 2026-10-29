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
 * listed: F2 the trend's (lib/ask/filters/defs/trend.ts), F4 a comparison's shared clients.
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

/** A lens found in a question: its block's table, the option, the words. */
export interface LensMatch {
  block: Block;
  path: SpecPath;
  value: unknown;
  matched: { text: string; from: number; to: number };
  quiet?: true;
  dim?: "supplier" | "authority";
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

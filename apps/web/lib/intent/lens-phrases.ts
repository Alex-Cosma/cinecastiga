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
 * listed: F2 the trend's (lib/ask/filters/defs/trend.ts).
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

const ROWS_SUPPLIER = "firme|firmele|furnizori|furnizorii|companii|companiile|societati|societatile";
const ROWS_AUTHORITY = "institutii|institutiile|clienti|clientii|cumparatori|cumparatorii|autoritati|autoritatile";

export const LENS_PHRASES: Partial<Record<Block, readonly LensPhrase[]>> = {
  trend: [
    // The trend cues of rules.ts read the same words: the cue decides the question, the lens the group.
    { re: /\b(?:(?:a|au|s a|s au) crescut|cresterea?|cresterile|cresteri|cresc)\b/, path: "trend.change", value: "up", quiet: true },
    { re: /\b(?:(?:a|au|s a|s au) scazut|scaderea?|scaderile|scaderi|scad)\b/, path: "trend.change", value: "down", quiet: true },
    { re: new RegExp(`\\b(?:${ROWS_SUPPLIER}) noi\\b`), path: "trend.change", value: "new", dim: "supplier" },
    { re: new RegExp(`\\b(?:${ROWS_AUTHORITY}) noi\\b`), path: "trend.change", value: "new", dim: "authority" },
    { re: /\b(?:(?:a|au) aparut|(?:a|au) intrat)\b/, path: "trend.change", value: "new" },
    { re: /\b(?:pentru )?prima (?:data|oara)\b/, path: "trend.firstOnly", value: true },
    { re: /\b(?:nu mai (?:apar|apare|castiga|cumpara|lucreaza)|(?:a|au) disparut|(?:a|au) iesit(?! din tipar))\b/, path: "trend.change", value: "gone" },
    { re: /\b(?:procentual\w*|in procente)\b/, path: "trend.order", value: "percent" },
    // Elsewhere "de câte ori" asks for the number of records (rules.ts modifiers): on a trend, for the order in percent.
    { re: /\bde cate ori\b/, path: "trend.order", value: "percent", quiet: true },
    { re: /\b(?:pe )?aceleasi luni\b/, path: "trend.months", value: "auto" },
  ],
};

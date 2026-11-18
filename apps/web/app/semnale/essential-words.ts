import { countWords } from "../../lib/ask/answer-text";

/*
 * Esențial's form of the line under the national list of „Adunate, trec de plafon” (lib/signal-list-words.ts): the
 * score is not shown there, so the line says what the list leaves out without „nu intră în scor” (owner, 18 November
 * 2026). Complet keeps the line as it is.
 */

/** „5.848 de cazuri sub 1,2× plafonul nu sunt în listă.” */
export const underLeftOutEssential = (n: number): string =>
  n === 1 ? "Un caz sub 1,2× plafonul nu e în listă." : `${countWords(n, "caz", "cazuri")} sub 1,2× plafonul nu sunt în listă.`;

/** „Sunt incluse și cele 5.848 de cazuri sub 1,2× plafonul.” (a link with `sub=1`). */
export const underIncludedEssential = (n: number): string =>
  n === 1 ? "Este inclus și cazul sub 1,2× plafonul." : `Sunt incluse și cele ${countWords(n, "caz", "cazuri")} sub 1,2× plafonul.`;

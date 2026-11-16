import { countWords } from "./ask/answer-text";
import { HISTORIC_MONTHS, historicLeftOutWords } from "./ask/historic";

/*
 * The lines of /semnale's lists that say what a list leaves out by default and bring it back (owner, 16 November 2026).
 * The ranking by risk leaves out the inactive profiles, in the words of Întreabă (lib/ask/historic.ts); the national
 * list of „Adunate, trec de plafon” leaves out the groups under 1,2× the ceiling, which add nothing to the score.
 */

/** „1.409 profiluri inactive, fără înregistrări în ultimele 24 de luni, nu sunt în listă.” (Întreabă's line). */
export const inactiveLeftOutWords = historicLeftOutWords;

/** „Sunt incluse și cele 1.409 profiluri inactive, fără înregistrări în ultimele 24 de luni.” */
export const inactiveIncludedWords = (n: number): string =>
  n === 1 ? `Este inclus și profilul inactiv, fără înregistrări în ultimele ${HISTORIC_MONTHS} de luni.`
    : `Sunt incluse și cele ${countWords(n, "profil inactiv", "profiluri inactive")}, fără înregistrări în ultimele ${HISTORIC_MONTHS} de luni.`;

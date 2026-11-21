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

/** „5.848 de cazuri sub 1,2× plafonul nu intră în scor și nu sunt în listă.” */
export const underLeftOutWords = (n: number): string =>
  n === 1 ? "Un caz sub 1,2× plafonul nu intră în scor și nu e în listă."
    : `${countWords(n, "caz", "cazuri")} sub 1,2× plafonul nu intră în scor și nu sunt în listă.`;

/** „Sunt incluse și cele 5.848 de cazuri sub 1,2× plafonul, care nu intră în scor.” */
export const underIncludedWords = (n: number): string =>
  n === 1 ? "Este inclus și cazul sub 1,2× plafonul, care nu intră în scor."
    : `Sunt incluse și cele ${countWords(n, "caz", "cazuri")} sub 1,2× plafonul, care nu intră în scor.`;

/**
 * The national list's column heads, said once above the rows instead of on each (UX audit Z6-17): who the row is, its
 * partner, what the picture shows and the value. Empty where a pattern has no such column. From the same pattern
 * and role as the rows (lib/signals.ts signalPopulation: a pair or an acquisition names the other side).
 */
export function signalListHeads(code: string, role: "authority" | "supplier"): { entity: string; partner: string; meter: string; amount: string } {
  const award = code.startsWith("award_");
  const other = role === "authority" ? "Firma" : "Instituția";
  const partner: Record<string, string> = {
    da_split: other, da_round: other, da_above_ceiling: other, da_concentration: "Firma principală", da_dependence: "Clientul public principal",
    da_first_month: "Instituția", da_first_month_buyer: "Firma", net_shared_admin: "Instituția",
  };
  const meter: Record<string, string> = {
    da_split: "Față de plafon", da_above_ceiling: "Peste plafon", da_year_end: "Decembrie", da_concentration: "Ponderea ei",
    da_dependence: "Ponderea lui", da_first_month: "Prima achiziție", da_first_month_buyer: "Prima achiziție",
  };
  return {
    entity: award ? "Instituția" : role === "authority" ? "Instituția" : "Firma",
    partner: award ? "Câștigătorii" : partner[code] ?? "",
    meter: meter[code] ?? "",
    amount: "Valoare", // polish M3: one short word keeps its funnel on its line (the amount's tip says „înregistrată”)
  };
}

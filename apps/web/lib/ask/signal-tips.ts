import { flagEntityRule, flagLabel } from "../flags";
import { flagDetail, isRetiredScatterFlag, scatterFlagLabel, type ScatterFlagFact, type ScatterRole } from "./scatter-shared";

/*
 * What a signal's tag means, in a sentence or two, on hover or a tap (owner, 15 November 2026: every signal tag of
 * an answer explains itself, short, with the sense of the pattern). The first sentence says what the data show for
 * this kind of profile (an institution or a firm); the second, when the tag has a number after "·", what that number
 * is. The full rule stays on /metodologie (FLAG_META.entityRule).
 */

type Role = ScatterRole;
type Fact = Pick<ScatterFlagFact<string>, "code" | "years" | "share" | "single">;

const whose = (role: Role) => (role === "supplier" ? "firmei" : "instituției");

const MEANING: Readonly<Record<string, (role: Role) => string>> = {
  da_split: (role) => role === "supplier"
    ? "Aceeași instituție a cumpărat de la firmă, în același an, de cel puțin 3 ori pentru același fel de lucru: fiecare achiziție sub plafonul de la care e nevoie de licitație, toate la un loc peste el. De verificat dacă era aceeași nevoie: atunci legea cere ca valorile să fie adunate. Obligația e a instituției."
    : "Instituția a cumpărat de la aceeași firmă, în același an, de cel puțin 3 ori pentru același fel de lucru: fiecare achiziție sub plafonul de la care e nevoie de licitație, toate la un loc peste el. De verificat dacă era aceeași nevoie: atunci legea cere ca valorile să fie adunate.",
  da_round: () => "Neobișnuit de multe achiziții directe la 96–100% din plafon, chiar sub suma de la care e nevoie de licitație: de cel puțin 2 ori mai multe decât media țării. De verificat dacă sumele au fost potrivite sub prag.",
  da_above_ceiling: (role) => `Achiziții publicate ca directe, cu valoarea peste plafonul din anul lor (estimată peste el, sau peste el chiar și cu TVA). Poate fi o excepție legală sau o sumă introdusă greșit: de verificat.${role === "supplier" ? " Obligația e a instituției, nu a firmei." : ""}`,
  da_dependence: () => "Cel puțin 70% din valoarea achizițiilor directe câștigate de firmă vine de la o singură instituție. Vânzările private și contractele din licitații nu intră în calcul.",
  da_capacity: () => "Într-un an, firma a câștigat prin achiziții directe mult peste mărimea ei: de cel puțin 1,5 ori cifra de afaceri din bilanț, sau 500.000 lei fără niciun angajat. Poate fi un intermediar; de verificat cine a făcut de fapt lucrarea.",
  da_year_end: () => "Într-un an, cel puțin 35% din valoarea achizițiilor directe ale instituției s-a contractat în decembrie, mult peste instituțiile de același tip. De verificat dacă era o nevoie reală sau graba de a cheltui bugetul rămas.",
  da_concentration: () => "O singură firmă are cel puțin 60% din valoarea achizițiilor directe ale instituției, din mai multe achiziții, în cel puțin 2 ani. De verificat cum a fost aleasă și dacă existau alternative.",
  // Retired from the score on 1 November 2026: only an answer saved before shows it.
  da_rapid: () => "Achiziții directe finalizate la foarte scurt timp după publicare. Semnalul a ieșit din scor la 1 noiembrie 2026 și apare doar în răspunsurile salvate înainte.",
};

/** What the number after "·" is ("2021–2022", "99,3%", "un singur client"), in the tag's own words. */
function detailWords(fact: Fact, role: Role, detail: string): string {
  if (fact.years?.length) return `${detail}: ${fact.years.length > 1 ? "anii în care apare" : "anul în care apare"}.`;
  if (fact.single) return fact.code === "da_concentration"
    ? "O singură firmă: toate achizițiile directe ale instituției sunt cu ea."
    : "Un singur client: toate achizițiile directe ale firmei sunt cu aceeași instituție.";
  switch (fact.code) {
    case "da_round": return `${detail}: cât din achizițiile directe ale ${whose(role)} sunt imediat sub plafon.`;
    case "da_above_ceiling": return `${detail}: cât din achizițiile directe ale ${whose(role)} sunt peste plafon.`;
    case "da_rapid": return `${detail}: cât din achizițiile directe ale ${whose(role)} sunt așa.`;
    case "da_dependence": return `${detail}: partea acelei instituții.`;
    case "da_concentration": return `${detail}: partea acelei firme.`;
    default: return "";
  }
}

/**
 * The tip of a signal's tag: its label as the title and what it means for an institution or a firm, with what the
 * number after "·" is when the tag has one. A code the site no longer explains falls back on its rule, or none.
 */
export function signalTip(fact: Fact, role: Role): { title: string; text: string } | null {
  const title = scatterFlagLabel(fact.code);
  const meaning = MEANING[fact.code]?.(role) ?? (isRetiredScatterFlag(fact.code) ? "" : flagEntityRule(fact.code));
  if (!meaning) return null;
  const detail = flagDetail(fact);
  const more = detail ? detailWords(fact, role, detail) : "";
  return { title: title || flagLabel(fact.code), text: more ? `${meaning} ${more}` : meaning };
}

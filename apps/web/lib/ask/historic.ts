import { countWords } from "./answer-text";

/*
 * The historic profiles (rf-2026.22, owner decision S8): no record, direct or by procedure, in the last 24 months
 * (marts.entity_profile.last_activity). The rankings by the risk score leave them out unless the question asks for them
 * (filters.includeHistoric): "Cine conduce?" since rf-2026.22, the risk cloud's list in the order of risk since
 * 15 November 2026 (owner: one pattern in both places). Listed, a historic row says so with a tag.
 */

export const HISTORIC_MONTHS = 24;

/** „770 de profiluri istorice, fără înregistrări în ultimele 24 de luni, nu sunt în listă.” */
export const historicLeftOutWords = (n: number): string =>
  `${countWords(n, "profil istoric", "profiluri istorice")}, fără înregistrări în ultimele ${HISTORIC_MONTHS} de luni, nu ${n === 1 ? "e" : "sunt"} în listă.`;

/** The day of a last record ("2023-09-12 00:00:00+03" or "2023-09-12"), or null when there is none. */
const dayOf = (last: string): { y: string; m: string; d: string } | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(last);
  return m ? { y: m[1]!, m: m[2]!, d: m[3]! } : null;
};

/** „09.2023”: the month of a last record (the tag, the search). */
export const lastMonthWords = (last: string): string | null => {
  const day = dayOf(last);
  return day ? `${day.m}.${day.y}` : null;
};

/**
 * The tag of a historic row: „istoric · ultima 09.2023”, neutral (no signal), its explanation on hover or a tap like
 * every tag of a list (owner, 15 November 2026). Structurally a RowFact (app/intreaba/answer/RowFacts.tsx).
 */
export function historicFact(last: string): { text: string; tip: { title: string; text: string } } {
  const month = lastMonthWords(last), day = dayOf(last);
  return {
    text: month ? `istoric · ultima ${month}` : "istoric",
    tip: {
      title: "Profil istoric",
      text: `Nicio achiziție sau contract în ultimele ${HISTORIC_MONTHS} de luni${day ? `; ultima înregistrare: ${day.d}.${day.m}.${day.y}` : ""}. `
        + "Clasamentele după risc nu îl arată implicit; scorul lui rămâne cel calculat.",
    },
  };
}

/** Why a found profile has no place in the list: „nu intră în listă: istoric, ultima în 02.2019”. */
export const historicPlaceWords = (last: string): string => {
  const month = lastMonthWords(last);
  return `nu intră în listă: istoric${month ? `, ultima în ${month}` : ""}`;
};

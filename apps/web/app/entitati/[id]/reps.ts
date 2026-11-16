/*
 * The entity page's „Conducere” (ONRC representatives). Some register rows carry a filler instead of a person's name
 * („FARA REPREZENTANT”, „REPREZENTANT NESPECIFICAT”, „-”): never shown as a person, never linked to „other firms”
 * (UX audit Z5-26, 16 November 2026). The list is the fillers found in reference.company_reps on that day.
 */
const FILLERS = new Set(["FARA REPREZENTANT", "REPREZENTANT NESPECIFICAT", "LIPSA NUME REPREZENTANT", "NU ARE", "NECUNOSCUT", "NEPRECIZAT"]);

/** Whether a representative's name is a register filler, not a person. */
export function isFillerRep(name: string | null | undefined): boolean {
  const plain = (name ?? "").normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/\s+/g, " ").trim();
  return plain === "" || /^[-.X\s]+$/.test(plain) || FILLERS.has(plain);
}

/** On a phone, the first persons shown; the rest behind „Încă N persoane”. */
export const REPS_SHOWN = 5;

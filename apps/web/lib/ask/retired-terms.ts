/**
 * Words that are not a subject on their own: too broad, or meaning two
 * different things. They were synonyms once (until migration 0081), so saved
 * links and free text may still carry them. Neither the engine (ground) nor
 * the interpreter guesses a meaning for them: both offer these choices.
 * Each choice is a cpvTerm the engine grounds (a curated synonym or a code).
 */
export interface RetiredTerm {
  message: string;
  choices: { label: string; cpvTerm: string }[];
}

export const RETIRED_TERMS: Readonly<Record<string, RetiredTerm>> = {
  lucrari: {
    message: "„Lucrări” e prea larg: aproape jumătate din valoarea tuturor achizițiilor sunt lucrări. Alege ce fel de lucrări te interesează.",
    choices: [
      { label: "lucrări de construcții", cpvTerm: "constructii" },
      { label: "clădiri", cpvTerm: "cladiri" },
      { label: "drumuri", cpvTerm: "drumuri" },
      { label: "reparații", cpvTerm: "reparatii" },
      { label: "renovare", cpvTerm: "renovare" },
    ],
  },
  mese: {
    message: "„Mese” poate însemna masa servită sau mobilierul. Alege la care te gândești.",
    choices: [
      { label: "catering (mese servite)", cpvTerm: "catering" },
      { label: "mobilier: mese", cpvTerm: "39121200" },
    ],
  },
  programe: {
    message: "„Programe” poate însemna programe informatice sau programe de formare. Alege la care te gândești.",
    choices: [
      { label: "software (programe informatice)", cpvTerm: "software" },
      { label: "programe de formare", cpvTerm: "80500000" },
    ],
  },
};

/** The retired entry for a folded term ("lucrari", "mese"), if any. */
export function retiredTerm(folded: string): RetiredTerm | null {
  return RETIRED_TERMS[folded.trim().replace(/\s+/g, " ")] ?? null;
}

/** "Alege: „lucrări de construcții”, „clădiri” …" — the choices as text, for an error message. */
export function retiredChoicesText(entry: RetiredTerm): string {
  return `Poți alege: ${entry.choices.map((c) => `„${c.label}”`).join(", ")}.`;
}

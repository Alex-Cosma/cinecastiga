/**
 * Words that are not a subject on their own: too broad, or meaning two
 * different things. They were synonyms once (until migration 0081), so saved
 * links and free text may still carry them. Neither the engine (ground) nor
 * the interpreter guesses a meaning for them: both offer these choices.
 * Each choice is a cpvTerm the engine grounds (a curated synonym or a code).
 */
export interface RetiredTerm {
  /** The folded forms that mean this word ("mese", "mesele", "meselor"); never a different word ("meserii"). */
  forms: string[];
  message: string;
  choices: { label: string; cpvTerm: string }[];
}

export const RETIRED_TERMS: Readonly<Record<string, RetiredTerm>> = {
  lucrari: {
    forms: ["lucrari", "lucrarile", "lucrarilor"],
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
    forms: ["mese", "mesele", "meselor"],
    message: "„Mese” poate însemna masa servită sau mobilierul. Alege la care te gândești.",
    choices: [
      { label: "catering (mese servite)", cpvTerm: "catering" },
      { label: "mobilier: mese", cpvTerm: "39121200" },
    ],
  },
  programe: {
    forms: ["programe", "programele", "programelor"],
    message: "„Programe” poate însemna programe informatice sau programe de formare. Alege la care te gândești.",
    choices: [
      { label: "software (programe informatice)", cpvTerm: "software" },
      { label: "programe de formare", cpvTerm: "80500000" },
    ],
  },
};

const BY_FORM = new Map(Object.values(RETIRED_TERMS).flatMap((entry) => entry.forms.map((form) => [form, entry] as const)));

/** The retired entry for one folded word, in any of its listed forms ("mesele" → mese), if any. */
export function retiredTerm(folded: string): RetiredTerm | null {
  return BY_FORM.get(folded.trim().replace(/\s+/g, " ")) ?? null;
}

/** Words that only join others ("lucrari de …", "mese si …"). */
const CONNECTORS = new Set(["de", "si", "sau", "din", "la", "in", "pe", "pentru", "cu", "a", "al", "ale", "ai"]);

/**
 * The retired entry for a whole text when it says nothing but the retired
 * word ("mesele", "lucrari de", "mese si"): any other word may name a real
 * subject ("lucrari de pavare", "mese si scaune") and is grounded normally.
 */
export function retiredText(folded: string): RetiredTerm | null {
  const words = folded.split(/[^a-z0-9]+/).filter(Boolean);
  const entries = words.map(retiredTerm);
  const found = entries.find((e): e is RetiredTerm => Boolean(e));
  if (!found) return null;
  return words.every((w, k) => entries[k] || CONNECTORS.has(w)) ? found : null;
}

/** "Alege: „lucrări de construcții”, „clădiri” …" — the choices as text, for an error message. */
export function retiredChoicesText(entry: RetiredTerm): string {
  return `Poți alege: ${entry.choices.map((c) => `„${c.label}”`).join(", ")}.`;
}

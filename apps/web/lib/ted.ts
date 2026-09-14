/**
 * Display metadata for the TED publication source. Plain-Romanian
 * labels for the eForms/TED code vocabulary — principle #8 (translate the
 * bureaucratese) — plus the caveats that keep the labels honest (#2, #7).
 */

/** ISO-2 → Romanian country name (the ones that appear as RO-tender winners). */
export const COUNTRY_RO: Record<string, string> = {
  RO: "România", DE: "Germania", IT: "Italia", FR: "Franța", ES: "Spania",
  NL: "Olanda", BE: "Belgia", AT: "Austria", PL: "Polonia", HU: "Ungaria",
  BG: "Bulgaria", GR: "Grecia", CZ: "Cehia", SK: "Slovacia", SI: "Slovenia",
  HR: "Croația", PT: "Portugalia", IE: "Irlanda", DK: "Danemarca", SE: "Suedia",
  FI: "Finlanda", LU: "Luxemburg", LT: "Lituania", LV: "Letonia", EE: "Estonia",
  CY: "Cipru", MT: "Malta", GB: "Marea Britanie", UK: "Marea Britanie",
  CH: "Elveția", NO: "Norvegia", US: "SUA", TR: "Turcia", CN: "China",
  IL: "Israel", RS: "Serbia", UA: "Ucraina", MD: "Moldova", JP: "Japonia",
  KR: "Coreea de Sud", IN: "India", CA: "Canada", BIH: "Bosnia și Herțegovina",
};

export function countryName(code: string | null | undefined): string {
  if (!code) return "necunoscut";
  return COUNTRY_RO[code] ?? code;
}

/** TED procurement-procedure code → plain Romanian. */
export const PROCEDURE_RO: Record<string, string> = {
  open: "Licitație deschisă",
  restricted: "Licitație restrânsă",
  "neg-w-call": "Negociere cu publicare",
  "neg-wo-call": "Negociere fără publicare",
  "comp-dial": "Dialog competitiv",
  "comp-tend": "Procedură concurențială",
  innovation: "Parteneriat pentru inovare",
};

export function procedureName(code: string | null | undefined): string {
  if (!code) return "—";
  return PROCEDURE_RO[code] ?? code;
}

export interface TedLabelMeta {
  title: string;
  hint: string;
}

/** also-in-seap / ted-only, with the honest explanation of what each means. */
export const TED_LABEL: Record<string, TedLabelMeta> = {
  "also-in-seap": {
    title: "și în SEAP",
    hint: "Am identificat automat o înregistrare corespunzătoare în datele SEAP analizate. Verifică anunțurile originale.",
  },
  "ted-only": {
    title: "Fără potrivire SEAP",
    hint: "Nu am identificat o înregistrare corespunzătoare în datele SEAP analizate. Atribuirea poate exista în SEAP chiar dacă potrivirea lipsește.",
  },
};

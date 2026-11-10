/**
 * Colloquial → registered-name aliases for Romanian public institutions.
 *
 * People search by TYPE + place ("primăria Buzău", "CJ Cluj"), but the
 * registry names are legal forms: the city hall of Buzău is "MUNICIPIUL
 * BUZAU", the county council is "JUDETUL CLUJ (CONSILIUL JUDETEAN)". This
 * expands a folded query into every registered-name shape it could mean;
 * callers OR the patterns together. A token-AND fallback (all words present,
 * any order) covers everything the rules don't.
 */

/**
 * Institution abbreviations → the words of their registered names (folded; connectors are not required by the name
 * search). „mai” (the interior ministry) is left out: it is also the month.
 */
const ABBREVIATIONS: Record<string, string[]> = {
  sju: ["spitalul judetean de urgenta"], scju: ["spitalul clinic judetean de urgenta"], scu: ["spitalul clinic de urgenta"],
  dgaspc: ["directia generala de asistenta sociala si protectia copilului"], dgasmb: ["directia generala de asistenta sociala a municipiului bucuresti"],
  isu: ["inspectoratul pentru situatii de urgenta"], igsu: ["inspectoratul general pentru situatii de urgenta"],
  ipj: ["inspectoratul de politie judetean"], igpr: ["inspectoratul general al politiei romane"],
  dsp: ["directia de sanatate publica"], isj: ["inspectoratul scolar judetean"], cjas: ["casa judeteana de asigurari de sanatate"],
  cas: ["casa de asigurari de sanatate"], cnas: ["casa nationala de asigurari de sanatate"], ocpi: ["oficiul de cadastru si publicitate imobiliara"],
  ancpi: ["agentia nationala de cadastru si publicitate imobiliara"], anaf: ["agentia nationala de administrare fiscala"],
  cnair: ["compania nationala de administrare a infrastructurii rutiere"], apia: ["agentia de plati si interventie pentru agricultura"],
  afir: ["agentia pentru finantarea investitiilor rurale"], mapn: ["ministerul apararii nationale"], sts: ["serviciul de telecomunicatii speciale"],
  umf: ["universitatea de medicina si farmacie"], ubb: ["universitatea babes bolyai"], upb: ["universitatea politehnica"],
  pmb: ["municipiul bucuresti"], ansvsa: ["autoritatea nationala sanitara veterinara si pentru siguranta alimentelor"],
  dsvsa: ["directia sanitara veterinara si pentru siguranta alimentelor"], ajofm: ["agentia judeteana pentru ocuparea fortei de munca"],
};

/** Expects an already-folded query (lowercase, no diacritics). */
export function aliasQueries(folded: string): string[] {
  const q = folded.replace(/\s+/g, " ").trim();
  const out = new Set<string>([q]);

  // Abbreviations people use for institutions, alone or before a place („SJU Bacău”, „DGASPC Sector 2”, „ANAF”):
  // the registered name's words (owner probe, 10 November 2026: none of these found the institution).
  const abbr = /^([a-z]{2,6})(?:\s+(.+))?$/.exec(q);
  const expanded = abbr ? ABBREVIATIONS[abbr[1]!] : undefined;
  if (expanded) for (const name of expanded) out.add(abbr![2] ? `${name} ${abbr![2]}` : name);
  // „Primăria Capitalei”, „Primăria Municipiului București”: the capital's own administration
  if (/^prim[aă]?ri[ae]?\s+(?:capitalei|generala|municipiului\s+bucuresti)$/.test(q)) out.add("municipiul bucuresti");
  const primMun = /^prim[aă]?ri[ae]?\s+municipiului\s+(.+)$/.exec(q);
  if (primMun) out.add(`municipiul ${primMun[1]}`);

  // primăria X → the UAT's legal names (city halls are registered as the UAT)
  const prim = /^prim[aă]?ri[ae]?\s+(.+)$/.exec(q);
  if (prim) {
    const rest = prim[1]!;
    const sec = /^sector(?:ul|ului)?\s*(\d)$/.exec(rest);
    if (sec) {
      out.add(`sectorul ${sec[1]}`);
      out.add(`sector ${sec[1]}`);
    } else {
      out.add(`municipiul ${rest}`);
      out.add(`orasul ${rest}`);
      out.add(`oras ${rest}`);
      out.add(`comuna ${rest}`);
    }
  }

  // CJ X / consiliul județean X → "JUDETUL X (CONSILIUL JUDETEAN)"
  const cj = /^(?:cj|consiliul?\s+judetean(?:\s+al)?)\s+(.+)$/.exec(q);
  if (cj) {
    out.add(`judetul ${cj[1]}`);
    out.add(`consiliul judetean ${cj[1]}`);
  }

  // prefectura X → instituția prefectului
  const pref = /^prefectura\s+(.+)$/.exec(q);
  if (pref) {
    out.add(`institutia prefectului ${pref[1]}`);
    out.add(`prefectul ${pref[1]}`);
  }

  return [...out];
}

/** Tokens for the all-words-anywhere fallback (skips 1-letter noise). */
export function queryTokens(folded: string): string[] {
  return folded
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t.length > 1);
}

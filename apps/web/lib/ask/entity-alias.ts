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
 * Institution abbreviations and nicknames → the words of their registered names (folded; connectors are not required
 * by the name search). Several shapes when the registry writes the same institution several ways („Inspectoratul
 * Școlar Județean Cluj”, „Inspectoratul Școlar al Județului Iași”), the shortest last. „mai” (the interior ministry)
 * is also the month: the name search reads it only at the start of the words, the interpreter only typed „MAI”.
 */
export const ABBREVIATIONS: Record<string, string[]> = {
  sju: ["spitalul judetean de urgenta"], scju: ["spitalul clinic judetean de urgenta"], scu: ["spitalul clinic de urgenta"],
  dgaspc: ["directia generala de asistenta sociala si protectia copilului"], dgasmb: ["directia generala de asistenta sociala a municipiului bucuresti"],
  isu: ["inspectoratul pentru situatii de urgenta"], igsu: ["inspectoratul general pentru situatii de urgenta"],
  ipj: ["inspectoratul de politie judetean", "inspectoratul de politie al judetului", "inspectoratul de politie"], igpr: ["inspectoratul general al politiei romane"],
  dsp: ["directia de sanatate publica"], isj: ["inspectoratul scolar judetean", "inspectoratul scolar al judetului", "inspectoratul scolar"],
  cjas: ["casa judeteana de asigurari de sanatate", "casa de asigurari de sanatate"],
  cas: ["casa de asigurari de sanatate"], cnas: ["casa nationala de asigurari de sanatate"], ocpi: ["oficiul de cadastru si publicitate imobiliara"],
  ancpi: ["agentia nationala de cadastru si publicitate imobiliara"], anaf: ["agentia nationala de administrare fiscala"],
  cnair: ["compania nationala de administrare a infrastructurii rutiere"], apia: ["agentia de plati si interventie pentru agricultura"],
  afir: ["agentia pentru finantarea investitiilor rurale"], mapn: ["ministerul apararii nationale"], sts: ["serviciul de telecomunicatii speciale"],
  umf: ["universitatea de medicina si farmacie"], ubb: ["universitatea babes bolyai"], upb: ["universitatea politehnica"],
  pmb: ["municipiul bucuresti"], ansvsa: ["autoritatea nationala sanitara veterinara si pentru siguranta alimentelor"],
  dsvsa: ["directia sanitara veterinara si pentru siguranta alimentelor"], ajofm: ["agentia judeteana pentru ocuparea fortei de munca"],
  mai: ["ministerul afacerilor interne"], suub: ["spitalul universitar de urgenta bucuresti"],
  // „Floreasca” is what people call the Bucharest emergency hospital on that street
  floreasca: ["spitalul clinic de urgenta bucuresti"],
};

/** Expects an already-folded query (lowercase, no diacritics). */
export function aliasQueries(folded: string): string[] {
  const q = folded.replace(/\s+/g, " ").trim();
  const out = new Set<string>([q]);

  // Abbreviations people use for institutions, alone or before a place („SJU Bacău”, „DGASPC Sector 2”, „ANAF”):
  // the registered name's words (owner probe, 10 November 2026: none of these found the institution).
  const abbr = /^([a-z]{2,9})(?:\s+(.+))?$/.exec(q);
  const expanded = abbr ? ABBREVIATIONS[abbr[1]!] : undefined;
  if (expanded) for (const name of expanded) {
    out.add(abbr![2] ? `${name} ${abbr![2]}` : name);
    // „DGASPC Sector 2 București”: a sector's institution is registered without the city
    const sector = abbr![2]?.replace(/\s+(?:din\s+)?(?:municipiul\s+)?bucuresti$/, "");
    if (sector && sector !== abbr![2] && /\bsector/.test(sector)) out.add(`${name} ${sector}`);
  }
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
      // „primăria Cluj Napoca” is registered „MUNICIPIUL CLUJ-NAPOCA”: the hyphen as the registry writes it
      for (const name of new Set([rest, rest.replace(/ /g, "-")])) {
        out.add(`municipiul ${name}`);
        out.add(`orasul ${name}`);
        out.add(`oras ${name}`);
        out.add(`comuna ${name}`);
      }
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

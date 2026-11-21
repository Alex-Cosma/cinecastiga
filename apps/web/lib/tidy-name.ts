import { cleanName } from "./format";
import localityWords from "./reference/locality-words.json" with { type: "json" };

/*
 * An entity's name as a title reads it (owner, 21 November 2026): SICAP writes most names in capitals without
 * diacritics („COMUNA BATRANA (PRIMARIA COMUNEI BATRANA)”), the titles show „Comuna Bătrâna (Primăria Comunei
 * Bătrâna)”; the lists, charts, tips and answers too (owner, the same day: „peste tot”): through EntityName, or this
 * function where a name is plain text. Display only: the stored name, search and its inputs, links, the labels saved
 * with clips and follows, and exports keep the source's spelling, and the entity page shows it in Complet.
 *
 * - A name already in mixed case keeps its case; when it has no diacritic at all, the unambiguous ones come back.
 * - Each word gets a capital, except the small joining words inside a name („de”, „din”, „și”, „nr.”).
 * - Legal forms, acronyms and words without vowels stay in capitals (SRL, S.A., DGASPC, RDS); Roman numerals too.
 * - Diacritics come back only where the word is unambiguous: a short list of the words institutions' names are made
 *   of, the counties, and the localities' names (INS SIRUTA, lib/reference/locality-words.json, 15 kB, built by
 *   scripts/map/build-locality-words.mjs) when every locality spelling of that word agrees. Anything else keeps the source's letters („Botesti” is Botești or Boțești).
 */

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleUpperCase("ro-RO");

/** Words institutions' names are made of, by their capitals without diacritics. */
const WORDS = [
  "Școala", "Școlar", "Școlară", "Școli", "Școlilor", "Gimnazială", "Gimnaziale", "Grădinița", "Grădinițe", "Grădiniței",
  "Primăria", "Primăriei", "Orașul", "Orașului", "Oraș", "Orășenesc", "Orășenească", "Județul", "Județului", "Județean",
  "Județeană", "Direcția", "Direcției", "Generală", "Generale", "Asistență", "Asistenței", "Protecția", "Protecție",
  "Socială", "Sociale", "Sănătate", "Sănătății", "Publică", "Națională", "Național", "Naționale", "Învățământ",
  "Învățământului", "Educație", "Educației", "Educațională", "Educaționale", "Profesională", "Profesionale", "Cultură",
  "Culturii", "Urgență", "Urgențe", "Situații", "Siguranță", "Siguranței", "Apărării", "Apărare", "Pază", "Poliție",
  "Poliției", "Evidență", "Evidența", "Plăți", "Plăților", "Asigurări", "Asigurărilor", "Ambulanță", "Ambulanțelor",
  "Sanguină", "Transfuzie", "Militară", "Militare", "Specială", "Speciale", "Incluzivă", "Incluzive", "Sanitară",
  "Sanitare", "Veterinară", "Veterinare", "Siguranța", "Alimentară", "Medicală", "Medicale", "Comunală", "Regională",
  "Regionale", "Teritorială", "Teritoriale", "Municipală", "Locală", "Persoanelor", "Vârstnice", "Vârstnici", "Bătrâni",
  "Muncă", "Mediului", "Învățământ", "Universitară", "Științe", "Științific", "Științifică", "Tehnică", "Economică",
  "Agricolă", "Silvică", "Ape", "Apă", "Gospodărie", "Gospodărire", "Gospodărirea", "Administrație", "Administrația",
  "Administrației", "Întreținere", "Reparații", "Construcții", "Servicii", "Comerț", "Producție", "Distribuție",
  "Utilități", "Transporturi", "Căi", "Ferată", "Ferate", "Drumuri", "Poduri", "Lucrări", "Investiții", "Dezvoltare",
  "Locuințe", "Pădure", "Păduri", "Pădurilor", "Bisericii", "Biserica", "Mănăstirea", "Mănăstirii", "Sfântul", "Sfânta",
  "Sfinții", "Ortodoxă", "Ortodox", "Română", "Românesc", "Românească", "România", "României", "Românilor", "Societate",
  "Societatea", "Autoritatea", "Agenția", "Agenției", "Comisia", "Instituția", "Prefectului", "Prefectura", "Instanță",
  "Judecătoria", "Judecătoriei", "Curtea", "Tribunalul", "Parchetul", "Penitenciarul", "Arhivele", "Biblioteca",
  "Bibliotecii", "Grădina", "Botanică", "Zoologică", "Filarmonica", "Operă", "Opera", "Artă", "Arte", "Muzică",
  "Pregătire", "Formare", "Ocupare", "Forței", "Inspecție", "Psihiatrie", "Recuperare", "Reabilitare", "Îngrijiri",
  "Îngrijire", "Paliative", "Copiilor", "Copilului", "Tineret", "Tineretului", "Activități", "Așezământ", "Așezământul",
  "Cămin", "Căminul", "Căminului", "Cantină", "Cantina", "Bucătărie", "Târgu", "Târgul", "Târgului", "Câmpia", "Câmpina",
  "Câmpulung", "Vâlcea", "Râmnicu", "Râmnicului", "Ștefan", "Ștefănești", "Vodă", "Bălcescu", "Mărășești", "Mărăști",
  "Constanța", "Iași", "Galați", "Bacău", "Brașov", "Ploiești", "Pitești", "Timișoara", "Brăila", "Focșani", "Botoșani",
  "Buzău", "Călărași", "Mureș", "Argeș", "Timiș", "Neamț", "Sălaj", "Caraș", "Mehedinți", "Dâmbovița", "Ialomița",
  "Bistrița", "Năsăud", "Maramureș", "București", "Bucureștii", "Mării", "Dunării", "Dunăre", "Mureșului", "Câmpului",
  "Gării", "Gară", "Piață", "Piața", "Piețe", "Piețelor", "Hală", "Hale", "Băile", "Băi", "Băilor", "Lacul", "Lacului",
  "Sector", "Secția", "Secție", "Unitatea", "Unității", "Centrul", "Spitalul", "Spital", "Clinică", "Clinic", "Clinice",
  "Infecțioase", "Pneumoftiziologie", "Obstetrică", "Ginecologie", "Pediatrie", "Oncologie", "Ortopedie",
  "Traumatologie", "Stomatologie", "Cardiovasculare", "Cardiologie", "Urologie", "Chirurgie", "Neurochirurgie",
  "Recuperare", "Sanatoriul", "Preventoriul", "Policlinica", "Dispensarul", "Farmacia", "Farmaceutică",
  "Cooperația", "Asociația", "Asociației", "Fundația", "Uniunea", "Ligă", "Liga", "Federația", "Intercomunitară",
  "Intercomunitare", "Îmbunătățiri", "Funciare", "Irigații", "Proprietarilor", "Crescătorilor", "Creșa", "Creșe", "Persoană", "Fizică", "Autorizată", "Întreprindere",
  "Individuală", "Familială", "Consultanță", "Amenajări", "Excavații", "Tâmplărie", "Instalații", "Proiectări", "Curățenie",
  "Medicină",
].map((word) => [fold(word), word] as const);

/** Words that stay in capitals; a few keep their own mixed spelling. */
const UPPER = new Set([
  "SRL", "SA", "SC", "RA", "SNC", "SCS", "SCA", "PFA", "II", "IF", "IFN", "ONG", "UAT", "ADI", "OUAI", "CJ", "CL",
  "DGASPC", "DAS", "DSP", "DSV", "DSVSA", "ISU", "ISJ", "IPJ", "IGPR", "IJJ", "ANAF", "CNAS", "CAS", "CJAS", "CASMB",
  "AJOFM", "ANOFM", "ANIF", "ANAR", "ABA", "SGA", "RNP", "CFR", "SNCFR", "CNAIR", "DRDP", "SNTGN", "CN", "CNCF", "RAJA",
  "RATB", "STB", "STS", "SPP", "SMURD", "UMF", "USAMV", "ASE", "UPB", "UTCN", "INCD", "ICDI", "IOSUD", "CEC", "BCR",
  "BRD", "TVR", "SRR", "ASSMB", "ANRE", "ANCOM", "ANPC", "ANSVSA", "ANMDMR", "OCPI", "ANCPI", "ITM", "DJST", "CSM",
  "CSS", "CSU", "CSO", "UTI", "IT", "TV", "AG", "SPA", "LLC", "KFT", "BV", "NV", "SAS", "SARL", "OOD", "EOOD", "SPRL",
  "UK", "EU", "UE", "SUA", "AVAS", "ARR", "RAR", "CNDIPT", "CCD", "CJRAE", "CMBRAE", "ISMB", "DGRFP", "AJFP",
  "DITL", "DGITL", "DPC", "DGPMB", "ADP", "ADPP", "RADET",
]);
const OWN = new Map([["GMBH", "GmbH"], ["LTD", "Ltd"], ["INC", "Inc"], ["MAPN", "MApN"], ["SF", "Sf"], ["STR", "Str"]]);

/** Small joining words, lowercase inside a name (never first). */
const SMALL = new Map([
  ["DE", "de"], ["DIN", "din"], ["CU", "cu"], ["SI", "și"], ["ȘI", "și"], ["ŞI", "și"], ["AL", "al"], ["ALE", "ale"],
  ["PENTRU", "pentru"], ["LA", "la"], ["IN", "în"], ["ÎN", "în"], ["PE", "pe"], ["PRIN", "prin"], ["SUB", "sub"],
  ["NR", "nr"], ["SAU", "sau"], ["CEL", "cel"], ["CEA", "cea"],
]);

const ROMAN = /^(?=[IVX])X{0,3}(IX|IV|V?I{0,3})$/;

/** Localities' and counties' words with their diacritics, by their capitals without them. */
const LOCALITIES = new Map<string, string>(localityWords.words.map((w) => [fold(w), w]));
const KNOWN = new Map<string, string>(WORDS);

function word(raw: string, first: boolean, after: string): string {
  const key = fold(raw);
  if (/\d/.test(raw)) return raw;
  // An initial or a dotted legal form (D. Bogdan, S.R.L.), a letter on its own (Citos M & S) stays a capital; „a” joins.
  if (raw.length === 1) return !first && key === "A" && !after.startsWith(".") ? "a" : raw;
  if (OWN.has(key)) return OWN.get(key)!;
  if (UPPER.has(key) || ROMAN.test(key)) return raw;
  if (!first && SMALL.has(key)) return SMALL.get(key)!;
  if (!/[AEIOUY]/.test(key)) return raw;
  // Diacritics are added only to a word the source wrote without any; its own (cedillas included) are kept.
  const known = raw === key ? KNOWN.get(key) ?? LOCALITIES.get(key) : null;
  return known ?? raw.charAt(0) + raw.slice(1).toLocaleLowerCase("ro-RO");
}

/** The name as a title reads it; see the note above. Empty stays empty. */
export function tidyName(name: string): string {
  const trimmed = name.replace(/\s+/g, " ").trim();
  if (!trimmed) return trimmed;
  if (/\p{Ll}/u.test(trimmed)) {
    // Written in small letters but without a single diacritic („Comuna Dobrotesti (Primaria Dobrotesti)”): only the
    // diacritics come back, on capitalised words that are unambiguous; the case stays the source's.
    if (/[^\x00-\x7F]/.test(trimmed)) return trimmed;
    return trimmed.replace(/\b[A-Z][a-z]{2,}\b/g, (raw) => KNOWN.get(fold(raw)) ?? LOCALITIES.get(fold(raw)) ?? raw)
      .replace(/(?<=\p{L} )si(?= \p{L})/gu, "și");
  }
  let index = 0;
  return trimmed.replace(/[\p{L}\p{N}]+/gu, (raw, offset: number) => {
    const first = index++ === 0;
    return word(raw, first, trimmed.slice(offset + raw.length, offset + raw.length + 1));
  }).replace(/\bnr(?= ?\d)/g, "nr.");
}

/** An entity's name in a title: the leading CUI some imports carry dropped (cleanName), then tidied. */
export function titleName(name: string | null | undefined): string {
  return tidyName(cleanName(name));
}

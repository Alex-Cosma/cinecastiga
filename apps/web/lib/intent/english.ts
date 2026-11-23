/*
 * Questions written in English (search probe, 23 November 2026: „top buyers of medical supplies 2025”, „who buys IT
 * services in bucuresti” were answered as a national total or not at all). The rules read Romanian; this is a small
 * layer before them that rewrites the question words of an English question into the Romanian cues the rules already
 * know. It translates no arbitrary text: a subject keeps its English word (rules.ts ENGLISH_SUBJECTS reads the frequent
 * ones), a name stays a name, and the answer is in Romanian with a note that the question was read from English.
 *
 * A text is English only when it has no Romanian function word, at least one word English questions are made of and
 * two marks in all: „top firme software”, „laptop service”, „Bank of Cyprus” and every Romanian question are left alone.
 */

/** Words English questions about purchases are made of; none is a Romanian word. */
const STRONG = new Set([
  "who", "what", "which", "how", "where", "did", "does", "spent", "spend", "spends", "spending", "buys", "bought", "buying", "wins", "won",
  "winning", "sells", "sold", "biggest", "largest", "buyers", "suppliers", "vendors", "hospitals", "hospital", "schools", "county", "counties",
  "council", "councils", "contracts", "tenders", "awards", "much", "many", "municipalities", "municipality", "money", "gets", "since",
  "between", "year", "ministries", "universities", "companies", "firms", "signed", "awarded", "town", "hall", "halls", "most", "competitors",
]);
/** English function words: they count only beside a strong one („The House of…” is a name). */
const WEAK = new Set(["the", "of", "by", "for", "and", "with", "from", "on", "my", "is", "was", "were", "to", "at", "romanian", "bucharest"]);
/** Romanian function words: one of them and the text is not rewritten („in” and „a” are both languages'). */
const ROMANIAN = new Set([
  "de", "la", "din", "pe", "cu", "si", "care", "cine", "cat", "cate", "cati", "ce", "pentru", "sau", "cel", "cele", "cea", "mai", "sunt", "este",
  "au", "fost", "prin", "dupa", "fara", "intre", "anul", "unde", "cum", "sa", "nu", "ai", "ale", "lui", "unei", "unui",
]);

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Whether the text is an English question (see above). */
export function looksEnglish(text: string): boolean {
  const words = fold(text).match(/[a-z]+/g) ?? [];
  if (words.some((w) => ROMANIAN.has(w))) return false;
  const marks = new Set(words.filter((w) => STRONG.has(w) || WEAK.has(w)));
  return marks.size >= 2 && [...marks].some((w) => STRONG.has(w));
}

/** Words before „contracts” that are not what the contracts are for („the most contracts”, „public contracts”). */
const NOT_A_SUBJECT = "the|of|most|biggest|largest|public|procurement|single|all|these|their|many|how|and|direct|open|more|any|some|which|what|top|in|for|by|on|with|won|wins|win|signed|awarded|had|has|have|who|buys|bought|gets|got|council|councils|county|hall|halls|bid|bidder|value|expensive|did|does";
const YEAR = "(20[0-3]\\d)";
/** Ordered: the longer phrase first, so it takes the shared words. All over the text as typed, any case. */
const REWRITES: [RegExp, string][] = [
  // „road contracts”, „cleaning tenders”: the noun first, as the Romanian cues expect it (before anything is rewritten)
  [new RegExp(`\\b(?!(?:${NOT_A_SUBJECT})\\b)([a-z]+) contracts\\b`, "gi"), "contracts $1"],
  [new RegExp(`\\b(?!(?:${NOT_A_SUBJECT})\\b)([a-z]+) tenders\\b`, "gi"), "tenders $1"],
  // the article, while the text is still English („a cheltuit” below keeps its own „a”)
  [/\b(?:a|an) (?=[a-z])/gi, ""],
  // --- periods
  [/\bsince the pandemic\b/gi, "de la pandemie incoace"],
  [new RegExp(`\\bsince ${YEAR}\\b`, "gi"), "din $1 incoace"],
  [new RegExp(`\\bbetween ${YEAR} and ${YEAR}\\b`, "gi"), "intre $1 si $2"],
  [new RegExp(`\\bfrom ${YEAR} to ${YEAR}\\b`, "gi"), "din $1 pana in $2"],
  [new RegExp(`\\bafter ${YEAR}\\b`, "gi"), "dupa $1"],
  [new RegExp(`\\bbefore ${YEAR}\\b`, "gi"), "inainte de $1"],
  [/\blast year\b/gi, "anul trecut"],
  [/\bthis year\b/gi, "anul acesta"],
  [/\b(?:over time|year by year|by year|per year|over the years)\b/gi, "pe ani"],
  // --- streams and competition
  [/\b(?:single[- ]bid(?:der)?|one[- ]bid(?:der)?|sole[- ]bid(?:der)?|only one bid(?:der)?) (?:tenders?|contracts?|procedures?|procurements?)\b/gi, "licitatii cu ofertant unic"],
  [/\b(?:with |had )?(?:a )?(?:single|one|sole|only one) bid(?:der)?\b/gi, "cu ofertant unic"],
  [/\b(?:direct awards?|direct purchases?|direct procurements?|direct contracts?|directly awarded contracts?)\b/gi, "achizitii directe"],
  [/\bopen tenders?\b/gi, "licitatie deschisa"],
  // --- the place of a county and of its council
  [/\b([a-z-]+) county council\b/gi, "consiliul judetean $1"],
  [/\bcounty councils\b/gi, "consilii judetene"],
  [/\bcounty council\b/gi, "consiliul judetean"],
  [/\b(?:by|per|across|for each|in each) count(?:y|ies)\b/gi, "pe judete"],
  [/\bwhich count(?:y|ies)\b/gi, "care judet"],
  [/\b(?!(?:the|a|each|every|one|any|what|top)\b)([a-z-]+) county\b/gi, "judetul $1"],
  [/\bcounties\b/gi, "judete"],
  [/\bcounty\b/gi, "judet"],
  // --- who buys
  [/\bmy (?:town|city) hall\b/gi, "primaria mea"],
  [/\b(?:town|city) halls\b|\bmunicipalities\b/gi, "primarii"],
  [/\b(?!(?:the|a|my|each|every|which|what|top)\b)([a-z-]+) (?:town|city) hall\b/gi, "primaria $1"],
  [/\b(?:town|city) hall\b|\bmunicipality\b/gi, "primaria"],
  [/\bstate[- ](?:owned )?(?:companies|enterprises)\b/gi, "companii de stat"],
  [/\bhospitals\b/gi, "spitale"],
  [/\bhospital\b/gi, "spital"],
  [/\bschools\b/gi, "scoli"],
  [/\bministries\b/gi, "ministere"],
  [/\buniversities\b/gi, "universitati"],
  [/\b(?:buyers|purchasers|contracting authorities|public bodies|institutions)(?: of)?\b/gi, "institutii"],
  [/\b(?:suppliers|vendors|contractors|companies|firms|winners|bidders|competitors)\b/gi, "firme"],
  // --- what is asked
  [/\bhow much (?:money )?(?:did |does |do |has |have |was |were |is |are )?/gi, "cat "],
  [/\bhow many\b/gi, "cate"],
  [/\bwho (?:buys|bought|is buying|are buying|purchases|purchased|spends|spent|pays|paid)\b/gi, "cine cumpara"],
  [/\bwho (?:wins|won|is winning|gets|got|sells|sold|supplies|supplied|receives|received)\b/gi, "cine castiga"],
  [/\bwho (?:are|is)\b/gi, "cine"],
  [/\bwho\b/gi, "cine"],
  [/\bwhich\b/gi, "care"],
  [/\bwhat\b/gi, "ce"],
  [/\b(?:the )?(?:biggest|largest|highest[- ]value|most expensive) (?:single )?contract\b/gi, "cel mai mare contract"],
  [/\b(?:the )?(?:biggest|largest|highest[- ]value|most expensive) (?:single )?(?:contracts|purchases|procurements)\b/gi, "cele mai mari contracte"],
  [/\b(?:spent|spends|spend|bought|buys|buy|paid|pays) the most\b/gi, "a cheltuit cel mai mult"],
  [/\b(?:won|wins|win|got|gets) the most\b/gi, "castiga cele mai multe"],
  [/\b(?:had|has|have|with) the most\b/gi, "cu cele mai multe"],
  [/\b(?:the )?most\b/gi, "cele mai multe"],
  [/\b(?:per capita|per inhabitant|per person|per head)\b/gi, "pe locuitor"],
  [/\b(?:(?:public )?procurement )?(?:spending|expenditures?|expenses)\b/gi, "cheltuieli"],
  [/\b(?:public )?procurements?\b/gi, "achizitii"],
  [/\btenders\b/gi, "licitatii"],
  [/\bcontracts\b/gi, "contracte"],
  [/\bservices\b/gi, "servicii"],
  [/\bmoney\b/gi, "bani"],
  [/\bvalue\b/gi, "valoare"],
  [/\b(?:signed|awarded|concluded) by\b/gi, "semnat de"],
  [/\b(?:spent|spend|spends)\b/gi, "a cheltuit"],
  [/\b(?:bought|buys|buy|purchased|purchases)\b/gi, "cumpara"],
  [/\b(?:won|wins|win)\b/gi, "castiga"],
  [/\bbucharest\b/gi, "bucuresti"],
  // --- function words
  [/\b(?:in |of |from )?romania\b|\bromanian\b/gi, ""],
  [/\bby (?:total )?value\b/gi, "dupa valoare"],
  [/\bby (?:number|count)\b/gi, "dupa numar"],
  [/\bby\b/gi, ""],
  [/\bon\b/gi, "pe"],
  [/\bfor\b/gi, "pentru"],
  [/\band\b/gi, "si"],
  [/\bwith\b/gi, "cu"],
  [/\bfrom\b/gi, "de la"],
  [/\bat\b/gi, "la"],
  [/\b(?:the|of|did|does|do|is|are|was|were|has|have|had|my)\b/gi, ""],
];

/** The English question with its question words in Romanian, or null when the text is not an English question. */
export function fromEnglish(text: string): string | null {
  if (!looksEnglish(text)) return null;
  let out = text;
  for (const [re, to] of REWRITES) out = out.replace(re, to);
  out = out.replace(/\s+/g, " ").trim();
  return out && out !== text ? out : null;
}

export const ENGLISH_NOTE = "Am citit întrebarea din engleză; răspunsul e în română.";

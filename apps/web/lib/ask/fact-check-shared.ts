import { countWords } from "./answer-text";
import { periodWordsWith } from "./filters/words";
import { formatRon } from "../format";
import { GLOSSARY } from "../glossary";

/*
 * "A cumpărat X de la Y?" (fact_check-2, plan §4.10, final fact_check §4–§5):
 * the shape of the answer and its words, shared by the engine (fact-check.ts),
 * the answer (app/intreaba/FactCheckAnswer.tsx), its CSV and a watch's core.
 * Plain TypeScript, no SQL and no React.
 *
 * Three verdicts: "Da" when the selection has a record, or a row of the pair
 * that the sums leave out (a direct acquisition above the 2 mil. lei filter or
 * without a positive value, a contract of uncertain identity, above 1 mld. lei
 * or of an unclear kind); "Acord-cadru" when it has only framework agreements
 * (a ceiling is not a purchase, and its call-offs may be missing from the
 * data); "Nu" otherwise, always with its reason. The answer describes the
 * selection asked (the same period, domain and channel); nothing in it changes
 * the verdict. Recorded values, not payments.
 */

export const FACT_CHECK_VERSION = 2;
export type FactVerdict = "yes" | "framework" | "no";
/** Why "Nu": the choices of the sentence, an old link's condition, or nothing between them in the data. */
export type FactNoReason = "choices" | "legacy" | "none";

export interface FactParty { entityId: string; name: string; cui?: string | null; county?: string | null }
export interface FactAmount { count: number; value: number }

/** A record of the list: the five largest and the most recent (final §4.6). */
export interface FactSample {
  daCode: string | null;
  date: string | null;
  cpvName: string | null;
  value: number;
  // fact_check-2
  src?: "da" | "contracts";
  /** sicap_da_id of a direct acquisition, the contract's id in core of a contract. */
  refId?: string | null;
  /** The contract's public id (/contracte/{nid}). */
  nid?: string | null;
  procedure?: string | null;
  nWinners?: number | null;
  /** The whole contract's value, of which the row holds the firm's share. */
  fullValue?: number | null;
  /** Offers received, when TED confirms them. */
  bids?: number | null;
  /** contractKind of a contract ("framework" on a build from before the framework rule: in the sums, labelled). */
  kind?: string | null;
  /** The most recent record, not among the five largest. */
  recent?: true;
}

/** Why a row of the pair is outside the sums (final §4.5). */
export type FactOutsideCategory = "framework" | "da_above" | "da_nonpositive" | "identity" | "above_cap" | "kind";
export interface FactOutsideRow {
  category: FactOutsideCategory;
  src: "da" | "contracts";
  refId: string;
  nid: string | null;
  code: string | null;
  date: string | null;
  /** What was bought: the CPV name. */
  what: string | null;
  /** The recorded value: a direct acquisition's, a contract's (or a ceiling) whole. */
  value: number | null;
  /** A direct acquisition's estimate, which shows a typed value. */
  estimated: number | null;
  procedure: string | null;
}

export interface FactShare { rank: number; of: number; share: number }
export interface FactTwin { role: "authority" | "supplier"; entityId: string; name: string; cui: string | null; county: string | null; count: number; yearFirst: number | null; yearLast: number | null }

export interface FactCheckData {
  // fact_check-1 (an answer stored before F6a has only these): `verdict` is now "Da".
  verdict: boolean;
  authority: FactParty;
  supplier: FactParty;
  /** The records of the selection, in the sums. */
  count: number;
  value: number;
  yearFirst: number | null;
  yearLast: number | null;
  samples: FactSample[];
  // fact_check-2 (plan §4.10)
  version?: 2;
  state?: FactVerdict;
  reason?: FactNoReason;
  /** The sentence restricts the period, the domain or the channel. */
  restricted?: boolean;
  /** An old link's condition applies (minimumRecords, singleBidder, county, kind, employees, administrator, population). */
  legacy?: boolean;
  dateFirst?: string | null;
  dateLast?: string | null;
  /** Contracts in the sums without a plausible date (CONTRACT_DATE_FLOOR): no year. */
  undated?: FactAmount;
  /** Dated records by year. */
  years?: { year: number; count: number; value: number }[];
  /** The archive's last year, when it is incomplete. */
  partialYear?: number | null;
  channels?: { da: FactAmount; contracts: FactAmount };
  /** CPV divisions by value. */
  domains?: { code: string; name: string | null; count: number; value: number }[];
  /** Open and restricted tenders with a known number of offers (TED); `unknown` is every other contract. */
  competition?: { single: number; multiple: number; unknown: number } | null;
  /** Contracts won in association: the firm's share and the whole contracts. */
  consortium?: { count: number; share: number; full: number } | null;
  /** Framework agreements of the selection outside the sums; `inSums` those a build from before the rule still sums. */
  frameworks?: { count: number; ceiling: number; inSums: number; inSumsCeiling: number; rows: FactOutsideRow[] };
  /** Rows of the selection the sums leave out. */
  excluded?: { count: number; rows: FactOutsideRow[] };
  /** The relation's weight, with the same choices: the buyer among the firm's clients, the firm among the buyer's suppliers. */
  share?: { ofSupplier: FactShare; ofAuthority: FactShare } | null;
  /** The whole relation (no period, domain, channel or old condition), when the selection is narrower. */
  relation?: { count: number; value: number; yearFirst: number | null; yearLast: number | null; frameworks: number; excluded: number } | null;
  /** Last day of data, per channel. */
  coverage?: { da: string | null; contracts: string | null };
  /** "Nu" in the whole archive: how many partners each side has. */
  partners?: { authoritySuppliers: number; supplierAuthorities: number } | null;
  /** "Nu" in the whole archive: an entity with exactly the same name that has records with the other side. */
  twins?: FactTwin[];
}

/** The procedures whose offers the line "Concurență" counts, as the signal award_single_bid (flags/competition.ts). */
export const COMPETITION_PROCEDURES: readonly string[] = ["Licitatie deschisa", "Licitatie deschisa accelerata", "Licitatie restransa"];
/** At most this many rows of the pair outside the sums are listed (the counts are whole). */
export const OUTSIDE_ROWS_LIMIT = 50;
/** Up to this rank the weight says the place ("al 7-lea"); beyond it "unul din …". */
export const SHARE_RANK_SHOWN = 20;

/** Filters of today's sentence: the pair, the period, the domain. Anything else of `filters` is an old link's. */
const SENTENCE_FILTERS = new Set(["authorityId", "authorityName", "supplierId", "supplierName", "cpvTerm", "yearFrom", "yearTo", "monthFrom", "monthTo"]);
type SpecLike = { dataset?: string | undefined; filters: Record<string, unknown>; population?: unknown; minimumRecords?: unknown };
const set = (v: unknown) => v !== undefined && v !== null && v !== "";

/** The sentence narrows the relation (Când, Ce, Cum). */
export function factRestricted(spec: SpecLike): boolean {
  const f = spec.filters;
  return ["yearFrom", "yearTo", "monthFrom", "monthTo", "cpvTerm"].some((key) => set(f[key])) || (spec.dataset !== undefined && spec.dataset !== "all");
}
/** An old link's condition (final §6.5): applied as before, the band "În toată relația" always shown. */
export function factLegacy(spec: SpecLike): boolean {
  return Boolean(spec.population || spec.minimumRecords) || Object.entries(spec.filters).some(([key, value]) => !SENTENCE_FILTERS.has(key) && set(value));
}

/** The three verdicts (final §4.1): records, else rows outside the sums ("Da · nu intră în sume"), else frameworks, else "Nu". */
export function factVerdict(o: { count: number; excluded: number; frameworks: number }): FactVerdict {
  if (o.count > 0 || o.excluded > 0) return "yes";
  return o.frameworks > 0 ? "framework" : "no";
}
/** Why "Nu": an old link's condition first, the sentence's choices, else nothing in the data. */
export function factNoReason(o: { legacy: boolean; relationHas: boolean }): FactNoReason {
  if (!o.relationHas) return "none";
  return o.legacy ? "legacy" : "choices";
}

export const VERDICT_WORDS: Record<FactVerdict, string> = { yes: "Da", framework: "Acord-cadru", no: "Nu" };
export const VERDICT_TIPS: Record<FactVerdict, string> = {
  yes: "Cel puțin o achiziție directă acceptată sau un contract atribuit în SEAP. Nu dovedește livrarea sau plata.",
  framework: GLOSSARY["acord-cadru"].text,
  no: "Achiziții directe din 02.04.2018; contracte din anunțurile de atribuire publicate din 2018. Nu apar: achizițiile din afara SEAP, instituțiile subordonate (școli, direcții) și firmele cu alt CUI.",
};

/** The (?) of each part of the answer (kit §4, terse; the explanations stay in the tips). */
export const FACT_TIPS = {
  share: "Partea relației din vânzările firmei și din achizițiile instituției, cu aceleași alegeri. Valori înregistrate, nu plăți.",
  competition: GLOSSARY["concurenta-oferte"].text,
  consortium: GLOSSARY["in-asociere"].text,
  excluded: "Filtru analitic, nu prag legal. Rândul rămâne vizibil, dar nu intră în sume.",
  undated: "Data din sursă e dinainte de arhivă (2018). Contractul intră în sume, dar nu primește an; o alegere de ani nu îl include.",
  frameworksInSums: "Această copie a datelor e calculată înaintea regulii care scoate plafoanele din sume: acordurile-cadru de aici sunt adunate. Un plafon nu e o comandă.",
} as const;

/** Why a row is outside the sums, after its value (final §4.5). */
export const OUTSIDE_WHY: Record<Exclude<FactOutsideCategory, "framework">, string> = {
  da_above: "peste filtrul de 2 mil. lei",
  da_nonpositive: "fără valoare pozitivă",
  identity: "identitate nesigură (publicare repetată în verificare)",
  above_cap: "peste 1 mld. lei",
  kind: "tip de contract neclar",
};

/** "38 de achiziții directe", "20 de contracte din proceduri", "un acord-cadru". */
export const daWords = (n: number) => countWords(n, "achiziție directă", "achiziții directe");
export const contractWords = (n: number) => countWords(n, "contract", "contracte");
export const frameworkWords = (n: number) => countWords(n, "acord-cadru", "acorduri-cadru");
export const recordWords = (n: number) => countWords(n, "înregistrare", "înregistrări");
export const lei = (value: number) => formatRon(value);

/** "al 2-lea", "primul"; the place among the partners (final §4.3). */
export function rankWords(rank: number): string {
  return rank === 1 ? "primul" : `al ${rank}-lea`;
}
/** "al 2-lea client din 70 (14%)", or beyond the 20th place "unul din 10.575 de clienți · <1%". */
export function shareWords(share: FactShare, one: string, many: string, percent: (share: number) => string): string {
  if (share.rank > SHARE_RANK_SHOWN) return `unul din ${countWords(share.of, one, many)} · ${percent(share.share)}`;
  return `${rankWords(share.rank)} ${one} din ${share.of.toLocaleString("ro-RO")} (${percent(share.share)})`;
}

/** "Nicio înregistrare în 2026." / "… cu alegerile făcute." / "… cu condiția din link." (final §5.1, §6.5). */
export function noRecordsWords(spec: SpecLike, reason: FactNoReason): string {
  if (reason === "none") return "Nicio înregistrare între ei în datele noastre.";
  if (reason === "legacy") return "Nicio înregistrare cu condiția din link.";
  const f = spec.filters;
  const onlyPeriod = !set(f.cpvTerm) && (spec.dataset === undefined || spec.dataset === "all");
  return onlyPeriod ? `Nicio înregistrare ${periodWordsWith(f)}.` : "Nicio înregistrare cu alegerile făcute.";
}

/** The band "În toată relația" (final §5.1): its verdict and its figures, in one line after the label. */
export function relationWords(r: NonNullable<FactCheckData["relation"]>): { verdict: string; facts: string[] } {
  const years = r.yearFirst && r.yearLast ? (r.yearFirst === r.yearLast ? String(r.yearFirst) : `${r.yearFirst}–${r.yearLast}`) : null;
  const facts = r.count > 0 ? [recordWords(r.count), lei(r.value), ...(years ? [years] : [])] : [];
  if (r.excluded > 0) facts.push(`${countWords(r.excluded, "rând exclus", "rânduri excluse")} din sume`);
  if (r.frameworks > 0) facts.push(`${facts.length ? "și " : ""}${frameworkWords(r.frameworks)}`);
  const verdict = r.count > 0 || r.excluded > 0 ? "da" : r.frameworks > 0 ? "acord-cadru" : "nu";
  return { verdict, facts };
}

/** The badge of a procedure in the list (final §4.6): its name, lower case, with ș and ț. */
const PROCEDURE_WORDS: Record<string, string> = {
  "licitatie deschisa": "licitație deschisă", "licitatie deschisa accelerata": "licitație deschisă accelerată",
  "procedura simplificata": "procedură simplificată", "procedura simplificata proprie": "procedură simplificată proprie",
  "negociere fara publicare prealabila": "negociere fără publicare", "negociere": "negociere",
  "licitatie restransa": "licitație restrânsă", "licitatie restransa accelerata": "licitație restrânsă accelerată",
  "procedura competitiva cu negociere": "procedură competitivă cu negociere", "procedura competitiva cu negociere accelerata": "procedură competitivă cu negociere",
  "cerere de oferta": "cerere de ofertă", "dialog competitiv": "dialog competitiv", "norme proprii (anexa 2)": "norme proprii (anexa 2)",
};
export function procedureWords(procedure: string | null | undefined): string | null {
  if (!procedure) return null;
  return PROCEDURE_WORDS[procedure.trim().toLowerCase()] ?? procedure.trim().toLowerCase();
}

/** The badges of a record (final §4.6): its procedure, the association, the offers, a ceiling a build still sums. */
export function sampleBadges(s: FactSample): string[] {
  const out: string[] = [];
  if (s.src === "da") out.push("achiziție directă");
  else { const p = procedureWords(s.procedure); if (p) out.push(p); }
  if (s.kind === "framework") out.push("plafon acord-cadru");
  if ((s.nWinners ?? 1) > 1) out.push(`asociere · ${countWords(s.nWinners!, "firmă", "firme")}${s.fullValue ? ` · contract ${formatRon(s.fullValue).replace(/ lei$/, "")}` : ""}`);
  if (s.bids !== null && s.bids !== undefined) out.push(s.bids === 1 ? "1 ofertă" : `${countWords(s.bids, "ofertă", "oferte")}`);
  return out;
}

/** "iul. 2018 – iun. 2026": a span of two days by month. */
const MONTHS = ["ian.", "feb.", "mar.", "apr.", "mai", "iun.", "iul.", "aug.", "sept.", "oct.", "nov.", "dec."];
export function monthSpan(first: string | null | undefined, last: string | null | undefined): string | null {
  if (!first || !last) return null;
  const month = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ""} ${iso.slice(0, 4)}`.trim();
  const a = month(first), b = month(last);
  if (a === b) return a;
  return first.slice(0, 4) === last.slice(0, 4) ? `${MONTHS[Number(first.slice(5, 7)) - 1]} – ${b}` : `${a} – ${b}`;
}
/** "11.06.2026" from an ISO day. */
export const roDay = (iso: string | null | undefined): string | null => iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : null;
/** The last day of data of both channels (the later one). */
export function coverageEnd(coverage: FactCheckData["coverage"]): string | null {
  const days = [coverage?.da, coverage?.contracts].filter((d): d is string => Boolean(d)).sort();
  return days.at(-1) ?? null;
}

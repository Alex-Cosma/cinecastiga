import { AWARD_COUNTING_CAVEAT, FLAG_META } from "./flags";
import { leiRounded } from "./lei";

/*
 * The words of a record page (owner, 7 November 2026: one template for contracts, direct acquisitions and notices).
 * SEAP writes procedures and states without diacritics and calls thousands of contracts "Contract subsecvent";
 * these helpers give each record a readable headline, a kind and a procedure in proper Romanian.
 */

const PROCEDURES: Record<string, string> = {
  "procedura simplificata": "Procedură simplificată",
  "procedura simplificata proprie": "Procedură simplificată proprie",
  "negociere fara publicare prealabila": "Negociere fără publicare prealabilă",
  "licitatie deschisa": "Licitație deschisă",
  "licitatie deschisa accelerata": "Licitație deschisă accelerată",
  "licitatie restransa": "Licitație restrânsă",
  "licitatie restransa accelerata": "Licitație restrânsă accelerată",
  "norme proprii (anexa 2)": "Norme proprii (Anexa 2)",
  "procedura competitiva cu negociere": "Procedură competitivă cu negociere",
  "procedura competitiva cu negociere accelerata": "Procedură competitivă cu negociere accelerată",
  "cerere de oferta": "Cerere de ofertă",
  "concurs de solutii deschis": "Concurs de soluții deschis",
  "concurs restrans": "Concurs restrâns",
  "dialog competitiv": "Dialog competitiv",
  "negociere": "Negociere",
};
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
/** SEAP numbers its lots ("1. Default lot", "4. Serviciu …"): the number says nothing on its own. */
const unnumbered = (s: string) => s.replace(/^\d+\s*[.)-]\s*/, "");

/** "NEGOCIERE FARA PUBLICARE PREALABILA" → "Negociere fără publicare prealabilă"; an unknown one keeps its text. */
export function procedureLabel(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  return PROCEDURES[fold(value)] ?? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

/** The record's kind, from the contract's financial kind (packages/db contractKind). */
export function kindLabel(kind: string | null | undefined): string {
  switch (kind) {
    case "framework": return "Acord-cadru";
    case "calloff": return "Comandă subsecventă";
    case "amendment": return "Act adițional";
    case "review": return "Tip neclar";
    default: return "Contract";
  }
}

export type DaStateKind = "accepted" | "refused" | "unaccepted" | "other";
const DA_STATES: Record<string, [string, DaStateKind]> = {
  "oferta acceptata": ["Ofertă acceptată", "accepted"],
  "oferta refuzata": ["Ofertă refuzată", "refused"],
  "conditii refuzate": ["Condiții refuzate", "refused"],
  "oferta neacceptata in termen": ["Ofertă neacceptată în termen", "unaccepted"],
  "conditii neacceptate la termen": ["Condiții neacceptate la termen", "unaccepted"],
};
/** A direct acquisition's state in Romanian and what it means: only an accepted offer is a purchase. */
export function daState(raw: string | null | undefined): { label: string; kind: DaStateKind } {
  const value = raw?.trim();
  if (!value) return {label: "Stare neprecizată", kind: "other"};
  const [label, kind] = DA_STATES[fold(value)] ?? [value, "other" as const];
  return {label, kind};
}

/** Titles that name nothing: "Contract", "Contract 707", "Contract subsecvent", "Contract de furnizare", a notice code. */
export function isGenericTitle(title: string | null | undefined, noticeNo?: string | null): boolean {
  const s = title?.trim();
  if (!s) return true;
  if (/^default lot\.?$/.test(fold(unnumbered(s)))) return true;
  if (noticeNo && fold(s) === fold(noticeNo)) return true;
  if (/^[A-Z]{2,4}\d{5,}$/.test(s)) return true;
  return s.length < 12 || /^(contract(ul)?|acord[- ]cadru)( (subsecvent|de (furnizare|servicii|lucrari|achizitie( publica)?)))?[\s\d./-]*(nr\.?[\s\d./-]*)?$/i.test(fold(s));
}

/** Compared without case, diacritics, punctuation or spacing: "1. Elaborarea hărților…" repeats "Elaborarea hartilor…". */
const bare = (s: string) => fold(s).replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * The lot line is worth showing unless it repeats the title or is SEAP's placeholder ("Default lot", "Lot 1"). The
 * lot's number does not make it new: "Lot 1. Elaborarea…" under the title "Elaborarea…" says nothing (UX audit bug 5).
 */
export function meaningfulLot(lot: string | null | undefined, title: string | null | undefined): string | null {
  const s = lot?.trim();
  if (!s || /^(default lot|lot( unic| \d+)?|lotul? \d+)\.?$/i.test(fold(unnumbered(s)))) return null;
  if (title && (bare(s) === bare(title) || bare(unnumbered(s)) === bare(title))) return null;
  return s;
}

/** A lot caption's number and object: "123. DOPAMINUM clorhidrat" → { no: "123", object: "DOPAMINUM clorhidrat" }. */
export function lotParts(lot: string | null | undefined): { no: string | null; object: string } | null {
  const s = lot?.trim();
  if (!s) return null;
  const m = /^(\d{1,4})\s*[.)-]\s*(\S[\s\S]*)$/.exec(s);
  return m ? { no: m[1]!, object: m[2]!.trim() } : { no: null, object: s };
}

/**
 * The lot's object as a page's title, when the record's own title is the one every lot of its notice shares (UX audit
 * Z7-03): only a lot that names something (not SEAP's placeholder, not a short code), else null and the title stays.
 */
export function lotTitle(lot: string | null | undefined): { no: string | null; object: string } | null {
  if (!meaningfulLot(lot, null)) return null;
  const parts = lotParts(lot);
  if (!parts || (parts.object.match(/\p{L}/gu)?.length ?? 0) < 4) return null;
  return parts;
}

/**
 * The page's headline: the record's own title when it names something, else the lot's object, the procedure's
 * title (a notice), the CPV category, and only then the kind. Never the notice number.
 */
export function recordHeadline(input: { title?: string | null; lot?: string | null; noticeTitle?: string | null; cpvName?: string | null; noticeNo?: string | null; kind: string }): string {
  const lot = meaningfulLot(input.lot, null);
  for (const candidate of [input.title, lot, input.noticeTitle]) if (candidate && !isGenericTitle(candidate, input.noticeNo)) return candidate.trim();
  return input.cpvName?.trim() || input.kind;
}

/** "16 minute", "3 ore", "2 zile": the time from a direct acquisition's publication to its finalization. */
export function durationLabel(from: string | null | undefined, to: string | null | undefined): string | null {
  if (!from || !to) return null;
  const minutes = Math.round((Date.parse(to.replace(" ", "T")) - Date.parse(from.replace(" ", "T"))) / 60000);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 60) return minutes === 1 ? "un minut" : `${minutes} ${minutes < 20 ? "minute" : "de minute"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return hours === 1 ? "o oră" : `${hours} ${hours < 20 ? "ore" : "de ore"}`;
  const days = Math.round(hours / 24);
  return `${days} ${days < 20 ? "zile" : "de zile"}`;
}

/**
 * What a contract's head can say about its value: the amount, a value published in another currency without a
 * confirmed rate (never converted: contract-money), or nothing published (UX audit Z7-valuta, Z7-10).
 */
export function contractValueState(c: { contractValueExact: string | null; legacyForeignValue: boolean; currency: string | null }): "amount" | "foreign" | "missing" {
  if (c.contractValueExact != null) return "amount";
  return c.legacyForeignValue && c.currency && c.currency.toUpperCase() !== "RON" ? "foreign" : "missing";
}

/**
 * The contracts found on a notice against the value it declares (UX audit Z7-09): said only when the two count the same
 * things (no framework ceiling on the notice, nothing kept out of the totals) and differ by at least 1%; the reason is
 * not in the source, so the sentence says so instead of guessing one.
 */
export function noticeGapNote(e: { total: string | null; award: string | null; frameworks: string | null; everyValue: string | null }): string | null {
  if (e.total == null || e.award == null || !(Number(e.award) > 0) || e.frameworks != null || e.everyValue !== e.total) return null;
  const gap = Math.round((Number(e.total) - Number(e.award)) * 100) / 100;
  if (Math.abs(gap) < Math.max(1, 0.01 * Number(e.award))) return null;
  const lei = (value: string) => leiRounded(value) ?? "—";
  return `Contractele găsite însumează ${lei(e.total)}, cu ${lei(Math.abs(gap).toFixed(2).replace(/\.00$/, ""))} ${gap > 0 ? "mai mult" : "mai puțin"}. Diferența nu e explicată în sursă.`;
}

/** Which two sentences of a signal's caveat say why it is not proof, where the first two are technical. */
const CAVEAT_PICK: Record<string, [number, number]> = {
  da_split: [3, 4], da_dependence: [3, 2], da_above_ceiling: [0, 2], da_first_month: [0, 2], award_single_bid: [4, 1],
};

/**
 * „De ce nu e o dovadă” on a record (UX audit Z7-06): two sentences, the usual explanations, in the signal's own words;
 * how a signal is counted and its technical limits stay in its rule on /metodologie, one click away („Regula →”).
 */
export function recordCaveat(code: string): string | null {
  const caveat = FLAG_META[code]?.caveat;
  if (!caveat) return null;
  const text = caveat.endsWith(AWARD_COUNTING_CAVEAT) ? caveat.slice(0, -AWARD_COUNTING_CAVEAT.length).trim() : caveat.trim();
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-ZĂÂÎȘȚ„])/u);
  const [a, b] = CAVEAT_PICK[code] ?? [0, 1];
  return [sentences[a], sentences[b]].filter((x): x is string => !!x).join(" ");
}

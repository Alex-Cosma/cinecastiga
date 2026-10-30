import { formatInt } from "../format";
import type { PROCEDURES, PURCHASE_KINDS } from "./spec";

/*
 * The common selection of F3 (plan §3, §4.1; kit §4): the purchase kind from
 * the CPV code, the procedure declared in SEAP and the size of the whole
 * purchase. Plain TypeScript for client and server: the words of the
 * sentence, the windows and the conditions, and the rules the engine applies
 * (predicates.ts writes the SQL from the same tables).
 */

export type PurchaseKind = (typeof PURCHASE_KINDS)[number];
export type Procedure = (typeof PROCEDURES)[number];

/**
 * The kind of a CPV division (stat final §3.3): works are division 45,
 * services 50–98, goods 03–44 and 48 (software packages). Every code of the
 * marts is in one of them (local copy, 26 Oct 2026: 0 codes elsewhere; 8 DA
 * records have no code and no kind); 46–47 do not exist.
 */
export function divisionKind(division: string): PurchaseKind | null {
  if (!/^\d{2}$/.test(division)) return null;
  if (division === "45") return "lucrari";
  if (division >= "50") return "servicii";
  if (division < "45" || division === "48" || division === "49") return "produse";
  return null;
}

/** The kinds a CPV prefix reaches: its division's, or every division under a one-digit prefix. */
export function prefixKinds(prefix: string): Set<PurchaseKind> {
  const kinds = new Set<PurchaseKind>();
  const digits = prefix.replace(/\D/g, "");
  if (digits.length >= 2) {
    const kind = divisionKind(digits.slice(0, 2));
    if (kind) kinds.add(kind);
  } else for (let d = 0; d <= 9; d++) {
    const kind = divisionKind(`${digits}${d}`);
    if (kind) kinds.add(kind);
  }
  return kinds;
}

/**
 * Whether a kind and a domain combine (plan §3, kit §5.3: "se combină, o
 * intersecție goală scoate tipul, cu notă"): some included prefix of the
 * domain is of that kind. Without a domain every kind applies.
 */
export function kindMeetsDomain(kind: PurchaseKind, prefixes: readonly string[]): boolean {
  return prefixes.length === 0 || prefixes.some((prefix) => prefixKinds(prefix).has(kind));
}

/**
 * Whether the engine applies a spec's kind with what its grounding matched
 * (the domain's codes; a comparison group's division grounds them without a
 * term). Not applied, it is left out with a note: the answer, its sources,
 * the pills and the spec returned (resolvedSpec) say the same thing.
 */
export function kindApplies(kind: PurchaseKind, grounding: { cpv?: { prefixes: readonly string[] } | undefined } | undefined): boolean {
  return kindMeetsDomain(kind, grounding?.cpv?.prefixes ?? []);
}
/** The note of a kind left out ("Despre „asfaltare”: …"), in the caveat's words. */
export function kindLeftOutNote(kind: PurchaseKind, term: unknown): string {
  return `„${String(term ?? "domeniul ales")}” nu are coduri de ${PURCHASE_KIND_WORDS[kind].noun}: am numărat domeniul întreg, fără tipul ales.`;
}

/** A code the builder knows without the server ("45", "33600000"): the kinds it reaches; null for words. */
export function codeKinds(term: unknown): Set<PurchaseKind> | null {
  const text = typeof term === "string" ? term.replace(/\s+/g, "") : "";
  return /^(?:\d{2,8}|\d{8}-\d)$/.test(text) ? prefixKinds(text.split("-")[0]!) : null;
}

/** The kit's words of each kind (kit §4 Domeniul: "Orice · Produse · Servicii · Lucrări", "de [lucrări]"). */
export const PURCHASE_KIND_WORDS: Record<PurchaseKind, { label: string; noun: string }> = {
  produse: { label: "Produse", noun: "produse" },
  servicii: { label: "Servicii", noun: "servicii" },
  lucrari: { label: "Lucrări", noun: "lucrări" },
};
/** The segmented's order (kit §4). */
export const PURCHASE_KIND_ORDER: readonly PurchaseKind[] = ["produse", "servicii", "lucrari"];

/**
 * The procedure types of marts.contract_transactions.procedure_type (0 NULL
 * on 1,110,721 rows, 26 Oct 2026) behind each procedure of the window (stat
 * final §3.1). "Alte proceduri" is the rest: restricted, competitive
 * negotiation, competitive dialogue, own rules (Anexa 2), requests for
 * offers, the own simplified procedure and "Negociere".
 */
export const PROCEDURE_TYPES: Record<Exclude<Procedure, "altele">, readonly string[]> = {
  deschisa: ["Licitatie deschisa", "Licitatie deschisa accelerata"],
  simplificata: ["Procedura simplificata"],
  negociere_fara_publicare: ["Negociere fara publicare prealabila"],
};
/** Every type the three named procedures hold: "altele" is what none holds. */
export const NAMED_PROCEDURE_TYPES: readonly string[] = Object.values(PROCEDURE_TYPES).flat();

/**
 * A procedure in the sentence, as the contracts' noun (stat final §1, kit §4
 * "Contracte"): "Cât valorează [contractele din licitații deschise]", "Câte
 * [contracte negociate fără publicare]", "valoarea [contractelor din proceduri
 * simplificate]", ", prin [licitații deschise]". The verbs stay the
 * contracts' ("încheiate de", "câștigate de").
 */
export interface ProcedureWords { label: string; detail?: string; the: string; bare: string; of: string; every: string; via: string }
export const PROCEDURE_WORDS: Record<Procedure, ProcedureWords> = {
  deschisa: {
    label: "Licitație deschisă", the: "contractele din licitații deschise", bare: "contracte din licitații deschise",
    of: "contractelor din licitații deschise", every: "contractele din licitații deschise", via: "licitații deschise",
  },
  simplificata: {
    label: "Procedură simplificată", the: "contractele din proceduri simplificate", bare: "contracte din proceduri simplificate",
    of: "contractelor din proceduri simplificate", every: "contractele din proceduri simplificate", via: "proceduri simplificate",
  },
  negociere_fara_publicare: {
    label: "Negociere fără publicare", detail: "Permisă în cazuri anume; o pistă, nu o abatere.",
    the: "contractele negociate fără publicare", bare: "contracte negociate fără publicare",
    of: "contractelor negociate fără publicare", every: "contractele negociate fără publicare", via: "negocieri fără publicare",
  },
  altele: {
    label: "Alte proceduri", detail: "Restrânsă, negociere competitivă, dialog, norme proprii…",
    the: "contractele din alte proceduri", bare: "contracte din alte proceduri",
    of: "contractelor din alte proceduri", every: "contractele din alte proceduri", via: "alte proceduri",
  },
};
/** The window's order (kit item 8, the group „O procedură anume”). */
export const PROCEDURE_ORDER: readonly Procedure[] = ["deschisa", "simplificata", "negociere_fara_publicare", "altele"];

/**
 * The size of the whole purchase (kit §4 "Mărimea achiziției"; stat final
 * §3.6): the value of the whole contract or direct acquisition, never a
 * winner's share. The lower bound is in the range, the upper one is not
 * ([min, max)), so the four ranges add up to the total.
 */
export interface ValueRange { purchaseValueMin?: number | undefined; purchaseValueMax?: number | undefined }
export const VALUE_RANGES: readonly (ValueRange & { label: string })[] = [
  { purchaseValueMax: 10_000, label: "Sub 10.000 lei" },
  { purchaseValueMin: 10_000, purchaseValueMax: 100_000, label: "10.000–100.000" },
  { purchaseValueMin: 100_000, purchaseValueMax: 1_000_000, label: "100.000–1 mil." },
  { purchaseValueMin: 1_000_000, label: "Peste 1 mil. lei" },
];

const short = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 1 });
/** "1 mil.", "2,5 mil.", "1 mld.", "100.000": a bound as the kit writes it, exact (a typed 1.250.000 stays whole). */
export function valueBound(n: number): string {
  if (n >= 1_000_000_000 && n % 100_000_000 === 0) return `${short.format(n / 1_000_000_000)} mld.`;
  if (n >= 1_000_000 && n % 100_000 === 0) return `${short.format(n / 1_000_000)} mil.`;
  return formatInt(n);
}

/**
 * The size in the words of the chip, the title's tail and the total line
 * (kit §4: "Doar cele de peste 1 mil. lei"): "de peste 1 mil. lei", "sub
 * 10.000 lei", "între 10.000 și 100.000 lei". Null without a bound.
 */
export function valueWords(range: ValueRange): string | null {
  const { purchaseValueMin: min, purchaseValueMax: max } = range;
  if (min === undefined && max === undefined) return null;
  if (min === undefined || min === 0) return max === undefined ? "de orice mărime" : `sub ${valueBound(max)} lei`;
  if (max === undefined) return `de peste ${valueBound(min)} lei`;
  return `între ${valueBound(min)} și ${valueBound(max)} lei`;
}

/**
 * The size ranges (VALUE_RANGES, [min, max)) a size covers when its bounds are
 * the ranges' own (a pill, or two of them in a row); null for bounds typed in
 * (50.000–250.000 lei), which agg_national_mix and agg_entity_kind_year cannot split.
 */
export function sizeRanges(min: number | null, max: number | null): number[] | null {
  const lows = VALUE_RANGES.map((r) => r.purchaseValueMin ?? 0);
  const from = min === null || min === 0 ? 0 : lows.indexOf(min);
  const to = max === null ? VALUE_RANGES.length : lows.indexOf(max);
  if (from < 0 || to < 0 || to <= from) return null;
  return Array.from({ length: to - from }, (_, i) => from + i);
}

/** The kit's range a size is on, or null for a range typed in ("Între … și … lei"). */
export function valueRangeIndex(range: ValueRange): number {
  return VALUE_RANGES.findIndex((r) => r.purchaseValueMin === range.purchaseValueMin && r.purchaseValueMax === range.purchaseValueMax);
}

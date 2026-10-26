import { countWords } from "../answer-text";
import type { Grounding } from "../ground";
import { countyIsFirmSeat, isHistoricalProfile, type PopulationCondition, type QueryPopulation } from "../population";
import { firmSeatWords, seatCountyWords } from "../seat";
import {
  KIND_OPTIONS, KIND_WORDS, countyWords, entityLabel, focalRole, periodLabel, subjectWords,
  type QuestionSpec,
} from "../question-ui";
import { countyDisplay } from "../resolved-spec";
import {
  DEFAULT_TREND_MIN_BASE, FIRM_SEATS, namedKind, type AskSpec, type AuthorityKind, type FirmSeat, type MonthWindow, type ParsedAuthorityKind,
} from "../spec";
import { formatExactDecimal, formatInt, formatRon } from "../../format";
import { monthsLabel } from "../months-window";
import { kindApplies, PROCEDURE_WORDS, PURCHASE_KIND_WORDS, valueWords, type Procedure, type PurchaseKind } from "../purchase";
import { TREND_ALL_CHANGES, TREND_FIRST_LABEL, TREND_GROUP_ROW, firstTimeWords, trendGroupLabel } from "./defs/trend";
import { filterContext } from "./context";
import { exclusionWords, isDaBoundPopulation, selectionOrigin, splitExcluded, type Excluded, type OriginHint, type OriginWords } from "./origin";
import { FILTERS, SPEC_PATH_OWNERS, presentPaths } from "./registry";
import { presentationTokens, sentenceTokens } from "./sentence";
import type { FilterId, FilterSpec } from "./types";
import {
  SINGLE_OFFER_WORDS, TREND_ORDER_WORDS, adminPhrase, employeesCount, employeesPhrase, employeesWords, localityName, periodWordsWith, streamPhrase, trendBaseWho,
} from "./words";

/*
 * describeConditions (plan §2.2 describe.ts, §0.4): every condition of a
 * question described in one place, in the words of each place that shows it:
 * the builder's chip, the "am înțeles" pills, the saved question's summary,
 * a watch's receipt (app/urmariri/ScopeConditions.tsx), the answer's caveat
 * and the sources' note, plus the title's tail (G7) and the total line (G8)
 * that F1b draws. Today's words are kept place by place; what the plan fixes
 * is fixed here once: numerals through countWords (G10), the label of a
 * selection another page produced (§2.6) and exclusions read "Fără X".
 * Plain TypeScript for client and server.
 */

/** What the caller knows besides the spec. */
export interface ConditionLabels {
  /** What the engine resolved: entity names, the place, the CPV codes and names (the pills). */
  grounding?: Grounding | undefined;
  /** The builder's name of a CPV code ("Domeniu: Lucrări de construcții · CPV 45"). */
  cpvName?: string | null | undefined;
  /** A page that binds its selection itself: a comparison group (origin.ts). */
  origin?: OriginHint | undefined;
  /** Names of the ids a population lists, where the caller knows them. */
  entities?: Readonly<Record<string, string>> | undefined;
  /** The months a trend's answer counted (its `executed.months`): what `months: "auto"` resolved to. */
  executedMonths?: MonthWindow | null | undefined;
  /**
   * `auto` the caller cannot resolve, or the reader's own "pe aceleași luni" on whole years: the title
   * says the rule, without months (the interpreter, lib/intent/to-spec.ts sentenceFor).
   */
  sameMonthsRule?: boolean | undefined;
  /** The years a trend's answer compared (its data.yearA/yearB): what a spec without years resolved to. */
  trendYears?: { yearA: number; yearB: number } | null | undefined;
}

export interface ScopeRow { label: string; value: string }

/** One condition, in the words of each place (absent: the place does not show it). */
export interface ConditionWords {
  id: FilterId;
  /** The condition in words, lowercase, for a list: the "Din link" chip, the total line. */
  words?: string;
  /** The title's tail, where it says less than `words` (null: nothing): a trend's months, only those it knows. */
  tail?: string | null;
  /** The chip (or the line) under today's builder sentence, with its detail. */
  chip?: string;
  chipDetail?: string;
  /** "Am înțeles" pills (lib/ask/pills.ts). */
  pills?: string[];
  /** Rows of a watch's receipt. */
  scope?: ScopeRow[];
  /** The saved question's summary (SavedQuestions). */
  summary?: string;
  /** The answer's caveat (runSpec) and the sources' note (runRows). */
  caveat?: string;
  note?: string;
  /** The full text behind a short chip: a precise selection's groups. */
  detail?: string;
  /** The page a population comes from (origin.ts). */
  origin?: OriginWords;
}

/** A precise selection, group by group, for a watch's receipt. */
export interface PopulationReceipt { intro: string; operator: string; groups: { title: string; items: string[] }[] }

export interface DescribedConditions {
  byId: Partial<Record<FilterId, ConditionWords>>;
  /** The condition pills, after the question's own (block, list length, measure: pills.ts). */
  pills: string[];
  scope: ScopeRow[];
  /** What is left of a population after its exclusions and its origin row. */
  receipt: PopulationReceipt | null;
  summary: string[];
  caveats: string[];
  /** The title's tail: the conditions under the sentence, without the leading comma (G7, R11; title.ts). */
  tail: string;
  /** What changes the total outside the sentence, or null (G8, component 21). */
  totalLine: string | null;
  /** The same, one condition each: the total line draws them apart ("· fără SYSTRA · firme cu 1–9 angajați"). */
  totalWords: string[];
}

/** Historical risk profiles: the archive of accepted direct acquisitions (entity_flags, runRows), whatever the link's stream. */
export const PROFILE_SOURCE_PILL = "profil istoric: achiziții directe acceptate, toată arhiva";
/** The builder's data stream chip. */
const STREAM_CHIP: Record<string, string> = { all: "Toate achizițiile", da: "Achiziții directe", contracts: "Contracte din proceduri" };
/** The data stream in the pills and a watch's receipt (kit §4: "Toate achizițiile", never "toate sursele"). */
const STREAM_PILL: Record<string, string> = { all: "toate achizițiile: directe și din proceduri", da: "doar achizițiile directe", contracts: "doar contractele din proceduri" };
const STREAM_SCOPE: Record<string, string> = { all: "Toate achizițiile: directe și din proceduri", da: "Achizițiile directe", contracts: "Contractele din proceduri" };
/** The kinds as the windows name them (kit §4 Tipurile), never "Comune", "Orașe și municipii", "Școli și licee". */
const KIND_SCOPE: Record<AuthorityKind, string> = {
  comuna: "Primării de comună", oras_municipiu: "Primării de oraș și municipiu", consiliu_judetean: "Consilii județene", spital: "Spitale", scoala: "Școli",
};

const records = (n: number) => countWords(n, "înregistrare", "înregistrări");
const capitalFirst = (text: string) => text.charAt(0).toLocaleUpperCase("ro-RO") + text.slice(1);
const numberOrUndefined = (value: unknown) => value === undefined || value === null || value === "" ? undefined : Number(value);
const conditionsOf = (p: QueryPopulation) => p.groups.reduce((n, group) => n + group.conditions.length, 0);

/** A list's nouns: named one, named many, counted one, counted many. */
const LIST_NOUNS = {
  authority: ["instituția", "instituțiile", "instituție", "instituții"], supplier: ["firma", "firmele", "firmă", "firme"],
  cpv: ["CPV", "CPV", "cod CPV", "coduri CPV"], county: ["județul", "județele", "județ", "județe"],
} as const;
const dayOf = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join(".") : iso;
/**
 * One condition of a precise selection in a chip's few words ("valoarea pe
 * câștigător ≥ 100.000 lei", "fără CPV 45"). Institutions and firms are named
 * from the link's labels or `known` (names the caller looked up), else
 * counted: never a bare id. A chip names at most two; `full` (the answer's
 * caveat and the sources' note) names every one it knows.
 */
function conditionWords(c: PopulationCondition, known: Readonly<Record<string, string>> = {}, full = false): string {
  if ("value" in c) return c.field === "value"
    ? `valoarea pe câștigător ${c.op === "gte" ? "≥" : "≤"} ${formatExactDecimal(c.value)} lei`
    : `data ${c.op === "gte" ? "≥" : "≤"} ${dayOf(c.value)}`;
  const [theOne, theMany, one, many] = LIST_NOUNS[c.field];
  const looked = c.values.every((v) => known[v]) ? c.values.map((v) => known[v]!) : null;
  const names = c.labels?.length === c.values.length ? c.labels : c.field === "cpv" || c.field === "county" ? c.values : looked;
  const what = names && (full || names.length <= 2) ? `${names.length === 1 ? theOne : theMany} ${names.join(", ")}` : countWords(c.values.length, one, many);
  return `${c.op === "not_in" ? "fără" : "doar"} ${what}`;
}

/**
 * A precise selection in the words of its chip, the title's tail and the total
 * line (kit P9 "Selecție avansată"): its conditions when there are one or two,
 * else how many there are; the (?) holds every group (populationDetail).
 * `named` false: the place's own chip, which already says "Selecție avansată:".
 */
export function preciseWords(population: QueryPopulation, named = true): string {
  const all = population.groups.flatMap((group) => group.conditions);
  if (all.length > 2) return `${named ? "selecție avansată, " : ""}${countWords(all.length, "condiție", "condiții")}`;
  const operator = population.groups.length > 1 ? population.operator : population.groups[0]?.operator ?? "and";
  return all.map((c) => conditionWords(c)).join(operator === "and" ? " și " : " sau ");
}

/**
 * The names an old link's precise selection lacks: ids of institutions and firms without labels, at most 20 (else none:
 * they are counted). Where a chip would name them (a list of one or two); `all`, every list (the server's caveat and note).
 */
export function unnamedEntityIds(population: QueryPopulation | undefined, all = false): string[] {
  const ids = new Set<string>();
  for (const c of population?.groups.flatMap((group) => group.conditions) ?? [])
    if ("values" in c && (c.field === "authority" || c.field === "supplier") && c.labels?.length !== c.values.length && (all || c.values.length <= 2))
      for (const id of c.values) ids.add(id);
  return ids.size <= 20 ? [...ids] : [];
}

/**
 * A precise selection's (?) (kit P9): every group, each condition in its
 * chip's words, institutions and firms named where `known` names them, else
 * counted (an old link without labels; the builder looks the names up after
 * the answer, the server with its grounding). `full`: every name known, not
 * only one or two (the answer's caveat, the sources' note).
 */
export function populationDetail(population: QueryPopulation, known: Readonly<Record<string, string>> = {}, full = false): string {
  const group = (g: QueryPopulation["groups"][number]) => g.conditions.map((c) => conditionWords(c, known, full)).join(g.operator === "and" ? " ȘI " : " SAU ");
  return population.groups.length === 1 ? group(population.groups[0]!) : population.groups.map((g) => `(${group(g)})`).join(population.operator === "and" ? " ȘI " : " SAU ");
}

/** What "Scoate din calcul" left out, every name, one kind after another: "firma SYSTRA", "instituțiile A, B" (caveat, note). */
function outWords(excluded: readonly Excluded[]): string {
  return [...new Set(excluded.map((e) => e.field))].map((field) => {
    const names = excluded.filter((e) => e.field === field).map((e) => e.label);
    const [theOne, theMany] = LIST_NOUNS[field];
    return `${names.length === 1 ? theOne : theMany} ${names.join(", ")}`;
  }).join("; ");
}

const RECEIPT_NAMES = { authority: "Instituția", supplier: "Firma", cpv: "Codul CPV", county: "Județul" };
function receiptCondition(c: PopulationCondition): string {
  if ("value" in c) return c.field === "value" ? `Valoare ${c.op === "gte" ? "de cel puțin" : "de cel mult"} ${formatExactDecimal(c.value)} lei` : `Data achiziției ${c.op === "gte" ? "începând cu" : "până la"} ${c.value}`;
  return `${RECEIPT_NAMES[c.field]} ${c.op === "not_in" ? "nu este în" : "este în"}: ${c.values.map((value, i) => c.labels?.[i] && c.labels[i] !== value ? `${c.labels[i]} (${value})` : value).join(", ")}`;
}
function receiptOf(population: QueryPopulation): PopulationReceipt {
  return {
    intro: "În plus față de filtrele întrebării, se aplică următoarele condiții:",
    operator: population.operator === "and" ? "Trebuie îndeplinite toate grupurile de mai jos:" : "Este suficient să fie îndeplinit unul dintre grupurile de mai jos:",
    groups: population.groups.map((group, i) => ({ title: `Grupul ${i + 1} · ${group.operator === "and" ? "toate condițiile" : "oricare condiție"}`, items: group.conditions.map(receiptCondition) })),
  };
}

type Spec = FilterSpec;
type Describe = (spec: Spec, labels: ConditionLabels) => Omit<ConditionWords, "id"> | null;
const named = (spec: Spec, role: "authority" | "supplier") => Boolean(spec.filters[`${role}Name`] || spec.filters[`${role}Id`]);

/** Each condition of today's builder and engine, in the order of the registry's families. */
const DESCRIBE: Partial<Record<FilterId, Describe>> = {
  dataset: (spec) => {
    const ds = spec.dataset ?? "all", profile = isHistoricalProfile(spec);
    // A profile reads every stream as its archive: the engine does not apply these words there (registry engine).
    const words = streamPhrase({ dataset: ds, filters: {} });
    // A procedure names its contracts itself ("doar contractele din licitații deschise"): one pill.
    const procedure = ds === "contracts" && spec.filters.procedure !== undefined;
    return {
      ...(words ? { words } : {}),
      chip: STREAM_CHIP[ds] ?? STREAM_CHIP.all!,
      pills: procedure ? [] : [profile ? PROFILE_SOURCE_PILL : STREAM_PILL[ds] ?? STREAM_PILL.all!],
      scope: [{ label: "Ce fel de achiziții", value: profile ? "Profil istoric: achiziții directe acceptate, cu valoare pozitivă de cel mult 2.000.000 lei" : STREAM_SCOPE[ds] ?? STREAM_SCOPE.all! }],
      ...(spec.dataset === "contracts" ? { summary: "Contracte din proceduri" } : spec.dataset === "da" ? { summary: "Achiziții directe" } : {}),
    };
  },
  cpvTerm: (spec, { grounding, cpvName }) => {
    // The pills say what the engine matched: a comparison group's division grounds a CPV without a term.
    const cpv = grounding?.cpv?.prefixes.length ? grounding.cpv : null;
    const pills: string[] = [];
    if (cpv) {
      const names = cpv.matchedNames;
      pills.push(names.length === 0 ? `CPV ${cpv.prefixes.join(", ")}` : names.length <= 2 ? names.join(" + ") : `${names[0]} +${countWords(names.length - 1, "CPV", "CPV")}`);
      const excluded = cpv.excludePrefixes?.length ?? 0;
      if (excluded) pills.push(`fără ${excluded === 1 ? "o subclasă" : countWords(excluded, "subclasă", "subclase")} (vezi limitele)`);
    }
    const term = spec.filters.cpvTerm === undefined || spec.filters.cpvTerm === "" ? null : String(spec.filters.cpvTerm);
    if (!term) return pills.length ? { pills } : null;
    const isCode = /^(?:\d{2,8}|\d{8}-\d)$/.test(term.replace(/\s+/g, ""));
    return {
      words: `pentru ${subjectWords(spec)}`,
      chip: `Domeniu: ${isCode ? cpvName ?? `CPV ${term}` : term}`,
      ...(isCode && cpvName ? { chipDetail: `CPV ${term}` } : {}),
      pills, scope: [{ label: "Domeniu / CPV", value: term }], summary: `CPV: ${term}`,
    };
  },
  authorityKind: (spec) => {
    const raw = spec.filters.authorityKind;
    if (!raw) return null;
    const kind = namedKind(raw as ParsedAuthorityKind);
    const known = kind && KIND_SCOPE[kind] ? kind : undefined;
    return {
      ...(known ? { words: `doar ${KIND_WORDS[known]!.bare}`, pills: [`doar ${KIND_WORDS[known]!.bare}`] } : {}),
      chip: (KIND_OPTIONS.find(([id]) => id === raw) ?? KIND_OPTIONS[0])[1],
      // A kind read ahead (local_admin) belongs to a newer release; its watch is refused, not shown as another kind.
      scope: [{ label: "Tipul instituției", value: known ? KIND_SCOPE[known] : "dintr-o versiune mai nouă a site-ului" }],
    };
  },
  authority: (spec, { grounding }) => {
    const f = spec.filters;
    const pills = grounding?.authority?.nameDisplay ? [grounding.authority.nameDisplay] : [];
    if (!named(spec, "authority")) return pills.length ? { pills } : null;
    return {
      words: `instituția „${entityLabel(spec, "authority")}”`, chip: entityLabel(spec, "authority"), pills,
      scope: [{ label: "Instituție", value: `${f.authorityName ?? "Identificator"}${f.authorityId ? ` · ${f.authorityId}` : ""}` }],
      summary: String(f.authorityName || `Instituția #${f.authorityId}`),
    };
  },
  supplier: (spec, { grounding }) => {
    const f = spec.filters;
    const pills = grounding?.supplier?.nameDisplay ? [grounding.supplier.nameDisplay] : [];
    if (!named(spec, "supplier")) return pills.length ? { pills } : null;
    return {
      words: `firma „${entityLabel(spec, "supplier")}”`, chip: entityLabel(spec, "supplier"), pills,
      scope: [{ label: "Firmă", value: `${f.supplierName ?? "Identificator"}${f.supplierId ? ` · ${f.supplierId}` : ""}` }],
      summary: String(f.supplierName || `Firma #${f.supplierId}`),
    };
  },
  compareWith: (spec, { grounding }) => {
    const f = spec.filters;
    const pills = grounding?.compare?.nameDisplay ? [`vs ${grounding.compare.nameDisplay}`] : [];
    if (!f.compareWith && !f.compareWithId) return pills.length ? { pills } : null;
    return {
      words: `comparat cu „${f.compareWith || `Entitatea #${f.compareWithId}`}”`, pills,
      scope: [{ label: "Comparație cu", value: `${f.compareWith ?? "Identificator"}${f.compareWithId ? ` · ${f.compareWithId}` : ""}` }],
    };
  },
  locality: (spec, { grounding }) => {
    const f = spec.filters;
    const pills = grounding?.uat ? [String(f.uatName ?? grounding.uat.name ?? `UAT ${grounding.uat.siruta}`)] : [];
    if (!f.uatSiruta && !f.uatName) return pills.length ? { pills } : null;
    return {
      words: `primăria ${f.uatName ? localityName(String(f.uatName)) : `localității ${f.uatSiruta}`}`,
      chip: String(f.uatName || `Localitatea #${f.uatSiruta}`), pills,
      scope: [{ label: "Localitate", value: `${f.uatName ?? "Localitate"} · SIRUTA ${f.uatSiruta ?? "nespecificat"}` }],
    };
  },
  county: (spec, { grounding }) => {
    const canonical = grounding?.county?.canonical;
    const pills = canonical ? [canonical === "Bucuresti" ? "București" : `județul ${countyDisplay(canonical)}`] : [];
    const county = spec.filters.county ? String(spec.filters.county) : null;
    if (!county) return pills.length ? { pills } : null;
    // On a firm profile the county is the firm's own seat (countyIsFirmSeat, R0).
    const where = countyWords(county);
    return {
      words: countyIsFirmSeat(spec, focalRole(spec)) ? `cu sediul ${where.replace(/^din /, "în ")}` : where,
      chip: county, pills, scope: [{ label: "Județ", value: county }],
    };
  },
  // F4, the firm's seat (kit §4 "Sediul firmei"): glued to the firms that are the subject; on a ranking the total
  // line says whose total it is ("doar firmele cu sediul în alt județ", G8), on a firm profile the group's seat.
  firmSeat: (spec) => {
    const seat = spec.filters.firmSeat as FirmSeat | undefined;
    if (!seat || !(FIRM_SEATS as readonly string[]).includes(seat)) return null;
    const where = firmSeatWords(seat, spec.filters.county ? String(spec.filters.county) : null);
    return {
      words: `doar firmele cu sediul ${where}`, chip: `Cu sediul ${where}`, pills: [`cu sediul ${where}`],
      scope: [{ label: "Sediul firmei", value: `${where.charAt(0).toLocaleUpperCase("ro-RO")}${where.slice(1)} (față de instituție)` }],
    };
  },
  seatCounty: (spec, { grounding }) => {
    const county = spec.filters.seatCounty ? String(spec.filters.seatCounty) : null;
    if (!county) return null;
    const where = seatCountyWords(grounding?.seatCounty?.canonical ?? county);
    return {
      words: isHistoricalProfile(spec) ? `cu sediul ${where}` : `doar firmele cu sediul ${where}`, chip: `Cu sediul ${where}`, pills: [`cu sediul ${where}`],
      scope: [{ label: "Sediul firmei", value: county }],
    };
  },
  admin: (spec, { grounding }) => {
    const f = spec.filters;
    const pills = grounding?.admin?.personKey && grounding.admin.display ? [`conduse azi de ${grounding.admin.display}`] : [];
    if (!f.adminName && !f.adminPersonKey) return pills.length ? { pills } : null;
    return {
      words: adminPhrase(f.adminName), chip: `Conduse azi de ${f.adminName || "persoana selectată"}`, pills,
      scope: [{ label: "Reprezentant legal", value: String(f.adminName ?? f.adminPersonKey) }],
    };
  },
  period: (spec) => {
    const f = spec.filters;
    const bound = (y: unknown, m: unknown) => y === undefined ? null : m ? `${y}-${String(m).padStart(2, "0")}` : String(y);
    const from = bound(f.yearFrom, f.monthFrom), to = bound(f.yearTo, f.monthTo);
    const pills = f.yearFrom || f.yearTo
      ? [spec.block === "trend" ? `${from ?? "?"} → ${to ?? "?"}` : from && to && from !== to ? `${from}–${to}` : (from ?? to)!]
      : isHistoricalProfile(spec) ? [] : ["toți anii"];
    const mark = (y: unknown, m: unknown) => `${y}${m ? `-${String(m).padStart(2, "0")}` : ""}`;
    return {
      ...(f.yearFrom || f.yearTo ? { words: periodWordsWith(f) } : {}),
      chip: periodLabel(spec), pills,
      scope: [{ label: "Perioada întrebării", value: f.yearFrom || f.yearTo ? `${f.yearFrom ? mark(f.yearFrom, f.monthFrom) : "De la începutul datelor"} — ${f.yearTo ? mark(f.yearTo, f.monthTo) : "fără limită finală"}` : "Fără limite de an în filtrele de pornire" }],
    };
  },
  // F3, the common selection (kit §4: "Lucrări", "Licitație deschisă", "Doar cele de peste 1 mil. lei").
  purchaseKind: (spec, { grounding }) => {
    const kind = spec.filters.purchaseKind as PurchaseKind | undefined;
    // Left out by the engine when the domain has no codes of it (kindApplies): its caveat says so, no pill.
    if (!kind || !PURCHASE_KIND_WORDS[kind] || grounding && !kindApplies(kind, grounding)) return null;
    const { label, noun } = PURCHASE_KIND_WORDS[kind];
    return { words: `doar ${noun}`, chip: label, pills: [`doar ${noun}`], scope: [{ label: "Ce s-a cumpărat", value: `${label} (după codul CPV)` }], summary: label };
  },
  procedure: (spec) => {
    const procedure = spec.filters.procedure as Procedure | undefined;
    if (!procedure || !PROCEDURE_WORDS[procedure]) return null;
    const { label, the } = PROCEDURE_WORDS[procedure];
    return { words: `doar ${the}`, chip: label, pills: [`doar ${the}`], scope: [{ label: "Procedura", value: label }], summary: label };
  },
  purchaseValue: (spec) => {
    const range = { purchaseValueMin: numberOrUndefined(spec.filters.purchaseValueMin), purchaseValueMax: numberOrUndefined(spec.filters.purchaseValueMax) };
    const words = valueWords(range);
    if (!words) return null;
    const whole = "Mărimea e valoarea întregului contract sau a achiziției directe, nu cota fiecărui câștigător; sumele rămân pe cote.";
    return {
      words: `doar cele ${words}`, chip: `Doar cele ${words}`, pills: [`doar achizițiile ${words}`],
      scope: [{ label: "Mărimea achiziției", value: capitalFirst(words) }], summary: capitalFirst(words), caveat: whole, note: whole,
    };
  },
  // Kit §4 "Oferte": "o singură ofertă", never "un singur ofertant".
  singleBidder: (spec) => spec.filters.singleBidder ? {
    words: SINGLE_OFFER_WORDS, chip: "O singură ofertă", pills: ["o singură ofertă"],
    scope: [{ label: "Concurență", value: "Doar contractele cu o singură ofertă confirmată" }],
  } : null,
  employees: (spec) => {
    const f = spec.filters;
    if (f.minEmployees === undefined && f.maxEmployees === undefined) return null;
    const min = f.minEmployees === undefined ? undefined : Number(f.minEmployees);
    const max = f.maxEmployees === undefined ? undefined : Number(f.maxEmployees);
    const range = min !== undefined && max !== undefined ? `${formatInt(min)}–${employeesCount(max)}` : null;
    return {
      words: employeesPhrase(min, max)!,
      chip: range ?? (max !== undefined ? `Cel mult ${employeesCount(max)}` : `Cel puțin ${employeesCount(min!)}`),
      pills: [range ?? (max !== undefined ? max === 0 ? "fără angajați" : `cel mult ${employeesCount(max)}` : `cel puțin ${employeesCount(min!)}`)],
      scope: [{ label: "Angajați", value: `${f.minEmployees ?? 0} — ${f.maxEmployees ?? "fără limită maximă"}` }],
    };
  },
  minimumRecords: (spec) => {
    const m = spec.minimumRecords;
    if (!m) return null;
    const authority = m.role === "authority", n = records(m.count);
    return {
      words: `${authority ? "instituții" : "firme"} cu cel puțin ${n} în selecție`,
      chip: `${authority ? "Instituții" : "Firme"}: cel puțin ${n} în selecție.`,
      pills: [`${authority ? "instituții" : "firme"} cu ≥ ${n} în selecție`],
      scope: [{ label: "Populație minimă", value: `${authority ? "Instituții" : "Firme"} cu cel puțin ${n} în selecție` }],
      summary: `Minimum ${n}`,
      caveat: `Păstrăm ${authority ? "instituțiile" : "firmele"} cu cel puțin ${n} în selecția filtrată. O atribuire pe câștigător este o înregistrare; pragul nu numără contracte distincte.`,
      note: `Pragul de ${n} pentru ${authority ? "instituții" : "firme"} se calculează înainte de selecția unui grup și filtrele locale ale surselor.`,
    };
  },
  population: (spec, { origin: hint, entities: named, grounding }) => {
    const p = spec.population;
    if (!p) return null;
    // An old link's entities without labels by their names: the caller's, or the server's grounding (looked up with it); else counted.
    const entities = { ...grounding?.entities, ...named };
    const precise = populationDetail(p, entities, true);
    const origin = selectionOrigin(p, hint, entities);
    if (origin) {
      const text = `${origin.label}: ${origin.words}`;
      return {
        origin, words: origin.words, chip: text, pills: [text], summary: text, detail: populationDetail(p, entities),
        scope: [{ label: origin.label, value: origin.words }],
        caveat: `${text}. Valorile se referă la cota alocată fiecărui furnizor.`, note: `${text}.`,
      };
    }
    const { excluded, rest } = splitExcluded(p);
    const restWords = rest ? preciseWords(rest) : null;
    // "Scoate din calcul" (F4) in its own words, never "Selecție precisă" (kit §4): the pill as the total line, the
    // answer's caveat and the sources' note with every name; the rest of a precise selection keeps its own words.
    const out = excluded.length ? outWords(excluded) : null;
    const restPrecise = rest ? populationDetail(rest, entities, true) : null;
    return {
      words: [...exclusionWords(excluded), ...(restWords ? [restWords] : [])].join(", "),
      chip: precise, detail: populationDetail(p, entities),
      pills: [
        ...exclusionWords(excluded),
        ...(rest ? [`Selecție precisă · ${countWords(conditionsOf(rest), "condiție", "condiții")} în ${countWords(rest.groups.length, "grup", "grupuri")}`] : []),
      ],
      ...(excluded.length ? { scope: [{ label: "Scoase din calcul", value: excluded.map((e) => `Fără ${e.label}${e.label !== e.value ? ` (${e.value})` : ""}`).join(", ") }] } : {}),
      summary: precise,
      caveat: [
        ...(restPrecise ? [`Selecție precisă aplicată: ${restPrecise}. Datele și limitele sunt inclusive; valorile se referă la cota alocată fiecărui furnizor.`] : []),
        ...(out ? [`Scoase din calcul: ${out}.`] : []),
      ].join(" "),
      note: [...(restPrecise ? [`Selecție precisă aplicată: ${restPrecise}.`] : []), ...(out ? [`Scoase din calcul: ${out}.`] : [])].join(" "),
    };
  },
  // F2, the trend's lenses (kit §4: „Noi” always with its year, „Nu mai apar”, „Aceleași luni: ian.–mai”, „Prima dată”).
  trendChange: (spec) => {
    const change = spec.trend?.change;
    if (!change) return null;
    const { yearFrom: a, yearTo: b } = spec.filters;
    const label = trendGroupLabel(change, a, b);
    const words = (change === "all" ? TREND_ALL_CHANGES : label).toLocaleLowerCase("ro-RO");
    // „Grupa”, as the drawer's header, „Urmărește grupa” and a watch's fixed group (MF-note-grupei).
    return { words, chip: label, pills: [words], scope: [{ label: TREND_GROUP_ROW, value: change === "all" ? TREND_ALL_CHANGES : label }], summary: label };
  },
  trendMonths: (spec, labels) => {
    const months = spec.trend?.months;
    if (months === undefined) return null;
    // `auto` as the answer ran it (labels.executedMonths, the pills): its months, and no pill on whole years (trend final §3.3).
    const whole = (w: MonthWindow) => w[0] === 1 && w[1] === 12;
    const ran = months === "auto" ? labels.executedMonths ?? null : null;
    const window: MonthWindow | null = Array.isArray(months) ? months as MonthWindow : ran && !whole(ran) ? ran : null;
    const chosen = window ? monthsLabel({ from: window[0], to: window[1] }) : null;
    const chip = months === "whole" ? "Ani întregi" : chosen ? `Aceleași luni: ${chosen}` : "Aceleași luni";
    const rule = Array.isArray(months) ? chosen : null;
    // The title says the months only where they are known and part of a year (trend final §1): chosen
    // ones, or those the answer counted; `auto` before its answer is the rule, which the summary says.
    const tail = window && !whole(window) ? `pe aceleași luni: ${chosen}` : months === "auto" && labels.sameMonthsRule ? "pe aceleași luni" : null;
    return {
      words: months === "whole" ? "pe ani întregi" : chosen ? `pe aceleași luni: ${chosen}` : "pe aceleași luni", tail,
      chip, pills: ran && !window ? [] : [chip.toLowerCase()],
      ...(tail ? {} : { summary: chip }),
      scope: [{ label: "Luni comparate", value: months === "whole" ? "Ani întregi" : rule ? `${rule}, în ambii ani` : "Aceleași luni în ambii ani, până la ultima lună completă" }],
    };
  },
  // F3, the evolution's lenses (final timeseries §5.4: the title says the state, „…, an de an, pe domenii, …”).
  timeseriesGrain: (spec) => spec.timeseries?.grain === "month"
    ? { words: "lună de lună", pills: [], scope: [{ label: "Ritmul", value: "Lună de lună" }] } : null,
  timeseriesSplit: (spec) => {
    const split = spec.timeseries?.split;
    if (!split) return null;
    const words = split === "channel" ? "pe directe și proceduri" : "pe domenii";
    return { words, chip: capitalFirst(words), pills: [words], scope: [{ label: "Împarte", value: split === "channel" ? "Directe / proceduri" : "Domenii (diviziuni CPV)" }], summary: capitalFirst(words) };
  },
  timeseriesMonths: (spec, labels) => {
    const months = spec.timeseries?.months;
    if (months === undefined) return null;
    // `auto` as the answer ran it (labels.executedMonths), as the trend's; whole years say nothing in the title.
    const ran = months === "auto" ? labels.executedMonths ?? null : null;
    const window: MonthWindow | null = Array.isArray(months) ? months as MonthWindow : ran && !(ran[0] === 1 && ran[1] === 12) ? ran : null;
    const chosen = window ? monthsLabel({ from: window[0], to: window[1] }) : null;
    const chip = chosen ? `Aceleași luni: ${chosen}` : "Aceleași luni";
    return {
      words: chosen ? `pe aceleași luni: ${chosen}` : "pe aceleași luni", tail: chosen ? `pe aceleași luni: ${chosen}` : null,
      chip, pills: ran && !window ? [] : [chip.toLowerCase()], ...(chosen ? {} : { summary: chip }),
      scope: [{ label: "Luni numărate", value: chosen ? `${chosen}, în fiecare an` : "Aceleași luni în fiecare an, până la ultima lună completă" }],
    };
  },
  // Kit §6 trend 4: "după [diferența în lei | creșterea în procente]", the presentation line's words (P5).
  trendOrder: (spec) => {
    const order = spec.trend?.order;
    if (!order) return null;
    const words = `după ${TREND_ORDER_WORDS[order]}`, chip = capitalFirst(TREND_ORDER_WORDS[order]);
    return { words, chip, pills: [words], scope: [{ label: "Ordine", value: chip }] };
  },
  trendMinBase: (spec) => {
    // A percent order without its base ranks from 1 mil. lei (TREND_RULES): said as applied.
    const base = spec.trend?.minBase ?? (spec.trend?.order === "percent" ? DEFAULT_TREND_MIN_BASE : undefined);
    if (base === undefined) return null;
    const when = spec.filters.yearFrom ? ` în ${spec.filters.yearFrom}` : "";
    return {
      words: `dintre ${trendBaseWho(spec.dim)} cu cel puțin ${formatRon(base)}${when}`, chip: `Cel puțin ${formatRon(base)}${when}`, pills: [`cel puțin ${formatRon(base)}${when}`],
      scope: [{ label: "Baza creșterii", value: `Cel puțin ${formatRon(base)}${when}` }],
    };
  },
  trendFirstOnly: (spec) => {
    if (!spec.trend?.firstOnly) return null;
    const year = spec.filters.yearTo ? ` în ${spec.filters.yearTo}` : "";
    const words = firstTimeWords(spec.filters.yearTo);
    return {
      words, chip: capitalFirst(words), pills: [words],
      scope: [{ label: TREND_FIRST_LABEL, value: `Prima înregistrare în datele noastre${year}` }],
    };
  },
};

/** The filters that have words: every key of today's engine but the shape of the answer (pills.ts) and the ignored comparison mode. */
export const DESCRIBED_FILTERS = Object.keys(DESCRIBE) as FilterId[];

/** The order of each place, today's. */
const TREND_ORDER: readonly FilterId[] = ["trendChange", "trendFirstOnly", "trendMonths", "trendOrder", "trendMinBase"];
const SERIES_ORDER: readonly FilterId[] = ["timeseriesGrain", "timeseriesSplit", "timeseriesMonths"];
const PILL_ORDER: readonly FilterId[] = ["purchaseKind", "cpvTerm", "authorityKind", "authority", "supplier", "compareWith", "locality", "county", "firmSeat", "seatCounty", "admin", "period", ...TREND_ORDER, ...SERIES_ORDER, "singleBidder", "employees", "dataset", "procedure", "purchaseValue", "population", "minimumRecords"];
const SCOPE_ORDER: readonly FilterId[] = ["authority", "supplier", "compareWith", "purchaseKind", "cpvTerm", "county", "firmSeat", "seatCounty", "locality", "authorityKind", "admin", "period", ...TREND_ORDER, ...SERIES_ORDER, "dataset", "procedure", "purchaseValue", "singleBidder", "employees", "minimumRecords", "population"];
// A trend's group is its title's own word (sentence.ts); its months, when the title does not say them.
const SUMMARY_ORDER: readonly FilterId[] = ["dataset", "procedure", "authority", "supplier", "purchaseKind", "cpvTerm", "purchaseValue", "trendMonths", "timeseriesSplit", "timeseriesMonths", "population", "minimumRecords"];
const CAVEAT_ORDER: readonly FilterId[] = ["purchaseValue", "population", "minimumRecords"];

/**
 * The conditions a question applies outside its basic sentence and that change
 * the total (G8): selections the engine applies on this answer that the
 * sentence does not say (a partners' row, a link's chip), and the selections
 * glued to the ranked firms (their size, administrator or seat). A town hall
 * says its county.
 */
function outsideSentence(spec: Spec): FilterId[] {
  const ctx = filterContext(spec);
  const said = new Set<FilterId>();
  for (const token of sentenceTokens(spec, ctx))
    if (token.kind === "fixed" || token.kind === "slot" && !token.glued) for (const id of token.says) said.add(id);
  if (said.has("locality")) said.add("county");
  const ids = new Set<FilterId>();
  for (const path of presentPaths(spec)) {
    const owner = SPEC_PATH_OWNERS[path];
    if (!owner || owner === "question" || said.has(owner)) continue;
    // The home page's direct-acquisition ceiling is the engine's own: it narrows nothing (no chip, no title words).
    if (owner === "population" && isDaBoundPopulation(spec)) continue;
    const def = FILTERS[owner];
    if (def.engine[ctx.form] !== undefined && def.scope(ctx.form, spec) === "selection") ids.add(owner);
  }
  return PILL_ORDER.filter((id) => ids.has(id));
}

/**
 * The partners' row of a relation (blocks.ts partners, P3b) says whose
 * condition it is in the title's tail and the total line, as the kit's "doar
 * furnizorii cu sediul în alt județ" (G8): "doar furnizorii cu 1–9 angajați",
 * "doar furnizorii conduși azi de X" (the network), "doar clienții din județul
 * Ilfov", "doar spitalele din județul Ilfov" (a kind with its county, one phrase).
 * An empty string: said with another chip's words.
 */
function partnerWords(spec: Spec): Partial<Record<FilterId, string>> {
  if (spec.block !== "network" && spec.block !== "sankey") return {};
  const f = spec.filters;
  if (focalRole(spec) === "authority") {
    const size = employeesWords(f.minEmployees, f.maxEmployees);
    const person = spec.block === "network" && (f.adminName || f.adminPersonKey) ? String(f.adminName ?? "persoana aleasă") : null;
    return { ...(size ? { employees: `doar furnizorii ${size}` } : {}), ...(person ? { admin: `doar furnizorii conduși azi de ${person}` } : {}) };
  }
  const kind = typeof f.authorityKind === "string" ? KIND_WORDS[f.authorityKind]?.the : undefined;
  const place = f.county ? countyWords(String(f.county)) : null;
  if (kind) return { authorityKind: `doar ${kind}${place ? ` ${place}` : ""}`, ...(place ? { county: "" } : {}) };
  return place ? { county: `doar clienții ${place}` } : {};
}

/** The shape of the answer, not a condition (the sentence's subject, its axis, the presentation line). */
const SHAPE: ReadonlySet<FilterId> = new Set(["dim", "measure", "topN", "rankBy", "comparisonMode"]);

/**
 * The title's tail (G7, R11): the conditions under the sentence (P4), in the
 * kit's order: the exclusions ("fără SYSTRA"), then what the engine applies
 * and the sentence does not say, a link's chip, another page's selection, a
 * partners' row, "Selecție avansată". What only the profile line or the
 * engine's own ceiling says has no words here (legacyConditions' noChip),
 * nor what the presentation line says (title.ts names a non-default order).
 */
function titleTailWords(spec: Spec, byId: Partial<Record<FilterId, ConditionWords>>, labels: ConditionLabels): string[] {
  const ctx = filterContext(spec);
  const said = new Set<FilterId>();
  for (const token of [...sentenceTokens(spec, ctx, { cpvName: labels.cpvName }), ...presentationTokens(spec)])
    if (token.kind !== "text") for (const id of token.says) said.add(id);
  if (said.has("locality")) said.add("county");
  const owners = new Set<FilterId>();
  for (const path of presentPaths(spec)) {
    const owner = SPEC_PATH_OWNERS[path];
    if (!owner || owner === "question" || SHAPE.has(owner) || said.has(owner) || FILTERS[owner].engine[ctx.form] === undefined) continue;
    if (owner === "dataset" && (spec.dataset === "all" || ctx.profile && spec.dataset !== "contracts")) continue;
    if (owner === "population" && isDaBoundPopulation(spec)) continue;
    owners.add(owner);
  }
  const words: string[] = [];
  const origin = byId.population?.origin;
  if (owners.has("population")) {
    if (origin) words.push(`${origin.label.charAt(0).toLocaleLowerCase("ro-RO")}${origin.label.slice(1)}: ${origin.words}`);
    else {
      const { excluded, rest } = splitExcluded(spec.population);
      words.push(...exclusionWords(excluded));
      if (rest) words.push(preciseWords(rest));
    }
  }
  const row = partnerWords(spec);
  for (const id of PILL_ORDER) {
    if (id === "population" || !owners.has(id)) continue;
    const own = byId[id];
    const said = row[id] ?? (own?.tail !== undefined ? own.tail : own?.words);
    if (said) words.push(said);
  }
  return words;
}

/** Every condition of a spec, in the words of each place (plan §2.2). */
export function describeConditions(input: QuestionSpec | AskSpec, labels: ConditionLabels = {}): DescribedConditions {
  const spec = input as Spec;
  const byId: Partial<Record<FilterId, ConditionWords>> = {};
  for (const [id, describe] of Object.entries(DESCRIBE) as [FilterId, Describe][]) {
    const words = describe(spec, labels);
    if (words) byId[id] = { id, ...words };
  }
  const pick = <K extends keyof ConditionWords>(order: readonly FilterId[], key: K) => order.map((id) => byId[id]?.[key]).filter((v): v is NonNullable<ConditionWords[K]> => v !== undefined);
  const exclusions = spec.population && !byId.population?.origin ? splitExcluded(spec.population) : null;
  const receiptPopulation = byId.population?.origin ? spec.population : exclusions?.rest;
  const row = partnerWords(spec);
  const total = outsideSentence(spec).map((id) => row[id] ?? byId[id]?.words).filter((w): w is string => Boolean(w));
  return {
    byId,
    pills: pick(PILL_ORDER, "pills").flat(),
    scope: pick(SCOPE_ORDER, "scope").flat(),
    receipt: receiptPopulation ? receiptOf(receiptPopulation) : null,
    summary: pick(SUMMARY_ORDER, "summary"),
    caveats: pick(CAVEAT_ORDER, "caveat"),
    tail: titleTailWords(spec, byId, labels).join(", "),
    totalLine: total.length ? total.join(", ") : null,
    totalWords: total,
  };
}

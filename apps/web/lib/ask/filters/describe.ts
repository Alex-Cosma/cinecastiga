import { countWords } from "../answer-text";
import type { Grounding } from "../ground";
import { countyIsFirmSeat, isHistoricalProfile, type PopulationCondition, type QueryPopulation } from "../population";
import {
  KIND_OPTIONS, KIND_WORDS, countyWords, describeQuestion, entityLabel, focalRole, localityGenitive, periodLabel, periodWords, subjectWords,
  type QuestionSpec,
} from "../question-ui";
import { countyDisplay } from "../resolved-spec";
import {
  NEWER_VERSION_QUESTION, namedKind, unimplementedSpecKeys, validateSpec, type AskSpec, type AuthorityKind, type ParsedAuthorityKind,
} from "../spec";
import { formatExactDecimal, formatInt, formatRon } from "../../format";
import { monthsLabel } from "../months-window";
import { BLOCK_FILTERS } from "./blocks";
import { TREND_CHANGE_LABELS } from "./defs/trend";
import { filterContext } from "./context";
import { selectionOrigin, splitExcluded, exclusionWords, type OriginHint, type OriginWords } from "./origin";
import { FILTERS, SPEC_PATH_OWNERS, presentPaths } from "./registry";
import type { FilterId, FilterSpec } from "./types";
import { employeesCount, employeesPhrase, streamPhrase, titleTailParts } from "./words";

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
}

export interface ScopeRow { label: string; value: string }

/** One condition, in the words of each place (absent: the place does not show it). */
export interface ConditionWords {
  id: FilterId;
  /** The condition in words, lowercase, for a list: the "Din link" chip, the total line. */
  words?: string;
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
  /** The title's tail after the period, without the leading comma (G7). */
  tail: string;
  /** What changes the total outside the sentence, or null (G8, component 21). */
  totalLine: string | null;
}

/** Historical risk profiles: the archive of accepted direct acquisitions (entity_flags, runRows), whatever the link's stream. */
export const PROFILE_SOURCE_PILL = "profil istoric: achiziții directe acceptate, toată arhiva";
/** The builder's data stream chip. */
const STREAM_CHIP: Record<string, string> = { all: "Toate achizițiile", da: "Achiziții directe", contracts: "Contracte din proceduri" };
const KIND_PILL: Record<AuthorityKind, string> = {
  comuna: "doar comune", oras_municipiu: "doar orașe/municipii", consiliu_judetean: "doar consilii județene", spital: "doar spitale", scoala: "doar școli/licee",
};
const KIND_SCOPE: Record<AuthorityKind, string> = {
  comuna: "Comune", oras_municipiu: "Orașe și municipii", consiliu_judetean: "Consilii județene", spital: "Spitale", scoala: "Școli și licee",
};

const records = (n: number) => countWords(n, "înregistrare", "înregistrări");
const conditionsOf = (p: QueryPopulation) => p.groups.reduce((n, group) => n + group.conditions.length, 0);

/** A precise selection in one line: "(instituții includ X ȘI CPV includ 45) SAU (…)". */
export function describePopulation(population: QueryPopulation): string {
  const names = { date: "data", value: "lei pe înregistrare", authority: "instituții", supplier: "firme", cpv: "CPV", county: "județe" };
  return population.groups.map((group) => `(${group.conditions.map((c) => "value" in c
    ? `${names[c.field]} ${c.op === "gte" ? "≥" : "≤"} ${c.value}`
    : `${names[c.field]} ${c.op === "not_in" ? "exclud" : "includ"} ${(c.labels ?? c.values).join(", ")}`).join(group.operator === "and" ? " ȘI " : " SAU ")})`).join(population.operator === "and" ? " ȘI " : " SAU ");
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
    return {
      ...(words ? { words } : {}),
      chip: STREAM_CHIP[ds] ?? STREAM_CHIP.all!,
      pills: [profile ? PROFILE_SOURCE_PILL : ds === "contracts" ? "doar contracte prin proceduri" : ds === "da" ? "doar achiziții directe" : "toate sursele: achiziții directe + contracte prin proceduri"],
      scope: [{ label: "Sursele întrebării", value: profile ? "Profiluri istorice: achiziții directe acceptate, cu valoare pozitivă de cel mult 2.000.000 lei" : ds === "da" ? "Achiziții directe" : ds === "contracts" ? "Contracte prin proceduri" : "Achiziții directe și contracte prin proceduri" }],
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
    const known = kind && KIND_PILL[kind] ? kind : undefined;
    return {
      ...(known ? { words: `doar ${KIND_WORDS[known]!.bare}`, pills: [KIND_PILL[known]] } : {}),
      chip: (KIND_OPTIONS.find(([id]) => id === raw) ?? KIND_OPTIONS[0])[1],
      // A kind read ahead (local_admin) belongs to a newer release; its watch is refused, not shown as another kind.
      scope: [{ label: "Tip instituție", value: known ? KIND_SCOPE[known] : "dintr-o versiune mai nouă a site-ului" }],
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
      words: `primăria ${localityGenitive(String(f.uatName ?? `localității ${f.uatSiruta}`))}`,
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
  admin: (spec, { grounding }) => {
    const f = spec.filters;
    const pills = grounding?.admin?.personKey && grounding.admin.display ? [`conduse de ${grounding.admin.display}`] : [];
    if (!f.adminName && !f.adminPersonKey) return pills.length ? { pills } : null;
    return {
      words: `firmele conduse de ${f.adminName || "persoana aleasă"}`, chip: `Conduse de ${f.adminName || "persoana selectată"}`, pills,
      scope: [{ label: "Reprezentant legal", value: String(f.adminName ?? f.adminPersonKey) }],
    };
  },
  period: (spec) => {
    const f = spec.filters;
    const bound = (y: unknown, m: unknown) => y === undefined ? null : m ? `${y}-${String(m).padStart(2, "0")}` : String(y);
    const from = bound(f.yearFrom, f.monthFrom), to = bound(f.yearTo, f.monthTo);
    const pills = f.yearFrom || f.yearTo
      ? [spec.block === "trend" ? `${from ?? "?"} → ${to ?? "?"}` : from && to && from !== to ? `${from}–${to}` : (from ?? to)!]
      : isHistoricalProfile(spec) ? [] : ["toți anii disponibili"];
    const mark = (y: unknown, m: unknown) => `${y}${m ? `-${String(m).padStart(2, "0")}` : ""}`;
    return {
      ...(f.yearFrom || f.yearTo ? { words: periodWords(spec) } : {}),
      chip: periodLabel(spec), pills,
      scope: [{ label: "Perioada întrebării", value: f.yearFrom || f.yearTo ? `${f.yearFrom ? mark(f.yearFrom, f.monthFrom) : "De la începutul datelor"} — ${f.yearTo ? mark(f.yearTo, f.monthTo) : "fără limită finală"}` : "Fără limite de an în filtrele de pornire" }],
    };
  },
  singleBidder: (spec) => spec.filters.singleBidder ? {
    words: "doar contracte cu un singur ofertant", chip: "Un singur ofertant", pills: ["un singur ofertant"],
    scope: [{ label: "Concurență", value: "Doar proceduri cu un singur ofertant confirmat" }],
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
  population: (spec, { origin: hint, entities }) => {
    const p = spec.population;
    if (!p) return null;
    const precise = describePopulation(p);
    const origin = selectionOrigin(p, hint, entities);
    if (origin) {
      const text = `${origin.label}: ${origin.words}`;
      return {
        origin, words: origin.words, chip: text, pills: [text], summary: text, detail: precise,
        scope: [{ label: origin.label, value: origin.words }],
        caveat: `${text}. Valorile se referă la cota alocată fiecărui furnizor.`, note: `${text}.`,
      };
    }
    const { excluded, rest } = splitExcluded(p);
    const restWords = rest ? `selecție precisă, ${countWords(conditionsOf(rest), "condiție", "condiții")}` : null;
    return {
      words: [...exclusionWords(excluded), ...(restWords ? [restWords] : [])].join(", "),
      chip: precise, detail: precise,
      pills: [`Selecție precisă · ${countWords(conditionsOf(p), "condiție", "condiții")} în ${countWords(p.groups.length, "grup", "grupuri")}`],
      ...(excluded.length ? { scope: [{ label: "Scoase din calcul", value: excluded.map((e) => `Fără ${e.label}${e.label !== e.value ? ` (${e.value})` : ""}`).join(", ") }] } : {}),
      summary: precise,
      caveat: `Selecție precisă aplicată: ${precise}. Datele și limitele sunt inclusive; valorile se referă la cota alocată fiecărui furnizor.`,
      note: `Selecție precisă aplicată: ${precise}.`,
    };
  },
  // F2, the trend's lenses (kit §4: „Noi” always with its year, „Nu mai apar”, „Aceleași luni: ian.–mai”, „Prima dată”).
  trendChange: (spec) => {
    const change = spec.trend?.change;
    if (!change) return null;
    const { yearFrom: a, yearTo: b } = spec.filters;
    const label = change === "new" && a ? `Noi față de ${a}` : change === "gone" && b ? `Nu mai apar în ${b}` : TREND_CHANGE_LABELS[change];
    const words = change === "all" ? "toate schimbările" : label.toLowerCase();
    return { words, chip: label, pills: [words], scope: [{ label: "Grupul", value: change === "all" ? "Toate schimbările" : label }], summary: label };
  },
  trendMonths: (spec) => {
    const months = spec.trend?.months;
    if (months === undefined) return null;
    const chosen = Array.isArray(months) ? monthsLabel({ from: months[0], to: months[1] }) : null;
    const chip = months === "whole" ? "Ani întregi" : chosen ? `Aceleași luni: ${chosen}` : "Aceleași luni";
    return {
      words: months === "whole" ? "pe ani întregi" : chosen ? `pe aceleași luni: ${chosen}` : "pe aceleași luni",
      chip, pills: [chip.toLowerCase()], summary: chip,
      scope: [{ label: "Luni comparate", value: months === "whole" ? "Ani întregi" : chosen ? `${chosen}, în ambii ani` : "Aceleași luni în ambii ani, până la ultima lună completă" }],
    };
  },
  trendOrder: (spec) => {
    const order = spec.trend?.order;
    if (!order) return null;
    const words = order === "percent" ? "ordonate după creșterea în procente" : "ordonate după diferența în lei";
    return { words, chip: order === "percent" ? "Creșterea în procente" : "Diferența în lei", pills: [words], scope: [{ label: "Ordine", value: order === "percent" ? "Creșterea în procente" : "Diferența în lei" }] };
  },
  trendMinBase: (spec) => {
    const base = spec.trend?.minBase;
    if (base === undefined) return null;
    const who = spec.dim === "supplier" ? "firmele" : spec.dim === "county" ? "județele" : "instituțiile";
    const when = spec.filters.yearFrom ? ` în ${spec.filters.yearFrom}` : "";
    return {
      words: `dintre ${who} cu cel puțin ${formatRon(base)}${when}`, chip: `Cel puțin ${formatRon(base)}${when}`, pills: [`cel puțin ${formatRon(base)}${when}`],
      scope: [{ label: "Baza creșterii", value: `Cel puțin ${formatRon(base)}${when}` }],
    };
  },
  trendFirstOnly: (spec) => {
    if (!spec.trend?.firstOnly) return null;
    const year = spec.filters.yearTo ? ` în ${spec.filters.yearTo}` : "";
    return {
      words: `prima dată${year}`, chip: `Prima dată${year}`, pills: [`prima dată${year}`],
      scope: [{ label: "Prima dată", value: `Prima înregistrare în datele noastre${year}` }],
    };
  },
};

/** The filters that have words: every key of today's engine but the shape of the answer (pills.ts) and the ignored comparison mode. */
export const DESCRIBED_FILTERS = Object.keys(DESCRIBE) as FilterId[];

/** The order of each place, today's. */
const TREND_ORDER: readonly FilterId[] = ["trendChange", "trendFirstOnly", "trendMonths", "trendOrder", "trendMinBase"];
const PILL_ORDER: readonly FilterId[] = ["cpvTerm", "authorityKind", "authority", "supplier", "compareWith", "locality", "county", "admin", "period", ...TREND_ORDER, "singleBidder", "employees", "dataset", "population", "minimumRecords"];
const SCOPE_ORDER: readonly FilterId[] = ["authority", "supplier", "compareWith", "cpvTerm", "county", "locality", "authorityKind", "admin", "period", ...TREND_ORDER, "dataset", "singleBidder", "employees", "minimumRecords", "population"];
const SUMMARY_ORDER: readonly FilterId[] = ["dataset", "authority", "supplier", "cpvTerm", "trendChange", "trendMonths", "population", "minimumRecords"];
const CAVEAT_ORDER: readonly FilterId[] = ["population", "minimumRecords"];

/**
 * The conditions a question applies outside its sentence and that change the
 * total (G8): selections the engine applies on this answer, which the
 * sentence of BLOCK_FILTERS does not say.
 */
function outsideSentence(spec: Spec): FilterId[] {
  const ctx = filterContext(spec);
  const said = new Set<FilterId>();
  for (const slot of BLOCK_FILTERS[ctx.block]?.sentence(spec, ctx) ?? []) {
    said.add(slot.id);
    for (const id of slot.writes ?? []) said.add(id);
  }
  const ids = new Set<FilterId>();
  for (const path of presentPaths(spec)) {
    const owner = SPEC_PATH_OWNERS[path];
    if (!owner || owner === "question" || said.has(owner)) continue;
    const def = FILTERS[owner];
    if (def.engine[ctx.form] !== undefined && def.scope(ctx.form) === "selection") ids.add(owner);
  }
  return PILL_ORDER.filter((id) => ids.has(id));
}

/** A saved question in the list (SavedQuestions): its title, then the conditions a title does not repeat. */
export function savedQuestionSummary(raw: unknown): string {
  const spec = validateSpec(raw);
  if ("error" in spec) return "Deschide pentru a verifica această întrebare.";
  // Its sentence here would leave out the condition this release does not read.
  if (unimplementedSpecKeys(spec).length) return NEWER_VERSION_QUESTION;
  return [describeQuestion(spec), ...describeConditions(spec).summary].join(" · ");
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
  const total = outsideSentence(spec).map((id) => byId[id]?.words).filter((w): w is string => Boolean(w));
  return {
    byId,
    pills: pick(PILL_ORDER, "pills").flat(),
    scope: pick(SCOPE_ORDER, "scope").flat(),
    receipt: receiptPopulation ? receiptOf(receiptPopulation) : null,
    summary: pick(SUMMARY_ORDER, "summary"),
    caveats: pick(CAVEAT_ORDER, "caveat"),
    tail: titleTailParts(spec).join(", "),
    totalLine: total.length ? total.join(", ") : null,
  };
}

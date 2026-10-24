import type { Grounding } from "../ground";
import { isHistoricalProfile, type PopulationCondition, type QueryPopulation } from "../population";
import { KIND_OPTIONS, entityLabel, periodLabel, type QuestionSpec } from "../question-ui";
import { countyDisplay } from "../resolved-spec";
import { namedKind, type AskSpec, type ParsedAuthorityKind } from "../spec";
import { formatExactDecimal } from "../../format";

/*
 * The six grammars of the conditions before describeConditions (F0, commit
 * 01ebab0), frozen for filters/describe.test.ts: the condition pills of
 * pills.ts, the saved summary of SavedQuestions, the rows and the receipt of
 * app/urmariri/ScopeConditions.tsx, describePopulation, the caveats of runSpec
 * and the notes of runRows, plus the builder's chips and the title's tail.
 * The test checks that describeConditions says the same, except the changes
 * the plan fixes (G10 numerals, the labels of other pages' selections, "Fără X").
 * Never edit to follow the new code.
 */

type Spec = QuestionSpec;

export function describePopulationBefore(population: QueryPopulation): string {
  const names = { date:"data", value:"lei pe înregistrare", authority:"instituții", supplier:"firme", cpv:"CPV", county:"județe" };
  return population.groups.map(group => `(${group.conditions.map(c => "value" in c
    ? `${names[c.field]} ${c.op === "gte" ? "≥" : "≤"} ${c.value}`
    : `${names[c.field]} ${c.op === "not_in" ? "exclud" : "includ"} ${(c.labels ?? c.values).join(", ")}`).join(group.operator === "and" ? " ȘI " : " SAU ")})`).join(population.operator === "and" ? " ȘI " : " SAU ");
}

const KIND_LABEL = { comuna: "doar comune", oras_municipiu: "doar orașe/municipii", consiliu_judetean: "doar consilii județene", spital: "doar spitale", scoala: "doar școli/licee" } as const;
const PROFILE_SOURCE_PILL = "profil istoric: achiziții directe acceptate, toată arhiva";

/** pills.ts buildPills, from the CPV pill on (the question's own pills stay in pills.ts). */
export function conditionPillsBefore(input: Spec | AskSpec, grounding: Grounding): string[] {
  const spec = input as AskSpec;
  const pills: string[] = [];
  if (grounding.cpv && grounding.cpv.prefixes.length > 0) {
    const names = grounding.cpv.matchedNames;
    if (names.length === 0) pills.push(`CPV ${grounding.cpv.prefixes.join(", ")}`);
    else pills.push(names.length <= 2 ? names.join(" + ") : `${names[0]} +${names.length - 1} CPV`);
    const excluded = grounding.cpv.excludePrefixes?.length ?? 0;
    if (excluded) pills.push(`fără ${excluded === 1 ? "o subclasă" : `${excluded} subclase`} (vezi limitele)`);
  }
  const kind = namedKind(spec.filters.authorityKind);
  if (kind) pills.push(KIND_LABEL[kind]);
  if (grounding.authority?.nameDisplay) pills.push(grounding.authority.nameDisplay);
  if (grounding.supplier?.nameDisplay) pills.push(grounding.supplier.nameDisplay);
  if (grounding.compare?.nameDisplay) pills.push(`vs ${grounding.compare.nameDisplay}`);
  if (grounding.uat) {
    pills.push(spec.filters.uatName ?? grounding.uat.name ?? `UAT ${grounding.uat.siruta}`);
  }
  if (grounding.county?.canonical) pills.push(grounding.county.canonical === "Bucuresti" ? "București" : `județul ${countyDisplay(grounding.county.canonical)}`);
  if (grounding.admin?.personKey && grounding.admin.display)
    pills.push(`conduse de ${grounding.admin.display}`);
  if (spec.filters.yearFrom || spec.filters.yearTo) {
    const f = spec.filters.yearFrom;
    const t = spec.filters.yearTo;
    const mm = (y: number | undefined, m: number | undefined) =>
      y === undefined ? null : m ? `${y}-${String(m).padStart(2, "0")}` : String(y);
    const from = mm(f, spec.filters.monthFrom);
    const to = mm(t, spec.filters.monthTo);
    pills.push(spec.block === "trend" ? `${from ?? "?"} → ${to ?? "?"}` : from && to && from !== to ? `${from}–${to}` : (from ?? to)!);
  } else if (!isHistoricalProfile(spec)) {
    pills.push("toți anii disponibili");
  }
  if (spec.filters.singleBidder) pills.push("un singur ofertant");
  {
    const mn = spec.filters.minEmployees;
    const mx = spec.filters.maxEmployees;
    if (mn !== undefined && mx !== undefined) pills.push(`${mn}–${mx} angajați`);
    else if (mx !== undefined) pills.push(mx === 0 ? "fără angajați" : `cel mult ${mx} angajați`);
    else if (mn !== undefined) pills.push(`cel puțin ${mn} angajați`);
  }
  const ds = spec.dataset ?? "all";
  pills.push(isHistoricalProfile(spec) ? PROFILE_SOURCE_PILL : ds === "contracts" ? "doar contracte prin proceduri" : ds === "da" ? "doar achiziții directe" : "toate sursele: achiziții directe + contracte prin proceduri");
  if (spec.population) pills.push(`Selecție precisă · ${spec.population.groups.reduce((n, group) => n + group.conditions.length, 0)} condiții în ${spec.population.groups.length} grupuri`);
  if (spec.minimumRecords) pills.push(`${spec.minimumRecords.role === "authority" ? "instituții" : "firme"} cu ≥ ${spec.minimumRecords.count} înregistrări în selecție`);
  return pills;
}

/** The pills.ts pill of the list length: "top 10 furnizori". */
export function topPillBefore(spec: Spec | AskSpec): string {
  const DIM_LABEL = { authority: "autorități", supplier: "furnizori", county: "județe" } as const;
  return `top ${spec.topN ?? 10} ${DIM_LABEL[(spec.dim ?? "authority") as keyof typeof DIM_LABEL]}`;
}

/** SavedQuestions summary, after describeQuestion. */
export function summaryBefore(input: Spec | AskSpec): string[] {
  const spec = input as AskSpec;
  return [spec.dataset === "contracts" ? "Contracte din proceduri" : spec.dataset === "da" ? "Achiziții directe" : null,
    spec.filters.authorityName || (spec.filters.authorityId ? `Instituția #${spec.filters.authorityId}` : null),
    spec.filters.supplierName || (spec.filters.supplierId ? `Firma #${spec.filters.supplierId}` : null),
    spec.filters.cpvTerm ? `CPV: ${spec.filters.cpvTerm}` : null,
    spec.population ? describePopulationBefore(spec.population) : null,
    spec.minimumRecords ? `Minimum ${spec.minimumRecords.count} înregistrări` : null].filter((v): v is string => Boolean(v));
}

const SCOPE_KIND = { comuna: "Comune", oras_municipiu: "Orașe și municipii", consiliu_judetean: "Consilii județene", spital: "Spitale", scoala: "Școli și licee" };
const SCOPE_NAMES = { authority: "Instituția", supplier: "Firma", cpv: "Codul CPV", county: "Județul" };
function scopeCondition(c: PopulationCondition) {
  if ("value" in c) return c.field === "value" ? `Valoare ${c.op === "gte" ? "de cel puțin" : "de cel mult"} ${formatExactDecimal(c.value)} lei` : `Data achiziției ${c.op === "gte" ? "începând cu" : "până la"} ${c.value}`;
  return `${SCOPE_NAMES[c.field]} ${c.op === "not_in" ? "nu este în" : "este în"}: ${c.values.map((value, i) => c.labels?.[i] && c.labels[i] !== value ? `${c.labels[i]} (${value})` : value).join(", ")}`;
}
/** ScopeConditions: the rows of the question's conditions and the receipt of its precise selection. */
export function scopeBefore(input: Spec | AskSpec) {
  const spec = input as AskSpec, f = spec.filters;
  const items: { label: string; value: string }[] = [];
  if (f.authorityId || f.authorityName) items.push({ label: "Instituție", value: `${f.authorityName ?? "Identificator"}${f.authorityId ? ` · ${f.authorityId}` : ""}` });
  if (f.supplierId || f.supplierName) items.push({ label: "Firmă", value: `${f.supplierName ?? "Identificator"}${f.supplierId ? ` · ${f.supplierId}` : ""}` });
  if (f.compareWithId || f.compareWith) items.push({ label: "Comparație cu", value: `${f.compareWith ?? "Identificator"}${f.compareWithId ? ` · ${f.compareWithId}` : ""}` });
  if (f.cpvTerm) items.push({ label: "Domeniu / CPV", value: f.cpvTerm });
  if (f.county) items.push({ label: "Județ", value: f.county });
  if (f.uatSiruta || f.uatName) items.push({ label: "Localitate", value: `${f.uatName ?? "Localitate"} · SIRUTA ${f.uatSiruta ?? "nespecificat"}` });
  if (f.authorityKind) { const named = namedKind(f.authorityKind); items.push({ label: "Tip instituție", value: named ? SCOPE_KIND[named] : "dintr-o versiune mai nouă a site-ului" }); }
  if (f.adminName || f.adminPersonKey) items.push({ label: "Reprezentant legal", value: f.adminName ?? f.adminPersonKey! });
  items.push({ label: "Perioada întrebării", value: f.yearFrom || f.yearTo ? `${f.yearFrom ? `${f.yearFrom}${f.monthFrom ? `-${String(f.monthFrom).padStart(2, "0")}` : ""}` : "De la începutul datelor"} — ${f.yearTo ? `${f.yearTo}${f.monthTo ? `-${String(f.monthTo).padStart(2, "0")}` : ""}` : "fără limită finală"}` : "Fără limite de an în filtrele de pornire" });
  items.push({ label: "Sursele întrebării", value: isHistoricalProfile(spec) ? "Profiluri istorice: achiziții directe acceptate, cu valoare pozitivă de cel mult 2.000.000 lei" : spec.dataset === "da" ? "Achiziții directe" : spec.dataset === "contracts" ? "Contracte prin proceduri" : "Achiziții directe și contracte prin proceduri" });
  if (f.singleBidder) items.push({ label: "Concurență", value: "Doar proceduri cu un singur ofertant confirmat" });
  if (f.minEmployees !== undefined || f.maxEmployees !== undefined) items.push({ label: "Angajați", value: `${f.minEmployees ?? 0} — ${f.maxEmployees ?? "fără limită maximă"}` });
  if (spec.minimumRecords) items.push({ label: "Populație minimă", value: `${spec.minimumRecords.role === "authority" ? "Instituții" : "Firme"} cu cel puțin ${spec.minimumRecords.count} înregistrări în selecție` });
  const receipt = spec.population ? {
    intro: "În plus față de filtrele întrebării, se aplică următoarele condiții:",
    operator: spec.population.operator === "and" ? "Trebuie îndeplinite toate grupurile de mai jos:" : "Este suficient să fie îndeplinit unul dintre grupurile de mai jos:",
    groups: spec.population.groups.map((group, i) => ({ title: `Grupul ${i + 1} · ${group.operator === "and" ? "toate condițiile" : "oricare condiție"}`, items: group.conditions.map(scopeCondition) })),
  } : null;
  return { items, receipt };
}

/** runSpec: the precise selection and the record threshold. */
export function caveatsBefore(input: Spec | AskSpec): string[] {
  const spec = input as AskSpec, caveats: string[] = [];
  if (spec.population) caveats.push(`Selecție precisă aplicată: ${describePopulationBefore(spec.population)}. Datele și limitele sunt inclusive; valorile se referă la cota alocată fiecărui furnizor.`);
  if (spec.minimumRecords) caveats.push(`Păstrăm ${spec.minimumRecords.role === "authority" ? "instituțiile" : "firmele"} cu cel puțin ${spec.minimumRecords.count} înregistrări în selecția filtrată. O atribuire pe câștigător este o înregistrare; pragul nu numără contracte distincte.`);
  return caveats;
}

/** runRows, outside the profiles: the precise selection's note and the threshold's. */
export function notesBefore(input: Spec | AskSpec): { population: string | null; minimumRecords: string | null } {
  const spec = input as AskSpec;
  return {
    population: spec.population ? `Selecție precisă aplicată: ${describePopulationBefore(spec.population)}.` : null,
    minimumRecords: spec.minimumRecords ? `Pragul de ${spec.minimumRecords.count} înregistrări pentru ${spec.minimumRecords.role === "authority" ? "instituții" : "firme"} se calculează înainte de selecția unui grup și filtrele locale ale surselor.` : null,
  };
}

/** QuestionBuilder activeConditions and the lines of "Mai multe filtre": the words of each chip. */
export function chipsBefore(draft: Spec, cpvName?: string): Record<string, string> {
  const f = draft.filters, out: Record<string, string> = {};
  const SOURCES: Record<string, string> = { all: "Toate achizițiile", da: "Achiziții directe", contracts: "Contracte din proceduri" };
  const cpvTerm = String(f.cpvTerm ?? ""), cpvIsCode = /^(?:\d{2,8}|\d{8}-\d)$/.test(cpvTerm.replace(/\s+/g, ""));
  out.dataset = SOURCES[draft.dataset ?? "all"] ?? SOURCES.all!;
  if (f.authorityKind) out.authorityKind = (KIND_OPTIONS.find(([id]) => id === (f.authorityKind as ParsedAuthorityKind)) ?? KIND_OPTIONS[0])[1];
  if (f.county) out.county = String(f.county);
  if (f.uatSiruta) out.locality = String(f.uatName || `Localitatea #${f.uatSiruta}`);
  out.period = periodLabel(draft);
  if (f.cpvTerm) out.cpvTerm = `Domeniu: ${cpvIsCode ? cpvName ?? `CPV ${cpvTerm}` : cpvTerm}`;
  if (f.authorityName || f.authorityId) out.authority = entityLabel(draft, "authority");
  if (f.supplierName || f.supplierId) out.supplier = entityLabel(draft, "supplier");
  if (f.minEmployees !== undefined || f.maxEmployees !== undefined) out.employees = f.minEmployees !== undefined && f.maxEmployees !== undefined ? `${f.minEmployees}–${f.maxEmployees} angajați` : f.maxEmployees !== undefined ? `Cel mult ${f.maxEmployees} angajați` : `Cel puțin ${f.minEmployees} angajați`;
  if (f.adminName || f.adminPersonKey) out.admin = `Conduse de ${f.adminName || "persoana selectată"}`;
  if (f.singleBidder) out.singleBidder = "Un singur ofertant";
  if (draft.population) out.population = describePopulationBefore(draft.population);
  if (draft.minimumRecords) out.minimumRecords = `${draft.minimumRecords.role === "supplier" ? "Firme" : "Instituții"}: cel puțin ${draft.minimumRecords.count} înregistrări în selecție.`;
  return out;
}

/** question-ui.ts conditionsTail (and lib/intent suffix): the parts after the period. */
export function tailBefore(spec: Spec | AskSpec, channelSaid = false): string[] {
  const f = spec.filters as Record<string, unknown>;
  const countOfWords = (n: number, noun: string) => { const lastTwo = n % 100; return `${n}${n !== 0 && (lastTwo === 0 || lastTwo >= 20) ? " de" : ""} ${noun}`; };
  const parts: string[] = [];
  if (f.singleBidder) parts.push("doar contracte cu un singur ofertant");
  else if (spec.dataset === "da" && !channelSaid) parts.push("doar achiziții directe");
  else if (spec.dataset === "contracts") parts.push("doar contracte din proceduri");
  const min = f.minEmployees === undefined ? undefined : Number(f.minEmployees);
  const max = f.maxEmployees === undefined ? undefined : Number(f.maxEmployees);
  if (max === 0) parts.push("firme fără angajați");
  else if (min !== undefined && max !== undefined) parts.push(`firme cu ${min}–${countOfWords(max, "angajați")}`);
  else if (max !== undefined) parts.push(`firme cu cel mult ${countOfWords(max, "angajați")}`);
  else if (min !== undefined) parts.push(`firme cu cel puțin ${countOfWords(min, "angajați")}`);
  return parts;
}

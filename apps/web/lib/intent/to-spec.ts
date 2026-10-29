import { cleanName } from "../format";
import { joinCpvTerms } from "../ask/cpv-terms";
import { countWords } from "../ask/answer-text";
import { questionTitle, type TitleLabels } from "../ask/filters/title";
import { IMPLEMENTED_KEYS, validateSpec, type AskFilters, type AskSpec, type AuthorityKind, type Block, type Dataset } from "../ask/spec";
import { defaultTrendYears, isWholeYear, monthsLabel, sameMonthsWindow, trendYearsFrom, type CoveragePeriods } from "../ask/months-window";
import { FILTERS, offeredFilters, SPEC_PATH_OWNERS } from "../ask/filters/registry";
import { filterContext, NATIONAL_ENTITY_SCAN, nationalEntityScan } from "../ask/filters/context";
import { choiceState } from "../ask/filters/pickers";
import type { FilterSpec, SpecPath } from "../ask/filters/types";
import { TREND_CHANGE_LABELS, TREND_FIRST_LABEL } from "../ask/filters/defs/trend";
import { genitive, hasNamedScope } from "./rules";
import { fold } from "./text";
import type { LensMatch } from "./lens-phrases";
import type { EntityMatch, IntentAlternative, IntentKind, IntentResult, Interpretation, PersonMatch, PlaceMatch, SubjectMatch } from "./types";

/**
 * Interpretation → AskSpec (validated by the engine's own validateSpec) and
 * → a plain Romanian sentence. The spec is what the builder edits and what
 * /api/ask runs; nothing here touches the database.
 */

/** Kinds whose institutions are not part of a locality scope (the UAT's own administration only). */
const NOT_IN_LOCALITY: AuthorityKind[] = ["scoala", "spital", "consiliu_judetean"];
const PROFILE_DROPPED: (keyof AskFilters)[] = ["cpvTerm", "yearFrom", "yearTo", "monthFrom", "monthTo", "minEmployees", "maxEmployees", "adminName", "adminPersonKey", "procedure"];
/**
 * "Un singur ofertant" written in words (plan §2.7, §9 F1): the number of
 * offers is known for part of the contract records only, by year of the
 * record (local copy, 25.10.2026: 9,7% in 2018, 17,8–25,6% in 2019–2023,
 * 1,7–2,0% from 2024), so the interpreter never writes the filter; it says
 * why, on any period. A link that carries the filter still applies it ("Din link").
 */
export const SINGLE_OFFER_NOTE = "Numărul de oferte îl știm doar pentru o parte din înregistrările contractelor (18–26% în 2019–2023, ~2% din 2024), deci nu îl folosim ca filtru.";
const SINGLE_OFFER_DA_NOTE = "Achizițiile directe nu au oferte de numărat, deci nu folosim acest filtru.";

interface Choice { place?: PlaceMatch | null; person?: PersonMatch | null; entity?: EntityMatch; pair?: { focal: EntityMatch; other: EntityMatch } }

/**
 * What the server knows besides the words (lib/intent/server.ts): the
 * archive's periods per channel (coveragePeriods), for a trend's default years
 * and its same months; and the current year, for the fallback without them.
 */
export interface SpecContext { periods?: CoveragePeriods | null; year?: number }

/** "„nu mai apar” nu se aplică la această întrebare; am păstrat restul." (plan §2.7: never silently). */
export const lensNotApplied = (words: string) => `„${words}” nu se aplică la această întrebare; am păstrat restul.`;

/** The option a lens writes, and the one it needs first: the order in percent ranks growths, the first-time ones are new. */
const LENS_NEEDS: Partial<Record<SpecPath, { path: SpecPath; value: unknown; note: string }>> = {
  "trend.order": { path: "trend.change", value: "up", note: "Ordinea în procente există doar la creșteri; am arătat creșterile." },
  "trend.firstOnly": { path: "trend.change", value: "new", note: `„${TREND_FIRST_LABEL}” se referă la firmele noi; am arătat firmele noi.` },
};
const optionsOf = (raw: Record<string, unknown>, block: string): Record<string, unknown> =>
  (raw[block] && typeof raw[block] === "object" ? raw[block] : {}) as Record<string, unknown>;
const readPath = (raw: Record<string, unknown>, path: SpecPath): unknown => {
  const [head, sub] = path.split(".") as [string, string | undefined];
  return sub === undefined ? raw[head] : head === "filters" ? (raw.filters as Record<string, unknown>)[sub] : optionsOf(raw, head)[sub];
};

/**
 * The lenses of the chosen block, written by their filters (plan §2.7): a key
 * this release applies (IMPLEMENTED_KEYS) that the question offers
 * (BLOCK_FILTERS: its sentence, P4, presentation line or strip), among the
 * values its control offers here, with what the filter's write implies. A
 * lens the question does not offer, two that
 * contradict each other, or a phrase of another question's table is said,
 * never applied silently; the words of a cue or a modifier this question
 * already used (`quiet`) need no note.
 */
export function applyLenses(raw: Record<string, unknown>, lenses: readonly LensMatch[], notes: string[]): Record<string, unknown> {
  const block = raw.block as Block;
  // The selection's filters said in words (block "*": the kind, the size, the firm's seat) are every question's own.
  const own = lenses.filter((l) => l.block === block || l.block === "*");
  const overlaps = (a: LensMatch["matched"], b: LensMatch["matched"]) => a.from < b.to && b.from < a.to;
  for (const l of lenses)
    if (l.block !== block && l.block !== "*" && !l.quiet && !own.some((o) => overlaps(o.matched, l.matched))) notes.push(lensNotApplied(l.matched.text));
  const byPath = new Map<SpecPath, LensMatch[]>();
  for (const l of own) byPath.set(l.path, [...(byPath.get(l.path) ?? []), l]);
  let spec = raw as unknown as FilterSpec;
  /** Why a choice the question offers is not chosen here (choiceState: a national scan, a code without the kind…). */
  let held: string | null = null;
  const offered = (path: SpecPath, value: unknown, at: FilterSpec, typed = false): boolean => {
    held = null;
    const owner = SPEC_PATH_OWNERS[path];
    if (owner === "question" || !IMPLEMENTED_KEYS.has(path)) return false;
    const ctx = filterContext(at);
    // A national ranking per entity does not invite a size, nor goods and services (S4r-national-kind, blocks.ts): it
    // reads both marts whole until the marts stage's size column (PRECOMPUTE.md). The reason, not "nu se aplică".
    if (owner === "purchaseValue" && nationalEntityScan(at)) { held = NATIONAL_ENTITY_SCAN; return false; }
    if (!offeredFilters(at, ctx).has(owner)) {
      if (owner === "purchaseKind" && nationalEntityScan(at)) held = NATIONAL_ENTITY_SCAN;
      return false;
    }
    // A bound typed in words is any value the filter's rule accepts (its window has a field for it), not only a preset.
    if (!typed && !FILTERS[owner].choices(at, ctx).some((choice) => JSON.stringify(choice) === JSON.stringify(value))) return false;
    const state = choiceState({ id: owner }, { filter: owner, value }, at, ctx);
    if (state.state !== "offered") { held = state.state === "disabled" ? state.reason : null; return false; }
    const reason = FILTERS[owner].validate?.(FILTERS[owner].write(at, value) as unknown as AskSpec) ?? null;
    if (reason) { held = reason; return false; }
    return true;
  };
  const write = (path: SpecPath, value: unknown) => {
    const owner = SPEC_PATH_OWNERS[path];
    if (owner !== "question") spec = FILTERS[owner].write(spec, value);
  };
  // The keys a lens needs are written first ("procentual" after "au crescut").
  const paths = [...byPath.keys()].sort((a, b) => Number(Boolean(LENS_NEEDS[a])) - Number(Boolean(LENS_NEEDS[b])));
  for (const path of paths) {
    const found = byPath.get(path)!;
    const words = [...new Set(found.map((l) => l.matched.text))];
    const values = [...new Set(found.map((l) => JSON.stringify(l.value)))];
    if (values.length > 1) { notes.push(`„${words.join("” și „")}” nu merg împreună; nu le-am aplicat.`); continue; }
    const value = found[0]!.value, need = LENS_NEEDS[path];
    if (need) {
      const current = readPath(spec as unknown as Record<string, unknown>, need.path);
      if (current === undefined && offered(need.path, need.value, spec)) { write(need.path, need.value); notes.push(need.note); }
      else if (current !== need.value) { notes.push(lensNotApplied(words.join("”, „"))); continue; }
    }
    if (!offered(path, value, spec, found.some((l) => l.typed))) {
      if (held) notes.push(`„${words.join("”, „")}” nu se aplică aici: ${held}`);
      else if (!found.every((l) => l.quiet)) notes.push(lensNotApplied(words.join("”, „")));
      continue;
    }
    write(path, value);
  }
  return spec as unknown as Record<string, unknown>;
}

/** The rows a question names: the words ("firme", "instituții"), or a lens that names them ("clienți noi"), or a ranking cue. */
function trendRows(i: Interpretation): "supplier" | "authority" | null {
  if (i.dimHint) return i.dimHint;
  const named = i.lenses.find((l) => l.block === "trend" && l.dim)?.dim;
  if (named) return named;
  return i.otherIntents.includes("ranking_suppliers") ? "supplier" : i.otherIntents.includes("ranking_authorities") ? "authority" : null;
}

/** "parcuri și spații verzi": the labels of every recognised subject, for the sentence. */
export function subjectsLabel(subjects: Pick<SubjectMatch, "label">[]): string | null {
  const labels = [...new Set(subjects.map((s) => s.label))];
  if (!labels.length) return null;
  return labels.length === 1 ? labels[0]! : `${labels.slice(0, -1).join(", ")} și ${labels.at(-1)}`;
}

function personDisplay(p: PersonMatch): string {
  return `${cleanName(p.name)}${p.birthYear ? ` (n. ${p.birthYear}${p.birthLocality ? `, ${p.birthLocality}` : ""})` : ""}`;
}

function baseFilters(i: Interpretation, choice: Choice, notes: string[]): AskFilters {
  const f: AskFilters = {};
  // several subjects are counted together ("parcuri și spații verzi"), each record once
  if (i.subjects.length) f.cpvTerm = joinCpvTerms(i.subjects.map((s) => s.term));
  if (i.authorityKind) f.authorityKind = i.authorityKind.kind;
  const place = choice.place === undefined ? i.place : choice.place;
  if (place?.kind === "county") f.county = place.county;
  if (place?.kind === "locality" && place.siruta) {
    if (i.authorityKind && NOT_IN_LOCALITY.includes(i.authorityKind.kind)) {
      // A locality covers only the town hall; schools and hospitals are separate institutions.
      f.county = place.county;
      notes.push(`Localitatea include doar primăria; pentru ${f.authorityKind === "scoala" ? "școli" : f.authorityKind === "spital" ? "spitale" : "consiliul județean"} am folosit județul ${place.county}.`);
    } else {
      f.uatSiruta = place.siruta;
      f.uatName = place.label;
    }
  }
  if (i.authority) {
    f.authorityName = cleanName(i.authority.name);
    if (i.authority.id) f.authorityId = i.authority.id;
  }
  if (i.supplier) {
    f.supplierName = cleanName(i.supplier.name);
    if (i.supplier.id) f.supplierId = i.supplier.id;
  }
  if (i.compareWith) {
    f.compareWith = cleanName(i.compareWith.name);
    if (i.compareWith.id) f.compareWithId = i.compareWith.id;
  }
  const person = choice.person === undefined ? i.person : choice.person;
  if (person) {
    f.adminPersonKey = person.key;
    f.adminName = personDisplay(person);
  }
  if (i.period?.yearFrom !== undefined) f.yearFrom = i.period.yearFrom;
  if (i.period?.yearTo !== undefined) f.yearTo = i.period.yearTo;
  if (i.employees?.min !== undefined) f.minEmployees = i.employees.min;
  if (i.employees?.max !== undefined) f.maxEmployees = i.employees.max;
  // F3: a procedure the engine names, on the contracts (a stream of direct acquisitions has none).
  if (i.procedure && i.dataset !== "da") f.procedure = i.procedure;
  return f;
}

/** Build the spec of one intent. Returns the engine's validation message when impossible. */
export function specFor(input: Interpretation, asked: IntentKind, choice: Choice = {}, context: SpecContext = {}): { spec: AskSpec | null; error: string | null; notes: string[] } {
  const i = choice.pair ? { ...input, authority: choice.pair.focal, compareWith: choice.pair.other, place: null }
    : choice.entity ? { ...input, [choice.entity.role]: choice.entity } : input;
  // "Ce firme noi apar în 2025, față de 2024?": a ranking with two years and a trend's group in words is a trend.
  const years = i.period?.yearFrom !== undefined && i.period.yearTo !== undefined && i.period.yearFrom !== i.period.yearTo;
  const intent: IntentKind = (asked === "ranking_suppliers" || asked === "ranking_authorities") && years
    && i.lenses.some((l) => l.block === "trend" && l.path === "trend.change" && !l.quiet) ? "trend" : asked;
  const notes: string[] = [];
  const f = baseFilters(i, choice, notes);
  const raw: Record<string, unknown> = { block: "table", measure: i.measure === "count" ? "count" : "value", filters: f };
  // Offers belong to procedures: the phrase keeps its stream, never the filter.
  if (i.dataset) raw.dataset = i.dataset;
  else if (i.singleBidder) raw.dataset = "contracts";
  if (i.singleBidder) notes.push(i.dataset === "da" ? SINGLE_OFFER_DA_NOTE : SINGLE_OFFER_NOTE);
  const named = Boolean(f.authorityName || f.supplierName);
  const dropForProfiles = (keepEntity: boolean) => {
    const dropped = PROFILE_DROPPED.filter((k) => f[k] !== undefined);
    for (const k of dropped) delete f[k];
    delete raw.dataset;
    if (!keepEntity) for (const k of ["authorityName", "authorityId", "supplierName", "supplierId", "compareWith", "compareWithId"] as const) delete f[k];
    if (dropped.length) {
      const what = [
        dropped.includes("cpvTerm") ? "domeniul" : null,
        dropped.some((k) => k.startsWith("year") || k.startsWith("month")) ? "perioada" : null,
        dropped.some((k) => k.endsWith("Employees")) ? "mărimea firmelor" : null,
        dropped.some((k) => k.startsWith("admin")) ? "persoana" : null,
        dropped.includes("procedure") ? "procedura" : null,
      ].filter(Boolean);
      notes.push(`Indicele de risc și semnalele sunt calculate pe toată activitatea din achizițiile directe, deci nu am aplicat ${what.join(", ")}. Semnalele sunt piste de verificat, nu dovezi.`);
    }
  };
  const place = choice.place === undefined ? i.place : choice.place;
  /** The locality scope is the town hall only; questions about "institutions in X" or risk profiles use the county. */
  const localityToCounty = (why: string) => {
    if (!f.uatSiruta || !place) return;
    delete f.uatSiruta; delete f.uatName;
    f.county = place.county;
    notes.push(why);
  };
  const townHallOnly = (what: string) => `Datele leagă de o localitate doar primăria ei; pentru ${what} am folosit județul ${place?.county ?? ""}.`;
  switch (intent) {
    case "ranking_suppliers":
    case "ranking_authorities": {
      let dim: "supplier" | "authority" = intent === "ranking_suppliers" ? "supplier" : "authority";
      if (dim === "supplier" && (f.supplierName || f.supplierId)) dim = "authority";
      else if (dim === "authority" && (f.authorityName || f.authorityId)) dim = "supplier";
      raw.dim = dim;
      if (dim === "authority" && !(f.supplierName || f.supplierId) && !(f.authorityName || f.authorityId)) localityToCounty(townHallOnly("„ce instituții”"));
      if (i.measure === "value_per_capita") {
        if (dim === "authority") raw.measure = "value_per_capita";
        else notes.push("Valoarea pe locuitor se calculează doar pentru primării; clasamentul firmelor folosește valoarea totală.");
      }
      if (i.superlative && !i.topN) {
        raw.block = "entity_card";
        raw.rankBy = "value";
        raw.measure = "value";
      } else raw.topN = i.topN ?? 10;
      break;
    }
    case "total":
      raw.block = "stat";
      break;
    case "breakdown":
      raw.block = "breakdown";
      raw.measure = "value";
      break;
    case "trend": {
      const twoYears = f.yearFrom !== undefined && f.yearTo !== undefined && f.yearFrom !== f.yearTo;
      // The block on the years as written (two years and the rows), or a group named in words ("au crescut",
      // "firme noi", "nu mai apar"): "Cum au evoluat … în 2025?" stays an evolution (plan §2.7).
      const rows = trendRows(i);
      const group = i.lenses.some((l) => l.block === "trend" && l.path === "trend.change");
      if (rows && (twoYears && i.dimHint || group)) {
        raw.block = "trend";
        raw.dim = rows === "supplier" && !(f.supplierName || f.supplierId) ? "supplier" : "authority";
        if (raw.dim === "authority") localityToCounty(townHallOnly("schimbarea pe instituții"));
        raw.topN = i.topN ?? 10;
        raw.measure = "value";
        if (!twoYears) {
          // Only once the question is a trend: one year Y is Y − 1 → Y; none, the default years of the archive.
          const dataset = (raw.dataset ?? "all") as Dataset;
          const year = f.yearTo ?? f.yearFrom;
          const fallback = context.year ? { yearFrom: context.year - 2, yearTo: context.year - 1 } : null;
          const years = trendYearsFrom({ yearFrom: f.yearFrom, yearTo: f.yearTo }, defaultTrendYears(context.periods ?? null, dataset) ?? fallback);
          if (!years) return { spec: null, error: "Spune ce ani compari, de exemplu „între 2024 și 2025”.", notes };
          f.yearFrom = years.yearFrom; f.yearTo = years.yearTo;
          notes.push(year === undefined ? `Am comparat ${years.yearTo} cu ${years.yearFrom}: ultimul an încheiat cu cel dinainte.`
            : year === years.yearTo ? `Am comparat ${year} cu anul dinainte.` : `Am comparat ${years.yearTo} cu ${years.yearFrom}: ${year} nu are un an complet înainte în date.`);
        }
        // A new trend's months are `auto` (plan §2.6): whole years while the later year is complete, else its
        // complete months in both years (trend final §3.3); a year whose complete months are unknown is refused
        // by the run (autoMonthsUnresolved), never a part of a year against a whole one.
        raw.trend = { ...optionsOf(raw, "trend"), months: "auto" };
        const window = context.periods && f.yearTo !== undefined ? sameMonthsWindow(context.periods, (raw.dataset ?? "all") as Dataset, f.yearTo, "auto") : null;
        if (window && !("error" in window) && !isWholeYear(window))
          notes.push(`${f.yearTo} nu e încă încheiat: am comparat aceleași luni din ambii ani (${monthsLabel(window)}).`);
      } else {
        raw.block = "timeseries";
        if (raw.measure === "value_per_capita") raw.measure = "value";
      }
      break;
    }
    case "compare": {
      raw.block = "compare";
      raw.comparisonMode = "transactions";
      raw.measure = "value";
      delete f.uatSiruta; delete f.uatName;
      // Between two firms the county and the kind are their clients' (plan §2.7, final compare §3.5: „+ Cine a
      // cumpărat”), and an institution is never written: it would make the question a comparison of institutions.
      const firms = i.compareWith?.role === "supplier" || !i.compareWith && Boolean(f.supplierName || f.supplierId) && !(f.authorityName || f.authorityId);
      if (firms && (f.authorityName || f.authorityId)) {
        notes.push(`Comparația a două firme nu se restrânge la o instituție; am păstrat comparația, fără „${f.authorityName ?? "instituția"}”.`);
        delete f.authorityName; delete f.authorityId;
      }
      if (!firms) { delete f.county; delete f.authorityKind; }
      break;
    }
    case "signals": {
      raw.measure = "value";
      // risk profiles compare institutions with each other; never a one-town-hall population (localityScopeSupport)
      if (!named) localityToCounty(townHallOnly("semnale"));
      if (named) {
        raw.block = "distribution";
        if (f.authorityName && f.supplierName) { delete f.supplierName; delete f.supplierId; }
        const supplierFocal = Boolean(f.supplierName);
        if (f.uatSiruta) localityToCounty(townHallOnly("grupul de comparație"));
        if (supplierFocal) { delete f.authorityKind; delete f.uatSiruta; delete f.uatName; }
        if (supplierFocal) delete f.county;
        dropForProfiles(true);
      } else {
        const dim = i.dimHint === "supplier" ? "supplier" : "authority";
        raw.block = i.superlative ? "entity_card" : "scatter";
        raw.dim = dim;
        if (i.superlative) raw.rankBy = "risk";
        if (dim === "supplier" && f.authorityKind) {
          delete f.authorityKind;
          notes.push("Profilurile firmelor nu se pot restrânge după tipul instituției care cumpără; am păstrat doar județul.");
        }
        dropForProfiles(false);
      }
      break;
    }
  }
  // "în 2025 față de 2024" on a total or a ranking would sum both years: the year asked about, as before the rule.
  const versus = i.period?.versus;
  if (versus && raw.block !== "trend" && raw.block !== "timeseries" && f.yearFrom !== undefined) {
    f.yearFrom = versus.main; f.yearTo = versus.main;
    notes.push(`Am folosit prima perioadă din întrebare; „${versus.other}” nu a fost aplicată.`);
  }
  let lensed = applyLenses(raw, i.lenses, notes);
  // A new trend says its group (plan §2.6, trend final §4.2): the growths, unless the words name one or ask
  // for every change ("cum s-au schimbat", "evoluția"); two groups that exclude each other were said: every change.
  if (lensed.block === "trend" && optionsOf(lensed, "trend").change === undefined) {
    const said = i.lenses.some((l) => l.block === "trend" && l.path === "trend.change");
    const change = said || EVERY_CHANGE.test(fold(i.text)) ? "all" : "up";
    lensed = FILTERS.trendChange.write(lensed as unknown as FilterSpec, change) as unknown as Record<string, unknown>;
  }
  const valid = validateSpec(lensed);
  if ("error" in valid) return { spec: null, error: valid.error, notes };
  return { spec: valid, error: null, notes };
}

/** The words of a change without a direction: a trend of every change, not the default growths. */
const EVERY_CHANGE = /\b(?:schimb\w*|evolu\w*|tendint\w*|dinamic\w*|diferent\w*)\b/;

// ------------------------------------------------------------- sentence

export interface SentenceLabels {
  /** The person asked about town halls; the ranking covers every institution, and the sentence says so. */
  allInstitutions?: boolean;
  /** Readable subject for the spec's cpvTerm ("iluminat", "Servicii de deszăpezire"). */
  subject?: string | null;
  /**
   * A trend's `months: "auto"`: the archive's periods say whether it means the same months or whole years
   * (sameMonthsWindow); without them, or when the words asked for the same months, the sentence says them.
   */
  periods?: CoveragePeriods | null;
  sameMonthsSaid?: boolean;
}

/** Whether a trend's sentence says "pe aceleași luni": `auto` that the periods resolve to whole years needs no words. */
export function saysSameMonths(spec: AskSpec, labels: Pick<SentenceLabels, "periods" | "sameMonthsSaid"> = {}): boolean {
  if (spec.trend?.months !== "auto") return false;
  if (labels.sameMonthsSaid || labels.periods === undefined || spec.filters.yearTo === undefined) return true;
  const window = sameMonthsWindow(labels.periods, spec.dataset ?? "all", spec.filters.yearTo, "auto");
  return "error" in window || !isWholeYear(window);
}

/**
 * A trend's `auto` months as the title says them (trend final §1, §3.3): the months the archive's
 * periods resolve to when they are part of a year ("pe aceleași luni: ian.–mai"), the rule when they
 * cannot be resolved or the words asked for them, nothing on whole years.
 */
function sameMonthsLabels(spec: AskSpec, labels: SentenceLabels): Pick<TitleLabels, "executedMonths" | "sameMonthsRule"> {
  if (spec.block !== "trend" || spec.trend?.months !== "auto") return {};
  const window = labels.periods !== undefined && spec.filters.yearTo !== undefined
    ? sameMonthsWindow(labels.periods, spec.dataset ?? "all", spec.filters.yearTo, "auto") : null;
  if (window && !("error" in window) && !isWholeYear(window)) return { executedMonths: [window.from, window.to] };
  return saysSameMonths(spec, labels) ? { sameMonthsRule: true } : { executedMonths: [1, 12] };
}

/**
 * One plain Romanian sentence for a spec (plan §2.7, F1b-r-interpreter-sentence): the builder's
 * sentence and the conditions under it, as the answer's title says them (filters/title.ts), so "Am
 * înțeles așa:" and the builder say the same question. The interpreter adds what it knows: the reader's
 * own words for the domain, that a question about town halls counts every institution, and the months
 * `auto` resolves to.
 */
export function sentenceFor(spec: AskSpec, labels: SentenceLabels = {}): string {
  return questionTitle(spec, {
    ...(labels.subject && spec.filters.cpvTerm ? { subject: labels.subject } : {}),
    ...(labels.allInstitutions ? { allInstitutions: true } : {}),
    ...sameMonthsLabels(spec, labels),
  });
}

// ---------------------------------------------------------- the result

const INTENT_LABEL: Record<IntentKind, string> = {
  ranking_suppliers: "Cine câștigă contractele",
  ranking_authorities: "Ce instituții cumpără",
  total: "Cât valorează în total",
  breakdown: "Pe ce se duc banii",
  trend: "Cum s-a schimbat de la an la an",
  compare: "Compară",
  signals: "Ce merită verificat",
};

const FOLLOW_UPS: Record<IntentKind, IntentKind[]> = {
  ranking_suppliers: ["total", "trend"],
  ranking_authorities: ["total", "breakdown"],
  total: ["ranking_suppliers", "trend"],
  breakdown: ["ranking_suppliers", "trend"],
  trend: ["total", "ranking_suppliers"],
  compare: ["total"],
  signals: ["ranking_suppliers"],
};

function specKey(spec: AskSpec): string {
  return JSON.stringify(spec);
}

/** Assemble the API answer: spec, sentence and ready alternatives. `context`: the archive's periods, for a trend's years and months. */
export function resultFor(i: Interpretation, context: SpecContext = {}): IntentResult {
  const labels: SentenceLabels = { subject: subjectsLabel(i.subjects), ...(i.askedTownHalls && !i.authorityKind && i.measure !== "value_per_capita" ? { allInstitutions: true } : {}),
    ...(context.periods !== undefined ? { periods: context.periods } : {}),
    ...(i.lenses.some((l) => l.block === "trend" && l.path === "trend.months") ? { sameMonthsSaid: true } : {}) };
  const notes = [...i.notes];
  let spec: AskSpec | null = null;
  let problem: string | null = null;
  if (i.intent === "compare" && !i.compareWith && i.compareChoices.length) {
    problem = "Ce vrei să compari? Comparăm două instituții, nu două locuri.";
  } else if (i.intent && i.subjectChoices) {
    // a word that is not a subject on its own: each meaning is an alternative
    problem = i.subjectChoices.message;
  } else if (i.intent && i.placeAmbiguous) {
    // never guess between localities of the same name: each is an alternative
    problem = "Alege localitatea la care te gândești.";
  } else if (i.intent && i.entityAlternatives.length && !i.supplier && !i.authority) {
    problem = i.choicesPartial
      ? `${countWords(i.choicesPartial.total, "firmă sau instituție", "firme sau instituții")} se potrivesc. Alege una dintre primele ${i.choicesPartial.shown} sau scrie numele complet.`
      : "Mai multe firme sau instituții au acest nume. Alege-o pe cea la care te gândești.";
  } else if (i.intent && !hasNamedScope(i) && i.leftover.length) {
    // only defaults matched ("<script> cine câștigă"): do not answer a national question nobody asked
    problem = "Nu am recunoscut în întrebare un subiect, un loc, o instituție sau o firmă.";
  } else if (i.intent && i.personAlternatives.length && !i.person) {
    problem = i.choicesPartial
      ? `În Registrul Comerțului sunt ${countWords(i.choicesPartial.total, "persoană", "persoane")} cu acest nume. Alege una dintre primele ${i.choicesPartial.shown} sau caut-o după nume.`
      : i.personAlternatives.length === 1
        ? "Confirmă persoana: am căutat numele așa cum l-ai scris."
        : "Alege persoana la care te gândești; în Registrul Comerțului sunt mai multe cu același nume.";
  } else if (i.intent) {
    const built = specFor(i, i.intent, {}, context);
    spec = built.spec;
    notes.push(...built.notes);
    if (!spec) problem = built.error;
  } else if (i.text) {
    problem = "Nu am recunoscut în întrebare un subiect, un loc, o instituție sau o firmă.";
  }
  const alternatives: IntentAlternative[] = [];
  const seen = new Set<string>(spec ? [specKey(spec)] : []);
  const add = (label: string, kind: IntentAlternative["kind"], s: AskSpec | null) => {
    if (!s || seen.has(specKey(s))) return;
    seen.add(specKey(s));
    alternatives.push({ label, kind, spec: s, sentence: sentenceFor(s, labels) });
  };
  const intent = i.intent ?? "ranking_suppliers";
  // While something must be chosen, offer only that choice: other alternatives would silently drop it.
  const choosing = spec ? null
    : i.intent === "compare" && i.compareChoices.length ? "pair"
    : i.subjectChoices ? "subject"
    : i.placeAmbiguous ? "place"
    : i.entityAlternatives.length && !i.supplier && !i.authority ? "entity"
    : i.personAlternatives.length && !i.person ? "person"
    : "none";
  for (const p of choosing === null || choosing === "place" ? i.placeAlternatives : []) {
    const label = p.kind === "locality" && i.place?.kind === "county" ? `Doar primăria ${genitive(p)}`
      : p.kind === "county" && i.place?.kind === "locality" ? (p.county === "București" ? "Tot Bucureștiul" : `Tot județul ${p.county}`)
      : p.label;
    const alt = specFor(i, intent, { place: p }, context).spec;
    // an alternative must keep the scope its label promises (never a silent nationwide answer)
    if (alt && p.kind === "locality" && !alt.filters.uatSiruta) continue;
    if (alt && p.kind === "county" && alt.filters.county !== p.county) continue;
    add(label, "place", alt);
  }
  if (choosing === "subject" && i.subjectChoices) {
    const { matched } = i.subjectChoices;
    for (const o of i.subjectChoices.options) {
      const chosen: Interpretation = { ...i, subjectChoices: null, subjects: [{ term: o.term, label: o.label, cpvName: null, source: /^\d/.test(o.term) ? "catalog" : "synonym", matched }, ...i.subjects] };
      const alt = specFor(chosen, intent, {}, context).spec;
      if (alt) { alternatives.push({ label: o.label, kind: "subject", spec: alt, sentence: sentenceFor(alt, { ...labels, subject: o.label }) }); seen.add(specKey(alt)); }
    }
  }
  if (choosing === "pair") for (const pair of i.compareChoices) add(pair.label, "entity", specFor(i, "compare", { pair }, context).spec);
  if (choosing === "person") for (const p of i.personAlternatives) add(personDisplay(p), "person", specFor(i, intent, { person: p }, context).spec);
  // a number that is both a fiscal code and a CPV code: the firm or institution is a choice too
  if (choosing === "entity" || (choosing === "subject" && i.entityAlternatives.length && !i.supplier && !i.authority)) {
    const base = (e: EntityMatch) => `${cleanName(e.name)}${e.county && !/^(na|necunoscut)$/i.test(e.county) ? ` (${e.county})` : ""}`;
    const counts = new Map<string, number>();
    for (const e of i.entityAlternatives) counts.set(base(e), (counts.get(base(e)) ?? 0) + 1);
    // same name and county: the registry id is the only honest difference
    for (const e of i.entityAlternatives) add(`${base(e)}${(counts.get(base(e)) ?? 0) > 1 && e.id ? ` · ID ${e.id}` : ""}`, "entity", specFor(i, intent, { entity: e }, context).spec);
  }
  if (spec && i.intent) {
    const follow = [...i.otherIntents, ...FOLLOW_UPS[i.intent]].filter((k) => k !== i.intent && k !== "compare");
    let n = 0;
    for (const k of [...new Set(follow)]) {
      if (n >= 3) break;
      const before = alternatives.length;
      add(INTENT_LABEL[k], "intent", specFor(i, k, {}, context).spec);
      if (alternatives.length > before) n++;
    }
  }
  return {
    q: i.text,
    interpretation: { ...i, notes: [...new Set(notes)] },
    spec,
    sentence: spec ? sentenceFor(spec, labels) : null,
    alternatives,
    problem,
  };
}

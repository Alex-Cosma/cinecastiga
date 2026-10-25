import { cleanName } from "../format";
import { joinCpvTerms } from "../ask/cpv-terms";
import { titleTail } from "../ask/filters/words";
import { IMPLEMENTED_KEYS, namedKind, validateSpec, type AskFilters, type AskSpec, type AuthorityKind, type Block, type Dataset } from "../ask/spec";
import { defaultTrendYears, isWholeYear, monthsLabel, sameMonthsWindow, trendYearsFrom, type CoveragePeriods } from "../ask/months-window";
import { FILTERS, SPEC_PATH_OWNERS } from "../ask/filters/registry";
import { filterContext } from "../ask/filters/context";
import type { FilterSpec, SpecPath } from "../ask/filters/types";
import { TREND_CHANGE_LABELS } from "../ask/filters/defs/trend";
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
const PROFILE_DROPPED: (keyof AskFilters)[] = ["cpvTerm", "yearFrom", "yearTo", "monthFrom", "monthTo", "singleBidder", "minEmployees", "maxEmployees", "adminName", "adminPersonKey"];

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
  "trend.firstOnly": { path: "trend.change", value: "new", note: "„Prima dată” se referă la firmele noi; am arătat firmele noi." },
};
const optionsOf = (raw: Record<string, unknown>, block: string): Record<string, unknown> =>
  (raw[block] && typeof raw[block] === "object" ? raw[block] : {}) as Record<string, unknown>;
const readPath = (raw: Record<string, unknown>, path: SpecPath): unknown => {
  const [head, sub] = path.split(".") as [string, string | undefined];
  return sub === undefined ? raw[head] : head === "filters" ? (raw.filters as Record<string, unknown>)[sub] : optionsOf(raw, head)[sub];
};

/**
 * The lenses of the chosen block, written by their filters (plan §2.7): a key
 * this release applies on this question (IMPLEMENTED_KEYS, the filter's
 * engine level on the answer's form) among the values its control offers
 * here, with what the filter's write implies. BLOCK_FILTERS does not place
 * the trend's keys yet (the builder of F1b/F2 does), so the engine level
 * stands for "offered". A lens the question does not offer, two that
 * contradict each other, or a phrase of another question's table is said,
 * never applied silently; the words of a cue or a modifier this question
 * already used (`quiet`) need no note.
 */
export function applyLenses(raw: Record<string, unknown>, lenses: readonly LensMatch[], notes: string[]): Record<string, unknown> {
  const block = raw.block as Block;
  const own = lenses.filter((l) => l.block === block);
  const overlaps = (a: LensMatch["matched"], b: LensMatch["matched"]) => a.from < b.to && b.from < a.to;
  for (const l of lenses)
    if (l.block !== block && !l.quiet && !own.some((o) => overlaps(o.matched, l.matched))) notes.push(lensNotApplied(l.matched.text));
  const byPath = new Map<SpecPath, LensMatch[]>();
  for (const l of own) byPath.set(l.path, [...(byPath.get(l.path) ?? []), l]);
  let spec = raw as unknown as FilterSpec;
  const offered = (path: SpecPath, value: unknown, at: FilterSpec): boolean => {
    const owner = SPEC_PATH_OWNERS[path];
    if (owner === "question" || !IMPLEMENTED_KEYS.has(path)) return false;
    const def = FILTERS[owner], ctx = filterContext(at);
    return def.engine[ctx.form] !== undefined && def.choices(at, ctx).some((choice) => JSON.stringify(choice) === JSON.stringify(value));
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
    if (!offered(path, value, spec)) { if (!found.every((l) => l.quiet)) notes.push(lensNotApplied(words.join("”, „"))); continue; }
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
  if (i.singleBidder) f.singleBidder = true;
  if (i.employees?.min !== undefined) f.minEmployees = i.employees.min;
  if (i.employees?.max !== undefined) f.maxEmployees = i.employees.max;
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
  if (i.dataset && !(i.dataset === "da" && i.singleBidder)) raw.dataset = i.dataset;
  if (i.dataset === "da" && i.singleBidder) notes.push("Numărul de ofertanți există doar pentru contractele din proceduri; am folosit contractele, nu achizițiile directe.");
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
        dropped.includes("singleBidder") ? "filtrul de ofertanți" : null,
        dropped.some((k) => k.endsWith("Employees")) ? "mărimea firmelor" : null,
        dropped.some((k) => k.startsWith("admin")) ? "persoana" : null,
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
    case "compare":
      raw.block = "compare";
      raw.comparisonMode = "transactions";
      raw.measure = "value";
      delete f.uatSiruta; delete f.uatName; delete f.county; delete f.authorityKind;
      break;
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

const KIND_PLURAL: Record<AuthorityKind, [string, string]> = {
  // [with article, without]
  comuna: ["primăriile de comună", "primării de comună"],
  oras_municipiu: ["primăriile de oraș și municipiu", "primării de oraș și municipiu"],
  consiliu_judetean: ["consiliile județene", "consilii județene"],
  spital: ["spitalele", "spitale"],
  scoala: ["școlile", "școli"],
};

function countyPhrase(county: string): string {
  return county === "București" ? "din București" : `din județul ${county}`;
}

function uatPhrase(label: string): string {
  // "Municipiul Buzău (Buzău)" → "Municipiului Buzău"; keeps the county for comune
  const m = /^(.*?) \(([^)]+)\)$/.exec(label);
  const name = m ? m[1]! : label;
  const county = m ? m[2]! : null;
  const bare = name.replace(/^(Municipiul|Orașul|Comuna|Sectorul) /, "");
  const g = genitive({ name });
  return county && county !== bare ? `${g} (${county})` : g;
}

/** "instituțiile din județul Buzău", "primăria Municipiului Buzău", "„SPITALUL …”". */
function buyers(f: AskFilters): string {
  if (f.authorityName) return `„${f.authorityName}”`;
  if (f.uatSiruta) return `primăria ${uatPhrase(f.uatName ?? `localității ${f.uatSiruta}`)}`;
  const kind = namedKind(f.authorityKind);
  const who = kind ? KIND_PLURAL[kind][0] : "instituțiile";
  return `${who} ${f.county ? countyPhrase(f.county) : "din toată țara"}`;
}

function wherePlain(f: AskFilters): string {
  // the engine scopes a locality to its town hall (compile.ts), so the sentence says so
  if (f.uatSiruta) return ` ale primăriei ${uatPhrase(f.uatName ?? `localității ${f.uatSiruta}`)}`;
  if (f.county) return ` ${countyPhrase(f.county)}`;
  return "";
}

function period(f: AskFilters): string {
  if (f.yearFrom && f.yearTo) return f.yearFrom === f.yearTo ? `în ${f.yearFrom}` : `între ${f.yearFrom} și ${f.yearTo}`;
  if (f.yearFrom) return `din ${f.yearFrom} încoace`;
  if (f.yearTo) return `până în ${f.yearTo}`;
  return "în toți anii";
}

/** The stream and the employees after the period: the title's tail (filters/words.ts), one writer for both. */
const suffix = (spec: AskSpec): string => titleTail(spec);

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

/** One plain Romanian sentence for a spec, as a person would ask it. */
export function sentenceFor(spec: AskSpec, labels: SentenceLabels = {}): string {
  const f = spec.filters;
  const subjectLabel = f.cpvTerm ? labels.subject ?? f.cpvTerm : null;
  const subj = subjectLabel ? ` pentru „${subjectLabel}”` : "";
  const fromSupplier = f.supplierName ? ` de la „${f.supplierName}”` : "";
  const admin = f.adminName ? ` de la firmele conduse de ${f.adminName}` : "";
  const when = period(f);
  const tail = suffix(spec);
  const anyInstitution = labels.allInstitutions ? " (toate instituțiile, nu doar primăriile)" : "";
  const kind = namedKind(f.authorityKind);
  const dimNoun = spec.dim === "supplier" ? "firme" : spec.dim === "county" ? "județe" : kind ? KIND_PLURAL[kind][1] : `instituții${anyInstitution}`;
  switch (spec.block) {
    case "table":
      if (spec.dim === "supplier")
        return `Cine câștigă ${spec.measure === "count" ? "cele mai multe contracte" : "contractele"}${subj} de la ${buyers(f)}${admin ? `, dintre firmele conduse de ${f.adminName}` : ""}, ${when}${tail}?`;
      return `Ce ${dimNoun}${spec.dim === "county" ? "" : wherePlain(f)} cumpără cel mai mult${spec.measure === "value_per_capita" ? " pe locuitor" : spec.measure === "count" ? " (număr de achiziții)" : ""}${subj}${fromSupplier}${admin}, ${when}${tail}?`;
    case "stat":
      return spec.measure === "count"
        ? `Câte achiziții${subj} au fost făcute de ${buyers(f)}${fromSupplier}${admin}, ${when}${tail}?`
        : `Cât valorează achizițiile${subj} făcute de ${buyers(f)}${fromSupplier}${admin}, ${when}${tail}?`;
    case "breakdown":
      return `Ce cumpără ${buyers(f)}${subjectLabel ? ` în domeniul „${subjectLabel}”` : ""}${fromSupplier}${admin}, ${when}${tail}?`;
    case "timeseries":
      return `Cum au evoluat de la an la an achizițiile${subj} făcute de ${buyers(f)}${fromSupplier}${admin}, ${when}${tail}?`;
    case "trend": {
      const filtered = Boolean(f.authorityName || f.uatSiruta || f.county || f.authorityKind);
      const t = spec.trend ?? {}, a = f.yearFrom ?? "…", b = f.yearTo ?? "…";
      // The group and the months in words (trend final §1): "Ce firme noi apar …, față de 2024?", "… pe aceleași luni".
      const months = t.months === "auto" ? saysSameMonths(spec, labels) ? ", pe aceleași luni" : "" : Array.isArray(t.months) ? `, pe ${monthsLabel({ from: t.months[0], to: t.months[1] })}` : "";
      const from = spec.dim === "supplier" ? `${subj}${filtered ? ` de la ${buyers(f)}` : ""}` : `${subj}${fromSupplier}`;
      const who = spec.dim === "supplier" ? "firme" : `${dimNoun}${spec.dim === "county" ? "" : wherePlain(f)}`;
      if (t.change === "new")
        return t.firstOnly
          ? `Ce ${who} apar pentru prima dată în achizițiile${from} din ${b}, față de ${a}${months}${tail}?`
          : `Ce ${who.replace(/^(firme|instituții|județe)/, "$1 noi")} apar în achizițiile${from} din ${b}, față de ${a}${months}${tail}?`;
      if (t.change === "gone") return `Ce ${who} din ${a} nu mai apar în achizițiile${from} din ${b}${months}${tail}?`;
      if (t.change === "up" || t.change === "down") {
        const change = `${t.change === "up" ? "creștere" : "scădere"}${t.order === "percent" ? " în procente" : ""}`;
        return spec.dim === "supplier"
          ? `Ce firme au cea mai mare ${change} a valorii câștigate${from} între ${a} și ${b}${months}${tail}?`
          : `Ce ${who} au cea mai mare ${change} a achizițiilor${from} între ${a} și ${b}${months}${tail}?`;
      }
      return spec.dim === "supplier"
        ? `Ce firme au cea mai mare schimbare a valorii contractelor${from} între ${a} și ${b}${months}${tail}?`
        : `Ce ${who} au cea mai mare schimbare a achizițiilor${from} între ${a} și ${b}${months}${tail}?`;
    }
    case "compare":
      return f.supplierName
        ? `Cum se compară contractele${subj} câștigate de „${f.supplierName}” cu cele câștigate de „${f.compareWith ?? "?"}”, ${when}${tail}?`
        : `Cum se compară achizițiile${subj} făcute de „${f.authorityName ?? "?"}” cu cele făcute de „${f.compareWith ?? "?"}”, ${when}${tail}?`;
    case "scatter":
      return `Ce ${dimNoun}${wherePlain(f)} ies din tipar după indicele de risc și valoarea achizițiilor?`;
    case "entity_card":
      if (spec.rankBy === "risk")
        return `Care ${spec.dim === "supplier" ? "firmă" : f.authorityKind === "spital" ? "spital" : f.authorityKind === "scoala" ? "școală" : f.authorityKind === "comuna" ? "primărie de comună" : f.authorityKind === "oras_municipiu" ? "primărie de oraș" : f.authorityKind === "consiliu_judetean" ? "consiliu județean" : `instituție${labels.allInstitutions ? " (oricare, nu doar primăriile)" : ""}`}${wherePlain(f)} are cel mai ridicat indice de risc?`;
      return spec.dim === "supplier"
        ? `Care firmă are contractele de cea mai mare valoare${subj} de la ${buyers(f)}, ${when}${tail}?`
        : `Care ${f.authorityKind === "spital" ? "spital" : f.authorityKind === "scoala" ? "școală" : f.authorityKind === "comuna" ? "primărie de comună" : f.authorityKind === "oras_municipiu" ? "primărie de oraș" : f.authorityKind === "consiliu_judetean" ? "consiliu județean" : `instituție${labels.allInstitutions ? " (oricare, nu doar primăriile)" : ""}`}${wherePlain(f)} cumpără cel mai mult${subj}${fromSupplier}, ${when}${tail}?`;
    case "distribution":
      return `Unde se situează „${f.authorityName ?? f.supplierName ?? "?"}” după indicele de risc, față de ${f.supplierName ? "alte firme" : "alte instituții"}${f.county && !f.supplierName ? ` ${countyPhrase(f.county)}` : ""}?`;
    case "network":
      return `Cu cine lucrează „${f.authorityName ?? f.supplierName ?? "?"}”?`;
    case "sankey":
      return `Cum se împart achizițiile „${f.authorityName ?? f.supplierName ?? "?"}” între parteneri și domenii?`;
    case "fact_check":
      return `A cumpărat „${f.authorityName ?? "?"}” de la „${f.supplierName ?? "?"}”?`;
    case "map":
      return `Cum se împart pe județe achizițiile${subj}, ${when}${tail}?`;
    default:
      return "Întrebarea ta";
  }
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
      ? `${i.choicesPartial.total} firme sau instituții se potrivesc. Alege una dintre primele ${i.choicesPartial.shown} sau scrie numele complet.`
      : "Mai multe firme sau instituții au acest nume. Alege-o pe cea la care te gândești.";
  } else if (i.intent && !hasNamedScope(i) && i.leftover.length) {
    // only defaults matched ("<script> cine câștigă"): do not answer a national question nobody asked
    problem = "Nu am recunoscut în întrebare un subiect, un loc, o instituție sau o firmă.";
  } else if (i.intent && i.personAlternatives.length && !i.person) {
    problem = i.choicesPartial
      ? `În Registrul Comerțului sunt ${i.choicesPartial.total} persoane cu acest nume. Alege una dintre primele ${i.choicesPartial.shown} sau caut-o după nume.`
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

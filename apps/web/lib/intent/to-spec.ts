import { cleanName } from "../format";
import { validateSpec, type AskFilters, type AskSpec, type AuthorityKind } from "../ask/spec";
import { genitive, hasNamedScope } from "./rules";
import type { EntityMatch, IntentAlternative, IntentKind, IntentResult, Interpretation, PersonMatch, PlaceMatch } from "./types";

/**
 * Interpretation → AskSpec (validated by the engine's own validateSpec) and
 * → a plain Romanian sentence. The spec is what the builder edits and what
 * /api/ask runs; nothing here touches the database.
 */

/** Kinds whose institutions are not part of a locality scope (the UAT's own administration only). */
const NOT_IN_LOCALITY: AuthorityKind[] = ["scoala", "spital", "consiliu_judetean"];
const PROFILE_DROPPED: (keyof AskFilters)[] = ["cpvTerm", "yearFrom", "yearTo", "monthFrom", "monthTo", "singleBidder", "minEmployees", "maxEmployees", "adminName", "adminPersonKey"];

interface Choice { place?: PlaceMatch | null; person?: PersonMatch | null; entity?: EntityMatch; pair?: { focal: EntityMatch; other: EntityMatch } }

function personDisplay(p: PersonMatch): string {
  return `${cleanName(p.name)}${p.birthYear ? ` (n. ${p.birthYear}${p.birthLocality ? `, ${p.birthLocality}` : ""})` : ""}`;
}

function baseFilters(i: Interpretation, choice: Choice, notes: string[]): AskFilters {
  const f: AskFilters = {};
  const subject = i.subjects[0];
  if (subject) f.cpvTerm = subject.term;
  if (i.authorityKind) f.authorityKind = i.authorityKind.kind;
  const place = choice.place === undefined ? i.place : choice.place;
  if (place?.kind === "county") f.county = place.county;
  if (place?.kind === "locality" && place.siruta) {
    if (f.authorityKind && NOT_IN_LOCALITY.includes(f.authorityKind)) {
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
export function specFor(input: Interpretation, intent: IntentKind, choice: Choice = {}): { spec: AskSpec | null; error: string | null; notes: string[] } {
  const i = choice.pair ? { ...input, authority: choice.pair.focal, compareWith: choice.pair.other, place: null }
    : choice.entity ? { ...input, [choice.entity.role]: choice.entity } : input;
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
      if (twoYears && i.dimHint) {
        raw.block = "trend";
        raw.dim = i.dimHint === "supplier" && !(f.supplierName || f.supplierId) ? "supplier" : "authority";
        if (raw.dim === "authority") localityToCounty(townHallOnly("schimbarea pe instituții"));
        raw.topN = i.topN ?? 10;
        raw.measure = "value";
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
  const valid = validateSpec(raw);
  if ("error" in valid) return { spec: null, error: valid.error, notes };
  return { spec: valid, error: null, notes };
}

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
  const who = f.authorityKind ? KIND_PLURAL[f.authorityKind][0] : "instituțiile";
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

/** Romanian numerals take "de" from 20 on: "5 angajați", "49 de angajați". */
export function countOf(n: number, noun: string): string {
  const lastTwo = n % 100;
  return `${n}${n !== 0 && (lastTwo === 0 || lastTwo >= 20) ? " de" : ""} ${noun}`;
}

function suffix(spec: AskSpec): string {
  const f = spec.filters;
  const parts: string[] = [];
  if (f.singleBidder) parts.push("doar contracte cu un singur ofertant");
  else if (spec.dataset === "da") parts.push("doar achiziții directe");
  else if (spec.dataset === "contracts") parts.push("doar contracte din proceduri");
  if (f.maxEmployees === 0) parts.push("firme fără angajați");
  else if (f.minEmployees !== undefined && f.maxEmployees !== undefined) parts.push(`firme cu ${f.minEmployees}–${countOf(f.maxEmployees, "angajați")}`);
  else if (f.maxEmployees !== undefined) parts.push(`firme cu cel mult ${countOf(f.maxEmployees, "angajați")}`);
  else if (f.minEmployees !== undefined) parts.push(`firme cu cel puțin ${countOf(f.minEmployees, "angajați")}`);
  return parts.length ? `, ${parts.join(", ")}` : "";
}

export interface SentenceLabels {
  /** The person asked about town halls; the ranking covers every institution, and the sentence says so. */
  allInstitutions?: boolean;
  /** Readable subject for the spec's cpvTerm ("iluminat", "Servicii de deszăpezire"). */
  subject?: string | null;
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
  const dimNoun = spec.dim === "supplier" ? "firme" : spec.dim === "county" ? "județe" : f.authorityKind ? KIND_PLURAL[f.authorityKind][1] : `instituții${anyInstitution}`;
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
      return spec.dim === "supplier"
        ? `Ce firme au cea mai mare schimbare a valorii contractelor${subj}${filtered ? ` de la ${buyers(f)}` : ""} între ${f.yearFrom ?? "…"} și ${f.yearTo ?? "…"}${tail}?`
        : `Ce ${dimNoun}${spec.dim === "county" ? "" : wherePlain(f)} au cea mai mare schimbare a achizițiilor${subj}${fromSupplier} între ${f.yearFrom ?? "…"} și ${f.yearTo ?? "…"}${tail}?`;
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

/** Assemble the API answer: spec, sentence and ready alternatives. */
export function resultFor(i: Interpretation): IntentResult {
  const labels: SentenceLabels = { subject: i.subjects[0]?.label ?? null, ...(i.askedTownHalls && !i.authorityKind && i.measure !== "value_per_capita" ? { allInstitutions: true } : {}) };
  const notes = [...i.notes];
  let spec: AskSpec | null = null;
  let problem: string | null = null;
  if (i.intent === "compare" && !i.compareWith && i.compareChoices.length) {
    problem = "Ce vrei să compari? Comparăm două instituții, nu două locuri.";
  } else if (i.intent && i.placeAmbiguous) {
    // never guess between localities of the same name: each is an alternative
    problem = "Alege localitatea la care te gândești; există mai multe cu același nume.";
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
    const built = specFor(i, i.intent);
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
    : i.placeAmbiguous ? "place"
    : i.entityAlternatives.length && !i.supplier && !i.authority ? "entity"
    : i.personAlternatives.length && !i.person ? "person"
    : "none";
  for (const p of choosing === null || choosing === "place" ? i.placeAlternatives : []) {
    const label = p.kind === "locality" && i.place?.kind === "county" ? `Doar primăria ${genitive(p)}`
      : p.kind === "county" && i.place?.kind === "locality" ? (p.county === "București" ? "Tot Bucureștiul" : `Tot județul ${p.county}`)
      : p.label;
    const alt = specFor(i, intent, { place: p }).spec;
    // an alternative must keep the scope its label promises (never a silent nationwide answer)
    if (alt && p.kind === "locality" && !alt.filters.uatSiruta) continue;
    if (alt && p.kind === "county" && alt.filters.county !== p.county) continue;
    add(label, "place", alt);
  }
  if (choosing === "pair") for (const pair of i.compareChoices) add(pair.label, "entity", specFor(i, "compare", { pair }).spec);
  if (choosing === "person") for (const p of i.personAlternatives) add(personDisplay(p), "person", specFor(i, intent, { person: p }).spec);
  if (choosing === "entity") {
    const base = (e: EntityMatch) => `${cleanName(e.name)}${e.county && !/^(na|necunoscut)$/i.test(e.county) ? ` (${e.county})` : ""}`;
    const counts = new Map<string, number>();
    for (const e of i.entityAlternatives) counts.set(base(e), (counts.get(base(e)) ?? 0) + 1);
    // same name and county: the registry id is the only honest difference
    for (const e of i.entityAlternatives) add(`${base(e)}${(counts.get(base(e)) ?? 0) > 1 && e.id ? ` · ID ${e.id}` : ""}`, "entity", specFor(i, intent, { entity: e }).spec);
  }
  if (spec && i.intent) {
    const follow = [...i.otherIntents, ...FOLLOW_UPS[i.intent]].filter((k) => k !== i.intent && k !== "compare");
    let n = 0;
    for (const k of [...new Set(follow)]) {
      if (n >= 3) break;
      const before = alternatives.length;
      add(INTENT_LABEL[k], "intent", specFor(i, k).spec);
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

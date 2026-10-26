import {
  BLOCK_OPTION_KEYS, optionBelongs, validateSpec, type AskSpec, type Block, type NetworkOptions, type OptionKey,
  type PeersOptions, type SankeyOptions, type ScatterOptions, type TimeseriesOptions, type TrendOptions,
} from "./spec";
import { isHistoricalProfile, type MinimumRecords, type QueryPopulation } from "./population";
import { cpvTermParts } from "./cpv-terms";

/**
 * The builder uses exactly the public /api/ask spec; it owns no query engine.
 * Every AskSpec is a QuestionSpec (the applied answer, a saved question, a
 * watch); the builder writes its filters by name.
 */
export interface QuestionSpec {
  block: string;
  dataset?: string;
  dim?: string;
  measure: string;
  topN?: number;
  rankBy?: string;
  filters: Record<string, string | number | boolean>;
  population?: QueryPopulation;
  comparisonMode?: "transactions" | "profiles";
  minimumRecords?: MinimumRecords;
  // Block options (plan §3), read ahead of the engine (F0a); each only on its own block.
  trend?: TrendOptions;
  timeseries?: TimeseriesOptions;
  network?: NetworkOptions;
  sankey?: SankeyOptions;
  scatter?: ScatterOptions;
  peers?: PeersOptions;
}
const OPTION_KEYS: readonly OptionKey[] = [...BLOCK_OPTION_KEYS, "peers"];

export const QUESTION_GROUPS = [
  {
    id: "money",
    label: "Bani și achiziții",
    description: "Începe cu o întrebare simplă.",
  },
  {
    id: "change",
    label: "Comparații și schimbări",
    description: "Pune cifrele în perspectivă.",
  },
  {
    id: "relations",
    label: "Relații",
    description: "Urmărește legăturile dintre cumpărători și firme.",
  },
  {
    id: "signals",
    label: "Repere și semnale",
    description: "Găsește puncte de plecare pentru verificări.",
  },
] as const;

export const QUESTION_TYPES: {
  id: Block;
  group: string;
  label: string;
  description: string;
  keywords: string;
}[] = [
  {
    id: "table",
    group: "money",
    label: "Cine câștigă cele mai multe contracte?",
    description: "Un clasament al firmelor, instituțiilor sau județelor.",
    keywords: "top clasament furnizori autoritati",
  },
  {
    id: "stat",
    group: "money",
    label: "Cât valorează achizițiile?",
    description: "O cifră clară, cu toate înregistrările din spatele ei.",
    keywords: "total suma numar cate",
  },
  {
    id: "timeseries",
    group: "money",
    label: "Cum se schimbă achizițiile în timp?",
    description: "Evoluția valorii sau a numărului, an după an.",
    keywords: "evolutie ani istoric grafic",
  },
  {
    id: "map",
    group: "money",
    label: "Unde se fac achizițiile?",
    description: "O hartă a județelor, cu cifrele fiecăruia.",
    keywords: "harta judete geografie",
  },
  {
    id: "breakdown",
    group: "money",
    label: "Pe ce se duc banii?",
    description: "Cum se împart achizițiile pe domenii.",
    keywords: "structura compozitie domenii categorii cpv",
  },
  {
    id: "compare",
    group: "change",
    label: "Cum se compară două instituții sau firme?",
    description: "Aceeași selecție de achiziții pentru două entități.",
    keywords: "comparatie versus vs fata in fata",
  },
  {
    id: "trend",
    group: "change",
    label: "Cine are cea mai mare schimbare?",
    description: "Diferența dintre doi ani, pentru fiecare entitate.",
    keywords: "tendinta crestere scadere schimbare",
  },
  {
    id: "network",
    group: "relations",
    label: "Cu cine lucrează o instituție sau firmă?",
    description: "Partenerii și achizițiile care îi leagă.",
    keywords: "retea legaturi parteneri furnizori clienti",
  },
  {
    id: "sankey",
    group: "relations",
    label: "Ce traseu au banii?",
    description: "De la parteneri la domeniile achizițiilor.",
    keywords: "flux bani traseu sankey",
  },
  {
    id: "fact_check",
    group: "relations",
    label: "A cumpărat o instituție de la o anumită firmă?",
    description: "Verifică o relație, direct în înregistrări.",
    keywords: "verificare afaceri contracte dovada",
  },
  {
    id: "distribution",
    group: "signals",
    label: "Cât de neobișnuit este un profil?",
    description: "Poziția indicelui de risc față de grupul ales.",
    keywords: "distributie percentila neobisnuit risc",
  },
  {
    id: "scatter",
    group: "signals",
    label: "Cine iese din tipar?",
    description: "Valoarea achizițiilor în raport cu indicele de risc.",
    keywords: "risc volum scatter outlier anomalii",
  },
  {
    id: "entity_card",
    group: "signals",
    label: "Cine conduce într-o categorie?",
    description: "Cea mai mare valoare a achizițiilor sau cel mai ridicat indice de risc.",
    keywords: "fisa campion superlativ cea mai mare risc",
  },
];

export const KIND_OPTIONS = [
  ["", "instituțiile publice", "instituțiilor publice"],
  ["comuna", "primăriile de comună", "primăriilor de comună"],
  ["oras_municipiu", "primăriile de oraș și municipiu", "primăriilor de oraș și municipiu"],
  ["consiliu_judetean", "consiliile județene", "consiliilor județene"],
  ["spital", "spitalele", "spitalelor"],
  ["scoala", "școlile", "școlilor"],
] as const;

export const PROFILE_QUESTIONS = new Set([
  "compare",
  "distribution",
  "scatter",
  "entity_card",
]);
export const isProfileQuestion = (spec: QuestionSpec) =>
  isHistoricalProfile(spec);
/**
 * The answers that show the number of records instead of the value (compile.ts). Elsewhere `measure` is ignored.
 * The breakdown orders its groups by it since F3 (final breakdown §3.8: both are on every row).
 */
export const COUNT_MEASURE_BLOCKS: readonly string[] = ["table", "stat", "timeseries", "map", "breakdown"];
/**
 * The axis of "Cine conduce?". A spec without rankBy runs as the risk index
 * (compile.ts `rankBy ?? "risk"`, isHistoricalProfile), so it reads as one.
 */
export const leaderAxis = (spec: { rankBy?: string }): "value" | "risk" =>
  spec.rankBy === "value" ? "value" : "risk";
export const foldQuestion = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
/** A copy that shares nothing with `spec`: an edit of the draft never reaches the applied question. */
export function cloneQuestion(spec: QuestionSpec): QuestionSpec {
  const next: QuestionSpec = {
    ...spec,
    filters: { ...spec.filters },
    ...(spec.population ? { population: structuredClone(spec.population) } : {}),
    ...(spec.minimumRecords ? { minimumRecords:{ ...spec.minimumRecords } } : {}),
  };
  // Block options hold arrays (a trend's month window): copied whole.
  for (const key of OPTION_KEYS) if (spec[key]) (next as Record<OptionKey, unknown>)[key] = structuredClone(spec[key]);
  return next;
}

export function defaultQuestion(): QuestionSpec {
  return {
    block: "table",
    dim: "supplier",
    measure: "value",
    topN: 10,
    // The all-period national ranking uses the existing precalculated totals.
    filters: {},
  };
}

/** Objects with their keys sorted at every depth; arrays keep their order. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, canonical(v)]),
  );
}

/**
 * Equal for two questions that select and answer the same, whatever the order
 * of their keys at any depth (a trend's `{ months, change }` is its
 * `{ change, months }`). Labels describe exact identities; they do not change
 * the selected records. Compared, never stored: the draft's "modified" state,
 * the saved question in use, a watched recipe (lib/monitoring.ts).
 */
export function questionKey(spec: QuestionSpec): string {
  const filters = { ...spec.filters };
  for (const [id, label] of [
    ["authorityId", "authorityName"], ["supplierId", "supplierName"],
    ["compareWithId", "compareWith"], ["uatSiruta", "uatName"],
    ["adminPersonKey", "adminName"],
  ]) if (filters[id!]) delete filters[label!];
  return JSON.stringify(canonical({ ...spec, dataset: spec.dataset ?? "all", filters }));
}

/** Grounding may enrich an untouched draft, but cannot replace later edits. */
export function reconcileQuestionDraft(current: QuestionSpec, submitted: QuestionSpec, resolved: QuestionSpec): QuestionSpec {
  return questionKey(current) === questionKey(submitted) ? cloneQuestion(resolved) : current;
}

export function periodLabel(spec: QuestionSpec): string {
  const f = spec.filters;
  const bound = (year: string, month: string) =>
    `${f[year]}${f[month] ? `-${String(f[month]).padStart(2, "0")}` : ""}`;
  if (f.yearFrom && f.yearTo) {
    const a = bound("yearFrom", "monthFrom"),
      b = bound("yearTo", "monthTo");
    return a === b ? a : `${a}–${b}`;
  }
  if (f.yearFrom) return `din ${bound("yearFrom", "monthFrom")}`;
  if (f.yearTo) return `până în ${bound("yearTo", "monthTo")}`;
  return "toți anii";
}

export function entityLabel(
  spec: QuestionSpec,
  role: "authority" | "supplier",
): string {
  return String(
    spec.filters[`${role}Name`] ||
      (spec.filters[`${role}Id`]
        ? `Entitatea #${spec.filters[`${role}Id`]}`
        : role === "authority"
          ? "alege o instituție"
          : "alege o firmă"),
  );
}

/** The second entity of a comparison, as the title and the sentence name it. */
export function compareWithLabel(spec: QuestionSpec): string {
  const f = spec.filters;
  return String(f.compareWith || (f.compareWithId ? `Entitatea #${f.compareWithId}` : "alege a doua entitate"));
}

export function focalRole(spec: QuestionSpec): "authority" | "supplier" {
  return spec.filters.authorityName || spec.filters.authorityId
    ? "authority"
    : spec.filters.supplierName || spec.filters.supplierId
      ? "supplier"
      : spec.dim === "supplier"
        ? "supplier"
        : "authority";
}

/** Plural nouns for the authority kinds, as a person says them in a question. */
export const KIND_WORDS: Record<string, { the: string; bare: string }> = {
  comuna: { the: "primăriile de comună", bare: "primării de comună" },
  oras_municipiu: { the: "primăriile de oraș și municipiu", bare: "primării de oraș și municipiu" },
  consiliu_judetean: { the: "consiliile județene", bare: "consilii județene" },
  spital: { the: "spitalele", bare: "spitale" },
  scoala: { the: "școlile", bare: "școli" },
};

/** One institution of a kind, after "Care" (kit §4 Tipurile, §5.41). */
export const KIND_ONE: Record<string, string> = {
  comuna: "primărie de comună",
  oras_municipiu: "primărie de oraș sau municipiu",
  consiliu_judetean: "consiliu județean",
  spital: "spital",
  scoala: "școală",
};

export function countyWords(county: string): string {
  return /^bucure[sș]ti$/i.test(county) ? "din București" : `din județul ${county}`;
}

export function subjectWords(spec: QuestionSpec): string | null {
  const term = spec.filters.cpvTerm;
  if (term === undefined || term === "") return null;
  // Several subjects ("parcuri + spatii verzi") are counted as their union: name each one.
  const words = cpvTermParts(String(term).trim()).map((text) =>
    /^\d[\d\s-]*$/.test(text) ? `CPV ${text.replace(/\s+/g, "")}` : `„${text}”`);
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} și ${words[words.length - 1]}` : words[0]!;
}

/**
 * Match compile.ts's actual scope, before the user applies a template. Filters
 * that the profile SQL ignores must never appear to constrain its answer.
 * Transaction filters and grounded IDs survive every compatible transition.
 *
 * The same call restores a link or a saved question and follows every edit.
 * Defaults and renderer rules (axis, row count, measure, dimension) apply only
 * when the question type changes; on the same type a spec the engine accepts
 * comes back as it was, so it opens unchanged and runs as asked. The repairs
 * that stay on every call fire only on drafts validateSpec refuses or rewrites.
 */
export function transitionQuestion(
  input: QuestionSpec,
  block: string = input.block,
): { spec: QuestionSpec; changes: string[] } {
  const spec = cloneQuestion(input);
  const changes: string[] = [];
  const entering = block !== input.block;
  spec.block = block;
  // A question's options leave with it (parseSpec drops them, or refuses a comparison group).
  if (entering) for (const key of OPTION_KEYS) if (!optionBelongs(key, block)) delete spec[key];
  if (block === "compare" && entering) spec.comparisonMode = "transactions";
  for (const role of ["authority", "supplier"] as const) {
    if (spec.filters[`${role}Id`] && !spec.filters[`${role}Name`])
      spec.filters[`${role}Name`] = `Entitatea #${spec.filters[`${role}Id`]}`;
  }
  if (block === "compare" && spec.filters.compareWithId && !spec.filters.compareWith)
    spec.filters.compareWith = `Entitatea #${spec.filters.compareWithId}`;
  // A view changes presentation, never the selected population. Unsupported
  // combinations remain editable and questionErrors explains how to resolve them.
  if (entering && block === "entity_card") {
    // A new leader question says its axis. Without rankBy it is the risk
    // index (leaderAxis), so a restored or edited one keeps that meaning.
    spec.rankBy = spec.rankBy ?? "value";
    spec.dim = spec.dim === "supplier" ? "supplier" : "authority";
  }
  if (entering && isProfileQuestion(spec)) {
    if (["distribution", "compare"].includes(block)) spec.dim = focalRole(spec);
    else spec.dim = spec.dim === "supplier" ? "supplier" : "authority";
  }
  if (["table", "trend"].includes(block)) {
    spec.dim = spec.dim ?? "supplier";
    if (
      spec.dim === "authority" &&
      (spec.filters.authorityName || spec.filters.authorityId) &&
      !spec.filters.supplierName &&
      !spec.filters.supplierId
    ) {
      spec.dim = "supplier";
      changes.push("Clasamentul arată furnizorii instituției selectate.");
    } else if (
      spec.dim === "supplier" &&
      (spec.filters.supplierName || spec.filters.supplierId) &&
      !spec.filters.authorityName &&
      !spec.filters.authorityId
    ) {
      spec.dim = "authority";
      changes.push(
        "Clasamentul arată instituțiile care cumpără de la firma selectată.",
      );
    }
    // An omitted topN is the API's complete, paginated ranking on a table and
    // ten rows on a trend (compile.ts `topN ?? 10`). Preserve it when reopening
    // or editing; new ranking templates start with ten rows, as does
    // defaultQuestion().
    if (spec.topN !== undefined) {
      spec.topN = Math.min(50, Math.max(1, spec.topN));
    } else if (entering) {
      spec.topN = 10;
    }
    // Annual comparisons require explicit endpoints; keep incomplete or equal
    // years as a draft instead of expanding its population automatically.
  }

  // Elsewhere the engine ignores the measure and answers in lei; an old link
  // with another measure still opens as it was asked.
  if (
    entering &&
    !COUNT_MEASURE_BLOCKS.includes(block) &&
    spec.measure !== "value"
  ) {
    spec.measure = "value";
    changes.push("Această întrebare folosește valoarea în lei.");
  }
  // On a ranking an edit to firms or counties is a draft validateSpec refuses.
  if (
    spec.measure === "value_per_capita" &&
    (block !== "table" || spec.dim !== "authority") &&
    (entering || block === "table")
  ) {
    spec.measure = "value";
    changes.push(
      "Valoarea pe locuitor este disponibilă în clasamentul instituțiilor; aici afișăm valoarea în lei.",
    );
  }
  if (spec.filters.singleBidder === true && spec.dataset !== "contracts") {
    spec.dataset = "contracts";
    changes.push(
      "Condiția „o singură ofertă” folosește contractele din proceduri.",
    );
  }
  return { spec, changes };
}

export function questionErrors(spec: QuestionSpec): string[] {
  const f = spec.filters;
  const errors: string[] = [];
  const hasAuthority = Boolean(f.authorityName || f.authorityId),
    hasSupplier = Boolean(f.supplierName || f.supplierId);
  if (
    ["network", "sankey", "distribution", "compare"].includes(spec.block) &&
    !hasAuthority &&
    !hasSupplier
  )
    errors.push(
      "Alege instituția sau firma despre care vrei să afli mai multe.",
    );
  if (spec.block === "compare" && !f.compareWith && !f.compareWithId)
    errors.push("Alege și a doua instituție sau firmă pentru comparație.");
  if (spec.block === "fact_check") {
    if (!hasAuthority) errors.push("Alege instituția cumpărătoare.");
    if (!hasSupplier) errors.push("Alege firma furnizoare.");
  }
  if (f.yearFrom && f.yearTo && Number(f.yearFrom) > Number(f.yearTo))
    errors.push("Anul de început trebuie să fie înaintea anului de sfârșit.");
  if (
    f.yearFrom === f.yearTo &&
    f.monthFrom &&
    f.monthTo &&
    Number(f.monthFrom) > Number(f.monthTo)
  )
    errors.push("Luna de început trebuie să fie înaintea lunii de sfârșit.");
  if (
    spec.block === "trend" &&
    (!f.yearFrom || !f.yearTo || f.yearFrom === f.yearTo)
  )
    errors.push("Alege doi ani diferiți pentru a vedea schimbarea.");
  if (
    f.minEmployees !== undefined &&
    f.maxEmployees !== undefined &&
    Number(f.minEmployees) > Number(f.maxEmployees)
  )
    errors.push(
      "Numărul minim de angajați trebuie să fie mai mic sau egal cu maximul.",
    );
  // A locality the view cannot honour is never carried silently (localityScopeSupport).
  if (spec.filters.uatSiruta) {
    const support = localityScopeSupport(spec);
    if (!support.ok) errors.push(`${support.reason} Elimină localitatea „${spec.filters.uatName ?? spec.filters.uatSiruta}” sau alege altă întrebare.`);
  }
  if (errors.length > (spec.filters.uatSiruta && !localityScopeSupport(spec).ok ? 1 : 0)) return errors;
  const validated = validateSpec(spec);
  if ("error" in validated) {
    return [
      ...errors,
      validated.error.startsWith("value_per_capita")
        ? "Valoarea pe locuitor se aplică instituțiilor cu populație cunoscută."
        : validated.error,
    ];
  }
  return errors;
}

/**
 * Can this question be scoped to one locality (AskFilters.uatSiruta)? The
 * engine applies a locality as the UAT's own administration (primărie /
 * consiliu local). Checked against compile.ts: the transaction blocks below
 * filter every query and every source list by it; the county map, county
 * rankings, relationship and comparison views and the historical risk
 * profiles do not offer it (a county view of one town hall, or a risk
 * population of one to three identities, would mislead).
 */
export function localityScopeSupport(spec: QuestionSpec): { ok: true } | { ok: false; reason: string } {
  if (isHistoricalProfile(spec))
    return { ok: false, reason: "Indicele de risc compară profiluri între ele, deci aici poți alege doar județul." };
  if (["map", "compare", "network", "sankey", "fact_check"].includes(spec.block))
    return { ok: false, reason: spec.block === "map" ? "Harta arată județele, deci aici poți alege doar județul." : "Această întrebare pornește de la instituții sau firme anume, deci aici poți alege doar județul." };
  if ((spec.block === "table" || spec.block === "trend") && spec.dim === "county")
    return { ok: false, reason: "Clasamentul pe județe nu se poate restrânge la o localitate, deci aici poți alege doar județul." };
  return { ok: true };
}

/**
 * Server-side twin of the builder rule: a spec carrying a locality its view
 * cannot honour is refused (never run with the locality silently ignored or
 * degenerate). Null when the spec is fine.
 */
export function localityScopeError(spec: AskSpec | QuestionSpec): string | null {
  const q = spec as unknown as QuestionSpec;
  if (!q.filters?.uatSiruta) return null;
  const support = localityScopeSupport(q);
  return support.ok ? null : `${support.reason} Elimină localitatea „${q.filters.uatName ?? q.filters.uatSiruta}” sau alege altă întrebare.`;
}

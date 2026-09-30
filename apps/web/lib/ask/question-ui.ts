import { validateSpec, type AskSpec, type Block } from "./spec";
import { isHistoricalProfile, type MinimumRecords, type QueryPopulation } from "./population";

/** The builder uses exactly the public /api/ask spec; it owns no query engine. */
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
}

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
  ["oras_municipiu", "primăriile de oraș", "primăriilor de oraș"],
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
export const foldQuestion = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export const cloneQuestion = (spec: QuestionSpec): QuestionSpec => ({
  ...spec,
  filters: { ...spec.filters },
  ...(spec.population ? { population: structuredClone(spec.population) } : {}),
  ...(spec.minimumRecords ? { minimumRecords:{ ...spec.minimumRecords } } : {}),
});

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

/** Labels describe exact identities; they do not change the selected records. */
export function questionKey(spec: QuestionSpec): string {
  const filters = { ...spec.filters };
  for (const [id, label] of [
    ["authorityId", "authorityName"], ["supplierId", "supplierName"],
    ["compareWithId", "compareWith"], ["uatSiruta", "uatName"],
    ["adminPersonKey", "adminName"],
  ]) if (filters[id!]) delete filters[label!];
  const s = {
    ...spec,
    dataset: spec.dataset ?? "all",
    filters: Object.fromEntries(
      Object.entries(filters).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(s).sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
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
  return "toți anii disponibili";
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

export function focalRole(spec: QuestionSpec): "authority" | "supplier" {
  return spec.filters.authorityName || spec.filters.authorityId
    ? "authority"
    : spec.filters.supplierName || spec.filters.supplierId
      ? "supplier"
      : spec.dim === "supplier"
        ? "supplier"
        : "authority";
}

/** A readable, deterministic title suitable for the applied answer and a saved investigation. */
export function describeQuestion(input: QuestionSpec | AskSpec): string {
  const spec = input as QuestionSpec;
  const f = spec.filters;
  const kind =
    KIND_OPTIONS.find(([id]) => id === (f.authorityKind ?? "")) ??
    KIND_OPTIONS[0];
  const scope =
    f.authorityName || f.authorityId
      ? `„${entityLabel(spec, "authority")}”`
      : kind[2];
  const where = f.uatName
    ? ` în ${f.uatName}`
    : f.county
      ? ` din ${f.county}`
      : " din România";
  const period = periodLabel(spec);
  const dims =
    spec.dim === "county"
      ? "județe"
      : spec.dim === "authority"
        ? "instituții"
        : "firme";
  const focal = `„${entityLabel(spec, focalRole(spec))}”`;
  switch (spec.block) {
    case "table":
      return `${spec.topN ? `Top ${spec.topN} ${dims}` : `Clasament: ${dims}`} după ${spec.measure === "count" ? "numărul achizițiilor" : spec.measure === "value_per_capita" ? "valoarea pe locuitor" : "valoarea achizițiilor"}${where} · ${period}`;
    case "stat":
      return `${spec.measure === "count" ? "Câte achiziții au" : "Cât valorează achizițiile"} ${spec.measure === "count" ? kind[1] : scope}${where} · ${period}?`;
    case "timeseries":
      return `Cum evoluează achizițiile ${scope}${where} · ${period}?`;
    case "map":
      return `Cum se împart achizițiile ${scope} pe județe · ${period}?`;
    case "breakdown":
      return `Ce cumpără ${f.authorityName || f.authorityId ? scope : kind[1]}${where} · ${period}?`;
    case "compare":
      return `${spec.comparisonMode !== "transactions" ? "Profiluri istorice" : "Achiziții comparate"}: ${focal} și „${f.compareWith || (f.compareWithId ? `Entitatea #${f.compareWithId}` : "alege a doua entitate")}”${spec.comparisonMode !== "transactions" ? "" : ` · ${period}`}`;
    case "trend":
      return `Ce ${dims} au cea mai mare schimbare între ${f.yearFrom ?? "…"} și ${f.yearTo ?? "…"}?`;
    case "network":
      return `Cu cine lucrează ${focal}?`;
    case "sankey":
      return `Cum se împart achizițiile ${focal} între parteneri și domenii?`;
    case "fact_check":
      return `A cumpărat „${entityLabel(spec, "authority")}” de la „${entityLabel(spec, "supplier")}”?`;
    case "distribution":
      return `Unde se situează ${focal} după indicele de risc?`;
    case "scatter":
      return `Ce ${dims} ies din tipar după risc și valoarea achizițiilor?`;
    case "entity_card":
      return `Care ${spec.dim === "supplier" ? "firmă" : "instituție"} are ${spec.rankBy === "risk" ? "cel mai ridicat indice de risc" : "cea mai mare valoare a achizițiilor"}?`;
    default:
      return "Întrebarea ta";
  }
}

/**
 * Match compile.ts's actual scope, before the user applies a template. Filters
 * that the profile SQL ignores must never appear to constrain its answer.
 * Transaction filters and grounded IDs survive every compatible transition.
 */
export function transitionQuestion(
  input: QuestionSpec,
  block: string = input.block,
): { spec: QuestionSpec; changes: string[] } {
  const spec = cloneQuestion(input);
  const changes: string[] = [];
  spec.block = block;
  if (block === "compare" && input.block !== "compare") spec.comparisonMode = "transactions";
  for (const role of ["authority", "supplier"] as const) {
    if (spec.filters[`${role}Id`] && !spec.filters[`${role}Name`])
      spec.filters[`${role}Name`] = `Entitatea #${spec.filters[`${role}Id`]}`;
  }
  if (block === "compare" && spec.filters.compareWithId && !spec.filters.compareWith)
    spec.filters.compareWith = `Entitatea #${spec.filters.compareWithId}`;
  // A view changes presentation, never the selected population. Unsupported
  // combinations remain editable and questionErrors explains how to resolve them.
  if (block === "entity_card") {
    spec.rankBy = spec.rankBy ?? "value";
    spec.dim = spec.dim === "supplier" ? "supplier" : "authority";
  }
  if (isProfileQuestion(spec)) {
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
    // An omitted topN is the API's complete, paginated ranking. Preserve it
    // when reopening or editing that question; new ranking templates start
    // with ten rows, as does defaultQuestion().
    if (spec.topN !== undefined) {
      spec.topN = Math.min(50, Math.max(1, spec.topN));
    } else if (block !== "table" || input.block !== "table") {
      spec.topN = 10;
    }
    // Annual comparisons require explicit endpoints; keep incomplete or equal
    // years as a draft instead of expanding its population automatically.
  }

  if (
    !["table", "stat", "timeseries", "map"].includes(block) &&
    spec.measure !== "value"
  ) {
    spec.measure = "value";
    changes.push("Această întrebare folosește valoarea în lei.");
  }
  if (
    spec.measure === "value_per_capita" &&
    (block !== "table" || spec.dim !== "authority")
  ) {
    spec.measure = "value";
    changes.push(
      "Valoarea pe locuitor este disponibilă în clasamentul instituțiilor; aici afișăm valoarea în lei.",
    );
  }
  if (spec.filters.singleBidder === true && spec.dataset !== "contracts") {
    spec.dataset = "contracts";
    changes.push(
      "Filtrul cu un singur ofertant folosește contractele din proceduri.",
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
  if (errors.length) return errors;
  const validated = validateSpec(spec);
  if ("error" in validated) {
    return [
      validated.error.startsWith("value_per_capita")
        ? "Valoarea pe locuitor se aplică instituțiilor cu populație cunoscută."
        : validated.error,
    ];
  }
  return [];
}

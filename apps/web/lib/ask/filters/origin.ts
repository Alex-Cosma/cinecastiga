import { countWords } from "../answer-text";
import type { PopulationCondition, QueryPopulation } from "../population";

/*
 * What a `population` stands for (plan §2.6, kit §5.15 and §5.42): the
 * selections other pages of the site produce today, the exclusions of
 * "Scoate din calcul" and the home page's direct-acquisition ceiling. Read
 * from the population alone, so a stored spec reads the same everywhere.
 * Plain TypeScript for client and server.
 */

/** The home page's direct-acquisition count states the analysis ceiling itself (predicates.ts DA_PLAFOND_RON). */
export const DA_BOUND_VALUE = "2000000";

/**
 * A selection produced by another page: a relationship's buyer–firm pairs
 * (connection-evidence-shared.ts), a comparison group's domain (peers-shared.ts,
 * peers-evidence-shared.ts) or an entity capture, the entity as a buyer or as a firm
 * (site-links.ts entityCaptureSpec). A person capture carries adminPersonKey and no
 * population: it reads as the ordinary phrase (plan §2.6, §12.18).
 */
export type SelectionOrigin = "relation" | "peers" | "entity";
export const ORIGIN_LABEL: Record<SelectionOrigin, string> = {
  relation: "Selecția relației",
  peers: "Grupul de comparație",
  entity: "Activitatea entității",
};

/**
 * What a page that binds the selection itself knows. A comparison group's spec
 * carries only its CPV division (the members are bound on the server), the same
 * shape as a precise selection of one code: without this hint it is not labelled.
 * Only the whole group's sources carry it (one member's are that member's
 * records): `members` counts the other members, as the comparison page does,
 * and `focal` names the analysed entity.
 */
export interface OriginHint { origin: "peers"; members?: number; focal?: string }

export interface OriginWords { origin: SelectionOrigin; label: string; words: string }

type ListCondition = Extract<PopulationCondition, { values: string[] }>;
const list = (c: PopulationCondition): c is ListCondition => "values" in c;
/** A list a page wrote: one id and no names (the precise-selection editor always names the entities it adds). */
const bare = (c: PopulationCondition, field: ListCondition["field"]): c is ListCondition =>
  list(c) && c.field === field && c.op === "in" && c.values.length === 1 && !c.labels;
/** The groups of a population read as one AND: its single group, or every group under AND. */
const single = (population: QueryPopulation) => population.groups.length === 1 ? population.groups[0]! : null;

/** The records of one entity as a buyer or as a firm: entityCaptureSpec. */
function entityOf(population: QueryPopulation): string | null {
  const group = single(population);
  if (!group || group.operator !== "or" || group.conditions.length !== 2) return null;
  const [a, b] = group.conditions as [PopulationCondition, PopulationCondition];
  const authority = bare(a, "authority") ? a : bare(b, "authority") ? b : null;
  const supplier = bare(a, "supplier") ? a : bare(b, "supplier") ? b : null;
  return authority && supplier && authority.values[0] === supplier.values[0] ? authority.values[0]! : null;
}

/** Buyer–firm pairs, any of them: connectionEvidenceSpec. */
function pairsOf(population: QueryPopulation): { authority: string; supplier: string }[] | null {
  if (population.operator !== "or" && population.groups.length > 1) return null;
  const pairs: { authority: string; supplier: string }[] = [];
  for (const group of population.groups) {
    if (group.operator !== "and" || group.conditions.length !== 2) return null;
    const authority = group.conditions.find((c) => bare(c, "authority")) as ListCondition | undefined;
    const supplier = group.conditions.find((c) => bare(c, "supplier")) as ListCondition | undefined;
    if (!authority || !supplier) return null;
    pairs.push({ authority: authority.values[0]!, supplier: supplier.values[0]! });
  }
  return pairs.length ? pairs : null;
}

/** One CPV division, the domain of a comparison group. */
function divisionOf(population: QueryPopulation): string | null {
  const group = single(population);
  const c = group?.conditions.length === 1 ? group.conditions[0]! : null;
  return c && list(c) && c.field === "cpv" && c.op === "in" && c.values.length === 1 && !c.labels && /^\d{2}$/.test(c.values[0]!) ? c.values[0]! : null;
}

/**
 * The page a population comes from, with its label and words ("Selecția
 * relației: 2 firme"), or null for a precise selection of a link. `names`
 * gives entity names where the caller knows them (labels of a capture).
 */
export function selectionOrigin(population: QueryPopulation | undefined, hint?: OriginHint, names: Readonly<Record<string, string>> = {}): OriginWords | null {
  if (!population) return null;
  const entity = entityOf(population);
  // Named once looked up (the builder's lookup, the server's grounding); never a bare id before.
  if (entity) return { origin: "entity", label: ORIGIN_LABEL.entity, words: `${names[entity] ?? "o entitate"} (ca instituție sau ca firmă)` };
  const pairs = pairsOf(population);
  if (pairs) {
    const authorities = new Set(pairs.map((p) => p.authority)), suppliers = new Set(pairs.map((p) => p.supplier));
    // The shared end of the pairs is named in the question (connectionEvidenceSpec puts it in its filters).
    const words = authorities.size === 1 ? countWords(suppliers.size, "firmă", "firme")
      : suppliers.size === 1 ? countWords(authorities.size, "instituție", "instituții")
        : countWords(pairs.length, "pereche instituție–firmă", "perechi instituție–firmă");
    return { origin: "relation", label: ORIGIN_LABEL.relation, words };
  }
  const division = hint?.origin === "peers" ? divisionOf(population) : null;
  if (division) {
    const members = hint!.members === undefined ? null
      : `${hint!.focal ?? "entitatea analizată"} și ${countWords(hint!.members, "alt membru", "alți membri")}`;
    return { origin: "peers", label: ORIGIN_LABEL.peers, words: [members, `CPV ${division}`].filter(Boolean).join(" · ") };
  }
  return null;
}

/**
 * The home page's population on direct acquisitions, value ≤ 2 mil. lei: the
 * ceiling the engine applies to them anyway (compile.ts nationalDaBound). A
 * display rule, not a rewrite (plan §2.6): no chip, the spec stays as it is.
 */
export function isDaBoundPopulation(spec: { dataset?: string | undefined; population?: QueryPopulation | undefined }): boolean {
  const group = spec.population ? single(spec.population) : null;
  const c = group?.conditions.length === 1 ? group.conditions[0]! : null;
  return spec.dataset === "da" && !!c && !list(c) && c.field === "value" && c.op === "lte" && c.value === DA_BOUND_VALUE;
}

/** "Scoate din calcul" (plan §2.6): one entity or CPV code left out, with the name a picker gave it. */
export interface Excluded { field: "authority" | "supplier" | "cpv"; value: string; label: string }

/**
 * The exclusions of a population and what is left of it. An exclusion is a
 * `not_in` list of institutions, firms or CPV codes with labels, in a group
 * that only excludes, under a top-level AND (kit §5.15). Anything else stays
 * a precise selection, in `rest`. Unlabelled lists are not exclusions: their
 * chip could only show a number.
 */
export function splitExcluded(population: QueryPopulation | undefined): { excluded: Excluded[]; rest: QueryPopulation | undefined } {
  if (!population) return { excluded: [], rest: undefined };
  if (population.operator !== "and" && population.groups.length > 1) return { excluded: [], rest: population };
  const excluded: Excluded[] = [];
  const kept: QueryPopulation["groups"] = [];
  for (const group of population.groups) {
    const only = (group.operator === "and" || group.conditions.length === 1) && group.conditions.every((c) =>
      list(c) && c.op === "not_in" && (c.field === "authority" || c.field === "supplier" || c.field === "cpv")
      && c.labels?.length === c.values.length);
    if (!only) { kept.push(group); continue; }
    for (const c of group.conditions as ListCondition[])
      c.values.forEach((value, i) => excluded.push({ field: c.field as Excluded["field"], value, label: c.labels![i]! }));
  }
  return { excluded, rest: kept.length ? { operator: population.operator, groups: kept } : undefined };
}

const EXCLUDED_NOUNS: Record<Excluded["field"], [string, string]> = {
  supplier: ["firmă", "firme"], authority: ["instituție", "instituții"], cpv: ["cod CPV", "coduri CPV"],
};
/**
 * "fără SYSTRA", "fără SYSTRA și ALTA", "fără 3 firme" (kit §4: the chip is
 * gathered from three on): one phrase per kind of entity, in the order given.
 */
export function exclusionWords(excluded: readonly Excluded[]): string[] {
  const fields = [...new Set(excluded.map((e) => e.field))];
  return fields.map((field) => {
    const own = excluded.filter((e) => e.field === field);
    if (own.length >= 3) return `fără ${countWords(own.length, ...EXCLUDED_NOUNS[field])}`;
    return `fără ${own.map((e) => e.label).join(" și ")}`;
  });
}

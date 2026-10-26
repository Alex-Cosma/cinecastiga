import { isHistoricalProfile, validatePopulation, type PopulationCondition, type QueryPopulation } from "../population";
import { BLOCK_FILTERS } from "./blocks";
import { filterContext } from "./context";
import { exclusionWords, selectionOrigin, splitExcluded, type Excluded } from "./origin";
import type { FilterSpec } from "./types";

/*
 * "Scoate din calcul" (plan §2.5, §3, §4.2, §4.7, §4.13; kit §5.13, trusa 3):
 * an entity of the answer's own rows leaves the selection. It is written as a
 * labelled `not_in` list in a group of exclusions only, under a top-level AND,
 * the shape splitExcluded (origin.ts) reads back as a "Fără X" chip; at most
 * five. The engine applies it on the records like any precise selection
 * (populationSql), so the total, "% din total" and the counties' totals
 * change and the total line says "fără X". Plain TypeScript for client and
 * server.
 */

export const MAX_EXCLUDED = 5;
/** Why the action is shown but not usable (RowMenu's second line, kit §5.13). */
export const EXCLUDE_FULL = "Cel mult 5 excluderi.";
/** A link's groups under "SAU": a group of exclusions under them would select more, not less. */
export const EXCLUDE_OR = "Selecția din link are grupuri legate prin „SAU”.";
/** A selection another page made (a relation, a comparison group, an entity's activity) keeps its own label. */
export const EXCLUDE_ORIGIN = "Selecția vine din altă pagină.";
/** A precise selection at its limits (validatePopulation: 8 groups, 32 conditions). */
export const EXCLUDE_LIMIT = "Selecția avansată are deja prea multe condiții.";

export type ExcludedRole = "authority" | "supplier";

/** The role whose rows the answer's "⋯" can leave out on this question (BLOCK_FILTERS.exclude), or null. */
export function excludedRole(spec: FilterSpec): ExcludedRole | null {
  const ctx = filterContext(spec);
  return BLOCK_FILTERS[ctx.block]?.exclude(spec, ctx)?.field ?? null;
}

/** The exclusions a population holds ("Fără X"), of every kind. */
export const exclusionsOf = (spec: Pick<FilterSpec, "population">): Excluded[] => splitExcluded(spec.population).excluded;

/**
 * The population with one more entity left out: its value joins the labelled
 * list of the same field in the group of exclusions, or a new group of
 * exclusions joins the others under AND (a single group reads the same under
 * either operator). An entity already left out changes nothing.
 */
export function withExclusion(population: QueryPopulation | undefined, entity: Excluded): QueryPopulation {
  const condition = (): PopulationCondition => ({ field: entity.field, op: "not_in", values: [entity.value], labels: [entity.label] });
  if (!population) return { operator: "and", groups: [{ operator: "and", conditions: [condition()] }] };
  if (splitExcluded(population).excluded.some((e) => e.field === entity.field && e.value === entity.value)) return structuredClone(population);
  const next = structuredClone(population);
  next.operator = "and";
  const { rest } = splitExcluded(population);
  // The groups splitExcluded reads as exclusions, by position (structuredClone keeps the order).
  const own = next.groups.filter((_, i) => !rest?.groups.includes(population.groups[i]!));
  const list = own.flatMap((group) => group.conditions).find((c): c is Extract<PopulationCondition, { values: string[] }> =>
    "values" in c && c.field === entity.field && c.op === "not_in");
  if (list) { list.values.push(entity.value); list.labels!.push(entity.label); }
  else if (own[0]) own[0].conditions.push(condition());
  else next.groups.push({ operator: "and", conditions: [condition()] });
  return next;
}

/**
 * Why "Scoate din calcul" is shown disabled on this answer, or null when it
 * can leave one more entity out: five already out, a link whose groups are
 * joined by "SAU", a selection another page made, or a precise selection at
 * its limits.
 */
export function exclusionBlocked(spec: Pick<FilterSpec, "population">): string | null {
  const population = spec.population;
  if (!population) return null;
  if (selectionOrigin(population)) return EXCLUDE_ORIGIN;
  if (population.operator === "or" && population.groups.length > 1) return EXCLUDE_OR;
  if (exclusionsOf(spec).length >= MAX_EXCLUDED) return EXCLUDE_FULL;
  // One more entity that no list holds yet: within validatePopulation's limits (8 groups, 32 conditions, 100 values)?
  const probe = withExclusion(population, { field: "supplier", value: "999999999999999999", label: "—" });
  return "error" in validatePopulation(probe) ? EXCLUDE_LIMIT : null;
}

/** The question with `entity` left out ("Scoate din calcul"), or null where the action is blocked. */
export function excludeEntity<S extends FilterSpec>(spec: S, entity: Excluded): S | null {
  if (exclusionBlocked(spec)) return null;
  return { ...spec, population: withExclusion(spec.population, entity) };
}

/** The population without some exclusions: their values leave the `not_in` lists; an empty list, group or population goes. */
export function withoutExclusions(population: QueryPopulation | undefined, excluded: readonly Pick<Excluded, "field" | "value">[]): QueryPopulation | undefined {
  if (!population) return undefined;
  const gone = (field: string, value: string) => excluded.some((e) => e.field === field && e.value === value);
  const groups = population.groups.map((group) => ({
    ...group,
    conditions: group.conditions.flatMap((c) => {
      if (!("values" in c) || c.op !== "not_in") return [c];
      const keep = c.values.map((value, i) => ({ value, label: c.labels?.[i] })).filter((v) => !gone(c.field, v.value));
      if (!keep.length) return [];
      return [{ ...c, values: keep.map((v) => v.value), ...(c.labels ? { labels: keep.map((v) => v.label!) } : {}) }];
    }),
  })).filter((group) => group.conditions.length);
  return groups.length ? { operator: population.operator, groups } : undefined;
}

const ROLE_NOUN: Record<ExcludedRole, string> = { authority: "instituții", supplier: "firme" };
/**
 * A new subject on the same question (plan §4.2: firms → institutions or
 * counties): the rows it left out were of the old subject, so those
 * exclusions leave, with their note ("Am scos „fără SYSTRA”: …"). Another
 * question keeps them wherever the engine applies a precise selection.
 */
export function exclusionsAfterSubject(before: FilterSpec, after: FilterSpec): { spec: FilterSpec; note: string | null } {
  const was = excludedRole(before);
  // A profile ("Cine conduce?" on the index) applies no precise selection: its axis sets them aside (parked.ts).
  if (!was || before.block !== after.block || excludedRole(after) === was || isHistoricalProfile(after)) return { spec: after, note: null };
  const own = exclusionsOf(after).filter((e) => e.field === was);
  if (!own.length) return { spec: after, note: null };
  const population = withoutExclusions(after.population, own);
  const next = { ...after };
  if (population) next.population = population; else delete next.population;
  const words = exclusionWords(own)[0]!;
  return { spec: next, note: `Am scos „${words}”: întrebarea nu mai e despre ${ROLE_NOUN[was]}.` };
}

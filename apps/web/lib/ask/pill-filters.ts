import type { AskSpec } from "./spec";
import { describeConditions, PILL_ORDER, type ConditionLabels } from "./filters/describe";
import type { FilterId } from "./filters/types";
import { ownPills } from "./pills";

/*
 * Which filter each pill under an answer's title states (owner, 1 November
 * 2026: a pill opens its filter's window in place). The pills are the
 * server's words (pills.ts buildPills): the answer's own first, as many as its
 * spec says, then the conditions in PILL_ORDER. Most conditions' words depend
 * on the spec alone and are matched exactly; a place, a domain, an
 * institution, a firm or a person are named from what the engine resolved
 * (its grounding), so they are read by their order between the others. When
 * their number does not add up (a name the engine could not resolve has no
 * pill), the pills of that stretch stay text. Plain TypeScript, tested.
 */

/** Conditions whose pill words come from the engine's grounding, and whether the spec sets them (one pill each then). */
const NAMED: Partial<Record<FilterId, (spec: AskSpec) => boolean>> = {
  cpvTerm: (spec) => spec.filters.cpvTerm !== undefined && spec.filters.cpvTerm !== "",
  authority: (spec) => Boolean(spec.filters.authorityName || spec.filters.authorityId),
  supplier: (spec) => Boolean(spec.filters.supplierName || spec.filters.supplierId),
  compareWith: (spec) => Boolean(spec.filters.compareWith || spec.filters.compareWithId),
  locality: (spec) => Boolean(spec.filters.uatSiruta || spec.filters.uatName),
  county: (spec) => Boolean(spec.filters.county),
  seatCounty: (spec) => Boolean(spec.filters.seatCounty),
  admin: (spec) => Boolean(spec.filters.adminName || spec.filters.adminPersonKey),
  population: (spec) => Boolean(spec.population),
};
/** The domain's second pill: the subclasses its exclusions leave out (describe.ts cpvTerm). */
const CPV_EXCLUDED = /^fără .+ \(vezi limitele\)$/;

export type PillLabels = Pick<ConditionLabels, "executedMonths" | "peerGroup"> & { scatterGroup?: number };

/** The filter of each pill (null: the answer's shape, or a pill whose filter cannot be told apart). */
export function pillFilters(spec: AskSpec, pills: readonly string[], labels: PillLabels = {}): (FilterId | null)[] {
  const out: (FilterId | null)[] = pills.map(() => null);
  const own = ownPills(spec, labels);
  own.forEach((pill, i) => { if (i < out.length) out[i] = pill.filter; });
  const described = describeConditions(spec, { executedMonths: labels.executedMonths, peerGroup: labels.peerGroup }).byId;
  let cursor = own.length;
  let pending: { id: FilterId; count: number }[] = [];
  /** The named conditions take the pills before `end`, in order, when their number adds up. */
  const flush = (end: number) => {
    const gap: number[] = [];
    for (let i = cursor; i < end; i++) gap.push(i);
    const cpv = pending.find((p) => p.id === "cpvTerm");
    const excluded = cpv ? gap.filter((i) => CPV_EXCLUDED.test(pills[i]!)) : [];
    for (const i of excluded) out[i] = "cpvTerm";
    const rest = gap.filter((i) => !excluded.includes(i));
    if (rest.length === pending.reduce((n, p) => n + p.count, 0)) {
      let k = 0;
      for (const p of pending) for (let n = 0; n < p.count; n++) out[rest[k++]!] = p.id;
    }
    pending = [];
    cursor = end;
  };
  for (const id of PILL_ORDER) {
    const named = NAMED[id];
    if (named) {
      if (named(spec)) pending.push({ id, count: id === "population" ? described.population?.pills?.length ?? 1 : 1 });
      continue;
    }
    for (const text of described[id]?.pills ?? []) {
      const at = pills.indexOf(text, cursor);
      if (at < 0) continue;
      flush(at);
      out[at] = id;
      cursor = at + 1;
    }
  }
  flush(pills.length);
  return out;
}

import { MIN_NETWORK_SINCE, NETWORK_LIST_LABELS, NEW_NETWORK_SHOW, networkLastYear, networkSinceChoices, type NetworkGroup, type NetworkOrder } from "../../network-shared";
import { NETWORK_RULES, type NetworkOptions } from "../../spec";
import type { FilterCtx, FilterDef, FilterSpec } from "../types";
import { alwaysScope, edited } from "./shared";

/*
 * The network's options (plan §4.8, §3, F4; final network §3, kit §6
 * network), applied by relations.ts (network-2): which partners (a group of
 * the whole relation against a reference year), the reference year, the order
 * and length of the list, and „Cu semnale”. The group is the sentence's verb
 * and the answer's buttons (they switch on data already fetched); the year is
 * the sentence's „din [2025]” and the answer's „Grupele, față de”; the order
 * and the length are the presentation line's and the answer's „Ordonează”;
 * „Cu semnale” a switch in the partners' row (P3b). A question without them
 * is every partner, by value, 14 rows: the answer of before network-2.
 */

const optionsOf = (spec: FilterSpec): NetworkOptions => spec.network ?? {};
/** The spec with one network option set (undefined: removed), and what that change implies for the others. */
function writeOption<K extends keyof NetworkOptions>(spec: FilterSpec, key: K, value: NetworkOptions[K] | undefined,
  implies: (options: NetworkOptions, next: FilterSpec) => void = () => {}): FilterSpec {
  return edited(spec, (next) => {
    const options: NetworkOptions = { ...optionsOf(next) };
    if (value === undefined) delete options[key];
    else options[key] = value;
    implies(options, next);
    if (Object.keys(options).length) next.network = options;
    else delete next.network;
  });
}

/** The last year a group can be counted from, as the builder knows it (the archive's periods, else the calendar year). */
export const lastNetworkYear = (ctx: Pick<FilterCtx, "coverage" | "year">): number => networkLastYear(ctx.coverage, ctx.year);
const num = (value: unknown): number | undefined => value === undefined || value === null || value === "" ? undefined : Number(value);

export const networkPartners: FilterDef<NetworkGroup> = {
  id: "networkPartners", keys: ["network.partners"], placement: "sentence", control: "countGroups",
  label: "Ce parteneri", windowTitle: "Ce parteneri?",
  // A condition on the partner grouped over its whole relation (relations.ts networkAnswer, networkMembersCond).
  engine: { network: "group" }, scope: alwaysScope("group"), since: "F4",
  read: (spec) => optionsOf(spec).partners,
  // A group is of the whole relation (final §3.2): the period's first year becomes its reference year, the period goes
  // (the note says so: transition.ts networkFollows); back on „Toți” the reference stays for the answer's buttons.
  write: (spec, value) => writeOption(spec, "partners", value, (options, next) => {
    if (value === undefined) return;
    const from = num(next.filters.yearFrom) ?? num(next.filters.yearTo);
    if (from !== undefined && options.since === undefined) options.since = Math.max(MIN_NETWORK_SINCE, from);
    for (const key of ["yearFrom", "yearTo", "monthFrom", "monthTo"]) delete next.filters[key];
  }),
  choices: () => [undefined, "new", "continuing", "gone"],
  validate: NETWORK_RULES.partners,
};

export const networkSince: FilterDef<number> = {
  id: "networkSince", keys: ["network.since"], placement: "sentence", control: "rangePills",
  label: "Anul de referință", windowTitle: "Față de ce an?",
  // The year the groups are counted from (networkGroupOf, in the grouping of relations.ts).
  engine: { network: "group" }, scope: alwaysScope("group"), since: "F4",
  read: (spec) => optionsOf(spec).since,
  write: (spec, value) => writeOption(spec, "since", value),
  // From 2021 to the last year every channel has complete: no 2026 while it runs (final §3.2).
  choices: (_spec, ctx) => networkSinceChoices(lastNetworkYear(ctx)),
};

export const networkOrder: FilterDef<NetworkOrder> = {
  id: "networkOrder", keys: ["network.order"], placement: "presentation", control: "segmented",
  label: "Ordinea", windowTitle: "Cum ordonăm partenerii?",
  // The order of the rows the answer holds for each order (relations.ts NETWORK_ORDER_COMPARE): no query.
  engine: { network: "display" }, scope: alwaysScope("display"), since: "F4",
  read: (spec) => optionsOf(spec).order,
  // The value is the order of a question without the key.
  write: (spec, value) => writeOption(spec, "order", value === "value" ? undefined : value),
  choices: () => ["value", "count", "years"],
};

export const networkShow: FilterDef<10 | 15 | 25 | 50> = {
  id: "networkShow", keys: ["network.show"], placement: "presentation", control: "segmented",
  label: "Câți parteneri", windowTitle: "Câți parteneri arăți?",
  // How many rows of the list show (14 on an old link, 15 on a new question: transition.ts enterNetwork).
  engine: { network: "display" }, scope: alwaysScope("display"), since: "F4",
  read: (spec) => optionsOf(spec).show,
  write: (spec, value) => writeOption(spec, "show", value),
  choices: () => [10, NEW_NETWORK_SHOW, 25, 50],
};

export const networkSignals: FilterDef<true> = {
  id: "networkSignals", keys: ["network.signals"], placement: "row", control: "toggle",
  label: "Cu semnale", windowTitle: "Cu semnale",
  // The partners with an official signal on the relation (relations.ts relationSignals): a selection, every list and total change.
  engine: { network: "group" }, scope: alwaysScope("selection"), since: "F4",
  read: (spec) => optionsOf(spec).signals,
  write: (spec, value) => writeOption(spec, "signals", value),
  choices: () => [undefined, true],
};

export const NETWORK_DEFS: readonly FilterDef[] = [networkPartners, networkSince, networkOrder, networkShow, networkSignals];

/** A network entered from another question (final §3.5, decision 7): 15 partners; a link without the key keeps 14. */
export function enterNetwork(spec: FilterSpec): FilterSpec {
  return edited(spec, (next) => { next.network = { show: NEW_NETWORK_SHOW, ...next.network }; });
}

/**
 * What follows a group chosen on a network (final §3.2, §4 „Schimbări automate”): the group writes the
 * year it is counted from (a watch then follows the same year, whatever the archive adds), the period's
 * first year when there was one, said once („Am păstrat doar anul de început: 2023.”), never a year the
 * archive has not completed. `ctx` knows the archive's periods.
 */
export function networkFollows(before: FilterSpec, after: FilterSpec, ctx: Pick<FilterCtx, "coverage" | "year">): { spec: FilterSpec; notes: string[] } {
  if (after.block !== "network" || !after.network?.partners) return { spec: after, notes: [] };
  const last = lastNetworkYear(ctx), asked = after.network.since;
  const since = asked === undefined ? last : Math.min(asked, last);
  const spec = since === asked ? after : writeOption(after, "since", since);
  if (asked !== undefined && asked > last) return { spec, notes: [`Grupele se socotesc față de ${last}: ${asked} nu s-a încheiat în date.`] };
  const hadPeriod = ["yearFrom", "yearTo", "monthFrom", "monthTo"].some((key) => before.filters[key] !== undefined && before.filters[key] !== "");
  if (!hadPeriod || before.network?.partners !== undefined) return { spec, notes: [] };
  return { spec, notes: [before.network?.since === undefined ? `Am păstrat doar anul de început: ${since}.` : `Am scos perioada: grupele se socotesc față de ${since}.`] };
}

/** A group's name with its year, for a chip, a pill or a note („Noi din 2025”, kit §4: „Noi” always with its year). */
export function networkGroupLabel(group: NetworkGroup, since?: number): string {
  return since === undefined ? NETWORK_LIST_LABELS[group] : `${NETWORK_LIST_LABELS[group]} din ${since}`;
}

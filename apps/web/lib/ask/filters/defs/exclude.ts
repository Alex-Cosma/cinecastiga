import type { FilterDef } from "../types";
import { alwaysScope } from "./shared";

/*
 * "Scoate din calcul" (plan §2.6, kit §4): the `not_in` groups of `population`
 * with labels, at most five, read as "Fără X". `population` keeps its one owner
 * (legacy.ts); this is a view of part of it and owns no path. Offered from F4.
 */

export const exclude: FilterDef<never> = {
  id: "exclude", keys: [], viewOf: "population", placement: "rowMenu", control: "none",
  label: "Scoate din calcul",
  engine: {}, scope: alwaysScope("selection"), stage: "F4",
  read: () => undefined,
  write: (spec) => spec,
  choices: () => [],
};

export const EXCLUDE_DEFS: readonly FilterDef[] = [exclude];

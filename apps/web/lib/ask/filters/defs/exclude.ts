import { TRANSACTION_FORMS } from "../context";
import type { FilterDef } from "../types";
import { alwaysScope, levels } from "./shared";

/*
 * "Scoate din calcul" (plan §2.6, §3, kit §4): the `not_in` groups of
 * `population` with labels, at most five, read as "Fără X". `population` keeps
 * its one owner (legacy.ts); this is a view of part of it and owns no path.
 * Written from the "⋯" of an answer's row (BLOCK_FILTERS.rowMenu, exclusions.ts),
 * applied on the records wherever a precise selection is (F4).
 */

export const exclude: FilterDef<never> = {
  id: "exclude", keys: [], viewOf: "population", placement: "rowMenu", control: "none",
  label: "Scoate din calcul",
  engine: levels(TRANSACTION_FORMS, "row"), scope: alwaysScope("selection"), since: "F4",
  read: () => undefined,
  write: (spec) => spec,
  choices: () => [],
};

export const EXCLUDE_DEFS: readonly FilterDef[] = [exclude];

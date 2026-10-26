import type { FilterDef } from "../types";
import { alwaysScope, edited } from "./shared";

/*
 * How many partners the flow draws (plan §4.9, F4; kit §6 sankey 5): 6 on a
 * question without the key (the answer of before sankey-2), 10 or 15. The
 * answer holds the first 15 (relations.ts sankeyAnswer) and folds the rest,
 * so the strip's „Arată 6 · 10 · 15” switches with no query.
 */

export const sankeyShown: FilterDef<6 | 10 | 15> = {
  id: "sankeyShown", keys: ["sankey.shown"], placement: "strip", control: "segmented",
  label: "Arată", windowTitle: "Câți parteneri arăți?",
  engine: { sankey: "display" }, scope: alwaysScope("display"), since: "F4",
  read: (spec) => spec.sankey?.shown,
  // Six is the question without the key.
  write: (spec, value) => edited(spec, (next) => {
    if (value === undefined || value === 6) delete next.sankey;
    else next.sankey = { ...next.sankey, shown: value };
  }),
  choices: () => [6, 10, 15],
};

export const SANKEY_DEFS: readonly FilterDef[] = [sankeyShown];

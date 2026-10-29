import type { FilterDef, FilterId } from "../types";
import { COMPARE_DEFS } from "./compare";
import { EXCLUDE_DEFS } from "./exclude";
import { FROM_WHOM_DEFS } from "./from-whom";
import { LEGACY_DEFS } from "./legacy";
import { NETWORK_DEFS } from "./network";
import { PROFILE_DEFS } from "./profile";
import { RANKING_DEFS } from "./ranking";
import { SANKEY_DEFS } from "./sankey";
import { SEAT_DEFS } from "./seat";
import { SELECTION_DEFS } from "./selection";
import { TIMESERIES_DEFS } from "./timeseries";
import { TREND_DEFS } from "./trend";
import { WINNERS_DEFS } from "./winners";

/** Every FilterDef, in the order of their families (the registry re-exports them). */
export const FILTER_DEFS: readonly FilterDef[] = [
  ...SELECTION_DEFS, ...FROM_WHOM_DEFS, ...SEAT_DEFS, ...RANKING_DEFS, ...WINNERS_DEFS, ...PROFILE_DEFS, ...TREND_DEFS,
  ...TIMESERIES_DEFS, ...NETWORK_DEFS, ...SANKEY_DEFS, ...COMPARE_DEFS, ...EXCLUDE_DEFS, ...LEGACY_DEFS,
];
export const FILTERS = Object.fromEntries(FILTER_DEFS.map((def) => [def.id, def])) as Record<FilterId, FilterDef>;

import { encodeSpec } from "./ask/permalink";
import type { AskSpec } from "./ask/spec";

/** Permalink to an "Întreabă" answer; the page runs the spec on load. */
export const askHref = (spec: AskSpec) => `/intreaba?spec=${encodeURIComponent(encodeSpec(spec))}`;

/**
 * "Pe ce se duc banii?" for one county: the breakdown by subject (CPV
 * domains) of every recorded acquisition by authorities seated there.
 * The same spec as the builder's breakdown template, with only the county set.
 */
export const countyBreakdownSpec = (county: string): AskSpec => ({ block: "breakdown", dataset: "all", measure: "value", filters: { county } });

export const countyBreakdownHref = (county: string) => askHref(countyBreakdownSpec(county));

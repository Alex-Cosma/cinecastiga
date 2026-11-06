import { decodeSpec } from "../../lib/ask/permalink";
import { restoreLink } from "../../lib/ask/filters/restore";
import { NATURAL_LANGUAGE_ENABLED } from "../../lib/ask/features";
import { describeConditions, PILL_ORDER } from "../../lib/ask/filters/describe";
import type { FilterId } from "../../lib/ask/filters/types";
import { ownPills } from "../../lib/ask/pills";
import type { AskSpec } from "../../lib/ask/spec";
import type { QuestionSpec } from "../../lib/ask/question-ui";

/*
 * What the address asks of /intreaba, read on the server (page.tsx) the way the panel's restore() reads it on mount
 * (owner, 6 November 2026, "ghost data loading"): a shared link, a reload or the home map's link opens on its
 * question from the first paint, the builder folded under "Schimbă întrebarea" and a ghost of its answer below, instead
 * of the start page that hydration folded away a moment later. Plain TypeScript, safe on both sides.
 */

export type AskLinkHint =
  /** `?spec=`: the builder's draft, the question that runs (shaped into the answer's ghost), and whether it runs now. */
  | { kind: "spec"; spec: QuestionSpec; link: AskSpec; run: boolean; notes: string[]; drill: boolean }
  /** `?spec=` that cannot be opened: the reason, said from the first paint. */
  | { kind: "error"; error: string }
  /** `?q=`: a question in words, read by the rules once the page is up. */
  | { kind: "text"; question: string };

type Params = Record<string, string | string[] | undefined>;
const one = (params: Params, key: string): string | undefined => {
  const value = params[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
};

export function readAskLink(params: Params): AskLinkHint | null {
  const question = one(params, "q"), encoded = one(params, "spec");
  // The panel's own order (AskPanel restore): a question in words wins only while the AI path is on.
  if (question && (NATURAL_LANGUAGE_ENABLED || !encoded)) return NATURAL_LANGUAGE_ENABLED ? null : { kind: "text", question };
  if (!encoded) return null;
  const restored = restoreLink(decodeSpec(encoded));
  if (restored.kind === "error") return { kind: "error", error: restored.error };
  return {
    kind: "spec", spec: restored.spec as unknown as QuestionSpec, link: restored.link as unknown as AskSpec,
    run: restored.run, notes: restored.notes, drill: one(params, "drill") === "1",
  };
}

/** A pill whose words come from what the engine resolves (a domain, a place, a name): drawn as a line in the ghost. */
export const GHOST_PILL = "\u2063";
/** The line's width for such a pill, by its condition: a domain's catalogue names run long, a county is a word. */
const GHOST_PILL_CH: Partial<Record<FilterId, number>> = { cpvTerm: 52, authority: 30, supplier: 24, compareWith: 26, locality: 16, county: 12, admin: 28, dim: 22 };
export function ghostPillWidth(pill: string): string | null {
  return pill.startsWith(GHOST_PILL) ? `${GHOST_PILL_CH[pill.slice(GHOST_PILL.length) as FilterId] ?? 18}ch` : null;
}

/** Conditions named from the engine's grounding (pill-filters.ts NAMED): one pill each, unknown before the answer. */
const NAMED: Partial<Record<FilterId, (spec: AskSpec) => boolean>> = {
  cpvTerm: (spec) => spec.filters.cpvTerm !== undefined && spec.filters.cpvTerm !== "",
  authority: (spec) => Boolean(spec.filters.authorityName || spec.filters.authorityId),
  supplier: (spec) => Boolean(spec.filters.supplierName || spec.filters.supplierId),
  compareWith: (spec) => Boolean(spec.filters.compareWith || spec.filters.compareWithId),
  locality: (spec) => Boolean(spec.filters.uatSiruta || spec.filters.uatName),
  county: (spec) => Boolean(spec.filters.county),
  admin: (spec) => Boolean(spec.filters.adminName || spec.filters.adminPersonKey),
};

/**
 * The pills under the answer's title as far as the spec alone says them (pills.ts buildPills without the engine's
 * grounding), in their order; a condition the engine names (its domain's catalogue name, the county as the data
 * spells it) is GHOST_PILL and its condition's id.
 */
export function ghostPills(spec: AskSpec): string[] {
  const described = describeConditions(spec, {}).byId;
  const out = ownPills(spec).map((pill) => pill.text);
  // The cloud's first pill counts the group it drew („82 de primării de comună”): known with the answer only.
  if (spec.block === "scatter") out[0] = `${GHOST_PILL}dim`;
  for (const id of PILL_ORDER) {
    const pills = described[id]?.pills ?? [];
    out.push(...(pills.length === 0 && NAMED[id]?.(spec) ? [GHOST_PILL + id] : pills));
  }
  return out;
}

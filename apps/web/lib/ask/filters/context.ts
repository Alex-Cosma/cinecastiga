import { BLOCKS, type Block } from "../spec";
import { isHistoricalProfile } from "../population";
import { focalRole, leaderAxis, localityScopeSupport } from "../question-ui";
import type { AnswerForm, FilterCtx, FilterSpec } from "./types";

export const ANSWER_FORMS: readonly AnswerForm[] = [
  ...BLOCKS.filter((block): block is Exclude<Block, "entity_card"> => block !== "entity_card"),
  "entity_card:value", "entity_card:risk",
];
/** The historical profiles: distribution, scatter and "Cine conduce?" on the risk index. */
export const PROFILE_FORMS: readonly AnswerForm[] = ["distribution", "scatter", "entity_card:risk"];
/** Everything answered over the transaction records (rowPredicates, lib/ask/predicates.ts). */
export const TRANSACTION_FORMS: readonly AnswerForm[] = ANSWER_FORMS.filter((form) => !PROFILE_FORMS.includes(form));

export const formOf = (spec: { block: string; rankBy?: string }): AnswerForm =>
  spec.block === "entity_card" ? `entity_card:${leaderAxis(spec)}` : spec.block as AnswerForm;

/**
 * What the pickers of a question know besides the spec (plan §2.2). The
 * coverage, the probed columns and the facet counts are optional: today's
 * builder reads none of them; F2–F5 pass what they have read.
 */
export function filterContext(
  spec: FilterSpec,
  extra: { year?: number; coverage?: FilterCtx["coverage"]; columns?: ReadonlySet<string>; facets?: FilterCtx["facets"] } = {},
): FilterCtx {
  const f = spec.filters;
  const ctx: FilterCtx = {
    block: spec.block as Block,
    form: formOf(spec),
    role: focalRole(spec),
    profile: isHistoricalProfile(spec),
    named: {
      authority: Boolean(f.authorityName || f.authorityId),
      supplier: Boolean(f.supplierName || f.supplierId),
      compareWith: Boolean(f.compareWith || f.compareWithId),
      admin: Boolean(f.adminName || f.adminPersonKey),
    },
    locality: localityScopeSupport(spec),
    // QuestionBuilder's period presets: this year and the two before it.
    year: extra.year ?? new Date().getFullYear(),
  };
  if (extra.coverage) ctx.coverage = extra.coverage;
  if (extra.columns) ctx.columns = extra.columns;
  if (extra.facets) ctx.facets = extra.facets;
  return ctx;
}

import { BLOCKS, type Block } from "../spec";
import { isHistoricalProfile } from "../population";
import { focalRole, leaderAxis, localityScopeSupport } from "../question-ui";
import { sizeRanges } from "../purchase";
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
 * A national answer grouped per institution or firm that no index bounds (S4 review; the builder's side of facets.ts
 * nationalLive): a ranking or a trend of institutions or firms, or "Cine conduce?" by value, with no named, compared or
 * person's entity, town hall, county, kind of institution or domain, on both channels or the direct acquisitions. Its
 * goods or services, or its size of purchase, read both marts whole (2–9 s locally) unless the nightly
 * agg_entity_kind_year answers them (kindRollupAnswers, S5 PRE-answers): the builder offers them only there.
 */
export function nationalEntityScan(spec: FilterSpec): boolean {
  const f = spec.filters, form = formOf(spec);
  const grouped = (form === "table" || form === "trend") && (spec.dim === "authority" || spec.dim === "supplier") || form === "entity_card:value";
  return grouped && spec.dataset !== "contracts" && !f.authorityName && !f.authorityId && !f.supplierName && !f.supplierId
    && !f.compareWith && !f.compareWithId && !f.adminName && !f.adminPersonKey && !f.uatSiruta && !f.county && !f.authorityKind && !f.cpvTerm;
}
/** Why, said on the options it disables. */
export const NATIONAL_ENTITY_SCAN = "Pe toată țara, pe instituții sau firme, cere un calcul pregătit noaptea. Alege un județ, un tip de instituție sau un domeniu.";

/**
 * S5 PRE-answers: whether such a national answer (nationalEntityScan) reads its goods, services or size from the
 * nightly agg_entity_kind_year (lib/ask/rollups.ts planRollup, entityKind), as the engine decides: conditions on the
 * ranked role only (on institutions no firms' size, seat, newness or relation; at most entities of the ranked role
 * left out), no record threshold, whole years (no months, no trend on the same months: `auto` up to this year, as
 * trend-rules.ts trendMonthsState says without the coverage) and a size of the kit's ranges (sizeRanges). S6
 * over-bar: goods or services without a size also on a trend's same months, with conditions on the ranked role
 * (agg_entity_kind_month), and on whole years with the other side's condition or exclusions (agg_pair_kind_year:
 * the institutions buying goods from firms with 1–9 employees). Otherwise the kind or the size reads both marts
 * whole (1.4–10 s locally: PRECOMPUTE.md) and the builder does not offer it.
 */
export function kindRollupAnswers(spec: FilterSpec, ctx: Pick<FilterCtx, "year">): boolean {
  const f = spec.filters, role = spec.dim === "supplier" ? "supplier" : "authority";
  if (f.monthFrom !== undefined || f.monthTo !== undefined || spec.minimumRecords) return false;
  const bound = (v: unknown) => v === undefined ? null : Number(v);
  const sized = f.purchaseValueMin !== undefined || f.purchaseValueMax !== undefined;
  if (sized && !sizeRanges(bound(f.purchaseValueMin), bound(f.purchaseValueMax))) return false;
  const months = spec.trend?.months;
  const sameMonths = formOf(spec) === "trend" && (Array.isArray(months) || months !== "whole" && (f.yearTo === undefined || Number(f.yearTo) >= ctx.year));
  if (sameMonths && sized) return false;
  // The other side read on its pairs: a kind alone, on whole years.
  const pairs = !sized && !sameMonths;
  // The other side's attributes and relations; the firms' own years (archive, register) are a ranking of firms' own.
  const firmsSide = f.minEmployees !== undefined || f.maxEmployees !== undefined || f.firmSeat || f.seatCounty || f.newSince !== undefined;
  if (role === "authority" && (firmsSide && !pairs || f.dominantSupplier)) return false;
  if (role === "supplier" && (f.mainClient || f.newScope === "buyer")) return false;
  // „Scoate din calcul” on the ranked role (rollups.ts sameRoleExclusions), or on either with the pairs: any other precise selection is live.
  const population = spec.population;
  if (!population) return true;
  if (population.operator !== "and" && population.groups.length > 1) return false;
  return population.groups.every((g) => (g.operator === "and" || g.conditions.length <= 1)
    && g.conditions.every((c) => (c.field === role || pairs && (c.field === "authority" || c.field === "supplier")) && c.op === "not_in"));
}

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

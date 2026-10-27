import type { BreakdownGroup, BreakdownSlice } from "../../lib/ask/compile";
import { formatShare } from "../../lib/ask/answer-text";
import { divisionKind, type PurchaseKind } from "../../lib/ask/purchase";
import { formatRon } from "../../lib/format";
import type { RowFact } from "./answer/RowFacts";

/*
 * The breakdown's answer as rows (final breakdown §3.7–§3.10, F3): the groups
 * the legend shows in the chosen order and the rest, the kinds row and the tag
 * of a group made by one record. Pure: BreakdownBlock (blocks.tsx) draws it,
 * answer-csv.ts exports the same rows.
 */

/** A breakdown's groups past this many are shown only after „Arată toate”; fewer when the rest is under a fifth (final §3.8). */
const SHOWN_GROUPS = 8, SHOWN_GROUPS_MAX = 15, REST_SHARE = 0.2;
/**
 * The groups a breakdown shows (final breakdown §3.8–§3.9): with every group
 * of the level (`base`), the first 8 in the chosen order, more (up to 15)
 * while the rest is over a fifth, or all of them; the rest as one row. An
 * answer without `base` (stored before F3) shows its top 8 and „alte domenii”.
 */
export function breakdownShown(slices: readonly BreakdownSlice[], other: { value: number; count: number }, base: readonly BreakdownGroup[] | undefined, byCount: boolean, all: boolean):
  { groups: BreakdownGroup[]; rest: { value: number; count: number }; restGroups: number; more: number; total: { value: number; count: number } } {
  if (!base) {
    const total = slices.reduce((t, s) => ({ value: t.value + s.value, count: t.count + s.count }), { ...other });
    return { groups: [...slices], rest: other, restGroups: 0, more: 0, total };
  }
  const amount = (s: { value: number; count: number }) => byCount ? s.count : s.value;
  const sorted = [...base].sort((a, b) => amount(b) - amount(a) || a.code.localeCompare(b.code));
  // `base` holds every group up to BREAKDOWN_BASE; `other` adds what lies past it on a very long level.
  const total = sorted.reduce((t, s) => ({ value: t.value + s.value, count: t.count + s.count }), { value: 0, count: 0 });
  const beyond = { value: Math.max(0, slices.reduce((t, s) => t + s.value, 0) + other.value - total.value), count: Math.max(0, slices.reduce((t, s) => t + s.count, 0) + other.count - total.count) };
  total.value += beyond.value; total.count += beyond.count;
  let n = all ? sorted.length : Math.min(SHOWN_GROUPS, sorted.length);
  const restOf = (k: number) => sorted.slice(k).reduce((t, s) => t + amount(s), 0) + amount(beyond);
  while (!all && n < Math.min(SHOWN_GROUPS_MAX, sorted.length) && restOf(n) > REST_SHARE * amount(total)) n++;
  const rest = sorted.slice(n).reduce((t, s) => ({ value: t.value + s.value, count: t.count + s.count }), { ...beyond });
  return { groups: sorted.slice(0, n), rest, restGroups: sorted.length - n, more: sorted.length - n, total };
}

/** The kinds row (final breakdown §3.7): each kind's share of the level, from its groups' divisions, largest first. */
export function breakdownKinds(base: readonly BreakdownGroup[], byCount: boolean): { kind: PurchaseKind; share: number }[] {
  const sums = new Map<PurchaseKind, number>();
  let total = 0;
  for (const g of base) {
    const kind = divisionKind(g.code.slice(0, 2)), amount = byCount ? g.count : g.value;
    total += amount;
    if (kind) sums.set(kind, (sums.get(kind) ?? 0) + amount);
  }
  return total > 0 ? [...sums.entries()].filter(([, v]) => v > 0).map(([kind, v]) => ({ kind, share: v / total })).sort((a, b) => b.share - a.share) : [];
}

/**
 * The grey tag „cod general” (final breakdown §3.5, plan §4.5 P8): the group coded as its parent itself, the parent
 * padded with zeros (4500 → 45000000 under 45), so its records name no subcategory. Neutral, with a (?). `parent`:
 * the code the level is inside (a domain written as digits), none at the divisions.
 */
export function generalTag(code: string, parent: string | null | undefined): RowFact | null {
  if (!parent || !/^\d+$/.test(parent) || code !== `${parent}00`) return null;
  return { text: "cod general", tip: { title: "Cod general", text: `Înregistrări codate doar cu codul ${parent.padEnd(8, "0")}, fără o subcategorie. Codul îl alege instituția.` } };
}

/** The amber tag of a group made by one record (final §3.10): a group of ≥ 10% of the level whose largest record is ≥ half of it. */
export function largestTag(group: Pick<BreakdownGroup, "value" | "max" | "maxSrc">, total: number): RowFact | null {
  if (!group.max || !group.maxSrc || total <= 0 || group.value / total < 0.1 || group.max / group.value < 0.5) return null;
  return { text: `${group.maxSrc === "contracts" ? "1 contract" : "1 achiziție directă"}: ${formatShare(group.max / group.value)}`, tone: "caveat",
    tip: { title: "O înregistrare mare", text: `Cea mai mare înregistrare: ${formatRon(group.max)}, ${formatShare(group.max / group.value)} din domeniu. Un contract intră întreg în anul atribuirii.` } };
}

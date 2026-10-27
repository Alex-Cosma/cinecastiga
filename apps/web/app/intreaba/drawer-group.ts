import { countWords } from "../../lib/ask/answer-text";
import type { BlockData } from "../../lib/ask/compile";
import { NETWORK_LIST_LABELS, networkList } from "../../lib/ask/network-shared";
import type { AskSpec } from "../../lib/ask/spec";
import { formatRon } from "../../lib/format";
import { partnerNoun } from "./network-answer";

/*
 * The header of a records drawer that lists a group of the answer (S4 review;
 * plan §4.2 Surse, §6.3, §7): a ranking of firms narrowed by CÂȘTIGĂTORII
 * keeps the whole selection's total and „% din total”, while its sources are
 * the band's firms' records, so the drawer says both figures („Înregistrările
 * celor 412 firme din listă · 8,1 mld. lei din 102 mld. lei”), as a trend's
 * group's does (trendGroupHeader); so do a network's group and „Cu semnale”.
 * From the answer on screen: no query of its own.
 */

export interface DrawerListGroup {
  kind: "band" | "network";
  /** A network's group in its words („Noi din 2025”), or „Cu semnale”; none on a band. */
  label: string | null;
  members: number;
  one: string;
  many: string;
  /** The selection's value the group is part of; null where the answer has no figure for it („Cu semnale” alone). */
  selection: number | null;
}

/** The group the whole answer's sources list, or null when they are the selection's own (no band, „Toți”). */
export function answerListGroup(data: BlockData | undefined, spec: AskSpec): DrawerListGroup | null {
  if (data?.block === "table" && spec.dim === "supplier" && data.group && data.totals)
    return { kind: "band", label: null, members: data.group.entities, one: "firmă", many: "firme", selection: data.totals.value };
  if (data?.block !== "network") return null;
  const list = networkList(spec), signals = spec.network?.signals === true;
  if (list === "all" && !signals) return null;
  const noun = partnerNoun(data);
  // A group has no period (NETWORK_RULES): „Toți” is then every group's partners, the whole relation's selection.
  return {
    kind: "network", label: list === "all" ? "Cu semnale" : `${NETWORK_LIST_LABELS[list]} din ${data.since}${signals ? ", cu semnale" : ""}`,
    members: data.lists[list].partners, one: noun.one, many: noun.many, selection: list === "all" ? null : data.lists.all.value,
  };
}

/** „Înregistrările celor 412 firme din listă · 8,1 mld. lei din 102 mld. lei”; „Grupa „Noi din 2025”: 12 instituții · …”. */
export function listGroupHeader(group: DrawerListGroup, value: string): string {
  const amount = `${formatRon(Number(value))}${group.selection !== null ? ` din ${formatRon(group.selection)}` : ""}`;
  if (group.kind === "band") return group.members === 1 ? `Înregistrările firmei din listă · ${amount}`
    : `Înregistrările celor ${countWords(group.members, group.one, group.many)} din listă · ${amount}`;
  const who = countWords(group.members, group.one, group.many);
  return group.label === "Cu semnale" ? `„Cu semnale”: ${who} · ${amount}` : `Grupa „${group.label}”: ${who} · ${amount}`;
}

import { BLOCK_FILTERS } from "../../../lib/ask/filters/blocks";
import { filterContext } from "../../../lib/ask/filters/context";
import { exclusionBlocked } from "../../../lib/ask/filters/exclusions";
import type { FilterSpec } from "../../../lib/ask/filters/types";
import type { AskSpec } from "../../../lib/ask/spec";
import type { RowAction } from "./RowMenu";

/*
 * P7, the "⋯" of an answer's row (kit component 15, plan §4.2, §4.7, §4.13),
 * in the order BLOCK_FILTERS.rowMenu gives on the question: "Vezi
 * înregistrările →" (the row's sources), "Scoate din calcul −" (F4: the row's
 * entity leaves the selection; disabled with its reason at five, on a link's
 * "SAU" or another page's selection), "Detaliază ›" (a flow's domain, one
 * CPV level down), its page "Fișa firmei ↗" and, on the network around an
 * institution, that institution's "Radiografia ↗". An action without its
 * handler (or the centre's id) is left out.
 */

export interface EntityRow { id: string; name: string }

export function entityRowActions(spec: AskSpec, row: EntityRow, on: { records?: () => void; exclude?: () => void; deeper?: () => void }, centre?: string): RowAction[] {
  const draft = spec as unknown as FilterSpec;
  const ctx = filterContext(draft);
  const entry = BLOCK_FILTERS[ctx.block];
  const role = entry?.exclude(draft, ctx)?.field ?? (spec.dim === "authority" ? "authority" : "supplier");
  const actions: RowAction[] = [];
  for (const id of entry?.rowMenu(draft, ctx) ?? []) {
    if (id === "records" && on.records) actions.push({ id, label: "Vezi înregistrările", glyph: "→", onSelect: on.records });
    if (id === "exclude" && on.exclude) {
      const blocked = exclusionBlocked(draft);
      actions.push({ id, label: "Scoate din calcul", glyph: "−", onSelect: on.exclude, ...(blocked ? { disabled: blocked } : {}) });
    }
    if (id === "deeper" && on.deeper) actions.push({ id, label: "Detaliază", glyph: "›", onSelect: on.deeper });
    if (id === "entity") actions.push({ id, label: role === "authority" ? "Fișa instituției" : "Fișa firmei", glyph: "↗", href: `/entitati/${row.id}` });
    // The network's institution in the centre (final network §3.6): its radiography, where this firm's place among its suppliers shows.
    if (id === "radiography" && centre) actions.push({ id, label: "Radiografia instituției", glyph: "↗", href: `/entitati/${centre}/radiografie` });
  }
  return actions;
}

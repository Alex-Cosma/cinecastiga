import type { FilterId } from "../../../lib/ask/filters/types";
import type { BuilderView, BuilderWindowSpec } from "../builder/view";
import { windowKind } from "../builder/window-model";

/*
 * The window a pill under the answer's title opens (owner, 1 November 2026):
 * the builder's own, for the applied question, so a pill chooses with the
 * same lists, counts and searches as the sentence. The sentence's phrase
 * first, then the presentation line's, an invitation's, a row's or a chip's
 * under the sentence; by its filter, else by a window that also writes it
 * (the buyer's window writes the town hall). A pill without one stays text.
 */

/**
 * Windows a pill does not open: they edit over several steps where they are (Selecție avansată, the exclusions,
 * „Față de cine?”, whose ticks apply one by one), or follow-ups the builder runs (another entity of a distribution
 * brings its county and type).
 */
const NOT_FROM_A_PILL = new Set(["advanced", "exclusions", "peers"]);

export function pillWindow(view: BuilderView, filter: FilterId | null, block: string): BuilderWindowSpec | null {
  if (!filter) return null;
  const windows = Object.values(view.windows).filter((win) => {
    const kind = windowKind(win);
    return !NOT_FROM_A_PILL.has(kind) && !(block === "distribution" && kind === "focal");
  });
  return windows.find((win) => win.slot.id === filter) ?? windows.find((win) => win.slot.writes?.includes(filter)) ?? null;
}

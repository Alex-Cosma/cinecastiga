/**
 * The site's one dropdown list (owner, 12 November 2026: every dropdown in the theme, all alike). These are its
 * decisions that need no document: where the list goes around its control, and which row a typed letter reaches.
 * The list itself is components/themed-select/themed-list.ts.
 */
export type ListItem = { value: string; label: string; disabled?: boolean; /** A group heading shown above this row. */ group?: string };

export type VerticalPlace = { side: "below"; top: number; maxHeight: number } | { side: "above"; bottom: number; maxHeight: number };

const GAP = 6, MARGIN = 8, COMFORT = 220, LEAST = 120;

/** Below the control when a comfortable list fits there or there is more room than above; else above it. */
export function placeVertical(anchorTop: number, anchorBottom: number, viewportHeight: number, wanted: number): VerticalPlace {
  const below = viewportHeight - anchorBottom - GAP - MARGIN, above = anchorTop - GAP - MARGIN;
  if (below >= Math.min(wanted, COMFORT) || below >= above) return { side: "below", top: anchorBottom + GAP, maxHeight: Math.max(LEAST, Math.min(wanted, below)) };
  return { side: "above", bottom: viewportHeight - anchorTop + GAP, maxHeight: Math.max(LEAST, Math.min(wanted, above)) };
}

/** The list starts at the control's left edge and is pulled back inside the screen when it would cross the right one. */
export function clampLeft(anchorLeft: number, width: number, viewportWidth: number): number {
  return Math.max(MARGIN, Math.min(anchorLeft, viewportWidth - MARGIN - width));
}

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("ro");

/** The row typed letters reach: the next one after `from` whose label starts with them, diacritics aside; -1 when none. */
export function typeaheadIndex(items: readonly ListItem[], typed: string, from: number): number {
  const want = plain(typed);
  if (!want) return -1;
  for (let step = 1; step <= items.length; step++) {
    const i = (from + step + items.length) % items.length, item = items[i]!;
    if (!item.disabled && plain(item.label).startsWith(want)) return i;
  }
  return -1;
}

/** The nearest row that can be chosen, walking from `from` in `direction`; stays on `from` when there is none. */
export function stepEnabled(items: readonly ListItem[], from: number, direction: 1 | -1): number {
  for (let i = from + direction; i >= 0 && i < items.length; i += direction) if (!items[i]!.disabled) return i;
  return from;
}

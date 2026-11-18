/**
 * The search list's arrow keys over the rows the reader sees (DiscoverySearch). A row can be in the page and not shown:
 * the dialog's starting questions that exist only in Complet (lib/view-mode.ts; owner, 18 November 2026). Down goes to
 * the next shown row and stays on the last one; Up goes to the previous shown row, and past the first back to the field
 * (-1), as the list always did.
 */
export function stepShown(current: number, down: boolean, count: number, shown: (index: number) => boolean): number {
  if (down) {
    for (let at = current + 1; at < count; at++) if (shown(at)) return at;
    return current;
  }
  for (let at = current - 1; at >= 0; at--) if (shown(at)) return at;
  return -1;
}

/** Whether a row is drawn: an element under display:none (its own or an ancestor's) has no layout box. */
export const isDrawn = (element: Element | null): boolean => Boolean(element && element.getClientRects().length > 0);

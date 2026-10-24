import type { KeyboardEvent } from "react";

/*
 * Keyboard and placement rules of the kit, as plain functions so they are
 * tested without a browser (kit §8): roving tabindex for segmented controls,
 * count groups, pills and option lists; where a window opens beside its
 * trigger without widening the page.
 */

export type Orientation = "horizontal" | "vertical" | "both";
/** The width at and under which a window is a bottom sheet (kit R6, §9); the CSS uses the same 600 px. */
export const SHEET_QUERY = "(max-width: 600px)";

const STEP: Record<Orientation, Record<string, 1 | -1>> = {
  horizontal: { ArrowRight: 1, ArrowLeft: -1 },
  vertical: { ArrowDown: 1, ArrowUp: -1 },
  // The WAI radio pattern: both pairs move.
  both: { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 },
};

/**
 * Where a roving key sends focus: the next or previous enabled item, wrapping
 * round; Home and End go to the first and last enabled one. Null when the key
 * is not a roving key here or nothing can take focus.
 */
export function rovingTarget(disabled: readonly boolean[], current: number, key: string, orientation: Orientation = "both"): number | null {
  const count = disabled.length;
  if (!count || disabled.every(Boolean)) return null;
  if (key === "Home") return disabled.findIndex(off => !off);
  if (key === "End") { for (let i = count - 1; i >= 0; i--) if (!disabled[i]) return i; return null; }
  const step = STEP[orientation][key];
  if (!step) return null;
  let index = current < 0 ? (step > 0 ? -1 : 0) : current;
  for (let tries = 0; tries < count; tries++) {
    index = (index + step + count) % count;
    if (!disabled[index]) return index;
  }
  return null;
}

/** The one item of a roving group reachable by Tab: the chosen one, else the first enabled one. */
export function rovingStop(checked: number, disabled: readonly boolean[]): number {
  if (checked >= 0 && checked < disabled.length) return checked;
  const first = disabled.findIndex(off => !off);
  return first < 0 ? 0 : first;
}

/**
 * The container's keydown for a roving group (marked `data-roving`): moves
 * focus between its own items (`selector`), never into a nested group, and
 * reports the new index. Items marked aria-disabled are skipped.
 */
export function rovingKeyDown(event: KeyboardEvent<HTMLElement>, selector: string, orientation: Orientation, onMove: (index: number) => void): void {
  const container = event.currentTarget;
  const items = Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(item => item.closest("[data-roving]") === container);
  const from = (event.target as HTMLElement).closest<HTMLElement>(selector);
  const next = rovingTarget(items.map(item => item.getAttribute("aria-disabled") === "true"), from ? items.indexOf(from) : -1, event.key, orientation);
  if (next === null) return;
  event.preventDefault();
  items[next]?.focus();
  onMove(next);
}

export interface Box { top: number; bottom: number; left: number; right: number }

/**
 * Where a desktop window opens: under its trigger, or above it when the
 * screen has no room below, and always inside the viewport with a gutter, so
 * it can never cause horizontal scroll.
 */
export function popoverPlacement(anchor: Box, pop: { width: number; height: number }, viewport: { width: number; height: number }, gutter = 16, gap = 8): { top: number; left: number } {
  const maxLeft = viewport.width - gutter - pop.width;
  const left = Math.max(gutter, Math.min(anchor.left, maxLeft));
  const below = anchor.bottom + gap, above = anchor.top - gap - pop.height;
  const roomBelow = viewport.height - gutter - below, roomAbove = anchor.top - gap - gutter;
  let top: number;
  if (pop.height <= roomBelow) top = below;
  else if (above >= gutter) top = above;
  else top = roomBelow >= roomAbove ? below : gutter;
  return { top: Math.round(Math.max(gutter, top)), left: Math.round(left) };
}

/** The elements a keyboard can reach inside `root`, in document order. */
export function focusables(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]"))
    .filter(element => element.tabIndex >= 0 && !element.hasAttribute("disabled") && !element.closest("[hidden]"));
}

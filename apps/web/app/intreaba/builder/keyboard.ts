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
 * A roving move in a grid of `columns` (the year grid of the period, kit §8):
 * ←/→ step through the cells in reading order and wrap round, ↑/↓ keep the
 * column and skip disabled cells in it (no move past the first or last row),
 * Home and End go to the first and last enabled cell.
 */
export function gridTarget(disabled: readonly boolean[], current: number, key: string, columns: number): number | null {
  if (key !== "ArrowUp" && key !== "ArrowDown") return rovingTarget(disabled, current, key, "horizontal");
  if (columns < 1 || !disabled.length || disabled.every(Boolean)) return null;
  if (current < 0) return rovingTarget(disabled, -1, key === "ArrowDown" ? "ArrowRight" : "ArrowLeft", "horizontal");
  const step = key === "ArrowDown" ? columns : -columns;
  for (let index = current + step; index >= 0 && index < disabled.length; index += step) if (!disabled[index]) return index;
  return null;
}

type Target = (disabled: readonly boolean[], current: number, key: string) => number | null;

function moveWithin(event: KeyboardEvent<HTMLElement>, selector: string, target: Target, onMove: (index: number) => void): void {
  const container = event.currentTarget;
  const items = Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(item => item.closest("[data-roving]") === container);
  const from = (event.target as HTMLElement).closest<HTMLElement>(selector);
  const next = target(items.map(item => item.getAttribute("aria-disabled") === "true"), from ? items.indexOf(from) : -1, event.key);
  if (next === null) return;
  event.preventDefault();
  items[next]?.focus();
  onMove(next);
}

/**
 * The container's keydown for a roving group (marked `data-roving`): moves
 * focus between its own items (`selector`), never into a nested group, and
 * reports the new index. Items marked aria-disabled are skipped.
 */
export function rovingKeyDown(event: KeyboardEvent<HTMLElement>, selector: string, orientation: Orientation, onMove: (index: number) => void): void {
  moveWithin(event, selector, (disabled, current, key) => rovingTarget(disabled, current, key, orientation), onMove);
}

/** rovingKeyDown for a grid laid out in `columns` (gridTarget). */
export function rovingGridKeyDown(event: KeyboardEvent<HTMLElement>, selector: string, columns: number, onMove: (index: number) => void): void {
  moveWithin(event, selector, (disabled, current, key) => gridTarget(disabled, current, key, columns), onMove);
}

/**
 * The menu button of an answer row ("⋯", kit §3 component 15): ↓ opens the
 * menu on its first item and ↑ on its last. Enter and Space are the button's
 * own click, which opens on the first item.
 */
export function menuButtonKey(key: string): "first" | "last" | null {
  return key === "ArrowDown" ? "first" : key === "ArrowUp" ? "last" : null;
}

export type MenuKey = { focus: number } | { close: "button" | "away" } | null;

/**
 * A key inside an open menu (WAI menu pattern): ↓/↑ wrap round, Home/End,
 * a letter jumps to the next item starting with it; Escape closes and focus
 * returns to the button; Tab closes and lets focus move on. Disabled items
 * stay reachable, so their reason can be read.
 */
export function menuKey(key: string, current: number, labels: readonly string[]): MenuKey {
  const count = labels.length;
  if (key === "Escape") return { close: "button" };
  if (key === "Tab") return { close: "away" };
  if (!count) return null;
  if (key === "ArrowDown") return { focus: current < 0 ? 0 : (current + 1) % count };
  if (key === "ArrowUp") return { focus: current <= 0 ? count - 1 : current - 1 };
  if (key === "Home") return { focus: 0 };
  if (key === "End") return { focus: count - 1 };
  if (key.length === 1 && key.trim()) {
    const letter = key.toLocaleLowerCase("ro");
    for (let step = 1; step <= count; step++) {
      const index = (Math.max(current, 0) + step) % count;
      if (labels[index]?.trim().toLocaleLowerCase("ro").startsWith(letter)) return { focus: index };
    }
  }
  return null;
}

export interface ComboState { active: number; expanded: boolean }
export type ComboKey = { state: ComboState } | { pick: number } | { wait: true } | { clear: true } | null;

/**
 * A key in the field of a combobox (entity search, "Unde e …?"; WAI
 * combobox with a listbox): ↓/↑ move the active option and wrap round,
 * Enter picks it (or the first result, as the site's search does), Escape
 * first leaves the list, then empties the field, and only then is left to the
 * window (null), which closes. `inline` lists stay drawn under the field;
 * the others collapse. Home/End stay the field's own. While the typed text
 * has no results yet (`busy`: the search is due or loading), the list on
 * screen belongs to the previous text: ↑/↓ leave it alone and Enter waits
 * for the fresh results (`wait`), so it never picks an out-of-date one.
 */
export function comboboxKey(key: string, state: ComboState, count: number, hasText: boolean, inline = false, busy = false): ComboKey {
  const { active, expanded } = state;
  if (busy && (key === "ArrowDown" || key === "ArrowUp")) return null;
  if (busy && key === "Enter" && hasText) return { wait: true };
  if (key === "ArrowDown" && count) return { state: { active: expanded && active >= 0 ? (active + 1) % count : 0, expanded: true } };
  if (key === "ArrowUp" && count) return { state: { active: expanded && active > 0 ? active - 1 : count - 1, expanded: true } };
  if (key === "Enter" && count && (expanded || inline)) return { pick: active >= 0 && active < count ? active : 0 };
  if (key === "Escape") {
    if (inline ? active >= 0 : expanded && count > 0) return { state: { active: -1, expanded: inline } };
    if (hasText) return { clear: true };
  }
  return null;
}

/**
 * A trailing debounce (the search callback of EntitySearch and Locate): only
 * the last value of a burst arrives, `ms` after the last call.
 */
export function debounce<T>(fn: (value: T) => void, ms: number): { call: (value: T) => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    call(value) { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; fn(value); }, ms); },
    cancel() { if (timer) clearTimeout(timer); timer = null; },
  };
}

/**
 * The adjoining bands (Angajați, kit §3 component 10): the chosen bands are
 * always one run. Pressing a band outside the run extends it and chooses the
 * bands between (`added`); pressing an end of the run drops it; pressing one
 * inside drops it and the bands between it and the nearer end (the upper
 * side on a tie) (`removed`). `added` and `removed` leave out the pressed band.
 */
export function toggleBand(pressed: readonly boolean[], index: number): { pressed: boolean[]; added: number[]; removed: number[] } {
  const on = pressed.map((value, at) => value ? at : -1).filter(at => at >= 0);
  const next = pressed.map(() => false), added: number[] = [], removed: number[] = [];
  const range = (from: number, to: number) => { for (let at = from; at <= to; at++) next[at] = true; };
  if (index < 0 || index >= pressed.length) return { pressed: [...pressed], added, removed };
  if (!on.length) { next[index] = true; return { pressed: next, added, removed }; }
  const lo = on[0]!, hi = on[on.length - 1]!;
  if (!pressed[index]) {
    const from = Math.min(lo, index), to = Math.max(hi, index);
    range(from, to);
    for (let at = from; at <= to; at++) if (at !== index && !pressed[at]) added.push(at);
    return { pressed: next, added, removed };
  }
  if (lo === hi) return { pressed: next, added, removed };
  let keepFrom = lo, keepTo = hi;
  if (index === lo) keepFrom = lo + 1;
  else if (index === hi) keepTo = hi - 1;
  else if (index - lo < hi - index) keepFrom = index + 1;
  else keepTo = index - 1;
  range(keepFrom, keepTo);
  for (let at = lo; at <= hi; at++) if (at !== index && !next[at]) removed.push(at);
  return { pressed: next, added, removed };
}

export interface Box { top: number; bottom: number; left: number; right: number }

/**
 * Where a desktop window opens: under its trigger, or above it when the
 * screen has no room below, and always inside the viewport with a gutter, so
 * it can never cause horizontal scroll. A tall window that fits on neither
 * side opens beside the phrase (right of it, else left), so it stays "lângă
 * frază" (kit R6) without covering it; only where there is no room beside
 * either is it pulled up until its bottom is inside the screen (it then
 * covers its trigger): a fixed window cannot be scrolled to.
 */
export function popoverPlacement(anchor: Box, pop: { width: number; height: number }, viewport: { width: number; height: number }, gutter = 16, gap = 8): { top: number; left: number } {
  const maxLeft = viewport.width - gutter - pop.width;
  const left = Math.max(gutter, Math.min(anchor.left, maxLeft));
  const below = anchor.bottom + gap, above = anchor.top - gap - pop.height;
  const roomBelow = viewport.height - gutter - below;
  // Beside the trigger, as high as its top allows within the screen.
  const sideTop = Math.min(anchor.top, viewport.height - gutter - pop.height);
  let top: number, at = left;
  if (pop.height <= roomBelow) top = below;
  else if (above >= gutter) top = above;
  else if (anchor.right + gap + pop.width <= viewport.width - gutter) { top = sideTop; at = anchor.right + gap; }
  else if (anchor.left - gap - pop.width >= gutter) { top = sideTop; at = anchor.left - gap - pop.width; }
  else top = Math.min(below, viewport.height - gutter - pop.height);
  return { top: Math.round(Math.max(gutter, top)), left: Math.round(at) };
}

/**
 * How far a scrolling box must scroll so an item is wholly inside it
 * (negative: up), 0 when it already is: the active result of a search,
 * scrolled into its list or its window without moving the page.
 */
export function revealDelta(item: { top: number; bottom: number }, box: { top: number; bottom: number }): number {
  if (item.top < box.top) return item.top - box.top;
  if (item.bottom > box.bottom) return Math.min(item.bottom - box.bottom, item.top - box.top);
  return 0;
}

/** The elements a keyboard can reach inside `root`, in document order. */
export function focusables(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]"))
    .filter(element => element.tabIndex >= 0 && !element.hasAttribute("disabled") && !element.closest("[hidden]"));
}

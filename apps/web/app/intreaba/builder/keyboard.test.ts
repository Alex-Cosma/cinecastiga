import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeyboardEvent } from "react";
import { comboboxKey, debounce, gridTarget, menuButtonKey, menuKey, popoverPlacement, revealDelta, rovingGridKeyDown, rovingKeyDown, rovingStop, rovingTarget, toggleBand } from "./keyboard";

// Kit §8: one Tab stop per group, arrows move and choose, disabled options are skipped.
describe("roving tabindex", () => {
  const none = [false, false, false, false];
  it("moves with the arrows, wraps round and skips disabled options", () => {
    expect(rovingTarget(none, 0, "ArrowRight")).toBe(1);
    expect(rovingTarget(none, 0, "ArrowDown")).toBe(1);
    expect(rovingTarget(none, 3, "ArrowRight")).toBe(0);
    expect(rovingTarget(none, 0, "ArrowLeft")).toBe(3);
    expect(rovingTarget([false, true, true, false], 0, "ArrowRight")).toBe(3);
    expect(rovingTarget([false, true, false, true], 2, "ArrowRight")).toBe(0);
    expect(rovingTarget([true, false, false, true], 1, "ArrowUp")).toBe(2);
  });
  it("goes to the first and last enabled option on Home and End", () => {
    expect(rovingTarget([true, false, false, true], 2, "Home")).toBe(1);
    expect(rovingTarget([true, false, false, true], 1, "End")).toBe(2);
  });
  it("starts from either end when nothing has focus yet", () => {
    expect(rovingTarget([true, false, false], -1, "ArrowRight")).toBe(1);
    expect(rovingTarget([false, false, true], -1, "ArrowLeft")).toBe(1);
  });
  it("ignores other keys, the other axis of a one-way group and an all-disabled group", () => {
    expect(rovingTarget(none, 0, "Enter")).toBeNull();
    expect(rovingTarget(none, 0, " ")).toBeNull();
    expect(rovingTarget(none, 0, "ArrowDown", "horizontal")).toBeNull();
    expect(rovingTarget(none, 0, "ArrowRight", "vertical")).toBeNull();
    expect(rovingTarget(none, 0, "ArrowDown", "vertical")).toBe(1);
    expect(rovingTarget([true, true], 0, "ArrowRight")).toBeNull();
    expect(rovingTarget([], 0, "ArrowRight")).toBeNull();
  });
  it("gives the Tab stop to the chosen option, else to the first enabled one", () => {
    expect(rovingStop(2, none)).toBe(2);
    expect(rovingStop(-1, [true, false, false])).toBe(1);
    expect(rovingStop(-1, [true, true])).toBe(0);
  });

  // The container handler, on stand-ins for the DOM (the tests run without a browser).
  const group = (disabled: boolean[]) => {
    const container: { querySelectorAll?: () => unknown } = {};
    const items = disabled.map(off => {
      const entry = { getAttribute: (name: string) => name === "aria-disabled" && off ? "true" : null, focus: vi.fn(), closest: (_selector: string): unknown => null };
      entry.closest = selector => selector === "[data-roving]" ? container : entry;
      return entry;
    });
    container.querySelectorAll = () => items;
    return { container: container as unknown as HTMLElement, items };
  };
  const press = (container: HTMLElement, target: unknown, key: string) => {
    const preventDefault = vi.fn();
    return { event: { currentTarget: container, target, key, preventDefault } as unknown as KeyboardEvent<HTMLElement>, preventDefault };
  };
  it("focuses and reports the next enabled item of its own group", () => {
    const { container, items } = group([false, true, false]);
    const onMove = vi.fn();
    const { event, preventDefault } = press(container, items[0], "ArrowRight");
    rovingKeyDown(event, '[role="radio"]', "both", onMove);
    expect(items[2]!.focus).toHaveBeenCalledOnce();
    expect(items[1]!.focus).not.toHaveBeenCalled();
    expect(onMove).toHaveBeenCalledWith(2);
    expect(preventDefault).toHaveBeenCalledOnce();
  });
  it("leaves Tab, Enter and Space to the browser", () => {
    const { container, items } = group([false, false]);
    const onMove = vi.fn();
    for (const key of ["Tab", "Enter", " "]) {
      const { event, preventDefault } = press(container, items[0], key);
      rovingKeyDown(event, '[role="radio"]', "both", onMove);
      expect(preventDefault).not.toHaveBeenCalled();
    }
    expect(onMove).not.toHaveBeenCalled();
  });
  it("never walks into a nested group", () => {
    const { container, items } = group([false, false, false]);
    const nested = {} as HTMLElement;
    const own = items[1]!;
    own.closest = selector => selector === "[data-roving]" ? nested : own;
    const onMove = vi.fn();
    rovingKeyDown(press(container, items[0], "ArrowRight").event, '[role="radio"]', "both", onMove);
    expect(items[2]!.focus).toHaveBeenCalledOnce();
    expect(onMove).toHaveBeenCalledWith(1); // the index among the group's own items
  });
});

// Kit R6 and §9: a desktop window opens beside its trigger and never widens the page.
describe("window placement", () => {
  const anchor = (left: number, top: number, width = 80, height = 30) => ({ left, top, right: left + width, bottom: top + height });
  it("opens under the trigger, aligned to its left edge", () => {
    expect(popoverPlacement(anchor(200, 100), { width: 340, height: 300 }, { width: 1280, height: 800 })).toEqual({ top: 138, left: 200 });
  });
  it("moves left to keep a 16 px gutter on the right", () => {
    const { left } = popoverPlacement(anchor(1150, 100), { width: 340, height: 300 }, { width: 1280, height: 800 });
    expect(left).toBe(1280 - 16 - 340);
  });
  it("opens above the trigger when there is no room below", () => {
    expect(popoverPlacement(anchor(200, 700), { width: 340, height: 300 }, { width: 1280, height: 800 }).top).toBe(700 - 8 - 300);
  });
  it("stays inside a narrow screen", () => {
    const { left } = popoverPlacement(anchor(250, 100), { width: 288, height: 300 }, { width: 320, height: 640 });
    expect(left).toBe(16);
    expect(left + 288).toBeLessThanOrEqual(320 - 16);
  });
  it("never starts above the top gutter, even when taller than both sides", () => {
    expect(popoverPlacement(anchor(10, 300), { width: 340, height: 900 }, { width: 1280, height: 800 }).top).toBeGreaterThanOrEqual(16);
  });
  it("opens a window that fits on neither side beside its phrase, never over it (kit R6)", () => {
    // 1280×720, the phrase at 30% of the height, the period window with its free range open (537 px).
    const viewport = { width: 1280, height: 720 };
    const over = (a: ReturnType<typeof anchor>, p: { top: number; left: number }) => p.left < a.right && p.left + 340 > a.left && p.top < a.bottom && p.top + 537 > a.top;
    for (const trigger of [anchor(200, 216), anchor(200, 420), anchor(900, 300, 200)]) {
      const placed = popoverPlacement(trigger, { width: 340, height: 537 }, viewport);
      expect(placed.top).toBeGreaterThanOrEqual(16);
      expect(placed.top + 537).toBeLessThanOrEqual(720 - 16);
      expect(placed.left + 340).toBeLessThanOrEqual(1280 - 16);
      expect(over(trigger, placed), JSON.stringify(trigger)).toBe(false);
    }
    // Right of the phrase, from its top when that fits; left of it when the right has no room.
    expect(popoverPlacement(anchor(200, 216), { width: 340, height: 537 }, viewport)).toEqual({ top: 720 - 16 - 537, left: 288 });
    expect(popoverPlacement(anchor(900, 100 + 60, 200), { width: 340, height: 537 }, viewport).left).toBe(900 - 8 - 340);
    // Still under the trigger when that already fits, above it when that fits.
    expect(popoverPlacement(anchor(200, 100), { width: 340, height: 537 }, viewport).top).toBe(138);
    expect(popoverPlacement(anchor(200, 640), { width: 340, height: 537 }, viewport).top).toBe(640 - 8 - 537);
    // No room beside either: pulled up until its bottom is on screen (it covers the trigger).
    const narrow = { width: 700, height: 720 };
    expect(popoverPlacement(anchor(200, 216, 200), { width: 340, height: 537 }, narrow).top).toBe(720 - 16 - 537);
  });
});

describe("revealing the active result", () => {
  it("scrolls its box only as far as needed, and not at all when it is in view", () => {
    const box = { top: 100, bottom: 400 };
    expect(revealDelta({ top: 150, bottom: 198 }, box)).toBe(0);
    expect(revealDelta({ top: 380, bottom: 428 }, box)).toBe(28);
    expect(revealDelta({ top: 60, bottom: 108 }, box)).toBe(-40);
    expect(revealDelta({ top: 120, bottom: 520 }, box)).toBe(20); // taller than the box: its top in view
  });
});

// Kit §8, part 2: the year grid is walked in two dimensions (5 columns).
describe("the year grid", () => {
  const ten = Array.from({ length: 10 }, () => false); // 2018 … 2026 and the range cell
  it("steps through the cells in reading order with ←/→, wrapping round", () => {
    expect(gridTarget(ten, 4, "ArrowRight", 5)).toBe(5); // end of the first row → start of the second
    expect(gridTarget(ten, 5, "ArrowLeft", 5)).toBe(4);
    expect(gridTarget(ten, 9, "ArrowRight", 5)).toBe(0);
  });
  it("keeps the column with ↑/↓ and does not move past the first or last row", () => {
    expect(gridTarget(ten, 1, "ArrowDown", 5)).toBe(6);
    expect(gridTarget(ten, 6, "ArrowUp", 5)).toBe(1);
    expect(gridTarget(ten, 7, "ArrowDown", 5)).toBeNull();
    expect(gridTarget(ten, 2, "ArrowUp", 5)).toBeNull();
    expect(gridTarget(Array.from({ length: 9 }, () => false), 4, "ArrowDown", 5)).toBeNull(); // the short last row
  });
  it("skips a disabled cell in the column, and Home/End go to the first and last enabled cell", () => {
    const disabled = [...ten]; disabled[6] = true;
    const fifteen = Array.from({ length: 15 }, (_, index) => index === 6);
    expect(gridTarget(fifteen, 1, "ArrowDown", 5)).toBe(11);
    expect(gridTarget(disabled, 1, "ArrowDown", 5)).toBeNull();
    expect(gridTarget([true, false, false, false, false, false, true], 3, "Home", 5)).toBe(1);
    expect(gridTarget([true, false, false, false, false, false, true], 3, "End", 5)).toBe(5);
  });
  it("starts from either end when nothing has focus, and ignores other keys", () => {
    expect(gridTarget(ten, -1, "ArrowDown", 5)).toBe(0);
    expect(gridTarget(ten, -1, "ArrowUp", 5)).toBe(9);
    expect(gridTarget(ten, 3, "Enter", 5)).toBeNull();
    expect(gridTarget([true, true], 0, "ArrowDown", 5)).toBeNull();
  });
  it("moves focus and the choice from the container", () => {
    const container: { querySelectorAll?: () => unknown } = {};
    const items = ten.map(() => {
      const entry = { getAttribute: () => null, focus: vi.fn(), closest: (_selector: string): unknown => null };
      entry.closest = selector => selector === "[data-roving]" ? container : entry;
      return entry;
    });
    container.querySelectorAll = () => items;
    const onMove = vi.fn(), preventDefault = vi.fn();
    rovingGridKeyDown({ currentTarget: container, target: items[2], key: "ArrowDown", preventDefault } as unknown as KeyboardEvent<HTMLElement>, '[role="radio"]', 5, onMove);
    expect(items[7]!.focus).toHaveBeenCalledOnce();
    expect(onMove).toHaveBeenCalledWith(7);
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});

// Kit §3 component 15 and §8: the "⋯" menu button and its menu (WAI menu button).
describe("the row menu", () => {
  const labels = ["Vezi înregistrările", "Scoate din calcul", "Fișa firmei"];
  it("opens on the first item with ↓ and on the last with ↑; Enter and Space stay the button's click", () => {
    expect(menuButtonKey("ArrowDown")).toBe("first");
    expect(menuButtonKey("ArrowUp")).toBe("last");
    expect(menuButtonKey("Enter")).toBeNull();
    expect(menuButtonKey(" ")).toBeNull();
  });
  it("wraps round with ↓/↑ and goes to the ends with Home/End", () => {
    expect(menuKey("ArrowDown", 2, labels)).toEqual({ focus: 0 });
    expect(menuKey("ArrowUp", 0, labels)).toEqual({ focus: 2 });
    expect(menuKey("ArrowDown", 0, labels)).toEqual({ focus: 1 });
    expect(menuKey("Home", 2, labels)).toEqual({ focus: 0 });
    expect(menuKey("End", 0, labels)).toEqual({ focus: 2 });
  });
  it("closes with Escape back to the button, and with Tab moving on", () => {
    expect(menuKey("Escape", 1, labels)).toEqual({ close: "button" });
    expect(menuKey("Tab", 1, labels)).toEqual({ close: "away" });
  });
  it("jumps to the next item starting with a typed letter, ignoring case and other keys", () => {
    expect(menuKey("f", 0, labels)).toEqual({ focus: 2 });
    expect(menuKey("S", 2, labels)).toEqual({ focus: 1 });
    expect(menuKey("z", 0, labels)).toBeNull();
    expect(menuKey("Enter", 0, labels)).toBeNull();
    expect(menuKey(" ", 0, labels)).toBeNull();
  });
});

// Kit §3 components 13 and 20: the combobox field (WAI editable combobox with a listbox).
describe("the combobox", () => {
  const closed = { active: -1, expanded: false }, open = { active: -1, expanded: true };
  it("opens on ↓ at the first result and on ↑ at the last, and wraps round", () => {
    expect(comboboxKey("ArrowDown", closed, 3, true)).toEqual({ state: { active: 0, expanded: true } });
    expect(comboboxKey("ArrowUp", closed, 3, true)).toEqual({ state: { active: 2, expanded: true } });
    expect(comboboxKey("ArrowDown", { active: 2, expanded: true }, 3, true)).toEqual({ state: { active: 0, expanded: true } });
    expect(comboboxKey("ArrowUp", { active: 0, expanded: true }, 3, true)).toEqual({ state: { active: 2, expanded: true } });
    expect(comboboxKey("ArrowDown", closed, 0, true)).toBeNull();
  });
  it("picks the active result on Enter, else the first, as the site's search does", () => {
    expect(comboboxKey("Enter", { active: 1, expanded: true }, 3, true)).toEqual({ pick: 1 });
    expect(comboboxKey("Enter", open, 3, true)).toEqual({ pick: 0 });
    expect(comboboxKey("Enter", closed, 3, true)).toBeNull(); // a collapsed list picks nothing
    expect(comboboxKey("Enter", closed, 3, true, true)).toEqual({ pick: 0 }); // the list in a window is always drawn
    expect(comboboxKey("Enter", open, 0, true)).toBeNull();
  });
  it("uses Escape in steps: leave the list, empty the field, then let the window close", () => {
    expect(comboboxKey("Escape", { active: 1, expanded: true }, 3, true)).toEqual({ state: { active: -1, expanded: false } });
    expect(comboboxKey("Escape", closed, 3, true)).toEqual({ clear: true });
    expect(comboboxKey("Escape", closed, 3, false)).toBeNull();
    // In a window the list stays drawn: Escape first drops the active result.
    expect(comboboxKey("Escape", { active: 1, expanded: true }, 3, true, true)).toEqual({ state: { active: -1, expanded: true } });
    expect(comboboxKey("Escape", open, 3, true, true)).toEqual({ clear: true });
    expect(comboboxKey("Escape", open, 3, false, true)).toBeNull();
  });
  it("leaves Home, End, Tab and letters to the field", () => {
    for (const key of ["Home", "End", "Tab", "a", " "]) expect(comboboxKey(key, { active: 1, expanded: true }, 3, true)).toBeNull();
  });
  it("never picks from the previous text's results while the new search is due or loading", () => {
    // "cluj" found 3; "buzău" is typed and Enter comes before its results: wait, then pick the first fresh one.
    expect(comboboxKey("Enter", open, 3, true, true, true)).toEqual({ wait: true });
    expect(comboboxKey("Enter", { active: 1, expanded: true }, 3, true, false, true)).toEqual({ wait: true });
    expect(comboboxKey("ArrowDown", open, 3, true, true, true)).toBeNull(); // the old list is not walked
    expect(comboboxKey("ArrowUp", open, 3, true, true, true)).toBeNull();
    expect(comboboxKey("Escape", open, 3, true, true, true)).toEqual({ clear: true }); // Escape still works
    expect(comboboxKey("Enter", open, 3, true, true, false)).toEqual({ pick: 0 });
  });
});

describe("the debounced search callback", () => {
  afterEach(() => { vi.useRealTimers(); });
  it("sends only the last text of a burst, after the pause", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const search = debounce(fn, 200);
    search.call("v"); search.call("vâ"); search.call("vân");
    vi.advanceTimersByTime(199);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith("vân");
    search.call("cluj");
    search.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledOnce();
  });
});

// Kit §3 component 10: adjoining bands are always one run.
describe("the adjoining bands", () => {
  const none = [false, false, false, false, false];
  const run = (pressed: boolean[]) => pressed.map((on, index) => on ? index : -1).filter(index => index >= 0);
  it("chooses one band, then extends the run and says which bands came with it", () => {
    const one = toggleBand(none, 1);
    expect(run(one.pressed)).toEqual([1]);
    const far = toggleBand(one.pressed, 3);
    expect(run(far.pressed)).toEqual([1, 2, 3]);
    expect(far.added).toEqual([2]);
    expect(toggleBand(far.pressed, 0).added).toEqual([]);
  });
  it("drops an end of the run, or the whole run when it is one band", () => {
    const three = [false, true, true, true, false];
    expect(run(toggleBand(three, 1).pressed)).toEqual([2, 3]);
    expect(run(toggleBand(three, 3).pressed)).toEqual([1, 2]);
    expect(run(toggleBand([false, true, false, false, false], 1).pressed)).toEqual([]);
  });
  it("drops a band inside the run with the bands toward the nearer end (the upper side on a tie)", () => {
    const all = [true, true, true, true, true];
    const inner = toggleBand(all, 1);
    expect(run(inner.pressed)).toEqual([2, 3, 4]);
    expect(inner.removed).toEqual([0]);
    const tie = toggleBand(all, 2);
    expect(run(tie.pressed)).toEqual([0, 1]);
    expect(tie.removed).toEqual([3, 4]);
  });
  it("joins a broken run from an old link into one, and ignores an index out of range", () => {
    const broken = [true, false, false, true, false];
    expect(run(toggleBand(broken, 4).pressed)).toEqual([0, 1, 2, 3, 4]);
    expect(toggleBand(broken, 9).pressed).toEqual(broken);
  });
});

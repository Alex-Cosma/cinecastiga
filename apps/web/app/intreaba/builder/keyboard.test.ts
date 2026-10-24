import { describe, expect, it, vi } from "vitest";
import type { KeyboardEvent } from "react";
import { popoverPlacement, rovingKeyDown, rovingStop, rovingTarget } from "./keyboard";

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
});

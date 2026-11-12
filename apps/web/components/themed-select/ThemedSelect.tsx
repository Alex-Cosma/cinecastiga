"use client";

import { useEffect } from "react";
import type { ListItem } from "@/lib/themed-list";
import { closeThemedList, openThemedList, themedListAnchor } from "./themed-list";

/**
 * Every `<select>` on the site opens the themed list instead of the browser's own (owner, 12 November 2026: all
 * dropdowns in the theme and alike). Mounted once in the root layout. The select stays what it was: its closed look,
 * its value, its form field, its React handlers. Only the list that opens is replaced, on a press, a tap or the keys
 * that would open it. A choice is written to the select and announced with the events React listens to.
 * A select marked `data-native`, a multiple one, a disabled or inert one is left alone.
 */
const eligible = (target: EventTarget | null): HTMLSelectElement | null =>
  target instanceof HTMLSelectElement && !target.multiple && target.size <= 1 && !target.disabled
    && target.dataset.native === undefined && !target.closest("[inert]") ? target : null;

function itemsOf(select: HTMLSelectElement): ListItem[] {
  const items: ListItem[] = [];
  const add = (option: HTMLOptionElement, group?: string, off = false) => {
    if (option.hidden) return;
    items.push({ value: option.value, label: option.label || option.text, ...(option.disabled || off ? { disabled: true } : {}), ...(group !== undefined ? { group } : {}) });
  };
  for (const child of select.children) {
    if (child instanceof HTMLOptionElement) add(child);
    else if (child instanceof HTMLOptGroupElement) {
      let first = true;
      for (const option of child.children) if (option instanceof HTMLOptionElement) { add(option, first ? child.label : undefined, child.disabled); first = false; }
    }
  }
  return items;
}

/** The select's name for the list: its aria-label, else its label's words without the options a wrapping label holds. */
function labelOf(select: HTMLSelectElement): string {
  const named = select.getAttribute("aria-label");
  if (named) return named;
  const label = select.labels?.[0]?.cloneNode(true);
  if (!(label instanceof HTMLElement)) return "";
  label.querySelectorAll("select").forEach((inner) => inner.remove());
  return (label.textContent ?? "").replace(/\s+/g, " ").trim();
}

function pick(select: HTMLSelectElement, value: string) {
  if (select.value === value) return;
  // React keeps its own setter on controlled fields; the prototype's writes the value React then reads from the event.
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function toggle(select: HTMLSelectElement, returnFocus: boolean) {
  if (themedListAnchor() === select) { closeThemedList(); return; }
  openThemedList({ anchor: select, items: itemsOf(select), value: select.value, label: labelOf(select), returnFocus, onPick: (value) => pick(select, value) });
}

export default function ThemedSelect() {
  useEffect(() => {
    let touch: { x: number; y: number } | null = null;
    const onMouseDown = (event: MouseEvent) => {
      const select = eligible(event.target);
      if (!select || event.button !== 0) return;
      event.preventDefault();
      toggle(select, true);
    };
    const onTouchStart = (event: TouchEvent) => {
      const point = event.touches[0];
      touch = eligible(event.target) && point ? { x: point.clientX, y: point.clientY } : null;
    };
    const onTouchEnd = (event: TouchEvent) => {
      const select = eligible(event.target), point = event.changedTouches[0], start = touch;
      touch = null;
      // A finger that moved was scrolling the page, not choosing.
      if (!select || !point || !start || Math.hypot(point.clientX - start.x, point.clientY - start.y) > 10) return;
      event.preventDefault();
      toggle(select, false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const select = eligible(event.target);
      if (!select || event.ctrlKey || event.metaKey) return;
      if (event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "F4") { event.preventDefault(); toggle(select, true); }
    };
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchend", onTouchEnd, { capture: true, passive: false });
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      closeThemedList();
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);
  return null;
}

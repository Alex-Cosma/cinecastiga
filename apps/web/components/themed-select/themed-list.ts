import { clampLeft, placeVertical, stepEnabled, typeaheadIndex, type ListItem } from "@/lib/themed-list";

/**
 * The site's one dropdown list, drawn in the theme (owner, 12 November 2026). One list is open at a time. It is a
 * listbox that takes the focus while open: arrows, Home, End and typed letters move, Enter or Space chooses, Escape,
 * Tab, a press outside, a scroll of the page or a resize closes it. It is added to the open modal dialog the control
 * sits in, else to <body>, so a dialog's top layer does not cover it.
 */
export type ThemedListOptions = {
  /** The control the list belongs to; an inline one that wraps is followed at its last line. */
  anchor: Element;
  items: readonly ListItem[];
  value: string;
  /** The accessible name of the list. */
  label: string;
  onPick(value: string): void;
  /** Whether the focus goes back to the control when the list closes (not after a touch: a phone would open its own picker). */
  returnFocus?: boolean;
};

const WANTED_HEIGHT = 336;
let closeOpen: ((refocus: boolean) => void) | null = null;
let openAnchor: Element | null = null;

export function themedListAnchor(): Element | null { return openAnchor; }
export function closeThemedList(): void { closeOpen?.(false); }

export function openThemedList({ anchor, items, value, label, onPick, returnFocus = true }: ThemedListOptions): void {
  closeOpen?.(false);
  const host: HTMLElement = anchor.closest<HTMLElement>("dialog[open]") ?? document.body;
  const panel = document.createElement("div");
  panel.className = "tl";
  panel.setAttribute("role", "listbox");
  panel.tabIndex = -1;
  if (label) panel.setAttribute("aria-label", label);
  const rows: HTMLElement[] = [];
  items.forEach((item, i) => {
    if (item.group !== undefined) {
      const heading = document.createElement("div");
      heading.className = "tl-group";
      heading.setAttribute("role", "presentation");
      heading.textContent = item.group;
      panel.append(heading);
    }
    const row = document.createElement("div");
    row.className = "tl-opt";
    row.id = `tl-opt-${i}`;
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", String(item.value === value));
    if (item.disabled) row.setAttribute("aria-disabled", "true");
    if (item.value === "") row.dataset.empty = "";
    row.dataset.i = String(i);
    row.textContent = item.label;
    rows.push(row);
    panel.append(row);
  });

  const rects = anchor.getClientRects(), rect = rects[rects.length - 1] ?? anchor.getBoundingClientRect();
  const place = placeVertical(rect.top, rect.bottom, innerHeight, WANTED_HEIGHT);
  panel.dataset.side = place.side;
  panel.style.maxHeight = `${place.maxHeight}px`;
  panel.style.minWidth = `${Math.min(Math.max(Math.round(rect.width), 200), innerWidth - 16)}px`;
  if (place.side === "below") panel.style.top = `${Math.round(place.top)}px`; else panel.style.bottom = `${Math.round(place.bottom)}px`;
  panel.style.left = "0px";
  host.append(panel);
  panel.style.left = `${Math.round(clampLeft(rect.left, panel.getBoundingClientRect().width, innerWidth))}px`;

  let active = -1;
  const activate = (i: number, scroll: ScrollLogicalPosition | null) => {
    if (i < 0 || i >= rows.length || items[i]!.disabled) return;
    if (active >= 0) delete rows[active]!.dataset.active;
    active = i;
    rows[i]!.dataset.active = "";
    panel.setAttribute("aria-activedescendant", rows[i]!.id);
    if (scroll) rows[i]!.scrollIntoView({ block: scroll });
  };
  const selected = items.findIndex((item) => item.value === value && !item.disabled);
  activate(selected >= 0 ? selected : stepEnabled(items, -1, 1), "center");

  let typed = "", typedAt = 0;
  const choose = (i: number) => {
    const item = items[i];
    if (!item || item.disabled) return;
    close(returnFocus);
    onPick(item.value);
  };
  const onKey = (event: KeyboardEvent) => {
    const { key } = event;
    if (key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (key === "Tab") { close(true); return; }
    if (key === "Enter" || (key === " " && !typed)) { event.preventDefault(); if (active >= 0) choose(active); else close(true); return; }
    if (key === "ArrowDown" || key === "ArrowUp") { event.preventDefault(); activate(stepEnabled(items, active, key === "ArrowDown" ? 1 : -1), "nearest"); return; }
    if (key === "Home" || key === "PageUp") { event.preventDefault(); activate(stepEnabled(items, -1, 1), "nearest"); return; }
    if (key === "End" || key === "PageDown") { event.preventDefault(); activate(stepEnabled(items, items.length, -1), "nearest"); return; }
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      typed = now - typedAt > 700 ? key : typed + key;
      typedAt = now;
      // One letter typed again walks the rows that start with it; more letters narrow from the row we are on.
      const i = typeaheadIndex(items, typed, typed.length === 1 ? active : active - 1);
      if (i >= 0) activate(i, "nearest");
    }
  };
  const rowOf = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>(".tl-opt") : null);
  const onClick = (event: MouseEvent) => { const row = rowOf(event.target); if (row) choose(Number(row.dataset.i)); };
  const onMove = (event: PointerEvent) => { const row = rowOf(event.target); if (row && event.pointerType !== "touch") activate(Number(row.dataset.i), null); };
  const onOutside = (event: Event) => { if (!(event.target instanceof Node) || (!panel.contains(event.target) && !anchor.contains(event.target))) close(false); };
  const onScroll = (event: Event) => { if (!(event.target instanceof Node) || !panel.contains(event.target)) close(false); };
  const onResize = () => close(false);
  const onFocusOut = (event: FocusEvent) => { if (!(event.relatedTarget instanceof Node) || !panel.contains(event.relatedTarget)) close(false); };

  function close(refocus: boolean) {
    if (closeOpen !== close) return;
    closeOpen = null;
    openAnchor = null;
    document.removeEventListener("pointerdown", onOutside, true);
    document.removeEventListener("scroll", onScroll, true);
    removeEventListener("resize", onResize);
    panel.removeEventListener("focusout", onFocusOut);
    panel.remove();
    anchor.removeAttribute("data-list-open");
    if (refocus && anchor instanceof HTMLElement) anchor.focus({ preventScroll: true });
  }

  panel.addEventListener("keydown", onKey);
  panel.addEventListener("click", onClick);
  panel.addEventListener("pointermove", onMove);
  panel.addEventListener("focusout", onFocusOut);
  document.addEventListener("pointerdown", onOutside, true);
  document.addEventListener("scroll", onScroll, true);
  addEventListener("resize", onResize);
  anchor.setAttribute("data-list-open", "");
  closeOpen = close;
  openAnchor = anchor;
  panel.focus({ preventScroll: true });
}

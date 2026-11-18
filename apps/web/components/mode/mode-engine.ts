import { DEFAULT_VIEW_MODE, VIEW_MODE_EVENT, VIEW_MODE_KEY, parseViewMode, type ViewMode } from "../../lib/view-mode";

/**
 * Switching between Esențial and Complet (lib/view-mode.ts). The switch is one view transition of the document: what
 * leaves fades out where it stood, what stays glides to its new place and size, what returns fades in once the rest has
 * made room (mode.css). The block the reader was looking at keeps its place on the screen. Nothing about a page has to
 * be declared for this: the page is measured in both modes, and whatever appears, disappears, moves or changes size
 * near the screen takes part. Reduced motion, a browser without view transitions, or too many things moving: at once.
 */
const NEAR = 1.3;
const MAX_NAMED = 140;

export function currentViewMode(): ViewMode {
  return parseViewMode(document.documentElement.dataset.mode) ?? DEFAULT_VIEW_MODE;
}
/** The reader's own choice, or null while they have not made one. */
export function storedViewMode(): ViewMode | null {
  try { return parseViewMode(localStorage.getItem(VIEW_MODE_KEY)); } catch { return null; }
}

type Box = { x: number; y: number; w: number; h: number } | null;
const box = (element: Element): Box => {
  const r = element.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
};
const close = (a: number, b: number) => Math.abs(a - b) < 0.75;

export function setViewMode(next: ViewMode, { animate = true, remember = true }: { animate?: boolean; remember?: boolean } = {}): void {
  const root = document.documentElement;
  const from = currentViewMode();
  const store = () => {
    if (remember) try { localStorage.setItem(VIEW_MODE_KEY, next); } catch { /* the mark on <html> still holds for this page */ }
    window.dispatchEvent(new CustomEvent(VIEW_MODE_EVENT, { detail: next }));
  };
  if (from === next) { root.dataset.mode = next; store(); return; }

  const main = document.querySelector("main");
  const headerBottom = document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0;
  // Both pictures of the page, measured without painting either: every element's box now and in the other mode.
  const elements = main ? Array.from(main.querySelectorAll<HTMLElement>("*")).filter((e) => !(e instanceof SVGElement) && e.tagName !== "SCRIPT" && e.tagName !== "STYLE") : [];
  const before = elements.map(box);
  root.dataset.mode = next;
  const after = elements.map(box);
  root.dataset.mode = from;
  // The first block under the header that exists in both modes keeps its place: the page is scrolled by what moved it.
  let shift = 0;
  if (window.scrollY > 0) {
    const i = elements.findIndex((e, k) => before[k] != null && after[k] != null && before[k]!.y >= headerBottom && /^(H[1-4]|SECTION|TABLE|FIGURE|ARTICLE|LI|TR|P)$/.test(e.tagName));
    if (i >= 0) shift = after[i]!.y - before[i]!.y;
  }
  const swap = () => {
    root.dataset.mode = next;
    if (shift) window.scrollBy(0, shift);
    store();
  };
  const start = (document as Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } }).startViewTransition;
  if (!animate || !start || !main || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { swap(); return; }

  // What takes part: top-down, an element that appears or disappears, or that moves as a whole; inside an element that
  // changes size, its children are looked at too. Only near the screen, where it is seen.
  const index = new Map<Element, number>(elements.map((e, k) => [e, k]));
  const vh = window.innerHeight, named: HTMLElement[] = [];
  const near = (b: Box, dy = 0) => b !== null && b.y + dy + b.h > -vh * (NEAR - 1) && b.y + dy < vh * NEAR;
  const visit = (element: HTMLElement) => {
    const k = index.get(element);
    if (k === undefined) return;
    const a = before[k] ?? null, b = after[k] ?? null;
    if (a === null && b === null) return;
    if (a === null || b === null) { if (near(a) || near(b, -shift)) named.push(element); return; }
    const moved = !close(a.x, b.x) || !close(a.y, b.y - shift), resized = !close(a.w, b.w) || !close(a.h, b.h);
    if (!near(a) && !near(b, -shift)) return;
    if (moved && !resized) { named.push(element); return; }
    if (resized && Math.max(a.h, b.h) <= vh * 1.2) named.push(element);
    for (const child of Array.from(element.children)) visit(child as HTMLElement);
  };
  for (const child of Array.from(main.children)) visit(child as HTMLElement);
  const use = named.length <= MAX_NAMED ? named : [];
  const names = use.map((element) => element.style.viewTransitionName);
  use.forEach((element, k) => { element.style.viewTransitionName = `mode-${k}`; });
  root.dataset.vt = "mode";
  start.call(document, swap).finished.finally(() => {
    use.forEach((element, k) => { if (names[k]) element.style.viewTransitionName = names[k]!; else element.style.removeProperty("view-transition-name"); });
    if (root.dataset.vt === "mode") delete root.dataset.vt;
  });
}

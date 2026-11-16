/*
 * The current tab's mark slides from the tab you left to the one you chose (UX audit M-07): the segmented controls of
 * Întreabă (Vizual / Tabel and the others), an entity's role (Cumpără / Vinde) and a case page's patterns. Their fill
 * is drawn by `::before` (transform only, --med, --ease); when the current option changes in place (the same elements,
 * another one marked), the new option's fill starts on the old one's box and travels to its own, and the new option's
 * words change colour over the same time. A tab drawn anew (another page) takes its mark at once; so does reduced motion.
 */

/** The tab families whose fill slides, and the group each belongs to. */
export const SLIDE_ITEMS = ".qb-seg-opt, .ehead-roles a, .sgc-tab";
const GROUPS = ".qb-seg, .ehead-roles, .sgc-tabs";
const MARKS = ["aria-current", "aria-checked", "aria-selected"] as const;

/** Whether a mark attribute's value means "this one" (absent and "false" do not). */
export const marked = (value: string | null): boolean => value !== null && value !== "false";

/** The transform that puts box `to` on box `from` (both relative to the viewport), from its top-left corner. */
export function fromBox(from: { left: number; top: number; width: number; height: number }, to: { left: number; top: number; width: number; height: number }): string {
  const sx = to.width ? from.width / to.width : 1, sy = to.height ? from.height / to.height : 1;
  return `translate(${Math.round(from.left - to.left)}px, ${Math.round(from.top - to.top)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
}

/** A CSS time ("260ms", ".26s") in milliseconds; anything else is `fallback`. */
export function cssMs(raw: string, fallback: number): number {
  const text = raw.trim(), value = Number.parseFloat(text);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return text.endsWith("ms") ? value : text.endsWith("s") ? value * 1000 : fallback;
}
const ms = (token: string, fallback: number) => cssMs(getComputedStyle(document.documentElement).getPropertyValue(token), fallback);

function slide(from: Element, to: Element) {
  // Before anything reads the layout: the colour change of the new option's words is a transition (.slide-to).
  to.classList.add("slide-to");
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const done = () => to.classList.remove("slide-to");
  if (!a.width || !b.width) { done(); return; }
  const ease = getComputedStyle(document.documentElement).getPropertyValue("--ease").trim() || "ease-out";
  const anim = to.animate([{ transform: fromBox(a, b) }, { transform: "none" }], { duration: ms("--med", 260), easing: ease, pseudoElement: "::before" });
  anim.onfinish = done; anim.oncancel = done;
}

/** Watches the document for a tab's mark moving within its group; returns the stop. */
export function watchSlides(root: Node): () => void {
  const observer = new MutationObserver((records) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const groups = new Map<Element, { from?: Element; to?: Element }>();
    for (const record of records) {
      const el = record.target;
      if (!(el instanceof Element) || !el.matches(SLIDE_ITEMS)) continue;
      const group = el.closest(GROUPS);
      if (!group) continue;
      const was = marked(record.oldValue), now = marked(el.getAttribute(record.attributeName!));
      if (was === now) continue;
      const entry = groups.get(group) ?? {};
      if (now) entry.to = el; else entry.from = el;
      groups.set(group, entry);
    }
    for (const { from, to } of groups.values()) if (from && to && from !== to) slide(from, to);
  });
  observer.observe(root, { subtree: true, attributes: true, attributeFilter: [...MARKS], attributeOldValue: true });
  return () => observer.disconnect();
}

/**
 * How a scroll the page starts itself moves (UX audit M-19): smoothly, unless the reader asked for reduced motion,
 * then at once. `behavior: "smooth"` does not read that preference by itself.
 */
export function scrollMotion(): ScrollBehavior {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

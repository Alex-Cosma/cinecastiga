/**
 * The site's chart pace (`--chart-pace` in components/motion/chart-motion.css, owner, 7 November 2026): 1 is the
 * motion of 6 November, 1.5 takes half as long again. Motion written in JS (the /harta camera, the radiography's zoom,
 * the end of an Ask map's fill) multiplies its durations by it, like the CSS does.
 */
export function chartPace(): number {
  if (typeof window === "undefined") return 1;
  return parsePace(getComputedStyle(document.documentElement).getPropertyValue("--chart-pace"));
}

/** A pace read from CSS; anything that is not a positive number is 1 (the motion as designed). */
export function parsePace(raw: string): number {
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

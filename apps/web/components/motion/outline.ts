/*
 * The outline family (UX audit, motion pass, 16 November 2026; owner: „Da” to every item). One thin line that closes
 * when something is ready: an explanation that waits for a resting mouse (M-01), a selection (M-03), the element a
 * link or an action landed on (M-09), a save at work (M-08), the line under a question at work (M-15). Never two at
 * once: an arrival cancels any other running outline. Not used on the small „?”, on keyboard focus, on chart hover,
 * on buttons one wants to press, on calls to action, on text links or cards, and never as a loop without an end.
 *
 * Durations shared by the site are tokens in globals.css (--fast, --med, --slow, --hold, --ease, --ease-exit,
 * --ease-hold); the gesture-specific timings fixed by the audit's spec live here, once, and in outline.css.
 */

/** The audit's timings (ms) that are not site tokens. */
export const OUTLINE_MS = {
  /** M-09: the arrival outline draws, stays, then fades. */
  arriveDraw: 600, arriveStay: 900, arriveFade: 400,
  /** M-09 with reduced motion: whole at once, then the same stay and fade. */
  arriveStill: 1300,
  /** M-08: a save shows its turning piece only after this wait (a fast save shows nothing), one turn takes `turn`. */
  progressDelay: 300, turn: 1200, close: 220, fade: 300, label: 1600,
  /** M-03: a selection without a camera (a dot in a cloud, a row) draws in this long. */
  pick: 300,
} as const;

/** The site's cubic-bezier curves (globals.css), for motion written with the Web Animations API. */
export const EASE = "cubic-bezier(.2,.7,.2,1)";
export const EASE_EXIT = "cubic-bezier(.4,0,1,1)";
export const EASE_HOLD = "cubic-bezier(.45,0,.55,1)";
/** The /harta camera's curve (ease-out cubic): a selection drawn while the camera moves follows it. */
export const EASE_CAMERA = "cubic-bezier(.33,1,.68,1)";

export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A time token from CSS (`--hold: 1000ms`), in ms; the fallback when it is missing or not a time. */
export function cssMs(name: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  return parseMs(getComputedStyle(document.documentElement).getPropertyValue(name), fallback);
}

/** „1000ms”, „1s”, „.2s” → ms; anything else → the fallback. */
export function parseMs(raw: string, fallback: number): number {
  const value = raw.trim();
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  if (value.endsWith("ms")) return n;
  if (value.endsWith("s")) return n * 1000;
  return fallback;
}

const num = (v: number) => Number(v.toFixed(2));

/**
 * The four quarters of a box's outline, each from the middle of the top or bottom edge to the middle of a side, on a
 * line `inset` px inside a `width` × `height` box (half a pixel: the centre of a 1 px border): top right, top left,
 * bottom right, bottom left. Mirror images, so they meet at the sides at the same moment.
 */
export function tracePaths(width: number, height: number, radius = 5, inset = 0.5): string[] {
  const s = inset, x0 = s, x1 = width - s, y0 = s, y1 = height - s;
  const r = Math.max(0, Math.min(radius - s, (x1 - x0) / 2, (y1 - y0) / 2));
  const cx = width / 2, cy = height / 2;
  return [
    `M${num(cx)} ${num(y0)}H${num(x1 - r)}A${num(r)} ${num(r)} 0 0 1 ${num(x1)} ${num(y0 + r)}V${num(cy)}`,
    `M${num(cx)} ${num(y0)}H${num(x0 + r)}A${num(r)} ${num(r)} 0 0 0 ${num(x0)} ${num(y0 + r)}V${num(cy)}`,
    `M${num(cx)} ${num(y1)}H${num(x1 - r)}A${num(r)} ${num(r)} 0 0 0 ${num(x1)} ${num(y1 - r)}V${num(cy)}`,
    `M${num(cx)} ${num(y1)}H${num(x0 + r)}A${num(r)} ${num(r)} 0 0 1 ${num(x0)} ${num(y1 - r)}V${num(cy)}`,
  ];
}

/** One closed outline, clockwise from the middle of the top edge (for a piece that turns round a button, M-08). */
export function perimeterPath(width: number, height: number, radius: number, inset = 0.75): string {
  const s = inset, x0 = s, x1 = width - s, y0 = s, y1 = height - s;
  const r = Math.max(0, Math.min(radius - s, (x1 - x0) / 2, (y1 - y0) / 2));
  const cx = width / 2;
  return `M${num(cx)} ${num(y0)}H${num(x1 - r)}A${num(r)} ${num(r)} 0 0 1 ${num(x1)} ${num(y0 + r)}V${num(y1 - r)}A${num(r)} ${num(r)} 0 0 1 ${num(x1 - r)} ${num(y1)}H${num(x0 + r)}A${num(r)} ${num(r)} 0 0 1 ${num(x0)} ${num(y1 - r)}V${num(y0 + r)}A${num(r)} ${num(r)} 0 0 1 ${num(x0 + r)} ${num(y0)}Z`;
}

/**
 * A closed path made only of absolute M/L/H/V/Z commands, restarted at its highest point (smallest y), so an outline
 * drawn from its start both ways (M-03: two copies, outline.css .mo-sel-a/.mo-sel-b) opens at the top of the area.
 * Anything else (curves, relative commands, several rings) comes back unchanged and opens where it starts.
 */
export function startAtTop(d: string): string {
  if (!/^\s*M/.test(d) || /[a-y]|[ACQSTacqst]/.test(d.replace(/[eE][-+]?\d/g, ""))) return d;
  const rings = d.split(/(?=M)/).filter((ring) => ring.trim());
  if (rings.length !== 1) return d;
  const tokens = d.match(/[MLHVZ]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g);
  if (!tokens) return d;
  const points: [number, number][] = [];
  let cmd = "", x = 0, y = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] ?? "";
    if (/[MLHVZ]/.test(t)) { cmd = t; if (cmd === "Z") break; continue; }
    if (cmd === "M" || cmd === "L") { x = Number(t); y = Number(tokens[++i]); points.push([x, y]); if (cmd === "M") cmd = "L"; }
    else if (cmd === "H") { x = Number(t); points.push([x, y]); }
    else if (cmd === "V") { y = Number(t); points.push([x, y]); }
    else return d;
  }
  const first = points[0], last = points[points.length - 1];
  if (!first || !last || points.length < 3 || points.some(([px, py]) => !Number.isFinite(px) || !Number.isFinite(py))) return d;
  if (last[0] === first[0] && last[1] === first[1]) points.pop();
  let top = 0, topY = first[1];
  points.forEach(([, py], i) => { if (py < topY) { top = i; topY = py; } });
  if (top === 0) return d;
  const ring = points.slice(top).concat(points.slice(0, top));
  return `M${ring.map(([px, py]) => `${num(px)} ${num(py)}`).join("L")}Z`;
}

/* ------------------------------------------------------------------------------------------------------------------
 * Arrival (M-09): the element a link or an action landed on draws its outline once, after the scroll has stopped,
 * stays a moment and fades. Only when something chose that element; never on an ordinary load.
 * ------------------------------------------------------------------------------------------------------------------ */

type Running = { cancel: () => void };
let running: Running | null = null;

/** Ends the outline that is drawing now, if any (a new arrival, a new selection). */
export function cancelOutline(): void {
  const was = running;
  running = null;
  was?.cancel();
}

const VOID = /^(INPUT|TEXTAREA|SELECT|IMG|BR|HR|SVG|TR|TD|TH|THEAD|TBODY|TFOOT|TABLE|COL|COLGROUP|OPTION|path|circle|g|rect|polygon)$/i;
const NS = "http://www.w3.org/2000/svg";

/** Waits until the window and every scrolling box round `el` have not moved for three frames (or 1.6 s). */
function whenStill(el: Element, then: () => void): () => void {
  const boxes: (Element | Window)[] = [window];
  for (let p = el.parentElement; p; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && p.scrollHeight > p.clientHeight) boxes.push(p);
  }
  const at = () => boxes.map((b) => (b instanceof Window ? `${b.scrollX},${b.scrollY}` : `${b.scrollLeft},${b.scrollTop}`)).join("|");
  // Two frames' grace: a smooth scroll asked for in the same frame has not moved yet.
  let last = at(), still = -2, frame = 0;
  const start = performance.now();
  const tick = () => {
    const now = at();
    still = now === last ? still + 1 : 0;
    last = now;
    if (still >= 3 || performance.now() - start > 1600) then();
    else frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

/**
 * Draws the arrival outline round `target` (M-09): 600 ms with the holding curve, stays 900 ms, fades in 400 ms. With
 * reduced motion it is whole at once and fades. It waits for any scroll to stop first. An element that cannot hold an
 * SVG (a field, a table row) is outlined at its own place, drawn in the nearest box that can.
 */
export function arrive(target: Element | null | undefined, { stroke = "var(--accent)", width = 2 }: { stroke?: string; width?: number } = {}): void {
  if (typeof window === "undefined" || !target || !(target instanceof HTMLElement || target instanceof SVGElement)) return;
  cancelOutline();
  // A title is outlined round its words, not across the whole width of its block.
  const words = target instanceof HTMLElement && /^H[1-4]$/.test(target.tagName);
  const own = target instanceof HTMLElement && !VOID.test(target.tagName) && !words;
  let host: Element = target;
  while (host.parentElement && (!(host instanceof HTMLElement) || VOID.test(host.tagName))) host = host.parentElement;
  if (!(host instanceof HTMLElement)) return;
  const box = host;
  const reduced = prefersReducedMotion();
  let svg: SVGSVGElement | null = null, restore = "", anims: Animation[] = [], done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    anims.forEach((a) => a.cancel());
    svg?.remove();
    if (restore !== "") box.style.position = restore === "-" ? "" : restore;
  };
  const stopWaiting = whenStill(target, () => {
    if (done || !box.isConnected || !target.isConnected) return cleanup();
    const cs = getComputedStyle(box), ts = getComputedStyle(target);
    if (cs.position === "static") { restore = box.style.position || "-"; box.style.position = "relative"; }
    let w: number, h: number, top: number, left: number, radius: number, inset: number;
    if (own) {
      // Over its own border; inside it when the box clips what overflows it.
      const clipped = cs.overflow !== "" && !/visible/.test(cs.overflow);
      const bl = parseFloat(cs.borderLeftWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0;
      w = clipped ? box.clientWidth : box.offsetWidth; h = clipped ? box.clientHeight : box.offsetHeight;
      top = clipped ? 0 : -bt; left = clipped ? 0 : -bl;
      radius = Math.max(0, (parseFloat(cs.borderTopLeftRadius) || 0) - (clipped ? bl : 0));
      inset = clipped ? width / 2 : Math.max(width / 2, bt / 2);
    } else {
      // At the target's place in the box that holds the outline (a title: round its words, a little apart).
      let r = target.getBoundingClientRect();
      if (words) {
        const range = document.createRange();
        range.selectNodeContents(target);
        const t = range.getBoundingClientRect();
        if (t.width && t.height) r = new DOMRect(t.left - 6, t.top - 3, Math.min(t.width + 12, r.right - t.left + 6), t.height + 6);
      }
      const b = box.getBoundingClientRect();
      w = r.width; h = r.height;
      top = r.top - b.top - box.clientTop + box.scrollTop; left = r.left - b.left - box.clientLeft + box.scrollLeft;
      radius = words ? 6 : parseFloat(ts.borderTopLeftRadius) || 0; inset = width / 2;
    }
    if (!w || !h) return cleanup();
    svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "mo-arrive");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h));
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.style.cssText = `top:${top}px;left:${left}px;color:${stroke}`;
    for (const d of tracePaths(w, h, radius, inset)) {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", d);
      p.setAttribute("pathLength", "1");
      p.setAttribute("stroke-width", String(width));
      svg.appendChild(p);
    }
    box.appendChild(svg);
    const paths = Array.from(svg.querySelectorAll("path"));
    const total = reduced ? OUTLINE_MS.arriveStill : OUTLINE_MS.arriveDraw + OUTLINE_MS.arriveStay + OUTLINE_MS.arriveFade;
    const hold = (total - OUTLINE_MS.arriveFade) / total;
    if (!reduced) anims = paths.map((p) => p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: OUTLINE_MS.arriveDraw, easing: EASE_HOLD, fill: "forwards" }));
    else paths.forEach((p) => p.style.setProperty("stroke-dashoffset", "0"));
    const fade = svg.animate([{ opacity: 1 }, { opacity: 1, offset: hold }, { opacity: 0 }], { duration: total, easing: "linear", fill: "forwards" });
    anims.push(fade);
    fade.onfinish = () => { if (running === me) running = null; cleanup(); };
  });
  const me: Running = { cancel: () => { stopWaiting(); cleanup(); } };
  running = me;
}

/**
 * Scrolls `el` into view (smoothly unless the reader asked for less motion) and draws its arrival outline when the
 * scroll stops (M-09). `block` as in scrollIntoView.
 */
export function scrollToArrive(el: Element | null | undefined, { block = "start" as ScrollLogicalPosition, focus = false, outline = el } : { block?: ScrollLogicalPosition; focus?: boolean; outline?: Element | null } = {}): void {
  if (!el) return;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block });
  if (focus && el instanceof HTMLElement) el.focus({ preventScroll: true });
  arrive(outline ?? el);
}

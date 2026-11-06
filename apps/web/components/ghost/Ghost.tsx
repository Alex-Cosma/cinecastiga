import type { CSSProperties, ElementType, ReactNode } from "react";

/**
 * Ghost kit (owner, 6 November 2026: "ghost data loading"). A ghost stands where content will be, in the content's
 * shape, so the page does not move when the data arrives. Rules that keep it honest:
 * - the ghost root is the REAL component's element with the real classes (its grid, paddings, borders);
 * - text is drawn with `G.Line` inside the real heading or paragraph: one line-height tall, so margins and line
 *   heights come from the real rules; known text (titles, section names, a name passed from the click) stays real;
 * - charts draw a fixed decorative profile inside the real chart's class and viewBox, never data;
 * - lines that exist only where the real text wraps more or less use `only` ("phone" / "wide" / "not-phone").
 * No hooks here: usable from loading.tsx, server and client components.
 */
export type GhostOnly = "phone" | "wide" | "not-phone";
type Wait = "client" | "suspense";

const cls = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

/** The ghost's root. `wait="client"` fades in after 120 ms (a client fetch); `"suspense"` shows at once (route or
 *  Suspense ghost, which React keeps at least 300 ms). `label` is the one status read out for this ghost: give it
 *  only to the outermost ghost of a page or panel. */
export function Ghost({ as: Tag = "div", className, name, label, wait, style, children, id }: {
  as?: ElementType; className?: string | undefined; name: string; label?: string | undefined; wait: Wait;
  style?: CSSProperties | undefined; children?: ReactNode; id?: string | undefined;
}) {
  return <Tag className={className} data-ghost={wait} data-g={name} aria-busy="true" style={style} id={id}>
    {label && <span className="g-sr" role="status">{label}</span>}
    {children}
  </Tag>;
}

function Line({ w = "100%", only, inline }: { w?: string; only?: GhostOnly | undefined; inline?: boolean }) {
  return <span aria-hidden="true" className={cls("g-line", inline && "g-inline", only && `g-${only}`)} style={{ width: w }} />;
}

/** Several lines of a paragraph: widths in order; `phone` lines are added only on phones, `wide` only on wide layouts. */
function Lines({ w, phone = [], wide = [] }: { w: readonly string[]; phone?: readonly string[]; wide?: readonly string[] }) {
  return <>
    {w.map((x, i) => <Line key={`b${i}`} w={x} />)}
    {wide.map((x, i) => <Line key={`w${i}`} w={x} only="wide" />)}
    {phone.map((x, i) => <Line key={`p${i}`} w={x} only="phone" />)}
  </>;
}

function Block({ h, w, ratio, r, className, only }: { h?: string; w?: string; ratio?: string; r?: string; className?: string; only?: GhostOnly }) {
  return <span aria-hidden="true" className={cls("g-block", only && `g-${only}`, className)}
    style={{ height: h, width: w, aspectRatio: ratio, borderRadius: r }} />;
}

/** A column chart's ghost: the real chart's class and viewBox, bars of a fixed decorative profile. */
function Bars({ className, viewBox, baseline, bars, gap = 0.18 }: {
  className?: string; viewBox: string; baseline: number; bars: readonly number[]; gap?: number;
}) {
  const [, , vw] = viewBox.split(/\s+/).map(Number);
  const step = (vw ?? 0) / bars.length;
  return <svg className={className} viewBox={viewBox} aria-hidden="true">
    {bars.map((h, i) => <rect key={i} className="g-svg" x={i * step + step * gap / 2} y={baseline - h} width={step * (1 - gap)} height={h} rx="1.5" />)}
  </svg>;
}

/** `n` rows in the real row element and class; `cells(i)` draws one row. Use the list's page size. */
function Rows({ n, as: Tag = "li", className, cells }: { n: number; as?: ElementType; className?: string; cells: (i: number) => ReactNode }) {
  return <>{Array.from({ length: n }, (_, i) => <Tag key={i} className={className} aria-hidden="true">{cells(i)}</Tag>)}</>;
}

export const G = { Line, Lines, Block, Bars, Rows };

/** A decorative width for row i of a ranked list: long first rows, shorter after (not data). */
export const rankWidth = (i: number, from = 82, step = 7, min = 30) => `${Math.max(min, from - i * step)}%`;

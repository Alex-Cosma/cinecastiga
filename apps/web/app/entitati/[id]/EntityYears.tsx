"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ENTITY_YEAR_EVENT, tipLeft, yearWords, type YearsModel } from "./entity-top";

/**
 * When the turnover line's left-to-right reveal reaches `x` (0–1 of the plot's width), as a share of the reveal's
 * duration. The reveal follows the site's --ease, cubic-bezier(.2,.7,.2,1), so a dot fades in as the line passes it.
 */
function lineReach(x: number): number {
  const bx = (s: number) => 0.6 * s * (1 - s) ** 2 + 0.6 * s * s * (1 - s) + s ** 3;
  const by = (s: number) => 2.1 * s * (1 - s) ** 2 + 3 * s * s * (1 - s) + s ** 3;
  let lo = 0, hi = 1;
  for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (by(m) < x) lo = m; else hi = m; }
  return bx((lo + hi) / 2);
}

/**
 * The entity's value per year (owner, 2 November 2026): bars per channel, a firm's turnover as a dashed line, the axis
 * at 0, half and the top. The ledger beside it is its legend. Bars are HTML in percent of the plot, so the words keep
 * their size at every width; the turnover line is an SVG stretched over the same plot.
 *
 * A year leads to its records (critique of the same day: the chart was a dead end): a click or Enter filters the
 * records table to that year and scrolls to it; a tap first shows the year's tip, whose link does the same. The tip opens
 * under the plot, centred on its year, never over a bar. The years are one tab stop; the arrows, Home and End move between them.
 *
 * In motion (owner, 6 November 2026), when the chart first comes into view: each year's column grows from 0 as one
 * piece, in chronological order; then the turnover line is drawn left to right and its dots appear as it passes them.
 * The axis, the grid and the years are there from the start.
 */
export default function EntityYears({ model, title }: { model: YearsModel; title: string }) {
  const n = model.bars.length;
  const [active, setActive] = useState<number | null>(null);
  const [focusable, setFocusable] = useState(n - 1);
  const [left, setLeft] = useState(0);
  const area = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const cols = useRef<(HTMLButtonElement | null)[]>([]);
  const pointer = useRef<string>("");
  // Whether this year's tip was open when the tap began: a tap's own hover and focus open it before its click.
  const opened = useRef(false);
  const titleId = useId();
  const center = (i: number) => ((i + 0.5) / n) * 100;

  // The tip under its year, inside the plot's width.
  useLayoutEffect(() => {
    if (active === null || !area.current || !tip.current) return;
    setLeft(tipLeft(active, n, area.current.clientWidth, tip.current.offsetWidth));
  }, [active, n]);
  // A tap elsewhere or Escape closes it.
  useEffect(() => {
    if (active === null) return;
    const close = (e: Event) => { if (!area.current?.contains(e.target as Node)) setActive(null); };
    const escape = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setActive(null); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [active]);

  /** The records table filtered to the year, then shown. */
  const records = (i: number) => {
    window.dispatchEvent(new CustomEvent(ENTITY_YEAR_EVENT, { detail: String(model.bars[i]!.year) }));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("achizitii")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    setActive(null);
  };
  const move = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const to = e.key === "ArrowRight" ? Math.min(n - 1, i + 1) : e.key === "ArrowLeft" ? Math.max(0, i - 1)
      : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (to === null) return;
    e.preventDefault();
    setFocusable(to);
    cols.current[to]?.focus();
  };

  const words = active === null ? null : yearWords(model.bars[active]!);
  const line = model.bars.flatMap((b, i) => (b.turnoverPct === null ? [] : [`${center(i)},${100 - b.turnoverPct}`])).join(" ");
  return (
    <figure className="ent-years" aria-labelledby={titleId} data-chart>
      <figcaption id={titleId} className="ent-years-title">{title}</figcaption>
      {/* Leaving the whole plot (bars, years, the tip under them) closes the tip, so the mouse can reach its link. */}
      <div className="ent-years-plot" onMouseLeave={() => setActive(null)}>
        <div className="ent-years-y" aria-hidden="true">
          {model.ticks.map((t) => <span key={t.pct} style={{ bottom: `${t.pct}%` }}>{t.label}</span>)}
        </div>
        <div className="ent-years-area" ref={area}>
          {model.ticks.map((t) => <i key={t.pct} className="ent-years-grid" style={{ bottom: `${t.pct}%` }} aria-hidden="true" />)}
          <div className="ent-years-cols">
            {model.bars.map((b, i) => {
              const w = yearWords(b);
              return (
                <button
                  key={b.year}
                  ref={(el) => { cols.current[i] = el; }}
                  type="button"
                  tabIndex={i === focusable ? 0 : -1}
                  className={`ent-years-col${b.partial ? " is-partial" : ""}${active === i ? " is-active" : ""}`}
                  aria-label={`${[w.head, w.da, w.ct, w.turnover].filter(Boolean).join("; ")}. Vezi înregistrările anului.`}
                  onPointerDown={(e) => { pointer.current = e.pointerType; opened.current = active === i; }}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => { setFocusable(i); setActive(i); }}
                  onBlur={(e) => { if (!area.current?.contains(e.relatedTarget as Node | null)) setActive(null); }}
                  onKeyDown={(e) => move(e, i)}
                  onClick={() => {
                    // A tap shows the tip first (its link opens the records); a click or Enter opens them.
                    if (pointer.current === "touch" && !opened.current) setActive(i);
                    else records(i);
                    pointer.current = "";
                  }}
                >
                  <span className="ent-years-bar cm-y" style={{ "--i": i } as CSSProperties} aria-hidden="true">
                    <i className="ent-years-ct" style={{ height: `${b.ctPct}%` }} />
                    <i className="ent-years-da" style={{ height: `${b.daPct}%` }} />
                  </span>
                </button>
              );
            })}
          </div>
          {model.turnover && <>
            {/* Revealed with a clip (the line is dashed and keeps its stroke width, so a dash-offset draw would not work). */}
            <svg className="ent-years-turnover cm-draw" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={line} vectorEffect="non-scaling-stroke" />
            </svg>
            {model.bars.map((b, i) => b.turnoverPct === null ? null
              : <i key={b.year} className="ent-years-dot cm-fade" aria-hidden="true" style={{ left: `${center(i)}%`, bottom: `${b.turnoverPct}%`,
                  "--cm-d": `calc(var(--years-draw) + var(--chart-in) * ${lineReach(center(i) / 100).toFixed(3)})` } as CSSProperties} />)}
          </>}
          {words && active !== null && (
            <div ref={tip} className="ent-years-tip" style={{ left }} aria-hidden="true">
              <b>{words.head}</b>
              <span><i className="ent-sw ent-sw-da" />{words.da}</span>
              {words.ct && <span><i className="ent-sw ent-sw-ct" />{words.ct}</span>}
              {words.turnover && <span><i className="ent-sw ent-sw-turnover" />{words.turnover}</span>}
              <button type="button" tabIndex={-1} className="ent-years-tip-go" onPointerDown={(e) => e.preventDefault()} onClick={() => records(active)}>
                Vezi înregistrările din {model.bars[active]!.year} →
              </button>
            </div>
          )}
        </div>
        <div className="ent-years-x" aria-hidden="true">
          {model.bars.map((b) => (
            <span key={b.year} className={b.partial ? "is-partial" : undefined}>
              <span className="ent-years-long">{b.year}</span><span className="ent-years-short">’{String(b.year).slice(2)}</span>
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}

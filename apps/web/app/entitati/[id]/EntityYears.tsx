"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { yearWords, type YearsModel } from "./entity-top";

/**
 * The entity's value per year (owner, 2 November 2026): bars per channel, a firm's turnover as a dashed line, the axis
 * at 0, half and the top. The ledger beside it is its legend. A year's figures show over the plot on hover, focus or
 * tap and nowhere else; each year is a button whose name says its figures. Bars are HTML in percent of the plot, so
 * the words keep their size at every width; the turnover line is an SVG stretched over the same plot.
 */
export default function EntityYears({ model, title }: { model: YearsModel; title: string }) {
  const [active, setActive] = useState<number | null>(null);
  const [left, setLeft] = useState(0);
  const area = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const n = model.bars.length;
  const center = (i: number) => ((i + 0.5) / n) * 100;

  // The tip over its year, inside the plot.
  useLayoutEffect(() => {
    if (active === null || !area.current || !tip.current) return;
    const width = area.current.clientWidth, own = tip.current.offsetWidth;
    setLeft(Math.min(Math.max(0, (center(active) / 100) * width - own / 2), Math.max(0, width - own)));
  }, [active, n]);
  // A tap elsewhere or Escape closes it.
  useEffect(() => {
    if (active === null) return;
    const close = (e: Event) => { if (!area.current?.contains(e.target as Node)) setActive(null); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setActive(null); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [active]);

  const words = active === null ? null : yearWords(model.bars[active]!);
  const line = model.bars.flatMap((b, i) => (b.turnoverPct === null ? [] : [`${center(i)},${100 - b.turnoverPct}`])).join(" ");
  return (
    <figure className="ent-years" aria-labelledby={titleId}>
      <figcaption id={titleId} className="ent-years-title">{title}</figcaption>
      <div className="ent-years-plot">
        <div className="ent-years-y" aria-hidden="true">
          {model.ticks.map((t) => <span key={t.pct} style={{ bottom: `${t.pct}%` }}>{t.label}</span>)}
        </div>
        <div className="ent-years-area" ref={area} onMouseLeave={() => setActive(null)}>
          {model.ticks.map((t) => <i key={t.pct} className="ent-years-grid" style={{ bottom: `${t.pct}%` }} aria-hidden="true" />)}
          <div className="ent-years-cols">
            {model.bars.map((b, i) => {
              const w = yearWords(b);
              return (
                <button
                  key={b.year}
                  type="button"
                  className={`ent-years-col${b.partial ? " is-partial" : ""}${active === i ? " is-active" : ""}`}
                  aria-label={[w.head, w.da, w.ct, w.turnover].filter(Boolean).join("; ")}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                >
                  <span className="ent-years-bar" aria-hidden="true">
                    <i className="ent-years-ct" style={{ height: `${b.ctPct}%` }} />
                    <i className="ent-years-da" style={{ height: `${b.daPct}%` }} />
                  </span>
                </button>
              );
            })}
          </div>
          {model.turnover && <>
            <svg className="ent-years-turnover" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={line} vectorEffect="non-scaling-stroke" />
            </svg>
            {model.bars.map((b, i) => b.turnoverPct === null ? null
              : <i key={b.year} className="ent-years-dot" style={{ left: `${center(i)}%`, bottom: `${b.turnoverPct}%` }} aria-hidden="true" />)}
          </>}
          {words && (
            <div ref={tip} className="ent-years-tip" style={{ left }} aria-hidden="true">
              <b>{words.head}</b>
              <span><i className="ent-sw ent-sw-da" />{words.da}</span>
              {words.ct && <span><i className="ent-sw ent-sw-ct" />{words.ct}</span>}
              {words.turnover && <span><i className="ent-sw ent-sw-turnover" />{words.turnover}</span>}
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

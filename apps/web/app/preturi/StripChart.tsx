"use client";

import { useRef, useState } from "react";
import { AXIS_FROM, AXIS_TO, axisPos, countWord, formatLei, formatQuantity, formatRatio, formatUnitPrice, ratioWords, type StripDot } from "@/lib/unit-prices-shared";


/**
 * The strip of a product (owner, 11 November 2026: hover and click on the dots and the chart). The marks are those of
 * the list and the product page: the median and twice the median as rules, the bands, the leads as dots, the furthest
 * named. Pointing at a dot shows its lead; a click opens its lines on the product page. Pointing anywhere else on the
 * strip reads the axis there: the price, its multiple of the median and, under the product's histogram, how many
 * institutions paid about that much.
 */
export default function StripChart({ band, median, per, dots, named = 1, index = 0, bins, binFrom = AXIS_FROM, binStep = 0.1, hrefBase, focusable = false }: {
  /** The spread in multiples of the median (eight in ten, the middle half). */
  band: { r10: number; r25: number; r75: number; r90: number };
  /** One year's median price, so the ruler reads prices; null across years (each against its own year's median). */
  median: number | null;
  per: string; dots: StripDot[]; named?: number; index?: number;
  bins?: number[]; binFrom?: number; binStep?: number;
  /** The product page's address; a dot adds its institution (`deschis`) and the anchor of its row. */
  hrefBase: string;
  /** Dots reachable by Tab (the product page); on the list the opened strip's rows carry the same leads. */
  focusable?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<StripDot | null>(null);
  const [ruler, setRuler] = useState<number | null>(null);
  const peak = bins ? Math.max(1, ...bins) : 1;
  const tagged = [...dots].sort((a, b) => b.ratio - a.ratio).slice(0, named);
  const href = (d: StripDot) => `${hrefBase}${hrefBase.includes("?") ? "&" : "?"}deschis=${d.id}#institutie-${d.id}-${d.year}`;
  const keyOf = (d: StripDot) => `${d.id}-${d.year}`;

  const move = (e: React.PointerEvent) => {
    if ((e.target as Element).closest(".pr-dot")) return;
    const r = box.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    setTip(null);
    setRuler(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
  };
  const leave = () => { setRuler(null); setTip(null); };

  // The axis at the pointer: x% → multiple → price; under a histogram, the bin's institutions and its prices.
  let reading: { x: number; text: string; detail: string | null } | null = null;
  if (ruler != null && !tip) {
    const ratio = 2 ** (AXIS_FROM + (ruler / 100) * (AXIS_TO - AXIS_FROM));
    let detail: string | null = null;
    if (bins) {
      const i = Math.min(bins.length - 1, Math.max(0, Math.floor((Math.log2(ratio) - binFrom) / binStep)));
      const lo = 2 ** (binFrom + i * binStep), hi = 2 ** (binFrom + (i + 1) * binStep);
      const n = bins[i] ?? 0;
      detail = median != null ? `${n === 0 ? "nicio instituție" : countWord(n, "o instituție", "instituții")} între ${formatUnitPrice(lo * median)} și ${formatUnitPrice(hi * median)} ${per}`
        : `${n === 0 ? "nicio comparație" : countWord(n, "o comparație", "comparații")} între ${formatRatio(lo)} și ${formatRatio(hi)} mediana anului lor`;
    }
    reading = { x: ruler, text: median != null ? `${formatUnitPrice(ratio * median)} ${per} · ${formatRatio(ratio)} mediana` : `${formatRatio(ratio)} mediana anului`, detail };
  }
  const side = (x: number) => (x > 66 ? " pr-tip-end" : x < 22 ? " pr-tip-start" : "");

  return <div className={`pr-marks${ruler != null || tip ? " is-reading" : ""}`} data-chart="" ref={box} style={{ ["--i" as string]: index }}
    onPointerMove={move} onPointerLeave={leave}>
    {bins && <div className="pr-bins cm-fade" aria-hidden="true">
      {bins.map((n, i) => n > 0 && <i key={i} style={{ left: `${(i / bins.length) * 100}%`, width: `${100 / bins.length}%`, height: `${Math.max(8, (n / peak) * 100)}%` }} />)}
    </div>}
    <span className="pr-band cm-fade" style={{ left: `${axisPos(band.r10)}%`, width: `${Math.max(0.6, axisPos(band.r90) - axisPos(band.r10))}%` }} />
    <span className="pr-band pr-core cm-fade" style={{ left: `${axisPos(band.r25)}%`, width: `${Math.max(0.6, axisPos(band.r75) - axisPos(band.r25))}%` }} />
    <span className="pr-rule pr-median" style={{ left: `${axisPos(1)}%` }} />
    <span className="pr-rule pr-double" style={{ left: `${axisPos(2)}%` }} />
    {reading && <>
      <span className="pr-ruler" style={{ left: `${reading.x}%` }} aria-hidden="true" />
      <span className={`pr-tip pr-read${side(reading.x)}`} style={{ left: `${reading.x}%` }} aria-hidden="true">
        <b>{reading.text}</b>{reading.detail && <small>{reading.detail}</small>}
      </span>
    </>}
    {dots.map((d) => <a key={keyOf(d)} href={href(d)} tabIndex={focusable ? 0 : -1}
      className={`pr-dot cm-fade cm-late${tagged.includes(d) ? " pr-dot-named" : ""}${d.ratio > 8 ? " pr-dot-over" : ""}${tip && keyOf(tip) === keyOf(d) ? " is-on" : ""}`}
      style={{ left: `${axisPos(d.ratio)}%` }}
      aria-label={`${d.name}, ${d.year}: ${formatUnitPrice(d.price)} ${per}, ${ratioWords(d.ratio)}. Deschide liniile.`}
      onPointerEnter={() => { setRuler(null); setTip(d); }} onPointerLeave={() => setTip(null)}
      onFocus={() => { setRuler(null); setTip(d); }} onBlur={() => setTip(null)}
      onClick={(e) => e.stopPropagation()} />)}
    {tagged.map((d, t) => <span key={`t${keyOf(d)}`} className={`pr-tag cm-fade cm-late${axisPos(d.ratio) > 70 ? " pr-tag-end" : ""}`}
      style={{ left: `${axisPos(d.ratio)}%`, ["--t" as string]: t }} aria-hidden="true"><span className="pr-tag-name">{d.name}</span> · <b>{formatRatio(d.ratio)}</b></span>)}
    {tip && <span className={`pr-tip pr-lead-tip${side(axisPos(tip.ratio))}`} style={{ left: `${axisPos(tip.ratio)}%` }} role="tooltip">
      <b>{tip.name}</b><small>{[tip.county, tip.year].filter(Boolean).join(" · ")}</small>
      <span className="pr-tip-row"><strong>{formatUnitPrice(tip.price)} {per}</strong> · {ratioWords(tip.ratio)} ({formatUnitPrice(tip.median)} în {tip.year})</span>
      <span className="pr-tip-row">{formatQuantity(tip.quantity, per)} · {tip.awards === 1 ? "o achiziție" : `${tip.awards} achiziții`} · {formatLei(tip.excess)} peste mediană</span>
      <small className="pr-tip-hint">Click: liniile instituției</small>
    </span>}
  </div>;
}

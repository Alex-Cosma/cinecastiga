"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AXIS_FROM, AXIS_TO, axisPos, countWord, formatLei, formatQuantity, formatRatio, formatUnitPrice, ratioWords, type StripDot } from "@/lib/unit-prices-shared";

/**
 * The strip of a product (owner, 11 November 2026: hover and click on the dots and the chart). The marks are those of
 * the list and the product page: the median and twice the median as rules, the bands, every lead as a tick, the
 * largest leads as dots, the largest by lei named. Pointing at a dot shows its lead; a click opens its lines on the
 * product page. Pointing anywhere else on the strip reads the axis there: the price, its multiple of the median and,
 * under the product's histogram, how many institutions bought at about that price.
 *
 * On the list (`mode="list"`) the strip is one image inside its row: the row's own text and its opened rows carry the
 * same leads, so the dots are for the mouse only. On the product page (`mode="product"`) the dots are one Tab stop:
 * the arrows move between them along the axis, Escape closes the card, and a touch reads the axis where it lands.
 */
export default function StripChart({ band, median, per, dots, named = 1, index = 0, bins, binFrom = AXIS_FROM, binStep = 0.1, hrefBase, ticks, mode = "list", label }: {
  /** The spread in multiples of the median (eight in ten, the middle half). */
  band: { r10: number; r25: number; r75: number; r90: number };
  /** One year's median price, so the ruler reads prices; null across years (each against its own year's median). */
  median: number | null;
  per: string; dots: StripDot[]; named?: number; index?: number;
  bins?: number[]; binFrom?: number; binStep?: number;
  /** The product page's address; a dot adds its institution (`deschis`) and the anchor of its row. */
  hrefBase: string;
  /** Every lead's place as one path (leadTicksPath): the dots are only the largest. */
  ticks?: string;
  mode?: "list" | "product";
  /** What the strip shows, in a sentence (its accessible name). */
  label: string;
}) {
  const product = mode === "product";
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<StripDot | null>(null);
  const [ruler, setRuler] = useState<number | null>(null);
  const keyOf = (d: StripDot) => `${d.id}-${d.year}`;
  /** The dot Tab lands on: the named one first, then the last one visited. */
  const [active, setActive] = useState<string | null>(null);
  const activeKey = active != null && dots.some((d) => keyOf(d) === active) ? active : dots[0] ? keyOf(dots[0]) : null;
  /** The pointer of the press under way, and the dot whose card was already up when it began (a touch shows first). */
  const press = useRef<{ type: string; shown: string | null }>({ type: "mouse", shown: null });
  const peak = bins ? Math.max(1, ...bins) : 1;
  // The dots come in the leads' one order (lei above the median first): the named ones are the first.
  const tagged = dots.slice(0, named);
  const href = (d: StripDot) => `${hrefBase}${hrefBase.includes("?") ? "&" : "?"}deschis=${d.id}-${d.year}#institutie-${d.id}-${d.year}`;
  /** The dots along the axis, for the arrows. */
  const along = useMemo(() => [...dots].sort((a, b) => a.ratio - b.ratio || b.excess - a.excess), [dots]);

  const reading_ = ruler != null || tip != null;
  useEffect(() => {
    if (!reading_) return;
    const close = () => { setRuler(null); setTip(null); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const away = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) close(); };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", away);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", away); };
  }, [reading_]);

  const read = (e: React.PointerEvent) => {
    if ((e.target as Element).closest(".pr-dot")) return;
    const r = box.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    setTip(null);
    setRuler(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
  };
  // A touch reads the axis on the product page only: on the list a touch opens the strip.
  const move = (e: React.PointerEvent) => { if (e.pointerType === "mouse" || product) read(e); };
  const down = (e: React.PointerEvent) => {
    press.current = { type: e.pointerType, shown: tip ? keyOf(tip) : null };
    if (e.pointerType !== "mouse" && product) read(e);
  };
  // A finger leaves the strip when it lifts: the reading stays until the next touch elsewhere (or Escape).
  const leave = (e: React.PointerEvent) => { if (e.pointerType === "mouse") { setRuler(null); setTip(null); } };

  const step = (d: StripDot, e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setTip(null); return; }
    const i = along.findIndex((o) => keyOf(o) === keyOf(d));
    const to = e.key === "ArrowRight" || e.key === "ArrowUp" ? along[i + 1] : e.key === "ArrowLeft" || e.key === "ArrowDown" ? along[i - 1]
      : e.key === "Home" ? along[0] : e.key === "End" ? along[along.length - 1] : undefined;
    if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") e.preventDefault();
    if (to) box.current?.querySelector<HTMLElement>(`[data-dot="${keyOf(to)}"]`)?.focus();
  };

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

  return <div className={`pr-marks${reading_ ? " is-reading" : ""}`} data-chart="" ref={box} style={{ ["--i" as string]: index }}
    role={product ? "group" : "img"} aria-label={label}
    onPointerMove={move} onPointerDown={down} onPointerLeave={leave}>
    {bins && <div className="pr-bins cm-fade" aria-hidden="true">
      {bins.map((n, i) => n > 0 && <i key={i} style={{ left: `${(i / bins.length) * 100}%`, width: `${100 / bins.length}%`, height: `${Math.max(8, (n / peak) * 100)}%` }} />)}
    </div>}
    <span className="pr-band cm-fade" style={{ left: `${axisPos(band.r10)}%`, width: `${Math.max(0.6, axisPos(band.r90) - axisPos(band.r10))}%` }} />
    <span className="pr-band pr-core cm-fade" style={{ left: `${axisPos(band.r25)}%`, width: `${Math.max(0.6, axisPos(band.r75) - axisPos(band.r25))}%` }} />
    <span className="pr-rule pr-median" style={{ left: `${axisPos(1)}%` }} />
    <span className="pr-rule pr-double" style={{ left: `${axisPos(2)}%` }} />
    {ticks && <svg className="pr-ticks cm-fade cm-late" viewBox="0 0 100 1" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d={ticks} vectorEffect="non-scaling-stroke" /></svg>}
    {reading && <>
      <span className="pr-ruler" style={{ left: `${reading.x}%` }} aria-hidden="true" />
      <span className={`pr-tip pr-read${side(reading.x)}`} style={{ left: `${reading.x}%` }} aria-hidden="true">
        <b>{reading.text}</b>{reading.detail && <small>{reading.detail}</small>}
      </span>
    </>}
    {dots.map((d) => {
      const k = keyOf(d);
      return <a key={k} href={href(d)} data-dot={k} tabIndex={product && k === activeKey ? 0 : -1} aria-hidden={product ? undefined : true}
        className={`pr-dot cm-fade cm-late${tagged.includes(d) ? " pr-dot-named" : ""}${d.ratio > 8 ? " pr-dot-over" : ""}${tip && keyOf(tip) === k ? " is-on" : ""}`}
        style={{ left: `${axisPos(d.ratio)}%` }}
        aria-label={`${d.name}, ${d.year}: ${formatUnitPrice(d.price)} ${per}, ${ratioWords(d.ratio)}, ${formatLei(d.excess)} peste mediană. Deschide liniile.`}
        onPointerEnter={(e) => { if (e.pointerType === "mouse") { setRuler(null); setTip(d); } }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") setTip(null); }}
        onFocus={() => { setRuler(null); setTip(d); setActive(k); }} onBlur={() => setTip(null)}
        onKeyDown={product ? (e) => step(d, e) : undefined}
        onClick={(e) => {
          e.stopPropagation();
          // A touch shows the lead first; the second touch on the same dot opens its lines.
          if (press.current.type !== "mouse" && press.current.shown !== k) { e.preventDefault(); setRuler(null); setTip(d); }
        }} />;
    })}
    {tagged.map((d, t) => {
      // The tag stays inside the strip: anchored by its end past the middle, never wider than the room on that side.
      const x = axisPos(d.ratio), end = x > 60;
      return <span key={`t${keyOf(d)}`} className={`pr-tag cm-fade cm-late${end ? " pr-tag-end" : ""}`}
        style={{ left: `${x}%`, maxWidth: end ? `calc(${x}% + 8px)` : `${2 * Math.min(x, 100 - x)}%`, ["--t" as string]: t }} aria-hidden="true">
        <span className="pr-tag-name">{d.name}</span><span className="pr-tag-x"> · <b>{formatRatio(d.ratio)}</b></span></span>;
    })}
    {tip && <span className={`pr-tip pr-lead-tip${side(axisPos(tip.ratio))}`} style={{ left: `${axisPos(tip.ratio)}%` }} role="tooltip">
      <b>{tip.name}</b><small>{[tip.county, tip.year].filter(Boolean).join(" · ")}</small>
      <span className="pr-tip-row"><strong>{formatUnitPrice(tip.price)} {per}</strong> · {ratioWords(tip.ratio)}{tip.median != null && ` (${formatUnitPrice(tip.median)} în ${tip.year})`}</span>
      <span className="pr-tip-row">{tip.quantity != null && `${formatQuantity(tip.quantity, per)} · `}{tip.awards != null && `${tip.awards === 1 ? "o achiziție" : `${tip.awards} achiziții`} · `}{formatLei(tip.excess)} peste mediană</span>
      <small className="pr-tip-hint">Pistă, nu dovadă · deschide liniile</small>
    </span>}
  </div>;
}

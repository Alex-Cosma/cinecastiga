"use client";

import { useState } from "react";
import { formatInt, formatRon } from "../../lib/format";
import { countyMap, foldCounty } from "../../lib/map";
import { encodeSpec } from "../../lib/ask/permalink";
import { countWords, formatShare } from "../../lib/ask/answer-text";
import type { AskSpec } from "../../lib/ask/spec";
import type { BlockData } from "../../lib/ask/compile";

type CountyValue = Extract<BlockData, { block: "map" }>["counties"][number];
type MapUnknown = Extract<BlockData, { block: "map" }>["unknown"];

/** Five steps of the theme's map ramp (--map-0 … --map-4, light and dark in approved.css). */
const MAP_STEPS = 5;

/** The county under the pointer: what the map shows there, in the answer's words. */
export function CountyTip({ label, value, count, national, asCount }: {
  label: string;
  value: number;
  count: number;
  national: number;
  asCount: boolean;
}) {
  // On a count the value is the number of records: said once, in words.
  const share = national > 0 ? `${formatShare(value / national)} din total` : null;
  return (
    <>
      <div className="t">{label}</div>
      {value > 0 ? (
        <>
          <div className="v">{asCount ? countWords(value, "înregistrare", "înregistrări") : formatRon(value)}</div>
          {asCount ? share && <div className="s">{share}</div> : (
            <div className="s">
              {countWords(count, "înregistrare", "înregistrări")}
              {share && ` · ${share}`}
            </div>
          )}
          <div className="s">click → înregistrările județului</div>
        </>
      ) : (
        <div className="s">nicio înregistrare pentru aceste filtre</div>
      )}
    </>
  );
}

export default function MapBlock({
  counties,
  unknown,
  spec,
}: {
  counties: CountyValue[];
  unknown: MapUnknown;
  spec: unknown;
}) {
  const asCount = (spec as AskSpec).measure === "count";
  const display = (v: number) =>
    asCount ? formatInt(v) + " înreg." : formatRon(v);
  // county click → same filters, scoped to that county, drill rows opened
  const countyUrl = (label: string): string =>
    `/intreaba?spec=${encodeURIComponent(encodeSpec(spec))}&drill=1&evidence=${encodeURIComponent(JSON.stringify({ county:label }))}`;

  const byKey = new Map<string, number>();
  const cntByKey = new Map<string, number>();
  for (const c of counties) {
    const k = foldCounty(c.county);
    byKey.set(k, (byKey.get(k) ?? 0) + (asCount ? c.count : c.value));
    cntByKey.set(k, (cntByKey.get(k) ?? 0) + c.count);
  }
  // Shares are of the whole selection, including records whose authority has
  // no known county and so are not on the map (audit F13).
  const unknownMeasure = asCount ? unknown.count : unknown.value;
  const national =
    counties.reduce((s, c) => s + (asCount ? c.count : c.value), 0) +
    unknownMeasure;
  const [tip, setTip] = useState<{
    label: string;
    value: number;
    count: number;
    x: number;
    y: number;
  } | null>(null);
  const values = countyMap.shapes
    .map((s) => byKey.get(s.key) ?? 0)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const th: number[] = [];
  for (let i = 1; i < MAP_STEPS; i++) {
    th.push(
      values[
        Math.min(
          Math.floor((i / MAP_STEPS) * values.length),
          values.length - 1,
        )
      ] ?? 0,
    );
  }
  const bucket = (v: number) => {
    let b = 0;
    while (b < th.length && v > th[b]!) b++;
    return b;
  };
  const ranked = countyMap.shapes
    .map((s) => ({ label: s.label, key: s.key, value: byKey.get(s.key) ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return (
    <div className="ask-maplayout">
      <div className="ask-mapwrap">
        <svg
          viewBox={`0 0 ${countyMap.width} ${countyMap.height}`}
          className="ask-choropleth"
          role="img"
          aria-label="Hartă pe județe"
        >
          {countyMap.shapes.map((s) => {
            const v = byKey.get(s.key) ?? 0;
            const move = (e: React.MouseEvent) =>
              setTip({
                label: s.label,
                value: v,
                count: cntByKey.get(s.key) ?? 0,
                x: e.clientX,
                y: e.clientY,
              });
            // Colours and outline are theme tokens (question-results.css), so both themes keep their contrast.
            return (
              <a
                key={s.key}
                href={countyUrl(s.label)}
              >
                <path
                  d={s.d}
                  className={`ask-county ${v > 0 ? `ask-county-${bucket(v)}` : "ask-county-none"}${tip?.label === s.label ? " hovered" : ""}`}
                  onMouseEnter={move}
                  onMouseMove={move}
                  onMouseLeave={() => setTip(null)}
                />
              </a>
            );
          })}
        </svg>
        <div className="ask-legend">
          <span>mai puțin</span>
          {Array.from({ length: MAP_STEPS }, (_, i) => (
            <span key={i} className={`sw ask-county-${i}`} />
          ))}
          <span>mai mult</span>
        </div>
        {unknown.count > 0 && national > 0 && (
          <p className="ask-fine">
            {asCount
              ? `${countWords(unknown.count, "înregistrare", "înregistrări")} (${formatShare(unknownMeasure / national)} din selecție)`
              : `${formatRon(unknown.value)} (${formatShare(unknownMeasure / national)} din selecție, ${countWords(unknown.count, "înregistrare", "înregistrări")})`}{" "}
            {asCount && unknown.count === 1 ? "are instituția fără județ cunoscut și nu apare" : "au instituția fără județ cunoscut și nu apar"} pe hartă · procentele sunt din totalul selecției
          </p>
        )}
        {tip && (
          <div
            className="ask-maptip"
            style={{ left: tip.x + 14, top: tip.y + 14 }}
          >
            <CountyTip label={tip.label} value={tip.value} count={tip.count} national={national} asCount={asCount} />
          </div>
        )}
      </div>
      <table className="ask-table ask-mapside">
        <tbody>
          {ranked.map((r, i) => (
            <tr key={r.key}>
              <td className="pos">{i + 1}</td>
              <td>
                <a href={countyUrl(r.label)}>
                  {r.label} →
                </a>
              </td>
              <td className="num">{display(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

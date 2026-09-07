"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SliceRow } from "@/lib/radiografie";
import { shortName, daysBetween } from "@/lib/radiografie-fmt";
import { useRxTip, fmtM } from "./RxTip";

const CEIL = (y: number) => (y <= 2022 ? 135_060 : 270_120);
const T0 = Date.parse("2020-01-01");

/**
 * "Cine feliază achizițiile directe?" — one strip per supplier with the
 * slicing shape (≥3 awards, same CPV class, 60 days, sum over the ceiling),
 * ranked by how far over the ceiling the window goes.
 */
export default function DaStrips({ rows, nSuppliers }: { rows: SliceRow[]; nSuppliers: number }) {
  const [all, setAll] = useState(false);
  const [hl, setHl] = useState<string | null>(null);
  const tip = useRxTip();
  const T1 = Date.parse(`${new Date().getFullYear()}-12-31`);

  useEffect(() => {
    const onFocus = (e: Event) => {
      const d = (e as CustomEvent<{ go: string; supplierId?: string }>).detail;
      if (d.go === "da" && d.supplierId) {
        setAll(true);
        setHl(d.supplierId);
        setTimeout(() => setHl(null), 1800);
      }
    };
    window.addEventListener("rx-focus", onFocus);
    return () => window.removeEventListener("rx-focus", onFocus);
  }, []);

  if (rows.length === 0)
    return (
      <div className="rx-panel" id="rx-da">
        <p className="rx-silence">
          Niciun furnizor cu forma de feliere ({nSuppliers} furnizori cu cel puțin 3 achiziții directe).
        </p>
      </div>
    );

  const shown = all ? rows : rows.slice(0, 4);
  return (
    <div className="rx-panel" id="rx-da">
      <div className="rx-strips">
        {shown.map((s) => {
          const pts = s.points.map((p) => ({ ...p, t: Date.parse(p.d) }));
          const vmax = Math.max(300_000, ...pts.map((p) => p.v)) * 1.08;
          const w = 680,
            h = 190,
            ml = 58,
            mr = 10,
            mt = 12,
            mb = 26;
          const X = (t: number) => ml + ((t - T0) / (T1 - T0)) * (w - ml - mr);
          const Y = (v: number) => mt + (1 - v / vmax) * (h - mt - mb);
          const t0 = Date.parse(s.d0),
            t1 = Date.parse(s.d1);
          const inWin = (p: { t: number; cls: string }) => p.t >= t0 && p.t <= t1 && p.cls === s.cpvClass;
          const years: number[] = [];
          for (let y = 2020; y <= new Date().getFullYear(); y++) years.push(y);
          const xb = X(Date.parse("2023-01-01"));
          return (
            <div key={s.supplierId} className={`rx-strip${hl === s.supplierId ? " rx-hl" : ""}`} id={`rx-strip-${s.supplierId}`}>
              <h3>
                <Link href={`/entitati/${s.supplierId}`} target="_blank">
                  {shortName(s.supplierName)}
                </Link>
                <span className="num">{s.ratio.toFixed(1).replace(".", ",")}× plafonul</span>
              </h3>
              <p className="win num">
                <b>
                  {s.n} achiziții · {fmtM(s.sum)}
                </b>{" "}
                în {daysBetween(s.d0, s.d1)} {daysBetween(s.d0, s.d1) === 1 ? "zi" : "zile"}, {s.d0.slice(0, 7)} · plafon {fmtM(s.ceiling)} ·{" "}
                {s.cpvName.toLowerCase()}
                <span className="faint">
                  {" "}
                  · {s.nTotal} achiziții în total, {fmtM(s.vTotal)}
                </span>
              </p>
              <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`achiziții directe ${s.supplierName}`}>
                {years.map((y) => {
                  const x = X(Date.parse(`${y}-01-01`));
                  return (
                    <g key={y}>
                      <line x1={x} x2={x} y1={mt} y2={h - mb} stroke="var(--rx-grid)" strokeWidth={1} />
                      <text x={x + 3} y={h - 8} fontSize={10} fill="var(--muted)">
                        {y}
                      </text>
                    </g>
                  );
                })}
                {[100_000, 200_000, 300_000, 500_000]
                  .filter((v) => v < vmax)
                  .map((v) => (
                    <g key={v}>
                      <text x={ml - 6} y={Y(v) + 3} fontSize={10} textAnchor="end" fill="var(--muted)">
                        {v / 1000}k
                      </text>
                      <line x1={ml} x2={w - mr} y1={Y(v)} y2={Y(v)} stroke="var(--rx-grid)" />
                    </g>
                  ))}
                <path
                  d={`M${ml} ${Y(CEIL(2020))} H${xb} V${Y(CEIL(2023))} H${w - mr}`}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  opacity={0.8}
                />
                <rect x={X(t0) - 5} y={mt} width={Math.max(10, X(t1) - X(t0) + 10)} height={h - mt - mb} fill="var(--rx-gold-soft)" opacity={0.9} />
                {pts.map((p, i) => {
                  const near = p.v >= CEIL(new Date(p.t).getFullYear()) * 0.7;
                  const w_ = inWin(p);
                  return (
                    <circle
                      key={i}
                      cx={X(p.t)}
                      cy={Y(p.v)}
                      r={w_ ? 4.5 : 3.5}
                      fill={w_ ? "var(--accent)" : near ? "var(--rx-gold)" : "var(--rx-slate)"}
                      stroke="var(--surface)"
                      strokeWidth={1}
                      onMouseMove={(e) =>
                        tip.show(
                          <>
                            <b>{fmtM(p.v)} lei</b>
                            <div>
                              {p.d} · {p.cpvName}
                            </div>
                            {p.gap != null && (
                              <div className="row">
                                <span>publicare→atribuire</span>
                                <span className="num">
                                  {p.gap < 60 ? `${p.gap} min` : p.gap < 1440 ? `${Math.round(p.gap / 60)} h` : `${Math.round(p.gap / 1440)} zile`}
                                </span>
                              </div>
                            )}
                          </>,
                          e,
                        )
                      }
                      onMouseLeave={tip.hide}
                    />
                  );
                })}
              </svg>
            </div>
          );
        })}
      </div>
      {!all && rows.length > 4 && (
        <button type="button" className="rx-more" onClick={() => setAll(true)}>
          arată toți cei {rows.length} furnizori
        </button>
      )}
      <p className="rx-silence">
        Ceilalți {nSuppliers - rows.length} furnizori cu cel puțin 3 achiziții directe: fără feliere.
      </p>
      {tip.el}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SliceRow } from "@/lib/radiografie";
import { shortName, daysBetween } from "@/lib/radiografie-fmt";
import { useRxTip, fmtM } from "./RxTip";
import { DA_CEILING_ERAS } from "@seap/domain";

/**
 * "Cine feliază achizițiile directe?" — one strip per supplier with the
 * slicing shape (≥3 awards, same CPV class, 60 days, sum over the ceiling),
 * ranked by how far over the ceiling the window goes.
 */
export default function DaStrips({ rows, nSuppliers, authorityId }: { rows: SliceRow[]; nSuppliers: number; authorityId: string }) {
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
          Niciun grup detectat după aceste criterii ({nSuppliers} furnizori cu cel puțin 3 achiziții directe). Datele necunoscute nu permit o concluzie.
        </p>
      </div>
    );

  const shown = all ? rows : rows.slice(0, 4);
  return (
    <div className="rx-panel" id="rx-da">
      <div className="rx-strips">
        {shown.map((s) => {
          const pts = s.points.map((p) => ({ ...p, t: Date.parse(p.d) }));
          const firstYear = Math.min(2020, ...pts.filter((p) => Number.isFinite(p.t)).map((p) => new Date(p.t).getUTCFullYear()));
          const T0 = Date.parse(`${firstYear}-01-01`);
          const vmax = Math.max(300_000, s.ceiling, ...pts.map((p) => p.v),
            ...DA_CEILING_ERAS.map((era) => s.purchaseType === "works" ? era.works : era.goodsServices)) * 1.08;
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
          const inWin = (p: typeof pts[number]) => p.t >= t0 && p.t <= t1 && p.cls === s.cpvClass
            && p.purchaseType != null && p.purchaseType === s.purchaseType && p.ceiling != null && p.v > 0 && p.v < p.ceiling;
          const years: number[] = [];
          for (let y = firstYear; y <= new Date().getFullYear(); y++) years.push(y);
          const ceilingSegments = s.purchaseType ? DA_CEILING_ERAS.flatMap((era) => {
            const start = Math.max(T0, Date.parse(era.validFrom));
            const end = Math.min(T1, era.validTo ? Date.parse(era.validTo) : T1);
            if (end <= start) return [];
            return [{ start, end, value: s.purchaseType === "works" ? era.works : era.goodsServices }];
          }) : [];
          return (
            <div key={s.supplierId} className={`rx-strip${hl === s.supplierId ? " rx-hl" : ""}`} id={`rx-strip-${s.supplierId}`}>
              <h3>
                <Link href={`/entitati/${s.supplierId}`} target="_blank">
                  {shortName(s.supplierName)}
                </Link>
                <span className="num">{s.ratio.toFixed(1).replace(".", ",")}× plafonul de referință</span>
              </h3>
              <p className="win num">
                <b>
                  {s.n} achiziții · {fmtM(s.sum)}
                </b>{" "}
                în {daysBetween(s.d0, s.d1)} {daysBetween(s.d0, s.d1) === 1 ? "zi" : "zile"}, {s.d0.slice(0, 7)} · plafon {fmtM(s.ceiling)} ·{" "}
                {s.cpvName.toLowerCase()} · {s.purchaseType === "works" ? "lucrări" : s.purchaseType === "goods_services" ? "produse/servicii" : "tip necunoscut"}, fără TVA
                <span className="faint">
                  {" "}
                  · {s.nTotal} achiziții în total, {fmtM(s.vTotal)}
                </span>
              </p>
              {!!(s.dateFallbackCount || s.typeInferredCount) && <p className="win faint">
                {s.dateFallbackCount ? `${s.dateFallbackCount} achiziții folosesc data finalizării, în lipsa publicării. ` : ""}
                {s.typeInferredCount ? `Tipul a fost dedus din CPV pentru ${s.typeInferredCount} achiziții.` : ""}
              </p>}
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
                  d={ceilingSegments.map((segment, i) => `${i ? "L" : "M"}${X(segment.start)} ${Y(segment.value)} H${X(segment.end)}`).join(" ")}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  opacity={0.8}
                />
                <rect x={X(t0) - 5} y={mt} width={Math.max(10, X(t1) - X(t0) + 10)} height={h - mt - mb} fill="var(--rx-gold-soft)" opacity={0.9} />
                {pts.map((p, i) => {
                  const near = p.ceiling != null && p.v >= p.ceiling * 0.7;
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
                            <div>{p.ceiling != null ? `Plafon de referință: ${fmtM(p.ceiling)} lei (${p.referenceDate})` : "Plafon necunoscut: data sau tipul nu permit clasificarea."}</div>
                            <div>{w_ ? "Inclusă în suma grupului evidențiat." : "Context: nu este inclusă în suma grupului evidențiat."}</div>
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
              <Link href={`/entitati/${authorityId}/radiografie/surse?tip=slicing&furnizor=${s.supplierId}`} className="rx-more">Vezi cele {s.n} achiziții din fereastră →</Link>
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
        Ceilalți {Math.max(0, nSuppliers - rows.length)} furnizori cu cel puțin 3 achiziții directe: fără grup detectat după aceste criterii. Aceasta nu confirmă absența unei probleme.
      </p>
      {tip.el}
    </div>
  );
}

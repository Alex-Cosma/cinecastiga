"use client";

import { useTip } from "../../intreaba/use-tip";
import { formatRon, formatInt } from "@/lib/format";
import { encodeSpec } from "@/lib/ask/permalink";
import { entityMonthSpec } from "@/lib/ask/site-links";

const LUNI = [
  "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
  "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie",
];

/**
 * 12-bar mini-chart of one year's monthly DA value — December highlighted,
 * instant hover tooltip (house rule, docs/PRINCIPLES.md), every bar deep-links
 * to the search drill for exactly that month's rows.
 */
export default function YearMiniChart({
  monthly,
  year,
  entityId,
  entityName,
  role,
}: {
  monthly: { ym: string; totalRon: number }[];
  year: string;
  entityId: string;
  entityName: string;
  role: "authority" | "supplier";
}) {
  const t = useTip();
  const months = Array.from({ length: 12 }, (_, i) => {
    const ym = `${year}-${String(i + 1).padStart(2, "0")}`;
    return { m: i + 1, v: monthly.find((p) => p.ym === ym)?.totalRon ?? 0 };
  });
  const max = months.reduce((a, b) => Math.max(a, b.v), 0) || 1;
  const total = months.reduce((a, b) => a + b.v, 0);
  const monthUrl = (m: number) =>
    `/?spec=${encodeURIComponent(encodeSpec(entityMonthSpec(entityId, entityName, role, year, m)))}&drill=1`;
  // The year written over its months, and a group that names it (critique 2 November 2026: two charts, no visible year).
  return (
    <div className="yem-fig">
      <p className="yem-cap">{year}</p>
    <div className="yem" role="group" aria-label={`Valoarea lunară a achizițiilor directe, ${year}`}>
      {t.el}
      {months.map((p) => (
        <a
          key={p.m}
          className={p.m === 12 ? "b dec" : "b"}
          href={monthUrl(p.m)}
          {...t.bind(
            `${LUNI[p.m - 1]} ${year}`,
            formatRon(p.v),
            `${total > 0 ? `${((p.v / total) * 100).toFixed(0)}% din anul ${formatInt(Number(year))}` : ""} · click → achizițiile lunii`,
          )}
        >
          <div className="f" style={{ height: `${Math.max(3, (p.v / max) * 100)}%` }} />
          <div className="l">{p.m === 12 ? "dec" : p.m}</div>
        </a>
      ))}
    </div>
    </div>
  );
}

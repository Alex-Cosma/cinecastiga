import Link from "next/link";
import { getSpendByCounty, type Role } from "@/lib/marts";
import { countyMap, foldCounty } from "@/lib/map";
import { formatRon } from "@/lib/format";

export const dynamic = "force-dynamic";

const BUCKETS = 5;
// Light → deep, 5 sequential classes (gold to accent-red).
const COLORS = ["#f3ead0", "#e7c98d", "#d99f57", "#c06a3a", "#9a2b1f"];
const NO_DATA = "#e9e6dd";

function quantileThresholds(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const th: number[] = [];
  for (let i = 1; i < BUCKETS; i++) {
    const idx = Math.floor((i / BUCKETS) * sorted.length);
    th.push(sorted[Math.min(idx, sorted.length - 1)] ?? 0);
  }
  return th;
}

function bucketOf(v: number, th: number[]): number {
  let b = 0;
  while (b < th.length && v > th[b]!) b++;
  return b;
}

export default async function HartaPage({
  searchParams,
}: {
  searchParams: Promise<{ rol?: string }>;
}) {
  const { rol } = await searchParams;
  const role: Role = rol === "furnizor" ? "supplier" : "authority";
  const data = await getSpendByCounty(role);

  const byKey = new Map<string, number>();
  for (const d of data) {
    const k = foldCounty(d.county);
    byKey.set(k, (byKey.get(k) ?? 0) + d.totalRon);
  }

  // Coverage: how much spend lands on a real county shape vs. the dirty tail.
  const shapeKeys = new Set(countyMap.shapes.map((s) => s.key));
  const totalAll = data.reduce((s, d) => s + d.totalRon, 0);
  const mapped = countyMap.shapes.reduce((s, sh) => s + (byKey.get(sh.key) ?? 0), 0);
  const coverage = totalAll > 0 ? (mapped / totalAll) * 100 : 0;

  const shapeValues = countyMap.shapes.map((s) => byKey.get(s.key) ?? 0).filter((v) => v > 0);
  const thresholds = quantileThresholds(shapeValues);

  const ranked = countyMap.shapes
    .map((s) => ({ label: s.label, key: s.key, value: byKey.get(s.key) ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  return (
    <>
      <h1 className="page-title">Harta cheltuielilor pe județe</h1>
      <p className="page-sub">
        {role === "authority"
          ? "Valoarea contractată de autoritățile din fiecare județ."
          : "Valoarea câștigată de furnizorii din fiecare județ."}
      </p>

      <div className="toggle">
        <Link href="/harta" className={role === "authority" ? "on" : ""}>
          Autorități
        </Link>
        <Link href="/harta?rol=furnizor" className={role === "supplier" ? "on" : ""}>
          Furnizori
        </Link>
      </div>

      <div className="map-layout">
        <div className="map-wrap">
          <svg
            viewBox={`0 0 ${countyMap.width} ${countyMap.height}`}
            className="choropleth"
            role="img"
            aria-label="Hartă cheltuieli pe județe"
          >
            {countyMap.shapes.map((s) => {
              const v = byKey.get(s.key) ?? 0;
              const color = v > 0 ? COLORS[bucketOf(v, thresholds)] : NO_DATA;
              return (
                <path key={s.key} d={s.d} fill={color} stroke="#fff" strokeWidth={0.8}>
                  <title>
                    {s.label} — {formatRon(v)}
                  </title>
                </path>
              );
            })}
          </svg>
          <div className="legend">
            {COLORS.map((c, i) => (
              <span key={c} className="legend-item">
                <span className="swatch" style={{ background: c }} />
                {i === 0 ? "mai puțin" : i === COLORS.length - 1 ? "mai mult" : ""}
              </span>
            ))}
          </div>
        </div>

        <div className="map-side">
          <h2>Top județe</h2>
          <table className="rank">
            <tbody>
              {ranked.map((r, i) => (
                <tr key={r.key}>
                  <td className="pos">{i + 1}</td>
                  <td>{r.label}</td>
                  <td className="num">{formatRon(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="note">
        Instantaneu 2020. {coverage.toFixed(0)}% din valoare este localizată într-un județ
        cartografiabil; restul are județ nestandardizat sau străin. Geometrie: GADM
        (necomercial) — de înlocuit cu Natural Earth.
      </p>
    </>
  );
}

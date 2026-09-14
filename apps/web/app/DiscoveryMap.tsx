"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { DiscoveryCounty } from "@/lib/discovery";
import { countyMap, foldCounty } from "@/lib/map";
import { formatRon, formatInt } from "@/lib/format";
import { encodeSpec } from "@/lib/ask/permalink";
import DiscoveryIcon from "./DiscoveryIcon";

const countyHref = (county: string) => `/intreaba?spec=${encodeURIComponent(encodeSpec({ block: "stat", dataset: "all", measure: "value", filters: { county } }))}`;
const mapHref = `/intreaba?spec=${encodeURIComponent(encodeSpec({ block: "map", dataset: "all", measure: "value", filters: {} }))}`;

export default function DiscoveryMap({ counties }: { counties: DiscoveryCounty[] }) {
  const [selected, setSelected] = useState(""), [hovered, setHovered] = useState("");
  const values = useMemo(() => {
    const result = new Map<string, { amount: number; count: number }>();
    for (const county of counties) { const key = foldCounty(county.county), previous = result.get(key); result.set(key, { amount: (previous?.amount ?? 0) + county.totalRon, count: (previous?.count ?? 0) + county.records }); }
    return result;
  }, [counties]);
  const thresholds = useMemo(() => {
    const sorted = countyMap.shapes.map((shape) => values.get(shape.key)?.amount ?? 0).filter((n) => n > 0).sort((a, b) => a - b);
    return [1, 2, 3, 4].map((i) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * i / 5))] ?? 0);
  }, [values]);
  const focusKey = hovered || selected, current = countyMap.shapes.find((shape) => shape.key === focusKey), total = values.get(focusKey);
  const present = countyMap.shapes.filter((shape) => values.has(shape.key)).length;
  return <section className="d-map-card" aria-labelledby="d-map-title">
    <div className="d-map-head"><div><p className="eyebrow">ROMÂNIA, MAI DE APROAPE</p><h2 id="d-map-title">Pe ce se duc banii<br />în județul tău?</h2></div><span className="d-map-compass" aria-hidden="true">N<svg viewBox="0 0 20 26"><path d="m10 3 5 16-5-4-5 4Z" /><path d="M10 3v21" /></svg></span></div>
    <svg viewBox={`0 0 ${countyMap.width} ${countyMap.height}`} className="d-romania-map" role="group" aria-label="Alege un județ pe hartă. Aceleași opțiuni sunt disponibile în selectorul de mai jos." onMouseLeave={() => setHovered("")}>
      {countyMap.shapes.map((shape) => {
        const data = values.get(shape.key), bucket = data ? thresholds.filter((threshold) => data.amount > threshold).length : -1;
        return <a key={shape.key} href={countyHref(shape.label)} aria-label={`${shape.label}: ${data ? `${formatRon(data.amount)}, ${formatInt(data.count)} înregistrări. Vezi achizițiile.` : "Fără valoare localizată în arhivă. Explorează județul."}`} onFocus={() => setHovered(shape.key)} onBlur={() => setHovered("")} onMouseEnter={() => setHovered(shape.key)}><path d={shape.d} className={`d-county d-county-${bucket}${focusKey === shape.key ? " selected" : ""}`}><title>{`${shape.label}${data ? ` · ${formatRon(data.amount)}` : " · date indisponibile"}`}</title></path></a>;
      })}
    </svg>
    <div className="d-map-legend"><span>Valoare înregistrată</span><div aria-label="De la valoare mai mică la valoare mai mare">{[0, 1, 2, 3, 4].map((n) => <i key={n} className={`d-map-swatch-${n}`} />)}</div><span>mai mare</span></div>
    <div className="d-map-choice"><div className="d-map-select"><DiscoveryIcon name="pin" /><label className="d-sr-only" htmlFor="discovery-county">Alege județul</label><select id="discovery-county" value={selected} onChange={(event) => { setSelected(event.target.value); setHovered(""); }}><option value="">Alege județul tău</option>{[...countyMap.shapes].sort((a, b) => a.label.localeCompare(b.label, "ro")).map((shape) => <option key={shape.key} value={shape.key}>{shape.label}</option>)}</select></div><Link href={selected ? countyHref(countyMap.shapes.find((shape) => shape.key === selected)!.label) : mapHref} aria-label={selected ? "Explorează achizițiile județului selectat" : "Deschide harta tuturor județelor"}><DiscoveryIcon name="arrow" /></Link></div>
    <p className="d-map-current" role="status">{current ? <><b>{current.label}</b> · {total ? `${formatRon(total.amount)} · ${formatInt(total.count)} înregistrări` : "Fără valoare localizată în arhivă"}</> : present ? <>Județele și București · sediul instituției, nu locul lucrării</> : <>Nu avem încă date cartografiate.</>}</p>
    <p className="d-map-basis">Harta include doar înregistrările cu județ cunoscut.</p>
  </section>;
}

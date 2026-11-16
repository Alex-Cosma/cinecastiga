"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DiscoveryCounty } from "@/lib/discovery";
import { countyMap, foldCounty } from "@/lib/map";
import { formatRon } from "@/lib/format";
import { askHref, countyBreakdownHref } from "@/lib/discovery-links";
import { NATIONAL_MAP_SPEC } from "@/lib/ask/site-links";
import Term from "@/components/Term";
import { GLOSSARY } from "@/lib/glossary";
import { TOUR_COUNTY_EVENT, TOUR_COUNTY_KEY } from "@/lib/tour";
import DiscoveryIcon from "./DiscoveryIcon";

// A county opens "Pe ce se duc banii?" (the breakdown by subject) for it, the
// question this card asks, rather than a single total. Client navigation (next/link inside the SVG): a whole page
// load landed on Ask's start page before its answer; 42 links in view are not prefetched.
const countyHref = countyBreakdownHref;
const mapHref = askHref(NATIONAL_MAP_SPEC);
/** The total favours the large counties: the (?) says so and the per-inhabitant map is one link away (UX audit Z1-24). */
const MAP_TIP = `${GLOSSARY["sediul-institutiei"].text} Valoarea e totală, așa că județele mari ies mereu în față; harta pe locuitor e în Hartă.`;

export default function DiscoveryMap({ counties }: { counties: DiscoveryCounty[] }) {
  const [selected, setSelected] = useState(""), [hovered, setHovered] = useState("");
  // On a touch screen the first tap on a county chooses it (its value in the readout, the arrow ready) and a second tap
  // on it, or the arrow, opens its answer (UX audit Z1-05): a tap no longer leaves the page at once, and a map read
  // with a finger shows its figures. A mouse click opens at once, as before.
  const pointer = useRef("");
  // The county chosen in the welcome tour is the map's at its end (UX audit Z1-25).
  useEffect(() => {
    const choose = (key: unknown) => { if (typeof key === "string" && countyMap.shapes.some((shape) => shape.key === key)) { setSelected(key); setHovered(""); } };
    try { const kept = sessionStorage.getItem(TOUR_COUNTY_KEY); if (kept) { sessionStorage.removeItem(TOUR_COUNTY_KEY); choose(kept); } } catch { /* no storage: nothing was kept */ }
    const onTour = (event: Event) => choose((event as CustomEvent<string>).detail);
    window.addEventListener(TOUR_COUNTY_EVENT, onTour);
    return () => window.removeEventListener(TOUR_COUNTY_EVENT, onTour);
  }, []);
  const values = useMemo(() => {
    // The map shows value only: a county's records next to the strip's "înregistrări contract–furnizor" read as a
    // county larger than the country (owner, 2 November 2026); the count is in the county's answer.
    const result = new Map<string, { amount: number }>();
    for (const county of counties) { const key = foldCounty(county.county), previous = result.get(key); result.set(key, { amount: (previous?.amount ?? 0) + county.totalRon }); }
    return result;
  }, [counties]);
  const thresholds = useMemo(() => {
    const sorted = countyMap.shapes.map((shape) => values.get(shape.key)?.amount ?? 0).filter((n) => n > 0).sort((a, b) => a - b);
    return [1, 2, 3, 4].map((i) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * i / 5))] ?? 0);
  }, [values]);
  const focusKey = hovered || selected, current = countyMap.shapes.find((shape) => shape.key === focusKey), total = values.get(focusKey);
  const present = countyMap.shapes.filter((shape) => values.has(shape.key)).length;
  return <section className="d-map-card" aria-labelledby="d-map-title">
    <div className="d-map-head"><div><h2 id="d-map-title">Pe ce se duc banii <br />în județul tău?</h2></div></div>
    {/* The map fills in, all counties together (never in the order of their values), when it first comes into view
        (DESIGN.md "Charts in motion"; the kit's cm-fade, gated by Reveal through data-chart). Hover stays instant. */}
    {/* One Tab stop for the map (UX audit Z1-20): the counties are left out of the Tab order, since the selector under it
        offers the same 42 choices and shows the same readout. */}
    <svg viewBox={`0 0 ${countyMap.width} ${countyMap.height}`} className="d-romania-map cm-fade" data-chart="" role="group" aria-label="Alege un județ pe hartă. Aceleași opțiuni sunt disponibile în selectorul de mai jos." onMouseLeave={() => setHovered("")} onPointerDown={(event) => { pointer.current = event.pointerType; }}>
      {countyMap.shapes.map((shape) => {
        const data = values.get(shape.key), bucket = data ? thresholds.filter((threshold) => data.amount > threshold).length : -1;
        return <Link key={shape.key} href={countyHref(shape.label)} prefetch={false} tabIndex={-1} onClick={(event) => { if (pointer.current === "touch" && selected !== shape.key) { event.preventDefault(); setSelected(shape.key); setHovered(""); } }} aria-label={`${shape.label}: ${data ? `${formatRon(data.amount)}. Vezi pe ce se duc banii.` : "Fără valoare localizată în arhivă. Vezi pe ce se duc banii."}`} onFocus={() => setHovered(shape.key)} onBlur={() => setHovered("")} onMouseEnter={() => setHovered(shape.key)}><path d={shape.d} className={`d-county d-county-${bucket}${focusKey === shape.key ? " selected" : ""}`}><title>{`${shape.label}${data ? ` · ${formatRon(data.amount)}` : " · date indisponibile"}`}</title></path></Link>;
      })}
    </svg>
    <div className="d-map-legend"><span>Valoare înregistrată</span><div aria-label="De la valoare mai mică la valoare mai mare">{[0, 1, 2, 3, 4].map((n) => <i key={n} className={`d-map-swatch-${n}`} />)}</div><span>mai mare</span></div>
    <div className="d-map-choice"><div className="d-map-select"><DiscoveryIcon name="pin" /><label className="d-sr-only" htmlFor="discovery-county">Alege județul</label><select id="discovery-county" value={selected} onChange={(event) => { setSelected(event.target.value); setHovered(""); }}><option value="">Alege județul tău</option>{[...countyMap.shapes].sort((a, b) => a.label.localeCompare(b.label, "ro")).map((shape) => <option key={shape.key} value={shape.key}>{shape.label}</option>)}</select></div><Link href={selected ? countyHref(countyMap.shapes.find((shape) => shape.key === selected)!.label) : mapHref} aria-label={selected ? "Vezi pe ce se duc banii în județul selectat" : "Deschide harta tuturor județelor"}><DiscoveryIcon name="arrow" /></Link></div>
    <div className="d-map-current-row">
      <p className="d-map-current" role="status">{current ? <><b>{current.label}</b> · {total ? <span>{formatRon(total.amount)}</span> : "Fără valoare localizată în arhivă"}</> : present ? <>Județele și București</> : <>Nu avem încă date cartografiate.</>}</p>
      {/* Outside the live region: a button must not sit inside role="status". */}
      {present && <Term tip title={GLOSSARY["sediul-institutiei"].title} text={MAP_TIP} />}
      <Link className="d-map-per-capita" href="/harta">Pe locuitor <DiscoveryIcon name="arrow" /></Link>
    </div>
  </section>;
}

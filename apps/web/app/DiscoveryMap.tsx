"use client";

import Link from "next/link";
import { SelectPath } from "../components/motion/Selection";
import { EASE_CAMERA } from "../components/motion/outline";
import { chartPace } from "../components/motion/pace";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DiscoveryCounty } from "@/lib/discovery";
import { countyMap, foldCounty } from "@/lib/map";
import { formatRon } from "@/lib/format";
import { countyKey } from "@/lib/map-capita-shared";
import { MAP_TRAVEL_NAME, mapCountyHref, markMapArrival, warmMapGeo } from "@/lib/map-arrival";
import { plainClick } from "@/components/motion/name-travel";
import Term from "@/components/Term";
import { GLOSSARY } from "@/lib/glossary";
import { TOUR_COUNTY_EVENT, TOUR_COUNTY_KEY } from "@/lib/tour";
import DiscoveryIcon from "./DiscoveryIcon";

// A county opens on /harta, the map of lei per inhabitant, on that county (owner, 18 November 2026; before: the
// breakdown by subject in Întreabă). The way there is drawn (lib/map-arrival.ts): this map travels into /harta's and
// its camera glides into the county. Client navigation (next/link inside the SVG); 42 links in view are not prefetched.
const countyHref = (label: string) => mapCountyHref(countyKey(label));
const mapHref = "/harta";
/** The total favours the large counties: the (?) says so and the per-inhabitant map is one link away (UX audit Z1-24). */
const MAP_TIP = `${GLOSSARY["sediul-institutiei"].text} Valoarea e totală, așa că județele mari ies mereu în față; harta pe locuitor e în Hartă.`;

export default function DiscoveryMap({ counties }: { counties: DiscoveryCounty[] }) {
  const [selected, setSelected] = useState(""), [hovered, setHovered] = useState("");
  // On a touch screen the first tap on a county chooses it (its value in the readout, the arrow ready) and a second tap
  // on it, or the arrow, opens its answer (UX audit Z1-05): a tap no longer leaves the page at once, and a map read
  // with a finger shows its figures. A mouse click opens at once, as before.
  const pointer = useRef("");
  const map = useRef<SVGSVGElement>(null);
  // A plain click that opens a county here: /harta is told which one, and this map takes the name it travels under
  // (the page's view transition). A new tab or a modified click opens the county without the arrival.
  const leave = (event: { defaultPrevented: boolean; button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }, label: string) => {
    if (!plainClick(event)) return;
    markMapArrival(countyKey(label));
    if ("startViewTransition" in document && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      map.current?.style.setProperty("view-transition-name", MAP_TRAVEL_NAME);
      // A navigation that never comes does not keep the name.
      window.setTimeout(() => map.current?.style.removeProperty("view-transition-name"), 6000);
    }
  };
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
    <div className="d-map-head"><div>{/* The title asks what both maps answer: this one the total by county, /harta lei per inhabitant (owner, 18 November 2026). */}<h2 id="d-map-title">Cât s-a contractat <br />în județul tău?</h2></div></div>
    {/* The map fills in, all counties together (never in the order of their values), when it first comes into view
        (DESIGN.md "Charts in motion"; the kit's cm-fade, gated by Reveal through data-chart). Hover stays instant. */}
    {/* One Tab stop for the map (UX audit Z1-20): the counties are left out of the Tab order, since the selector under it
        offers the same 42 choices and shows the same readout. */}
    <svg viewBox={`0 0 ${countyMap.width} ${countyMap.height}`} ref={map} className="d-romania-map cm-fade" data-chart="" role="group" onPointerEnter={() => { void warmMapGeo(); }} aria-label="Alege un județ pe hartă. Aceleași opțiuni sunt disponibile în selectorul de mai jos." onMouseLeave={() => setHovered("")} onPointerDown={(event) => { pointer.current = event.pointerType; }}>
      {countyMap.shapes.map((shape) => {
        const data = values.get(shape.key), bucket = data ? thresholds.filter((threshold) => data.amount > threshold).length : -1;
        return <Link key={shape.key} href={countyHref(shape.label)} prefetch={false} tabIndex={-1} onClick={(event) => { if (pointer.current === "touch" && selected !== shape.key) { event.preventDefault(); setSelected(shape.key); setHovered(""); void warmMapGeo(); return; } leave(event, shape.label); }} aria-label={`${shape.label}: ${data ? `${formatRon(data.amount)}. Vezi harta județului.` : "Fără valoare localizată în arhivă. Vezi harta județului."}`} onFocus={() => setHovered(shape.key)} onBlur={() => setHovered("")} onMouseEnter={() => setHovered(shape.key)}><path d={shape.d} className={`d-county d-county-${bucket}${focusKey === shape.key ? " selected" : ""}`}><title>{`${shape.label}${data ? ` · ${formatRon(data.amount)}` : " · date indisponibile"}`}</title></path></Link>;
      })}
      {/* The chosen county (a first tap on a phone, the selector, the tour's end) draws its outline once, from its top both
          ways (M-03); hover stays instant and draws nothing. */}
      {selected && (() => { const shape = countyMap.shapes.find((s) => s.key === selected); return shape ? <SelectPath key={selected} id={selected} d={shape.d} className="d-county-chosen" duration={600 * chartPace()} easing={EASE_CAMERA} /> : null; })()}
    </svg>
    <div className="d-map-legend"><span>Valoare înregistrată</span><div aria-label="De la valoare mai mică la valoare mai mare">{[0, 1, 2, 3, 4].map((n) => <i key={n} className={`d-map-swatch-${n}`} />)}</div><span>mai mare</span></div>
    <div className="d-map-choice"><div className="d-map-select"><DiscoveryIcon name="pin" /><label className="d-sr-only" htmlFor="discovery-county">Alege județul</label><select id="discovery-county" value={selected} onChange={(event) => { setSelected(event.target.value); setHovered(""); void warmMapGeo(); }}><option value="">Alege județul tău</option>{[...countyMap.shapes].sort((a, b) => a.label.localeCompare(b.label, "ro")).map((shape) => <option key={shape.key} value={shape.key}>{shape.label}</option>)}</select></div><Link href={selected ? countyHref(countyMap.shapes.find((shape) => shape.key === selected)!.label) : mapHref} onClick={(event) => { if (selected) leave(event, countyMap.shapes.find((shape) => shape.key === selected)!.label); }} aria-label={selected ? "Vezi harta județului selectat" : "Deschide harta tuturor județelor"}><DiscoveryIcon name="arrow" /></Link></div>
    <div className="d-map-current-row">
      <p className="d-map-current" role="status">{current ? <><b>{current.label}</b> · {total ? <span>{formatRon(total.amount)}</span> : "Fără valoare localizată în arhivă"}</> : present ? <>Județele și București</> : <>Nu avem încă date cartografiate.</>}</p>
      {/* Outside the live region: a button must not sit inside role="status". */}
      {present && <Term tip title={GLOSSARY["sediul-institutiei"].title} text={MAP_TIP} />}
      {/* The map of lei per inhabitant (UX audit Z1-24, Z4-20): the chosen county opens there, on the map's own default year.
          Only in Complet (owner, 18 November 2026): a second reading of this map; Hartă is in the menu. */}
      <Link className="d-map-per-capita" data-only="complet" prefetch={false} href={selected ? `/harta?ani=${new Date().getFullYear() - 1}&judet=${countyKey(countyMap.shapes.find((shape) => shape.key === selected)!.label)}` : "/harta"}>Pe locuitor <DiscoveryIcon name="arrow" /></Link>
    </div>
  </section>;
}

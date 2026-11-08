"use client";

import { useMemo, type CSSProperties } from "react";
import type { MapArea } from "@/lib/map-capita-shared";
import { CITY, dotRadius, packDots, pathCentroid } from "./dots";
import { useFillIn } from "./motion";

/*
 * The open county's hospitals on its map (owner, 8 November 2026, variant A): each a circle in its town, its area
 * proportional to its approved beds, never at its address (CNAS's list has none). Several hospitals of one town sit
 * side by side around the town's centre without overlapping; București's (and Ilfov's county hospital, in the capital)
 * gather around the city's centre. The county's UATs stay as a quiet backdrop.
 */

export default function HospitalLayer({ uats, hospitals, city, unit, ready, hover, tint, onHover, onOpen }: {
  uats: { siruta: string | number; d: string }[];
  hospitals: readonly MapArea[];
  /** București's centre in the map's units (for the capital's hospitals), or null. */
  city: [number, number] | null;
  /** The map's units per screen pixel at the county's view, so a circle keeps its size on any screen. */
  unit: number;
  ready: boolean;
  hover: string | null;
  /** A hospital's fill-opacity on the map's ramp, or null for a hollow ring (no figure). */
  tint: (a: MapArea) => number | null;
  onHover: (key: string | null) => void;
  onOpen: (a: MapArea) => void;
}) {
  const filled = useFillIn(ready);
  const centres = useMemo(() => new Map(uats.map((u) => [Number(u.siruta), pathCentroid(u.d)])), [uats]);
  const dots = useMemo(() => {
    const items = hospitals.flatMap((a) => {
      const at = a.siruta === CITY ? city : a.siruta ? centres.get(a.siruta) ?? null : null;
      return at ? [{ key: a.key, ax: at[0], ay: at[1], r: dotRadius(a.beds) * unit, area: a }] : [];
    });
    const placed = packDots(items, 1.5 * unit);
    // The largest first, so a small circle is never hidden under a large one.
    return items.map((it) => ({ ...it, at: placed.get(it.key)! })).sort((a, b) => b.r - a.r || a.key.localeCompare(b.key));
  }, [hospitals, centres, city, unit]);
  return <g className="mx-dots">
    {dots.map((d) => {
      const t = tint(d.area);
      return <g key={d.key} className={`mx-dot${t === null ? " is-gap" : ""}${hover === d.key ? " is-hover" : ""}`}
        onPointerEnter={() => onHover(d.key)} onClick={() => onOpen(d.area)}>
        {/* A target larger than the mark (4 px around it). */}
        <circle cx={d.at[0]} cy={d.at[1]} r={d.r + 4 * unit} className="mx-dot-hit" />
        <circle cx={d.at[0]} cy={d.at[1]} r={d.r} vectorEffect="non-scaling-stroke" className="mx-dot-m"
          style={t === null ? undefined : { fillOpacity: filled ? t : 0.07 } as CSSProperties} />
      </g>;
    })}
  </g>;
}

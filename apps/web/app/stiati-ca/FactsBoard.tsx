"use client";
import { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { PublicFact } from "@/lib/facts";
import FactCard from "./FactCard";
import { nextDraw, type Draw } from "./draw";
import { mosaic } from "./mosaic";
import { motionReduced, shuffleBoard, shuffleTime } from "./shuffle-motion";

/**
 * The page's title and its board of facts (owner, 27 November 2026). The board shows a draw of the published facts
 * (`first`, made by the server for this visit) and „Alte fapte” deals another draw in another arrangement (draw.ts,
 * mosaic.ts, shuffle-motion.ts).
 */
export default function FactsBoard({ facts, first }: { facts: PublicFact[]; first: Draw }) {
  const byId = useMemo(() => new Map(facts.map((f) => [f.id, f])), [facts]);
  const [draw, setDraw] = useState<Draw>(first);
  const [deals, setDeals] = useState(0);
  const board = useRef<HTMLDivElement>(null), icon = useRef<SVGSVGElement>(null);
  const busy = useRef(false), seen = useRef(new Set<string>());
  const shown = draw.ids.flatMap((id) => byId.get(id) ?? []);
  const tiles = mosaic(shown.length, true, draw.variant, draw.toneShift);

  const deal = async () => {
    if (busy.current || !board.current) return;
    busy.current = true;
    const next = nextDraw(facts, draw, seen.current);
    try {
      if (motionReduced()) setDraw(next);
      else {
        icon.current?.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(720deg)" }], { duration: shuffleTime(shown.length), easing: "cubic-bezier(.45,0,.25,1)" });
        await shuffleBoard(board.current, () => flushSync(() => setDraw(next)));
      }
      setDeals((n) => n + 1);
    } finally {
      busy.current = false;
    }
  };

  return <>
    <header className="facts-head">
      <h1>Știați că…</h1>
      {facts.length > 1 && <button type="button" className="btn facts-shuffle" onClick={deal}>
        <svg ref={icon} viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16.2 8.2A6.5 6.5 0 0 0 4.6 6.4M3.8 11.8a6.5 6.5 0 0 0 11.6 1.8" /><path d="M4.4 3.2v3.4h3.4M15.6 16.8v-3.4h-3.4" />
        </svg>
        Alte fapte
      </button>}
      <span className="sr-only" role="status">{deals > 0 ? `Alte fapte pe pagină (schimbarea ${deals}).` : ""}</span>
    </header>
    <div ref={board} className="facts-mosaic has-lead">{tiles.map((tile, i) => <FactCard key={shown[i]!.id} fact={shown[i]!} tile={tile} />)}</div>
  </>;
}

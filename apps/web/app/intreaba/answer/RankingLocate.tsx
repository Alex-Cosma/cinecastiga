"use client";

import { useEffect, useRef, useState } from "react";
import { formatRonFull } from "../../../lib/format";
import { LOCATE_DEBOUNCE_MS, LOCATE_MIN_CHARS, type LocateMatch, type LocateResult } from "../../../lib/ask/facet-parts";
import type { AskSpec } from "../../../lib/ask/spec";
import type { SearchResult } from "../builder/EntitySearch";
import Locate, { placeWords } from "./Locate";

/*
 * F5, "Unde e o firmă?" / "Unde e o instituție?" above a ranking (plan §4.2 P6,
 * final table §3.12, kit component 20): finds names in the answer's ranking
 * without filtering it (POST /api/ask/facets, part `locate`: the national
 * ranking over every record from entity_profile, any other from its rank
 * vector) and says "locul 37 din 413". A place past the rows shown offers
 * „Vezi în tot clasamentul ›”: the whole ranking, in pages, on that place's page.
 */

export interface RankingLocateProps {
  spec: AskSpec;
  /** How many places the answer shows (its first N, or a page's last place). */
  shown: number;
  /** Open the whole ranking on the page that holds `rank` (1-based). */
  onWhole: (rank: number) => void;
}

export default function RankingLocate({ spec, shown, onWhole }: RankingLocateProps) {
  const firms = spec.dim === "supplier";
  const [results, setResults] = useState<(SearchResult & { match: LocateMatch })[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [found, setFound] = useState<LocateMatch | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  // A new question forgets the last search's place.
  const key = JSON.stringify(spec);
  useEffect(() => { setFound(null); setResults([]); }, [key]);

  const search = (q: string) => {
    controller.current?.abort();
    if (q.length < LOCATE_MIN_CHARS) { setResults([]); setLoading(false); return; }
    const own = controller.current = new AbortController();
    setLoading(true);
    void fetch("/api/ask/facets", {
      method: "POST", headers: { "content-type": "application/json" }, signal: own.signal,
      body: JSON.stringify({ spec, part: "locate", q }),
    }).then(async (r) => (await r.json().catch(() => null)) as ({ ok: boolean } & LocateResult) | null).then((answer) => {
      if (own.signal.aborted) return;
      setLoading(false);
      if (!answer?.ok) { setResults([]); return; }
      setTotal(answer.total);
      setResults(answer.matches.map((match) => ({
        id: match.id, name: match.name, match,
        detail: match.rank === null ? "nu intră în clasament" : `${placeWords(match.rank, answer.total)}${match.value !== null ? ` · ${formatRonFull(match.value)}` : ""}`,
        ...(match.county ? { side: match.county } : {}),
      })));
    }).catch(() => { if (!own.signal.aborted) { setLoading(false); setResults([]); } });
  };

  const place = found ? found.rank === null ? "nu intră în clasament" : placeWords(found.rank, total) : null;
  return <div className="qb cq-locate">
    <Locate label={firms ? "Unde e o firmă?" : "Unde e o instituție?"} results={results} loading={loading} delay={LOCATE_DEBOUNCE_MS}
      minChars={LOCATE_MIN_CHARS} onSearch={search} emptyText="Niciun nume găsit în clasament."
      onPick={(result) => setFound((result as SearchResult & { match: LocateMatch }).match)}
      found={found && place ? { name: found.name, place } : null} />
    {found?.rank != null && found.rank > shown && (
      <button type="button" className="qb-link cq-locate-whole" onClick={() => onWhole(found.rank!)}>Vezi în tot clasamentul ›</button>
    )}
  </div>;
}

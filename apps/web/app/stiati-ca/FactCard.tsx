import type { CSSProperties } from "react";
import Link from "next/link";
import { formatCalendarDate } from "@/lib/format";
import type { FactChart } from "@/lib/fact-words";
import type { PublicFact } from "@/lib/facts";
import CopyFactLink from "./CopyFactLink";
import type { Tile } from "./mosaic";

/** The fact's small chart, to scale: two bars for a year against the one before, one bar for a share. */
function Chart({ chart, bare = false }: { chart: FactChart; bare?: boolean }) {
  if (chart.kind === "two") {
    const top = Math.max(chart.bars[0].value, chart.bars[1].value);
    return <div className="fact-two" role="img" aria-label={chart.says}>
      {chart.bars.map((bar, i) => <i key={i} className={i === 1 ? "is-now" : undefined} style={{ height: `${Math.max(2, (bar.value / top) * 100)}%` }} />)}
      {chart.bars.map((bar, i) => <span key={i}>{bar.label}</span>)}
    </div>;
  }
  return <div className="fact-share" role="img" aria-label={chart.label}>
    <div className="fact-share-track"><i style={{ width: `${Math.max(1, chart.share * 100)}%` }} /></div>
    {/* Where the context line beside it already says the count, the bar goes without its own line. */}
    {!bare && <span>{chart.label}</span>}
  </div>;
}

/**
 * One fact as a tile of the mosaic (owner, 27 November 2026): the large figure, the sentence that continues it, its
 * small chart or a line of context, and the way to the records behind it. The lead tile, and the fact on its own page
 * (`page`), also carry the day and both the chart and the context; there the sentence is the page's heading.
 */
export default function FactCard({ fact, tile, page = false }: { fact: PublicFact; tile?: Tile; page?: boolean }) {
  const lead = page || tile?.lead === true;
  const Say = page ? "h1" : "p";
  const style = tile ? ({ "--span": tile.span, "--rows": tile.rows, "--col": tile.col, "--row": tile.row } as CSSProperties) : undefined;
  // A large tile only half the board wide is tall and narrow: its chart goes under the words.
  const half = tile?.lead === true && tile.span === 3;
  const words = <>
    <p className="fact-figure">{fact.figure}{fact.unit && <small> {fact.unit}</small>}</p>
    <Say className="fact-say">{fact.statement}</Say>
    {fact.context && (lead || !fact.chart) && <p className="fact-context">{fact.context}</p>}
  </>;
  return <article className={`fact-card is-${page ? "plain" : tile?.tone ?? "plain"}${lead ? " is-lead" : ""}${half ? " is-half" : ""}${page ? " is-page" : ""}`} style={style} id={page ? undefined : `fapt-${fact.id}`}>
    {lead && <p className="fact-day">{page ? formatCalendarDate(fact.day) : <Link prefetch={false} href={`/stiati-ca/${fact.id}`}>{formatCalendarDate(fact.day)}</Link>}</p>}
    {lead && fact.chart?.kind === "two"
      ? <div className="fact-lead"><div className="fact-lead-words">{words}</div><Chart chart={fact.chart} /></div>
      : <>{words}{fact.chart && <Chart chart={fact.chart} bare={lead && Boolean(fact.context)} />}</>}
    <p className="fact-links">
      {fact.linkHref && <Link prefetch={false} href={fact.linkHref}>{fact.linkLabel ?? "Vezi înregistrările"} ›</Link>}
      <CopyFactLink id={fact.id} />
    </p>
  </article>;
}

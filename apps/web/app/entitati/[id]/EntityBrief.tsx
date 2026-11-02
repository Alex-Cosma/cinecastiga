import Link from "next/link";
import Term from "@/components/Term";
import type { EntitySummary, Segment, SummaryBar } from "@/lib/entity-summary";

/*
 * Under the top strip (owner, 2 November 2026, after the Impeccable critique): its notes (what its figures leave out or
 * split), then the domains — „Ce a atribuit” / „Ce a câștigat”, the one list the strip does not already say. The
 * totals, the largest partner and the partners' list were repeated: the strip, the ledger and „Furnizori” say them.
 */

/** A sentence's pieces: words, a (?) on a term, a link. */
function renderSegment(s: Segment, i: number) {
  if (typeof s === "string") return <span key={i}>{s}</span>;
  if (s.tip) return <Term key={i} tip id={s.tip}>{s.strong ? <strong>{s.text}</strong> : s.text}</Term>;
  // A list further down this page ("#peste-plafon") is a plain anchor.
  if (s.href?.startsWith("#")) return <a key={i} href={s.href}>{s.text}</a>;
  if (s.href) return <Link key={i} href={s.href}>{s.text}</Link>;
  return s.strong ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>;
}

function Bars({ bars }: { bars: SummaryBar[] }) {
  if (bars.length === 0) return null;
  return (
    <div className="ent-brief-list">
      <ul className="ent-tip-col">
        {bars.map((b) => (
          <li key={b.key}>
            <div className="ent-brief-label">
              {/* The full name stays in the text (screen readers, wrapping on phones); the title shows it where it is clipped. */}
              {b.href ? <Link href={b.href} title={b.label}>{b.label}</Link> : <span title={b.label}>{b.label}</span>}
              {b.consortium && <Term tip title="În consorțiu" text={b.consortium} className="cons-tag">în consorțiu</Term>}
            </div>
            <div className="ent-brief-track" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, b.share * 100))}%` }} /></div>
            <div className="ent-brief-val"><span>{b.valueLabel}</span> · {b.shareLabel}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function EntityBrief({ summary }: { summary: EntitySummary }) {
  if (summary.subjects.length === 0) return null;
  return (
    <section className="ent-brief" aria-labelledby="ce-a-atribuit">
      <h2 id="ce-a-atribuit" className="ent-tip">{summary.subjectsTitle} <Term tip id="cpv" /></h2>
      <Bars bars={summary.subjects} />
    </section>
  );
}

/** The top strip's notes: the contracts above the cap that its figures leave out, the contracts in a consortium. */
export function SummaryNotes({ notes }: { notes: Segment[][] }) {
  if (notes.length === 0) return null;
  return <div className="ent-top-notes ent-tip-col">{notes.map((s, i) => <p key={i} className="ent-tip">{s.map(renderSegment)}</p>)}</div>;
}

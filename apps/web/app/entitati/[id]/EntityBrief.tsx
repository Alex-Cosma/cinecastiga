import Link from "next/link";
import Term from "@/components/Term";
import type { GlossaryId } from "@/lib/glossary";
import type { EntitySummary, Segment, SummaryBar } from "@/lib/entity-summary";

/** "Pe scurt": plain sentences + two short bar lists, above the detailed sections. */
function renderSegment(s: Segment, i: number) {
  if (typeof s === "string") return <span key={i}>{s}</span>;
  if (s.tip) return <Term key={i} tip id={s.tip}>{s.text}</Term>;
  // A list further down this page ("#peste-plafon") is a plain anchor.
  if (s.href?.startsWith("#")) return <a key={i} href={s.href}>{s.text}</a>;
  if (s.href) return <Link key={i} href={s.href}>{s.text}</Link>;
  return s.strong ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>;
}

function Bars({ title, tip, bars, more }: { title: string; tip?: GlossaryId; bars: SummaryBar[]; more?: { href: string; label: string } }) {
  if (bars.length === 0) return null;
  return (
    <div className="ent-brief-list">
      <h3 className="ent-tip">{title}{tip && <> <Term tip id={tip} /></>}</h3>
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
      {more && <a className="ent-brief-more" href={more.href}>{more.label}</a>}
    </div>
  );
}

export default function EntityBrief({ summary, isAuth }: { summary: EntitySummary; isAuth: boolean }) {
  return (
    <section className="ent-brief" aria-labelledby="pe-scurt">
      <h2 id="pe-scurt">Pe scurt</h2>
      {summary.sentences.map((s, i) => <p key={i} className="ent-tip">{s.map(renderSegment)}</p>)}
      <div className="ent-brief-lists">
        <Bars title={summary.subjectsTitle} tip="cpv" bars={summary.subjects} />
        <Bars title={summary.partnersTitle} bars={summary.partners}
          more={{ href: "#parteneri", label: isAuth ? "Toți furnizorii ↓" : "Toate autoritățile ↓" }} />
      </div>
    </section>
  );
}

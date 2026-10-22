import Link from "next/link";
import type { EntitySummary, Segment, SummaryBar } from "@/lib/entity-summary";

/** "Pe scurt": plain sentences + two short bar lists, above the detailed sections. */
function renderSegment(s: Segment, i: number) {
  if (typeof s === "string") return <span key={i}>{s}</span>;
  if (s.href) return <Link key={i} href={s.href}>{s.text}</Link>;
  return s.strong ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>;
}

function Bars({ title, bars, more }: { title: string; bars: SummaryBar[]; more?: { href: string; label: string } }) {
  if (bars.length === 0) return null;
  return (
    <div className="ent-brief-list">
      <h3>{title}</h3>
      <ul>
        {bars.map((b) => (
          <li key={b.key}>
            <div className="ent-brief-label">
              {b.href ? <Link href={b.href}>{b.label}</Link> : <span>{b.label}</span>}
              {b.consortium && <span className="cons-tag" title={b.consortium}>în consorțiu</span>}
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
  const hasConsortiumBar = summary.partners.some((b) => b.consortium);
  return (
    <section className="ent-brief" aria-labelledby="pe-scurt">
      <h2 id="pe-scurt">Pe scurt</h2>
      {summary.sentences.map((s, i) => <p key={i}>{s.map(renderSegment)}</p>)}
      <div className="ent-brief-lists">
        <Bars title={summary.subjectsTitle} bars={summary.subjects} />
        <Bars title={summary.partnersTitle} bars={summary.partners}
          more={{ href: "#parteneri", label: isAuth ? "Toți furnizorii ↓" : "Toate autoritățile ↓" }} />
      </div>
      <p className="note">
        Procentele sunt din valoarea înregistrată de mai sus, pe aceeași selecție. Domeniile sunt diviziunile CPV, categoria oficială a ce s-a cumpărat.
        {hasConsortiumBar ? " „În consorțiu”: totalul include partea estimată din contracte câștigate împreună cu alte firme (valoarea împărțită egal)." : ""}
      </p>
    </section>
  );
}

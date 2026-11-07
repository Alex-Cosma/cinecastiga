import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import Term from "@/components/Term";
import { FLAG_META, flagFindingLabel } from "@/lib/flags";
import { riskEvidenceLine } from "@/lib/risk-presentation";
import { parseSignalState, signalUrl } from "@/lib/signals-shared";
import { formatExactDecimal, formatInt } from "@/lib/format";
import type { PairContext, RecordFlag } from "@/lib/record-types";
import { encodeSpec } from "@/lib/ask/permalink";
import { pairSpec } from "@/lib/ask/site-links";
import "./record.css";

/*
 * One template for the record pages (owner, 7 November 2026): a contract, a direct acquisition and an award notice
 * open with what was bought, who bought it from whom, the value with its own notes beside it, and the signals;
 * then the details, the parties, the documents and one block of sources, each link named after its document.
 */

export function RecordPage({ children, className }: { children: ReactNode; className?: string }) {
  return <article className={className ? `record ${className}` : "record"}>{children}</article>;
}

export interface RecordValue {
  amount: ReactNode;
  label: ReactNode;
  /** What qualifies this value (separate from totals, unverified currency, …): said right under it. */
  notes?: ReactNode[];
}

/** The head: title, lot, who from whom, the value and its notes, the record's identity line and its actions. */
export function RecordHead({ title, lot, lotLabel = "Lot", status, parties, value, meta, actions, signals }: {
  title: ReactNode; lot?: string | null;
  /** The word before `lot` ("Obiect" on a signal's page, where the line is the notice's object). */
  lotLabel?: string;
  status?: ReactNode; parties?: ReactNode; value?: RecordValue | null;
  meta: ReactNode[]; actions: ReactNode; signals?: number;
}) {
  const items = meta.filter(Boolean);
  return <header className="record-head">
    <div className="record-title">
      <h1>{title}</h1>
      {lot && <p className="record-lot"><span>{lotLabel}</span> {lot}</p>}
      {status && <p className="record-status" role="note">{status}</p>}
      {parties && <p className="record-parties">{parties}</p>}
    </div>
    {value && <div className="record-value">
      <p className="record-amount">{value.amount}</p>
      <p className="record-amount-label">{value.label}</p>
      {value.notes?.filter(Boolean).map((note, i) => <p className="record-value-note" key={i}>{note}</p>)}
    </div>}
    <p className="record-meta">{items.map((item, i) => <span key={i}>{item}</span>)}</p>
    <div className="record-actions">
      {actions}
      {!!signals && <a className="record-signal-chip" href="#semnale">{signals === 1 ? "1 semnal" : `${formatInt(signals)} semnale`} <span aria-hidden="true">↓</span></a>}
    </div>
  </header>;
}

export function RecordSection({ id, title, children, className }: { id: string; title: ReactNode; children: ReactNode; className?: string }) {
  return <section className={className ? `record-section ${className}` : "record-section"} aria-labelledby={`${id}-title`} id={id}>
    <h2 id={`${id}-title`}>{title}</h2>
    {children}
  </section>;
}

export interface Fact { label: ReactNode; value: ReactNode; wide?: boolean }
/** The record's facts as label/value pairs; a missing value is said in words by the caller, never left blank. */
export function Facts({ facts }: { facts: (Fact | null | false | undefined | "" | 0)[] }) {
  return <dl className="record-facts">
    {facts.filter((f): f is Fact => !!f).map((f, i) => <div key={i} className={f.wide ? "wide" : undefined}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
  </dl>;
}

/** Fields the source does not have, said once instead of a wall of "neprecizat". */
export function MissingLine({ fields }: { fields: string[] }) {
  if (!fields.length) return null;
  return <p className="record-missing">Lipsesc din sursă: {fields.join(", ")}.</p>;
}

/** The signals on this record: each with its name, what it means, one line of evidence and its case among the institution's. */
export function SignalList({ flags, authorityId, fallbackEvidence }: {
  flags: RecordFlag[]; authorityId: string | null; fallbackEvidence?: (flag: RecordFlag) => ReactNode;
}) {
  if (!flags.length) return null;
  return <RecordSection id="semnale" title={flags.length === 1 ? "Semnal" : "Semnale"} className="record-signals">
    <p className="record-lead">Piste de verificat, nu dovezi <Term tip id="semnal" /></p>
    <ul className="record-signal-list">
      {flags.map((f) => {
        const meta = FLAG_META[f.code];
        const line = riskEvidenceLine(f.code, f.evidence) ?? fallbackEvidence?.(f) ?? null;
        const href = authorityId ? signalUrl(parseSignalState({ tip: f.code, rol: "autoritate", ent: authorityId })) : null;
        return <li key={f.code}>
          <h3>{flagFindingLabel(f.code)}</h3>
          {meta?.short && <p>{meta.short}</p>}
          {line && <p className="record-evidence">{line}</p>}
          <div className="record-signal-links">
            {href && <Link href={href}>Toate cazurile instituției</Link>}
            {meta?.caveat && <details><summary>De ce nu e o dovadă</summary><p>{meta.caveat}</p></details>}
          </div>
        </li>;
      })}
    </ul>
  </RecordSection>;
}

export interface Party {
  key: string;
  role: string;
  name: ReactNode;
  /** One short line each: county, share, history, dependence, size, anomaly. */
  lines: ReactNode[];
}
export function PartyList({ parties }: { parties: Party[] }) {
  return <ul className="record-parties-list">
    {parties.map((p) => <li key={p.key}>
      <p className="record-party-role">{p.role}</p>
      <p className="record-party-name">{p.name}</p>
      {p.lines.filter(Boolean).map((line, i) => <p className="record-party-line" key={i}>{line}</p>)}
    </li>)}
  </ul>;
}

const pct = (share: number) => share >= 0.995 ? "Toate" : share < 0.01 ? "Sub 1%" : `${Math.round(share * 100)}%`;
/** What the data says about a firm next to this institution: its dependence on it and its size, neutral words. */
export function pairLines(pair: PairContext | null | undefined): ReactNode[] {
  if (!pair) return [];
  const out: ReactNode[] = [];
  const d = pair.dependence;
  if (d && d.share !== null) {
    const years = d.firstYear && d.lastYear ? (d.firstYear === d.lastYear ? `, ${d.firstYear}` : `, ${d.firstYear}–${d.lastYear}`) : "";
    out.push(<>{pct(d.share)} din contractele publice înregistrate ale firmei vin de la această instituție{years} <Term tip id="dependenta-firma" /></>);
  }
  const s = pair.size;
  if (s && (s.employees !== null || s.turnoverRon !== null)) {
    const parts = [s.employees !== null ? `${formatInt(s.employees)} ${s.employees === 1 ? "angajat" : "angajați"}` : null,
      s.turnoverRon !== null ? `cifră de afaceri ${formatExactDecimal(s.turnoverRon)} lei` : null].filter(Boolean);
    out.push(<>{parts.join(" · ")} în {s.year} <span className="record-quiet">· bilanț MF</span></>);
  }
  return out;
}

export interface ShareRow {
  key: string;
  name: ReactNode;
  /** 0..1, drawn as the bar's length. */
  share: number;
  /** The share in words ("98%", "peste 99%"). */
  shareText: string;
  /** The exact amount and what it counts, one short line. */
  detail: ReactNode;
}
/**
 * Who holds how much of a total (a signal's suppliers or institutions, a group's firms): one row each, the name, a bar
 * for the share and the exact amount. The bars grow from 0 together on first view (chart-motion.css).
 */
export function ShareList({ rows, label }: { rows: ShareRow[]; label: string }) {
  return <ol className="record-shares" aria-label={label} data-chart>
    {rows.map((r, i) => <li key={r.key} style={{ "--i": i } as CSSProperties}>
      <p className="record-share-name">{r.name}</p>
      <p className="record-share-figure"><b>{r.shareText}</b> <span>{r.detail}</span></p>
      <span className="record-share-bar" aria-hidden="true"><i className="cm-x" style={{ width: `${Math.max(0.6, Math.min(100, r.share * 100))}%` }} /></span>
    </li>)}
  </ol>;
}

/** A short list of links with a count each (an entity's other signals): one line per link, the count beside it. */
export function LinkList({ items }: { items: { key: string; href: string; label: ReactNode; count?: ReactNode }[] }) {
  return <ul className="record-links">
    {items.map((it) => <li key={it.key}><Link href={it.href} prefetch={false}>{it.label}</Link>{it.count && <span className="record-quiet"> · {it.count}</span>}</li>)}
  </ul>;
}

export interface Source { href: string; label: ReactNode; external?: boolean }
/** Every source of the record in one place, each link named after its document. */
export function Sources({ sources, children }: { sources: Source[]; children?: ReactNode }) {
  return <RecordSection id="surse" title="Surse" className="record-sources">
    <ul>
      {sources.map((s, i) => <li key={i}>{s.external
        ? <a href={s.href} target="_blank" rel="noopener noreferrer">{s.label} <span aria-hidden="true">↗</span><span className="sr-only"> (filă nouă)</span></a>
        : <Link href={s.href}>{s.label}</Link>}</li>)}
    </ul>
    {children}
  </RecordSection>;
}

/** Every record of one institution–firm pair, as a question in Întreabă (drawer open). */
export function pairHref(authority: { id: string; name: string }, supplier: { id: string; name: string }): string {
  return `/?spec=${encodeURIComponent(encodeSpec(pairSpec(authority, supplier)))}&drill=1`;
}

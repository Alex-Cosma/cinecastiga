import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import Term from "@/components/Term";
import { FLAG_META, flagFindingLabel } from "@/lib/flags";
import { GLOSSARY } from "@/lib/glossary";
import { CALLOFFS_MAYBE_ERROR, riskEvidenceLine } from "@/lib/risk-presentation";
import { parseSignalState, signalUrl } from "@/lib/signals-shared";
import { formatExactDecimal, formatInt } from "@/lib/format";
import { recordCaveat } from "@/lib/record-labels";
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
export function RecordHead({ title, heading, context, lot, lotLabel = "Lot", status, parties, value, meta, actions, signals }: {
  title: ReactNode; lot?: string | null;
  /** The page's own title element in place of `<h1>{title}</h1>` (a record page's RecordTitle, cut at three lines). */
  heading?: ReactNode;
  /** One row above the title: where the record belongs (its notice, its framework agreement). */
  context?: ReactNode;
  /** The word before `lot` ("Obiect" on a signal's page, where the line is the notice's object). */
  lotLabel?: string;
  status?: ReactNode; parties?: ReactNode; value?: RecordValue | null;
  meta: ReactNode[]; actions: ReactNode; signals?: number;
}) {
  const items = meta.filter(Boolean);
  return <header className="record-head">
    <div className="record-title">
      {context && <p className="record-context">{context}</p>}
      {heading ?? <h1>{title}</h1>}
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

/**
 * The signals on this record: each with its name, what it means, one line of evidence and its case among the
 * institution's, or the firm's own case for a signal that is the firm's (`supplierId`). `note`: one more line about
 * this very record under a signal's evidence.
 */
export function SignalList({ flags, authorityId, supplierId = null, fallbackEvidence, note }: {
  flags: RecordFlag[]; authorityId: string | null; supplierId?: string | null;
  fallbackEvidence?: (flag: RecordFlag) => ReactNode; note?: (flag: RecordFlag) => ReactNode;
}) {
  if (!flags.length) return null;
  // "Piste de verificat, nu dovezi" opens from the heading's "?" (owner, 17 November 2026: less small print); every
  // signal below keeps its visible "De ce nu e o dovadă".
  return <RecordSection id="semnale" title={<>{flags.length === 1 ? "Semnal" : "Semnale"} <Term tip title={GLOSSARY.semnal.title} text={`Piste de verificat, nu dovezi. ${GLOSSARY.semnal.text}`} /></>} className="record-signals">
    <ul className="record-signal-list">
      {flags.map((f) => {
        const meta = FLAG_META[f.code];
        // The card's own „De ce nu e o dovadă” says the data-entry error; the evidence line keeps the figures (owner, 17 November 2026).
        const line = riskEvidenceLine(f.code, f.evidence)?.replace(` ${CALLOFFS_MAYBE_ERROR}`, "") ?? fallbackEvidence?.(f) ?? null;
        // Call-offs over the ceiling: the evidence line starts with the same words as the definition and adds the
        // figures, so the definition goes (owner, 17 November 2026); every other signal keeps its definition.
        const short = f.code === "award_calloffs_over_ceiling" && line ? null : meta?.short;
        const firms = meta?.subject === "supplier";
        const href = firms ? (supplierId ? signalUrl(parseSignalState({ tip: f.code, rol: "furnizor", ent: supplierId })) : null)
          : authorityId ? signalUrl(parseSignalState({ tip: f.code, rol: "autoritate", ent: authorityId })) : null;
        const extra = note?.(f) ?? null;
        // Two sentences of why it is not proof; how it is counted is in its rule (Z7-06).
        const caveat = recordCaveat(f.code);
        return <li key={f.code}>
          <h3>{flagFindingLabel(f.code)}</h3>
          {short && <p>{short}</p>}
          {line && <p className="record-evidence">{line}</p>}
          {extra && <p className="record-evidence">{extra}</p>}
          <div className="record-signal-links">
            {href && <Link href={href}>{firms ? "Cazul firmei" : "Toate cazurile instituției"}</Link>}
            {/* One click from a signal to its rule (UX audit Z7-05); the anchors open the rule in the guide. */}
            {meta && <Link href={`/metodologie#${f.code}`} prefetch={false}>Regula <span aria-hidden="true">→</span></Link>}
            {caveat && <details><summary>De ce nu e o dovadă</summary><p>{caveat}</p></details>}
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
  /** Under the name: where the firm is (its county). */
  place?: ReactNode;
  /** What the data says about the pair, one short line each, in the same order on every record: this record's share,
   * the history with the institution, the institution's part of the firm's contracts, its size, an anomaly. */
  lines: ReactNode[];
}
/**
 * The parties (UX audit Z7-12, owner 16 November 2026): the institution one plain row (role · name · county), then each
 * firm a row, who on the left and what the data says about the pair on the right; the rows stack on a phone.
 */
export function PartyList({ institution, parties }: { institution: { name: ReactNode; place?: ReactNode }; parties: Party[] }) {
  return <>
    <p className="record-institution"><span className="record-party-role">Instituția</span> <span className="record-party-name">{institution.name}</span>{institution.place && <span className="record-quiet"> {institution.place}</span>}</p>
    <ul className="record-parties-list">
      {parties.map((p) => {
        const lines = p.lines.filter(Boolean);
        return <li key={p.key}>
          <div className="record-party-who">
            <p className="record-party-role">{p.role}</p>
            <p className="record-party-name">{p.name}</p>
            {p.place && <p className="record-party-line">{p.place}</p>}
          </div>
          {lines.length > 0 && <div className="record-party-what">{lines.map((line, i) => <p className="record-party-line" key={i}>{line}</p>)}</div>}
        </li>;
      })}
    </ul>
  </>;
}

const pct = (share: number) => share >= 0.995 ? "Toate" : share < 0.01 ? "Sub 1%" : `${Math.round(share * 100)}%`;
/** What the data says about a firm next to this institution: its dependence on it and its size, neutral words. */
export function pairLines(pair: PairContext | null | undefined): ReactNode[] {
  if (!pair) return [];
  const out: ReactNode[] = [];
  const d = pair.dependence;
  if (d && d.share !== null) {
    const years = d.firstYear && d.lastYear ? (d.firstYear === d.lastYear ? ` · ${d.firstYear}` : ` · ${d.firstYear}–${d.lastYear}`) : "";
    // Short form (owner, 17 November 2026): whose contracts and from whom is in the "?" right after it.
    out.push(<>{d.share >= 0.995 ? "Toate contractele firmei" : `${pct(d.share)} din contractele firmei`}{years} <Term tip id="dependenta-firma" /></>);
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

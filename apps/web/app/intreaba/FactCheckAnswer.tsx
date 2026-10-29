"use client";

import Link from "next/link";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { FactCheckData } from "../../lib/ask/compile";
import {
  FACT_TIPS, OUTSIDE_WHY, VERDICT_TIPS, VERDICT_WORDS, ceilingWords, contractWords, coverageEnd, daWords, frameworkWords, lei, monthSpan, noRecordsWords,
  recordWords, relationWords, roDay, sampleBadges, shareWords, shortLei, type FactOutsideRow, type FactParty, type FactSample,
} from "../../lib/ask/fact-check-shared";
import { countWords } from "../../lib/ask/answer-text";
import { askLink } from "../../lib/ask/source-spec";
import { countyDisplay } from "../../lib/ask/peer-groups-shared";
import type { QuestionSpec } from "../../lib/ask/question-ui";
import type { AskSpec } from "../../lib/ask/spec";
import { domainName } from "../../lib/cpv-aliases";
import { shareLabel } from "../../lib/entity-summary";
import { cleanName, formatRonFull } from "../../lib/format";
import { useAnswerEvidence } from "./AnswerEvidence";
import HelpTip from "./builder/HelpTip";
import "./fact-check.css";

/*
 * "A cumpărat X de la Y?" (fact_check-2, plan §4.10, final fact_check §4–§6):
 * the verdict (Da · Acord-cadru · Nu) with what it rests on, the two entities
 * by CUI and county, the weight of the relation, its profile (years,
 * channels, domains, competition), what to keep in mind (association,
 * framework ceilings, rows outside the sums), the five largest records and
 * the most recent, and the edge answers of final §5. The answer describes the
 * selection asked; every figure opens its records (→), another question is ›.
 * Recorded values, not payments.
 */

export interface FactCheckAnswerProps {
  fact: FactCheckData;
  /** The applied question: the sources' scopes and the wider question start from it. */
  spec?: AskSpec | undefined;
  /** "Arată toată relația": the same pair without period, domain, channel or an old link's condition. */
  onWider?: ((next: AskSpec) => void) | undefined;
}

/** The domains shown by name before "+N domenii" (final §4.4). */
const DOMAINS_SHOWN = 3;
/** Rows outside the sums shown before the rest unfolds (final §4.5). */
const OUTSIDE_SHOWN = 3;
/** Under 600 px the years wrap in rows of five, so each bar is a 44 px target (owner UI rule; the final drew nine columns of ~37 px). */
const YEARS_PER_PHONE_ROW = 5;

/** A figure beside its label (→): "107,5 mil." from a million, else with its unit ("18.453 lei"), so "2 · 18.453" never reads as two counts. */
const mil = shortLei;
const county = (raw: string | null | undefined) => countyDisplay(raw) ?? raw ?? null;
const partyLine = (p: FactParty) => [cleanName(p.name), p.cui ? `CUI ${p.cui}` : null, county(p.county)].filter(Boolean).join(" · ");
const shortName = (p: FactParty) => cleanName(p.name);

/** The pair alone (final §5.1 "Arată toată relația"): no period, domain, channel or old condition. */
export function wholeRelationSpec(spec: AskSpec): AskSpec {
  const f = spec.filters;
  const keep = ["authorityId", "authorityName", "supplierId", "supplierName"] as const;
  return { block: "fact_check", measure: spec.measure, filters: Object.fromEntries(keep.filter((key) => f[key] !== undefined).map((key) => [key, f[key]])) } as AskSpec;
}

export default function FactCheckAnswer({ fact: f, spec, onWider }: FactCheckAnswerProps) {
  const evidence = useAnswerEvidence();
  if (f.version !== 2 || !f.state) return <LegacyFact fact={f} />;
  const state = f.state;
  const records = f.count > 0;
  const whole = spec && onWider ? () => onWider(wholeRelationSpec(spec)) : null;
  const sources = (label: string, scope?: Parameters<NonNullable<typeof evidence>["open"]>[1], filters?: { stream: "da" | "contracts" }) =>
    evidence ? () => evidence.open(undefined, scope, label, filters ? { filters } : undefined) : undefined;
  const excludedOnly = state === "yes" && !records;

  return <div className="fc">
    {/* The verdict's (?) opens over the whole row (qb-tipwrap), not over the 86 px box. Its records open from the
        answer's own "Vezi cele N înregistrări" above: a second button here would open the same drawer. */}
    <div className="fc-verdict-row qb-tipwrap">
      <div className={`fc-verdict is-${state}`}>
        <span>{VERDICT_WORDS[state]}</span>
        {state !== "no" && <HelpTip tip={{ title: VERDICT_WORDS[state], text: VERDICT_TIPS[state] }} />}
      </div>
      <div className="fc-verdict-text">
        <VerdictText fact={f} spec={spec} />
      </div>
      {state === "framework" && f.frameworks?.rows.length === 1 && f.frameworks.rows[0]!.nid && <Link className="fc-src" href={`/contracte/${f.frameworks.rows[0]!.nid}`}>Vezi acordul-cadru<span className="qb-glyph" aria-hidden="true">↗</span></Link>}
    </div>

    {excludedOnly && <Outside rows={f.excluded?.rows ?? []} warm />}

    {state === "yes" && f.relation && <p className="fc-subtle">
      {records ? `${f.count.toLocaleString("ro-RO")} din ${f.relation.count.toLocaleString("ro-RO")} ale relației` : "O parte din relație"}
      {whole && <button type="button" className="fc-textlink" onClick={whole}>Arată toată relația</button>}
    </p>}

    {state === "no" && f.relation && f.reason !== "none" && <RelationBand relation={f.relation} onWhole={whole} />}

    <p className="fc-ident">
      {state === "no" && f.reason === "none" && <span>Ai ales:</span>}
      <span><Link href={`/entitati/${f.authority.entityId}`}>{partyLine(f.authority)}</Link></span>
      <span><Link href={`/entitati/${f.supplier.entityId}`}>{partyLine(f.supplier)}</Link></span>
    </p>

    {state === "no" && f.reason === "none" && <NoneContext fact={f} />}

    {records && f.share && <div className="fc-weight">
      <span>Pentru {shortName(f.supplier)}: {shareWords(f.share.ofSupplier, "client", "clienți", shareLabel)}</span>
      <span className="qb-tipwrap">Pentru {shortName(f.authority)}: {shareWords(f.share.ofAuthority, "furnizor", "furnizori", shareLabel)} <HelpTip tip={{ title: "Ponderea relației", text: FACT_TIPS.share }} /></span>
    </div>}

    {records && <Profile fact={f} sources={sources} />}
    <Remember fact={f} sources={sources} excludedOnly={excludedOnly} />
    {records && f.samples.length > 0 && <Samples samples={f.samples} count={f.count} />}
  </div>;
}

/** The lines beside the verdict (final §4.1, §5). */
function VerdictText({ fact: f, spec }: { fact: FactCheckData; spec: AskSpec | undefined }) {
  const state = f.state!;
  const words = { dataset: spec?.dataset, filters: (spec?.filters ?? {}) as Record<string, unknown>, population: spec?.population, minimumRecords: spec?.minimumRecords };
  const end = coverageEnd(f.coverage);
  if (state === "yes" && f.count > 0) {
    const onlyUndated = f.undated && f.undated.count === f.count;
    if (onlyUndated) return <>
      <p>{f.count === 1 ? "Un contract" : contractWords(f.count)} · <b className="fc-num">{lei(f.value)}</b></p>
      <p className="fc-meta qb-tipwrap">fără dată plauzibilă <HelpTip tip={{ title: "Fără dată plauzibilă", text: FACT_TIPS.undated }} /></p>
    </>;
    const span = monthSpan(f.dateFirst, f.dateLast);
    return <>
      <p><b>{recordWords(f.count)}</b> · <b className="fc-num">{lei(f.value)}</b> valoare înregistrată</p>
      <p className="fc-meta">{[span, f.dateLast ? `ultima: ${roDay(f.dateLast)}` : null, f.undated?.count ? `${countWords(f.undated.count, "contract", "contracte")} fără dată plauzibilă` : null].filter(Boolean).join(" · ")}</p>
    </>;
  }
  if (state === "yes") {
    const rows = f.excluded?.rows ?? [];
    const one = rows.length === 1 ? rows[0]! : null;
    return <>
      <p>{one ? `${one.src === "da" ? "O achiziție directă" : "Un contract"}${one.date ? `, ${roDay(one.date)}` : ""}${one.what ? ` · ${one.what}` : ""}` : countWords(f.excluded?.count ?? 0, "rând exclus din sume", "rânduri excluse din sume")}</p>
      <p className="fc-meta">Nu intră în sume.</p>
    </>;
  }
  if (state === "framework") {
    const fw = f.frameworks!;
    const one = fw.rows.length === 1 ? fw.rows[0]! : null;
    return <>
      <p>{one ? `Un acord-cadru${one.date ? `, ${roDay(one.date)}` : ""}` : frameworkWords(fw.count)} · <b className="fc-num">{ceilingWords(fw)}</b></p>
      <p className="fc-meta">Nicio comandă în date. Plafonul nu se adună.</p>
    </>;
  }
  // "Nu": its reason; an incomplete last year the question asks about; the archive's reach.
  const asked = f.reason === "choices" ? partialAsked(f.partialYear ?? null, words.filters) : null;
  return <>
    <p>{noRecordsWords(words, f.reason ?? "none")}</p>
    {asked && end && <p className="fc-meta">{asked} e incomplet: date până la {roDay(end)}.</p>}
    {f.reason === "none" && end && <p className="fc-meta qb-tipwrap">Date SEAP până la {roDay(end)} <HelpTip tip={{ title: "Ce acoperă datele", text: VERDICT_TIPS.no }} /></p>}
  </>;
}

/** The incomplete last year, when the question's period asks about it ("2026 e incomplet", final §5.1). */
function partialAsked(y: number | null, f: Record<string, unknown>): string | null {
  if (!y) return null;
  const from = f.yearFrom ? Number(f.yearFrom) : null, to = f.yearTo ? Number(f.yearTo) : null;
  return (from !== null || to !== null) && (from === null || from <= y) && (to === null || to >= y) ? String(y) : null;
}

/** "În toată relația: da · 5 înregistrări · 70,2 mil. lei · 2022–2025 · și 3 acorduri-cadru" + "Arată toată relația" (final §5.1). */
function RelationBand({ relation, onWhole }: { relation: NonNullable<FactCheckData["relation"]>; onWhole: (() => void) | null }) {
  const { verdict, facts } = relationWords(relation);
  return <div className="fc-whole" role="note">
    <p><b>În toată relația: {verdict}</b>{facts.length > 0 && <> · {facts.join(" · ")}</>}</p>
    {onWhole && <button type="button" className="fc-src" onClick={onWhole}>Arată toată relația</button>}
  </div>;
}

/** "Nu" in the whole archive (final §5.4): an entity of the same name with records, and each side's partners (›). */
function NoneContext({ fact: f }: { fact: FactCheckData }) {
  const network = (p: FactParty, role: "authority" | "supplier"): QuestionSpec => ({ block: "network", measure: "value", filters: role === "authority"
    ? { authorityId: Number(p.entityId), authorityName: p.name } : { supplierId: Number(p.entityId), supplierName: p.name } });
  const pairWith = (twin: NonNullable<FactCheckData["twins"]>[number]): QuestionSpec => ({ block: "fact_check", measure: "value", filters: twin.role === "authority"
    ? { authorityId: Number(twin.entityId), authorityName: twin.name, supplierId: Number(f.supplier.entityId), supplierName: f.supplier.name }
    : { authorityId: Number(f.authority.entityId), authorityName: f.authority.name, supplierId: Number(twin.entityId), supplierName: twin.name } });
  return <>
    {(f.twins ?? []).map((t) => <div key={`${t.role}:${t.entityId}`} className="fc-twin">
      Același nume, alt CUI: <b>{[t.cui ? `CUI ${t.cui}` : cleanName(t.name), county(t.county)].filter(Boolean).join(" · ")}</b> are <b>{recordWords(t.count)}</b> cu {shortName(t.role === "authority" ? f.supplier : f.authority)}
      {t.yearFirst ? `, ${t.yearFirst === t.yearLast ? t.yearFirst : `${t.yearFirst}–${t.yearLast}`}` : ""}.{" "}
      <Link className="fc-textlink" href={askLink(pairWith(t))}>Verifică<span className="qb-glyph" aria-hidden="true">›</span></Link>
    </div>)}
    {f.partners && <div className="fc-ctx">
      {f.partners.authoritySuppliers > 0 && <Link className="fc-textlink" href={askLink(network(f.authority, "authority"))}>Instituția a cumpărat de la {countWords(f.partners.authoritySuppliers, "firmă", "firme")}<span className="qb-glyph" aria-hidden="true">›</span></Link>}
      {f.partners.supplierAuthorities > 0 && <Link className="fc-textlink" href={askLink(network(f.supplier, "supplier"))}>Firma a vândut către {countWords(f.partners.supplierAuthorities, "instituție", "instituții")}<span className="qb-glyph" aria-hidden="true">›</span></Link>}
    </div>}
  </>;
}

type Sources = (label: string, scope?: Parameters<NonNullable<ReturnType<typeof useAnswerEvidence>>["open"]>[1], filters?: { stream: "da" | "contracts" }) => (() => void) | undefined;

/** A figure that opens its records (→), or plain text without the drawer. */
function SourceLink({ onClick, children, n }: { onClick: (() => void) | undefined; children: ReactNode; n?: string }) {
  const inner = <><span className="fc-t">{children}</span>{n && <span className="fc-n">{n}</span>}</>;
  return onClick ? <button type="button" className="fc-lk" onClick={onClick}>{inner}<span className="qb-glyph fc-arr" aria-hidden="true">→</span></button> : <span className="fc-lk">{inner}</span>;
}

/** The profile (final §4.4): each line only when it has something to split. */
function Profile({ fact: f, sources }: { fact: FactCheckData; sources: Sources }) {
  const years = f.years ?? [];
  const domains = f.domains ?? [];
  const shown = domains.length > DOMAINS_SHOWN + 1 ? domains.slice(0, DOMAINS_SHOWN) : domains;
  const rest = domains.slice(shown.length);
  const peak = Math.max(1, ...years.map((y) => y.count));
  const c = f.channels;
  const lines: ReactNode[] = [];
  if (years.length >= 2) lines.push(<Line key="y" label="Pe ani">
    <div className="fc-yrs" style={{ "--n": years.length, "--phone": Math.min(years.length, YEARS_PER_PHONE_ROW) } as CSSProperties}>
      {years.map((y) => {
        const partial = y.year === f.partialYear;
        const label = `${y.year}${partial ? "*" : ""}`;
        const open = sources(`${recordWords(y.count)} din ${y.year}`, { years: [y.year] });
        const body = <>
          <em>{y.count.toLocaleString("ro-RO")}</em>
          <i style={{ height: `${Math.max(3, (y.count / peak) * 100)}%` }} />
          <span>{label}</span>
        </>;
        const title = `${recordWords(y.count)} din ${y.year} · ${lei(y.value)}${partial ? " · an incomplet" : ""}`;
        return open ? <button key={y.year} type="button" className={`fc-yb${partial ? " is-partial" : ""}`} title={title} aria-label={`Vezi ${title}`} onClick={open}>{body}</button>
          : <span key={y.year} className={`fc-yb${partial ? " is-partial" : ""}`} title={title}>{body}</span>;
      })}
    </div>
    {(f.undated?.count ?? 0) > 0 && <p className="fc-note qb-tipwrap">+{f.undated!.count.toLocaleString("ro-RO")} fără dată <HelpTip tip={{ title: "Fără dată plauzibilă", text: FACT_TIPS.undated }} /></p>}
    {f.partialYear && years.some((y) => y.year === f.partialYear) && <p className="fc-note">* {f.partialYear} e incomplet.</p>}
  </Line>);
  if (c && c.da.count > 0 && c.contracts.count > 0) lines.push(<Line key="c" label="Cum">
    <div className="fc-flow">
      <SourceLink onClick={sources(daWords(c.da.count), undefined, { stream: "da" })} n={mil(c.da.value)}>{daWords(c.da.count)}</SourceLink>
      <SourceLink onClick={sources(`${contractWords(c.contracts.count)} din proceduri`, undefined, { stream: "contracts" })} n={mil(c.contracts.value)}>{contractWords(c.contracts.count)} din proceduri</SourceLink>
    </div>
  </Line>);
  if (domains.length >= 2) lines.push(<Line key="d" label="Ce">
    <div className="fc-flow">
      {shown.map((d) => <SourceLink key={d.code} onClick={sources(domainName(d.code, d.name), { cpvPrefixes: [d.code] })} n={`${d.count.toLocaleString("ro-RO")} · ${mil(d.value)}`}>
        <span title={d.name ?? undefined}>{domainName(d.code, d.name)}</span>
      </SourceLink>)}
      {rest.length > 0 && <SourceLink onClick={sources(`Celelalte ${countWords(rest.length, "domeniu", "domenii")}`, { excludeCpvPrefixes: shown.map((d) => d.code) })}
        n={`${rest.reduce((n, d) => n + d.count, 0).toLocaleString("ro-RO")} · ${mil(rest.reduce((n, d) => n + d.value, 0))}`}>+{countWords(rest.length, "domeniu", "domenii")}</SourceLink>}
    </div>
  </Line>);
  const comp = f.competition;
  if (comp) lines.push(<Line key="k" label="Concurență">
    <p className="fc-comp qb-tipwrap">
      {comp.single > 0 ? <SourceLink onClick={sources(`${contractWords(comp.single)} cu o singură ofertă`, { singleBid: true })}>{contractWords(comp.single)} cu o singură ofertă</SourceLink> : <span>niciun contract cu o singură ofertă</span>}
      <span>{comp.multiple > 0 ? `${comp.multiple.toLocaleString("ro-RO")} cu mai multe ` : ""}(TED){comp.unknown > 0 ? ` · ${comp.unknown.toLocaleString("ro-RO")} nu știm` : ""}</span>
      <HelpTip tip={{ title: "Concurență", text: FACT_TIPS.competition }} />
    </p>
  </Line>);
  return lines.length ? <div className="fc-prof">{lines}</div> : null;
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return <div className="fc-pl"><span className="fc-h">{label}</span><div className="fc-pc">{children}</div></div>;
}

/** "De reținut" (final §4.5): what changes how the total reads. Neutral, never orange. */
function Remember({ fact: f, sources, excludedOnly }: { fact: FactCheckData; sources: Sources; excludedOnly: boolean }) {
  const items: ReactNode[] = [];
  const cons = f.consortium;
  if (cons && f.count > 0) items.push(<li key="cons" className="qb-tipwrap">
    <SourceLink onClick={sources(`${contractWords(cons.count)} în asociere`, { consortium: true })}>{contractWords(cons.count)} în asociere</SourceLink>
    <span> socotim partea firmei, {lei(cons.share)} din {lei(cons.full)}.</span> <HelpTip tip={{ title: "În asociere", text: FACT_TIPS.consortium }} />
  </li>);
  const fw = f.frameworks;
  if (fw && fw.count > 0 && f.state !== "framework") items.push(<li key="fw"><Frameworks rows={fw.rows} frameworks={fw} /></li>);
  if (fw && f.state === "framework" && fw.rows.length > 1) items.push(<li key="fw"><Frameworks rows={fw.rows} frameworks={fw} /></li>);
  if (fw && fw.inSums > 0) items.push(<li key="fws" className="qb-tipwrap">
    <span>{frameworkWords(fw.inSums)} {fw.inSums === 1 ? "inclus" : "incluse"} în sume: plafon {lei(fw.inSumsCeiling)}, nu comenzi.</span> <HelpTip tip={{ title: "Plafoane în sume", text: FACT_TIPS.frameworksInSums }} />
  </li>);
  if (!excludedOnly && (f.excluded?.count ?? 0) > 0) items.push(<li key="ex"><Outside rows={f.excluded!.rows} total={f.excluded!.count} /></li>);
  if (!items.length) return null;
  return <div className="fc-pl fc-remember"><span className="fc-h">De reținut</span><ul className="fc-notes">{items}</ul></div>;
}

function Frameworks({ rows, frameworks }: { rows: readonly FactOutsideRow[]; frameworks: { count: number; ceiling: number; unknown?: number } }) {
  const [open, setOpen] = useState(false);
  return <div className="qb-tipwrap">
    <span><b>{frameworkWords(frameworks.count)}</b> · {ceilingWords(frameworks)}, nu se adună</span> <HelpTip tip={{ title: "Acord-cadru", text: VERDICT_TIPS.framework }} />
    {rows.length > 0 && <button type="button" className="fc-textlink" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "Ascunde" : rows.length === 1 ? "Vezi-l" : "Vezi-le"}</button>}
    {open && <ul className="fc-outside">{rows.map((r) => <li key={r.refId}>
      {r.nid ? <Link href={`/contracte/${r.nid}`}>{[roDay(r.date), r.what].filter(Boolean).join(" · ") || "Acord-cadru"}<span className="qb-glyph" aria-hidden="true">↗</span></Link> : [roDay(r.date), r.what].filter(Boolean).join(" · ")}
      <span className="fc-n">{r.value !== null && r.value > 0 ? `plafon ${formatRonFull(r.value)}` : `plafon fără valoare în lei${r.currency ? ` (${r.currency})` : ""}`}</span>
    </li>)}</ul>}
  </div>;
}

/** The rows outside the sums: up to three, then the rest unfolds; each opens its page (final §4.5, §5.5). */
function Outside({ rows, total, warm = false }: { rows: readonly FactOutsideRow[]; total?: number; warm?: boolean }) {
  const [all, setAll] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const shown = all ? rows : rows.slice(0, OUTSIDE_SHOWN);
  const hidden = (total ?? rows.length) - shown.length;
  // The rows unfold in place: keyboard focus moves to the first one shown, not back to the page's top.
  const more = () => { setAll(true); requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`li:nth-child(${OUTSIDE_SHOWN + 1})`)?.focus()); };
  return <div className={warm ? "fc-excl" : undefined}>
    <ul ref={list} className="fc-outside">{shown.map((r, i) => {
      const why = r.category === "framework" ? "plafon" : OUTSIDE_WHY[r.category];
      // An amount without a value in lei says so once, with its day and the source's currency ("02.04.2019 · fără valoare în lei (EUR)"):
      // without a figure, the day tells the rows apart.
      const amount = r.value !== null ? <><b className="fc-num">{formatRonFull(r.value)}</b>
        {r.estimated !== null && r.src === "da" ? <> (estimată: <b className="fc-num">{formatRonFull(r.estimated)}</b>)</> : null}{`, ${why}`}</> : null;
      const none = [roDay(r.date), `${why}${r.currency ? ` (${r.currency})` : ""}`].filter(Boolean).join(" · ");
      return <li key={`${r.src}:${r.refId}`} className="qb-tipwrap" tabIndex={i === OUTSIDE_SHOWN ? -1 : undefined}>
        <span>
          {warm ? amount ? <>Valoare înregistrată {amount}</> : `${none.charAt(0).toLocaleUpperCase("ro-RO")}${none.slice(1)}`
            : <>{`+${r.src === "da" ? "1 achiziție directă exclusă" : "1 contract exclus"} din sume (`}{amount ?? none})</>}
        </span>{" "}
        <HelpTip tip={{ title: "În afara sumelor", text: FACT_TIPS.excluded }} />{" "}
        {r.src === "da" && /^\d+$/.test(r.refId) ? <a className="fc-textlink" href={`https://e-licitatie.ro/pub/direct-acquisition/view/${r.refId}`} target="_blank" rel="noreferrer">Vezi achiziția<span className="qb-glyph" aria-hidden="true">↗</span></a>
          : r.nid ? <Link className="fc-textlink" href={`/contracte/${r.nid}`}>Vezi contractul<span className="qb-glyph" aria-hidden="true">↗</span></Link> : null}
      </li>;
    })}</ul>
    {hidden > 0 && !all && rows.length > shown.length && <button type="button" className="fc-textlink" onClick={more}>Arată încă {hidden.toLocaleString("ro-RO")}</button>}
    {hidden > 0 && (all || rows.length <= shown.length) && <p className="fc-note">și încă {countWords(hidden, "rând", "rânduri")} în afara sumelor</p>}
  </div>;
}

/** "Cele mai mari 5 · și cea mai recentă" (final §4.6): cards on a phone. */
function Samples({ samples, count }: { samples: readonly FactSample[]; count: number }) {
  const recent = samples.some((s) => s.recent);
  return <section className="fc-recs" aria-label="Cele mai mari înregistrări">
    <div className="fc-recs-head"><h4>{count === 1 ? "Înregistrarea" : count <= 5 ? "Înregistrările" : "Cele mai mari 5"}</h4>{recent && <small>și cea mai recentă</small>}</div>
    <ul>{samples.map((s, i) => <li key={`${s.src}:${s.refId ?? i}`}>
      <span className="fc-d">{roDay(s.date) ?? "fără dată"}</span>
      <span className="fc-w">
        {s.src === "contracts" && s.nid ? <Link href={`/contracte/${s.nid}`}>{s.cpvName ?? s.daCode ?? "Contract"}</Link> : <span>{s.cpvName ?? s.daCode ?? "Achiziție directă"}</span>}
        <span className="fc-badges">{sampleBadges(s).map((b) => <span key={b} className="fc-badge">{b}</span>)}{s.recent && <span className="fc-badge is-recent">cea mai recentă</span>}</span>
      </span>
      <span className="fc-v">{formatRonFull(s.value)}</span>
    </li>)}</ul>
  </section>;
}

/** An answer stored before fact_check-2 (captures, watch runs): its own words. */
function LegacyFact({ fact }: { fact: FactCheckData }) {
  return <div className="fc">
    <p className="fc-note">Răspuns dintr-o versiune mai veche a site-ului. Reîncarcă întrebarea ca să vezi verdictul și profilul.</p>
    <p>{fact.verdict ? `${recordWords(fact.count)}, în total ${formatRonFull(fact.value)}.` : "Nicio înregistrare în datele selectate."}</p>
  </div>;
}

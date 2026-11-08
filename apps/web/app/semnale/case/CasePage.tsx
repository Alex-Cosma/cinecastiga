import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import ClipButton from "@/components/ClipButton";
import EntityName from "@/components/EntityName";
import Term from "@/components/Term";
import { countWords } from "@/lib/ask/answer-text";
import { evidenceLinks } from "@/lib/ask/evidence";
import { entityHref } from "@/lib/entity-href";
import { FLAG_META, FLAG_ORDER, flagEntityRule, flagLabel } from "@/lib/flags";
import { cleanName, countyLabel, formatCalendarDate, formatExactDecimal, formatInt, formatRon } from "@/lib/format";
import { riskEvidenceLine, signalPeriodLabel } from "@/lib/risk-presentation";
import { RISK_BAND_CLASS, RISK_BAND_WORD, RISK_CRITERIA, riskBand, riskScoreText, type RiskCriterion, type ScorePart } from "@/lib/risk-score";
import type { CaseInstance, CaseRecord, SignalCase } from "@/lib/signal-case";
import { aboveWords, capacityWords, caseUnitWords, partnerWords, pctWords, roundWords, splitWords, yearEndWords, type CaseWords } from "@/lib/signal-case-words";
import { SIGNAL_GUIDANCE } from "@/lib/signal-guidance";
import {
  aboveCeiling, capacity, decemberRecords, nearCeiling, partnerShare, ratioWords, repeatedAmounts, splitGroup, splitSummary, topPartners, yearEnd,
  type AboveCeiling, type CaseInput, type NearCeiling, type SplitGroup,
} from "@/lib/signal-mirror";
import { signalUrl, withoutRole, type SignalState } from "@/lib/signals-shared";
import CaseTable, { type CaseRow } from "./CaseTable";
import OpenFromHash from "./OpenFromHash";
import OutsideMenu from "./OutsideMenu";
import RecordList, { type RecordRow } from "./RecordList";
import "./case.css";

/*
 * One pattern of one entity (owner, 6 November 2026, "Oglinda"): the entity's score made of its patterns is the
 * menu between them; the case is told in one sentence with its numbers; the mirror puts what happened beside its
 * reference; then the cases, each with its records, and the entity's other patterns. Every pattern is a lead to
 * check, not proof; values are recorded, not payments.
 */

const SEGMENT_CLASS = ["c0", "c1", "c2", "c3", "c4"] as const;
const RISK_CODES = new Set<string>(Object.keys(SIGNAL_GUIDANCE));
const inputOf = (i: CaseInstance): CaseInput => ({ id: i.id, partnerId: i.partnerId, partnerName: i.partnerName, period: i.period, evidence: i.evidence, records: i.records });
const lei = (v: string | number | null | undefined) => (v == null ? "necunoscută" : `${formatExactDecimal(String(v))} lei`);
/** The entity's own links carry `?rol=` only when it both buys and sells. */
const roleless = (data: SignalCase, href: string) => (data.entity.otherRole ? href : withoutRole(href));
const partnerRole = (role: SignalState["role"]) => (role === "authority" ? "supplier" : "authority");

interface Tabs { inScore: RiskCriterion[]; quiet: string[]; outside: string[] }

function caseTabs(data: SignalCase): Tabs {
  const { entity: e, counts } = data;
  const inScore = (RISK_CRITERIA[e.role] as readonly RiskCriterion[])
    .filter((c) => (e.points[c] ?? 0) > 0 && e.parts[c])
    .sort((a, b) => (e.points[b] ?? 0) - (e.points[a] ?? 0));
  const present = Object.keys(counts).filter((c) => (counts[c] ?? 0) > 0 && FLAG_META[c]);
  if (!present.includes(data.code) && FLAG_META[data.code]) present.push(data.code);
  const order = (c: string) => { const i = FLAG_ORDER.indexOf(c); return i < 0 ? 99 : i; };
  return {
    inScore: e.hasRiskScore ? inScore : [],
    quiet: present.filter((c) => RISK_CODES.has(c) && !(e.hasRiskScore && (inScore as string[]).includes(c))).sort((a, b) => order(a) - order(b)),
    outside: present.filter((c) => !RISK_CODES.has(c)).sort((a, b) => order(a) - order(b)),
  };
}

function ScoreTabs({ data, state, tabs }: { data: SignalCase; state: SignalState; tabs: Tabs }) {
  const { entity: e, code, counts } = data;
  const seg = (c: string) => SEGMENT_CLASS[Math.min(Math.max(0, (tabs.inScore as string[]).indexOf(c)), SEGMENT_CLASS.length - 1)];
  const href = (c: string) => roleless(data, signalUrl(state, { code: c }));
  // A tab: its segment's colour (in the score), a dashed one (found, 0 points), none (outside the score).
  const tab = (c: string, points: ReactNode, sub: string, cls = "") => (
    <li key={c}><Link href={href(c)} className={`sgc-tab ${cls}`} aria-current={c === code ? "page" : undefined}>
      {cls !== "outside" && <i className="sw" aria-hidden="true" />}<span><b>{flagLabel(c)}{points}</b><small>{sub}</small></span>
    </Link></li>
  );
  const scored = tabs.inScore.length > 0;
  return (
    <nav className="sgc-score" aria-label={`Tiparele: ${cleanName(e.name)}`}>
      {scored && (
        // Each segment opens its pattern's tab (the tabs under it are the same links, for the keyboard and screen readers).
        // In motion: the bar grows from 0 as one piece (components/motion/chart-motion.css).
        <div className="sgc-bar cm-x" data-chart title={`Scorul ${formatInt(Math.round(e.score))} din 100`}>
          {tabs.inScore.map((c, i) => (
            <Link key={c} href={href(c)} tabIndex={-1} aria-hidden="true" className={`sgc-seg ${seg(c)}${c === code ? " on" : ""}${i === 0 ? " first" : ""}`} style={{ width: `${e.points[c] ?? 0}%` }}>
              <span className={`sgc-tip${i === 0 ? " l" : ""}`}><b>{flagLabel(c)}</b><span>+{formatInt(e.points[c] ?? 0)} din scorul de {formatInt(Math.round(e.score))} · {caseUnitWords(c, counts[c] ?? 0)}</span></span>
            </Link>
          ))}
        </div>
      )}
      {/* The signals outside the score: one button at the end of the score's tabs, their list under it (owner, 6 November
          2026, variant 3); an entity with nothing in the score has them as its tabs. */}
      <ul className="sgc-tabs">
        {tabs.inScore.map((c) => tab(c, <> · +{formatInt(e.points[c] ?? 0)}</>, caseUnitWords(c, counts[c] ?? 0), seg(c)))}
        {tabs.quiet.map((c) => tab(c, e.hasRiskScore ? " · 0" : "", e.hasRiskScore ? "găsit, prea puțin" : caseUnitWords(c, counts[c] ?? 0), "quiet"))}
        {tabs.outside.length > 0 && (scored || tabs.quiet.length > 0
          ? <OutsideMenu current={code} items={tabs.outside.map((c) => ({ code: c, label: flagLabel(c), sub: caseUnitWords(c, counts[c] ?? 0), href: href(c) }))} />
          : tabs.outside.map((c) => tab(c, "", caseUnitWords(c, counts[c] ?? 0), "outside")))}
      </ul>
    </nav>
  );
}

/** One face of the mirror: what it compares, a large number and what it is. */
function Side({ title, big, unit, children }: { title: string; big: string; unit: ReactNode; children?: ReactNode }) {
  return <section className="sgc-side"><h2>{title}</h2><p className="sgc-big"><span>{big}</span><small>{unit}</small></p>{children}</section>;
}

/** The share bar of a partner signal, with the rule's thresholds. */
function ShareBar({ share, ticks = [] }: { share: number; ticks?: { at: number; label: string; left?: boolean }[] }) {
  return <>
    <div className="sgc-share" aria-hidden="true" data-chart><i className="cm-x" style={{ width: `${Math.max(0.6, Math.min(100, share * 100))}%` }} /></div>
    {ticks.length > 0 && <div className="sgc-ticks" aria-hidden="true">{ticks.map((t) => <span key={t.at} className={t.left ? "l" : ""} style={{ left: `${t.at * 100}%` }}><em>{t.label}</em></span>)}</div>}
  </>;
}

/**
 * A case's records as the sortable list's rows (RecordList). `counterparty`: the side each row names (the set-aside
 * acquisitions are with other partners).
 */
function Records({ records, alsoIn, code, empty, counterparty }: { records: readonly CaseRecord[]; alsoIn: Record<string, string[]>; code: string; empty?: string; counterparty?: "authority" | "supplier" }) {
  const rows: RecordRow[] = records.map((r, i) => {
    const links = evidenceLinks(r);
    const party = counterparty === "authority" ? { id: r.authorityId, name: r.authority } : counterparty === "supplier" ? { id: r.supplierId, name: r.supplier } : null;
    return {
      key: `${r.src}:${r.refId}:${i}`, code: r.daCode ?? r.refId ?? "", date: r.date ?? null,
      title: r.title ?? r.cpvName ?? (r.src === "contracts" ? "Contract" : "Achiziție directă"),
      href: `/${r.src === "contracts" ? "contracte" : "achizitii"}/${r.refId}`,
      value: r.originalValueExact === null ? null : Number(r.valueExact),
      valueText: r.originalValueExact === null ? "valoare nepublicată" : lei(r.valueExact),
      seap: links.seap, ted: links.ted,
      also: (r.refId ? alsoIn[r.refId] ?? [] : []).filter((c) => c !== code).map((c) => flagLabel(c)),
      party: party && counterparty ? { id: party.id ?? null, name: cleanName(party.name) || "—", role: counterparty } : null,
    };
  });
  return <RecordList rows={rows} empty={empty ?? "Nu mai găsim înregistrările acestui caz în datele de acum."} />;
}

/** A case's own actions: its records as CSV, and saving it in an investigation (signed-in viewers). */
function CaseActions({ inst, label }: { inst: CaseInstance; label: string }) {
  return <div className="sgc-acts">
    <a className="sgc-btn" href={`/api/evidence/sources?kind=signal&id=${inst.id}`} download>Descarcă CSV</a>
    <ClipButton kind="signal" refId={inst.id} label={label} />
  </div>;
}

function Warnings({ inst }: { inst: CaseInstance }) {
  const shown = inst.warnings.filter((w) => !w.startsWith("Selecția este reconstituită"));
  return shown.length ? <ul className="sgc-warn">{shown.map((w, i) => <li key={i}>{w}</li>)}</ul> : null;
}

/* ---------------- the patterns ---------------- */

function SplitCase({ data, groups }: { data: SignalCase; groups: SplitGroup[] }) {
  const s = splitSummary(groups);
  const items = groups.flatMap((g) => g.items);
  // At most 80 bars, whole groups first: a group's purchases stay side by side, the groups apart.
  const clusters: { g: SplitGroup; items: SplitGroup["items"] }[] = [];
  for (let left = 80, i = 0; i < groups.length && left > 0; i++) { const g = groups[i]!; clusters.push({ g, items: g.items.slice(0, left) }); left -= g.items.length; }
  const shown = clusters.reduce((a, c) => a + c.items.length, 0);
  const max = Math.max(1.05, ...groups.map((g) => g.ratio));
  const top = groups.slice(0, 8);
  const role = data.entity.role;
  let seen = 0;
  // A bar's hover card opens to the right near the left edge, to the left near the right one.
  const edge = (at: number, of: number) => (at < of * 0.2 ? " l" : at > of * 0.8 ? " r" : "");
  return <>
    <div className="sgc-mirror">
      <Side title="Luate pe rând" big={formatInt(s.acquisitions)} unit={s.allUnder ? (s.acquisitions === 1 ? "achiziție, sub plafon" : "achiziții, toate sub plafon") : "achiziții"}>
        {/* In motion: the axis, the ceiling and the 50% line stay; each purchase rises from 0, in their order, so the reader
            sees each one stop under the ceiling. The stagger is spread over the shown bars and capped. */}
        <div className="sgc-ychart" data-chart>
          <div className="sgc-yaxis" aria-hidden="true"><span style={{ bottom: "100%" }}>plafonul</span><span style={{ bottom: "50%" }}>50%</span><span style={{ bottom: "0%" }}>0</span></div>
          <div className="sgc-cols" style={shown > 10 ? { "--chart-step": `calc(var(--chart-cap) / ${shown})` } as CSSProperties : undefined}><span className="sgc-ceil" style={{ bottom: "100%" }} /><span className="sgc-grid50" />
            {clusters.map(({ g, items: its }) => (
              <div key={g.id} className={`grp${g.counted ? "" : " out"}`} style={{ flexGrow: its.length }}>
                {its.map((it, k) => {
                  const at = seen++;
                  const words = `${cleanName(g.partnerName)}, ${it.date ? formatCalendarDate(it.date) : "fără dată"}: ${lei(it.value)}, ${pctWords(it.ofCeiling)} din plafonul de ${lei(g.ceiling)}`;
                  return <span key={k} className="bar cm-y" tabIndex={0} role="img" aria-label={words} style={{ height: `${Math.max(0.8, Math.min(100, it.ofCeiling * 100))}%`, "--i": at } as CSSProperties}>
                    <span className={`sgc-tip${edge(at, shown)}`} aria-hidden="true"><b>{cleanName(g.partnerName)}</b><span>{it.date ? formatCalendarDate(it.date) : "fără dată"}{it.title ? ` · ${it.title}` : ""}</span><span><b>{lei(it.value)}</b> · {pctWords(it.ofCeiling)} din plafonul de {lei(g.ceiling)}</span></span>
                  </span>;
                })}
              </div>
            ))}</div>
        </div>
        <p className="sgc-cap">Fiecare bară e o achiziție, ca procent din plafonul ei; barele aceleiași firme stau împreună{items.length > shown ? ` (primele ${formatInt(shown)} din ${formatInt(items.length)})` : ""}.
          {s.largest && <> Cea mai mare: {lei(s.largest.value)}, cu {formatInt(Math.round(s.largest.ceiling - s.largest.value))} lei sub {lei(s.largest.ceiling)}.</>}</p>
      </Side>
      <Side title={role === "authority" ? "Adunate, pe firmă și an" : "Adunate, pe instituție și an"} big={ratioWords(s.topRatio)} unit="plafonul, la cel mai mare grup">
        {/* In motion: the ceiling stays; the groups rise together (groups, not a sequence). */}
        <div className="sgc-groups" data-chart><span className="sgc-ceil" style={{ bottom: `${(1 / max) * 100}%` }} />
          {top.map((g, i) => {
            const words = `${cleanName(g.partnerName)}, ${g.year}: ${countWords(g.count, "achiziție", "achiziții")}, ${lei(g.total)}, ${ratioWords(g.ratio)} plafonul de ${lei(g.ceiling)}`;
            return <div key={g.id} className={g.counted ? "" : "out"}><em aria-hidden="true">{ratioWords(g.ratio)}</em>
              <i className="cm-y" tabIndex={0} role="img" aria-label={words} style={{ height: `${(g.ratio / max) * 100}%` }}>
                <span className={`sgc-tip${edge(i, top.length)}`} aria-hidden="true"><b>{cleanName(g.partnerName)} · {g.year}</b><span>{countWords(g.count, "achiziție", "achiziții")}{g.dates ? `, ${g.dates}` : ""}</span><span><b>{lei(g.total)}</b> · {ratioWords(g.ratio)} plafonul de {lei(g.ceiling)}{g.counted ? "" : " · nu intră în scor"}</span></span>
              </i></div>;
          })}</div>
        <div className="sgc-glab">{top.map((g) => <span key={g.id}><EntityName id={g.partnerId} role={partnerRole(role)} title={cleanName(g.partnerName)}>{cleanName(g.partnerName)}</EntityName><small>{g.year}{g.counted ? "" : " · nu intră"}</small></span>)}</div>
        <p className="sgc-cap">Linia punctată e plafonul: fiecare bară e un grup, adunat.{groups.length > top.length ? ` Primele ${formatInt(top.length)} din ${formatInt(groups.length)}.` : ""}</p>
      </Side>
    </div>
    <CasesHead title={countWords(groups.length, "grup", "grupuri")} total={data.total} shown={groups.length} />
    {/* In motion: the rows on screen when the list comes into view grow their spark and their track, top to bottom. */}
    <div className="sgc-cases" data-chart>
      {groups.map((g, row) => {
        const inst = data.instances.find((x) => x.id === g.id)!;
        return (
          <details key={g.id} id={`caz-${g.id}`} className={`sgc-case${g.counted ? "" : " out"}`} style={{ "--i": row } as CSSProperties}>
            <summary>
              <span className="sgc-who"><b><EntityName id={g.partnerId} role={partnerRole(role)}>{cleanName(g.partnerName) || "—"}</EntityName></b> · {g.year} · {g.works ? "lucrări" : "produse și servicii"}{g.cpvClass ? ` (CPV ${g.cpvClass})` : ""}
                <small>{countWords(g.count, "achiziție", "achiziții")}{g.dates ? `, ${g.dates}` : ""}{g.recurring ? " · aprovizionare recurentă, nu intră în scor" : g.counted ? "" : " · sub 1,2×, nu intră în scor"}</small></span>
              <span className="sgc-mini" aria-hidden="true">
                <span className="p"><span className="pc cm-y">{g.items.slice(0, 24).map((it, k) => <i key={k} style={{ height: `${Math.min(100, it.ofCeiling * 100)}%` }} />)}</span></span>
                <span className="t"><i className="cm-x" style={{ width: `${(g.ratio / max) * 100}%` }} /><b style={{ left: `${(1 / max) * 100}%` }} /></span>
              </span>
              <span className="sgc-sum">{lei(g.total)}</span>
              <span className="sgc-x">{ratioWords(g.ratio)}</span>
            </summary>
            <div className="sgc-body">
              <p className="sgc-cap">Plafonul: {lei(g.ceiling)}, fără TVA. Adunate, cele {formatInt(g.count)} achiziții trec de el de {ratioWords(g.ratio).replace("×", "")} ori.</p>
              <Records records={inst.records} alsoIn={data.alsoIn} code={data.code} />
              <Warnings inst={inst} />
              <CaseActions inst={inst} label={`${flagLabel(data.code)} · ${cleanName(g.partnerName)} ${g.year}`} />
            </div>
          </details>
        );
      })}
    </div>
  </>;
}

/**
 * One acquisition just under its ceiling, as a dot (owner, 6 November 2026): its firm, date, title and sum on hover,
 * its page on click. Out of the tab order: the table under the chart holds the same acquisitions, one per row.
 */
function AcqDot({ it, rec, edge, style }: { it: NearCeiling; rec: CaseRecord | undefined; edge: string; style?: CSSProperties }) {
  const what = rec?.title ?? rec?.cpvName;
  const card = <span className={`sgc-tip${edge}`}><b>{cleanName(it.partnerName) || "—"}</b>
    <span>{it.date ? formatCalendarDate(it.date) : "fără dată"}{what ? ` · ${what}` : ""}</span>
    <span><b>{lei(it.value)}</b> · cu {lei(Math.round(it.gap * 100) / 100)} sub plafonul de {lei(it.ceiling)}</span></span>;
  return rec?.src === "da" && rec.refId
    ? <Link className="dot" href={`/achizitii/${rec.refId}`} prefetch={false} tabIndex={-1} style={style}>{card}</Link>
    : <i className="dot" style={style}>{card}</i>;
}

function RoundCase({ data, items }: { data: SignalCase; items: NearCeiling[] }) {
  const part = data.entity.parts.da_round as ScorePart | undefined;
  const expected = part?.expected != null ? Math.round(Number(part.expected)) : null;
  const found = data.total;
  const repeats = repeatedAmounts(items);
  const low = Math.min(0.96, ...items.map((i) => i.ofCeiling));
  const x = (r: number) => ((Math.min(1, r) - low) / (1 - low)) * 100;
  // Dots that land on the same spot stack upward, at most STACK high; a taller column says its number above it.
  const STACK = 12;
  const stack = new Map<number, number>();
  const placed = items.map((it) => { const key = Math.round(x(it.ofCeiling) * 2); const k = stack.get(key) ?? 0; stack.set(key, k + 1); return { it, left: x(it.ofCeiling), level: k }; });
  const tall = Math.min(STACK, Math.max(1, ...stack.values()));
  const capped = [...stack].filter(([, n]) => n > STACK).map(([key, n]) => ({ left: key / 2, n }));
  const recs = new Map(data.instances.map((i) => [i.id, i.records[0]]));
  // The found dots are the acquisitions, closest to the ceiling first; a row holds 15, so its edges open their card inwards.
  const rowEdge = (i: number) => (i % 15 < 5 ? " l" : i % 15 > 9 ? " r" : "");
  // The mirror needs the expectation, which the score keeps only for a pattern with points (owner, 6 November 2026):
  // without it the page goes straight to the chart, which already shows every acquisition found.
  return <>
    {expected != null && <div className="sgc-mirror">
      <Side title="Ne-am aștepta" big={`~${formatInt(expected)}`}
        unit={<Term tip className="sgc-unit-tip" title="Așteptate" text="Din achizițiile ei directe la 50–96% din plafon și raportul național pentru același tip și aceleași plafoane.">așteptate</Term>}>
        <p className="sgc-dots exp cm-fade" aria-hidden="true" data-chart>{Array.from({ length: Math.min(expected, 80) }, (_, i) => <i key={i} />)}</p>
      </Side>
      <Side title="Am găsit" big={formatInt(found)} unit={expected ? `de ${(found / Math.max(1, expected)).toFixed(1).replace(".", ",")} ori mai multe` : "achiziții la 96–100% din plafon"}>
        <p className="sgc-dots cm-fade" aria-hidden="true" data-chart>{items.slice(0, 80).map((it, i) => <AcqDot key={it.id} it={it} rec={recs.get(it.id)} edge={rowEdge(i)} />)}</p>
      </Side>
    </div>}
    <section className="sgc-near" aria-label="Cât de aproape de plafon">
      <h3>Cât de aproape de plafon</h3>
      {/* In motion: the ceiling line and the counts stay; the dots appear where they are, together (one group). */}
      <div className="sgc-swarm" style={{ height: `${Math.max(48, tall * 15 + (capped.length ? 40 : 24))}px` }} aria-hidden="true" data-chart>
        <span className="sgc-line" />
        <span className="sgc-swarm-dots cm-fade">
          {placed.filter((p) => p.level < STACK).map(({ it, left, level }) => <AcqDot key={it.id} it={it} rec={recs.get(it.id)}
            edge={left < 20 ? " l" : left > 80 ? " r" : ""} style={{ left: `${left}%`, bottom: `${8 + level * 15}px` }} />)}
        </span>
        {capped.map((c) => <em key={c.left} className={c.left > 92 ? "r" : ""} style={{ left: `${c.left}%`, bottom: `${8 + STACK * 15 + 2}px` }}>{formatInt(c.n)}</em>)}
      </div>
      <div className="sgc-axis" aria-hidden="true"><span>{pctWords(low)} din plafon</span><span>plafonul</span></div>
      {repeats.length > 0 && <p className="sgc-cap">{repeats.slice(0, 2).map((r) => `${countWords(r.n, "sumă", "sume")} de exact ${lei(r.value)}, cu ${formatInt(Math.round(r.ceiling - r.value))} lei sub ${lei(r.ceiling)}`).join("; ")}.</p>}
    </section>
    <CasesHead title={countWords(found, "sumă", "sume")} total={data.total} shown={items.length} />
    <CaseTable rows={tableRows(data, items, (it) => it.gap)} kind="under" order="cele mai apropiate de plafon întâi"
      partnerRole={partnerRole(data.entity.role)} clipPrefix={flagLabel(data.code)} />
  </>;
}

/** The table's rows (CaseTable) from a one-acquisition pattern's cases and their records. */
function tableRows<T extends { id: string; partnerId: string | null; partnerName: string | null; value: number; ceiling: number; date: string | null }>(
  data: SignalCase, items: readonly T[], diff: (it: T) => number, estimate: (it: T) => boolean = () => false,
): CaseRow[] {
  const byId = new Map(data.instances.map((i) => [i.id, i]));
  return items.map((it) => {
    const rec = byId.get(it.id)?.records[0];
    const also = rec?.refId ? (data.alsoIn[rec.refId] ?? []).filter((c) => c !== data.code).map((c) => flagLabel(c)) : [];
    return { id: it.id, partnerId: it.partnerId, partnerName: it.partnerName, title: rec?.title ?? rec?.cpvName ?? null, date: it.date,
      value: it.value, ceiling: it.ceiling, diff: diff(it), estimate: estimate(it), refId: rec?.src === "da" ? rec.refId : null,
      seap: rec ? evidenceLinks(rec).seap ?? null : null, also };
  });
}

function AboveCase({ data, items }: { data: SignalCase; items: AboveCeiling[] }) {
  const maxOver = Math.max(0, ...items.map((i) => i.over));
  return <>
    <div className="sgc-mirror">
      <Side title="Achizițiile peste plafon" big={formatInt(items.length)} unit={items.length === 1 ? "achiziție directă" : "achiziții directe"}>
        <p className="sgc-cap">Plafonul achiziției directe e fără TVA; regula numără și suma finală care îl trece chiar cu TVA.</p>
      </Side>
      <Side title="Cu cât l-au trecut" big={formatRon(maxOver)} unit="cea mai mare depășire" />
    </div>
    <CasesHead title={countWords(items.length, "achiziție", "achiziții")} total={data.total} shown={items.length} />
    <CaseTable rows={tableRows(data, items, (it) => it.over, (it) => it.basis === "estimate")} kind="above" order="cele mai mari sume întâi"
      partnerRole={partnerRole(data.entity.role)} clipPrefix={flagLabel(data.code)} />
  </>;
}

function YearEndCase({ data }: { data: SignalCase }) {
  const years = data.instances.map((i) => ({ inst: i, y: yearEnd(inputOf(i)) })).sort((a, b) => b.y.share - a.y.share);
  const top = years[0];
  if (!top) return null;
  return <>
    <div className="sgc-mirror">
      <Side title={`Decembrie ${top.y.year}`} big={pctWords(top.y.share)} unit={formatRon(top.y.december)}>
        <ShareBar share={top.y.share} ticks={top.y.reference != null ? [{ at: top.y.reference, label: `pragul, ${pctWords(top.y.reference)}`, left: top.y.reference > 0.6 }] : []} />
      </Side>
      <Side title="Restul anului" big={pctWords(1 - top.y.share)} unit={formatRon(top.y.total - top.y.december)} />
    </div>
    <CasesHead title={countWords(years.length, "an", "ani")} total={data.total} shown={years.length} />
    <div className="sgc-cases" data-chart>
      {years.map(({ inst, y }, i) => {
        const dec = decemberRecords(inst.records, y.year);
        return (
          <details key={inst.id} id={`caz-${inst.id}`} className="sgc-case" open={i === 0} style={{ "--i": i } as CSSProperties}>
            <summary>
              <span className="sgc-who"><b>{y.year}</b><small>decembrie: {formatRon(y.december)} din {formatRon(y.total)}</small></span>
              <span className="sgc-mini" aria-hidden="true"><span className="t"><i className="cm-x" style={{ width: `${y.share * 100}%` }} />{y.reference != null && <b style={{ left: `${y.reference * 100}%` }} />}</span></span>
              <span className="sgc-sumw">{countWords(dec.length, "achiziție", "achiziții")} în decembrie</span>
              <span className="sgc-x">{pctWords(y.share)}</span>
            </summary>
            <div className="sgc-body">
              <Records records={dec} alsoIn={data.alsoIn} code={data.code} empty="Nu găsim acum achizițiile din decembrie ale acestui an." />
              <Warnings inst={inst} />
              <CaseActions inst={inst} label={`${flagLabel(data.code)} · ${y.year}`} />
            </div>
          </details>
        );
      })}
    </div>
  </>;
}

function PartnerCase({ data, code }: { data: SignalCase; code: "da_concentration" | "da_dependence" }) {
  const inst = data.instances[0];
  if (!inst) return null;
  const s = partnerShare(code, inst.evidence, (data.entity.parts[code] as ScorePart | undefined)?.partnerShare);
  const partner = cleanName(inst.partnerName) || "partenerul principal";
  const mineTotal = inst.records.reduce((a, r) => a + r.value, 0);
  const dep = code === "da_dependence";
  const partnerName = <EntityName id={inst.partnerId} role={partnerRole(data.entity.role)}>{partner}</EntityName>;
  return <>
    <div className="sgc-mirror">
      <Side title={dep ? "Pentru firmă · de la cine vinde" : "Pentru instituție · de la cine cumpără"} big={pctWords(s.share)} unit={<>{dep ? "de la " : "la "}{partnerName}</>}>
        <ShareBar share={s.share} ticks={dep ? [{ at: 0.7, label: "semnal de la 70%", left: true }, { at: 0.85, label: "85% nivelul 1" }] : []} />
        <p className="sgc-cap"><b>{partnerName}</b> {formatRon(mineTotal)}{inst.aside && inst.aside.count > 0 && <> · <b>{dep ? "celelalte instituții" : "ceilalți furnizori"}</b> {formatRon(inst.aside.totalExact)}</>}</p>
      </Side>
      {dep
        ? <Side title={`Pentru ${partner} · de la cine cumpără`} big={s.reverse == null ? "—" : pctWords(s.reverse)} unit={`de la ${cleanName(data.entity.name)}`}>
            {s.reverse != null && <ShareBar share={s.reverse} />}
            <p className="sgc-cap">Tăria tiparului crește cu acest procent: cu cât firma contează mai mult pentru instituție, cu atât relația cântărește mai mult.</p>
          </Side>
        : <Side title="Fără cea mai mare achiziție" big={s.adjusted == null ? "—" : pctWords(s.adjusted)} unit={<>tot la {partnerName}</>}>
            {s.adjusted != null && <ShareBar share={s.adjusted} ticks={[{ at: 0.6, label: "semnal de la 60%" }]} />}
            <p className="sgc-cap">O singură achiziție mare nu face o relație; de aceea regula o scoate din calcul.</p>
          </Side>}
    </div>
    <CasesHead title={<>{countWords(inst.records.length, "achiziție", "achiziții")} cu {partnerName}</>} total={1} shown={1} actions={<CaseActions inst={inst} label={`${flagLabel(code)} · ${partner}`} />} />
    <div id={`caz-${inst.id}`}>
      <Records records={inst.records} alsoIn={data.alsoIn} code={data.code} />
      <Warnings inst={inst} />
      {inst.aside && inst.aside.count > 0 && (
        <details className="sgc-aside">
          <summary><b>Puse deoparte: {countWords(inst.aside.count, dep ? "achiziție de la alte instituții" : "achiziție de la alți furnizori", dep ? "achiziții de la alte instituții" : "achiziții de la alți furnizori")}, {lei(inst.aside.totalExact)}.</b> Nu intră în semnal; sunt restul de {pctWords(Math.max(0, 1 - s.share))}.</summary>
          <Records records={inst.aside.top} alsoIn={data.alsoIn} code={data.code} counterparty={dep ? "authority" : "supplier"} />
          {inst.aside.count > inst.aside.top.length && <p className="sgc-cap">Cele mai mari {formatInt(inst.aside.top.length)}. Toate sunt în <Link href={`${entityHref(data.entity.id, data.entity.role)}#inregistrari`}>înregistrările profilului</Link>.</p>}
        </details>
      )}
    </div>
  </>;
}

function CapacityCase({ data }: { data: SignalCase }) {
  const inst = data.instances[0];
  if (!inst) return null;
  const c = capacity(inputOf(inst));
  return <>
    <div className="sgc-mirror">
      <Side title={`Achiziții directe în ${c.year}`} big={formatRon(c.daValue)} unit={c.daCount != null ? countWords(c.daCount, "achiziție", "achiziții") : ""} />
      <Side title={`Bilanțul din ${c.turnoverYear ?? c.year}`} big={c.turnover == null ? "—" : formatRon(c.turnover)} unit={c.employees == null ? "cifră de afaceri · angajați nepublicați" : `cifră de afaceri · ${countWords(c.employees, "angajat", "angajați")}`}>
        {c.young && <p className="sgc-cap">Firmă nouă: bilanțul poate să nu arate încă activitatea anului.</p>}
      </Side>
    </div>
    <CasesHead title={`Achizițiile din ${c.year}`} total={1} shown={1} actions={<CaseActions inst={inst} label={`${flagLabel(data.code)} · ${c.year}`} />} />
    <div id={`caz-${inst.id}`}><Records records={inst.records} alsoIn={data.alsoIn} code={data.code} /><Warnings inst={inst} /></div>
  </>;
}

/** The signals outside the score (procedures, balance sheets, shared administrators): their cases, each with its sources page. */
function OutsideCase({ data }: { data: SignalCase }) {
  return <>
    <CasesHead title={caseUnitWords(data.code, data.total)} total={data.total} shown={data.instances.length} />
    <div className="sgc-cases">
      {data.instances.map((inst) => (
        <article key={inst.id} id={`caz-${inst.id}`} className="sgc-row outside">
          <span className="sgc-who"><b>{inst.partnerName ? <EntityName id={inst.partnerId} role={partnerRole(data.entity.role)}>{cleanName(inst.partnerName)}</EntityName> : riskEvidenceLine(inst.flagCode, inst.evidence) ?? FLAG_META[inst.flagCode]?.short}</b>
            <small>{inst.partnerName ? `${riskEvidenceLine(inst.flagCode, inst.evidence) ?? ""} · ` : ""}{signalPeriodLabel(inst.period, inst.evidence).replace(/^Perioada calculului: /, "")}</small></span>
          <span className="sgc-sum">{inst.totalExact === null ? "" : lei(inst.totalExact)}</span>
          <span className="sgc-src"><Link href={`/semnale/${inst.id}`}>Sursele →</Link></span>
        </article>
      ))}
    </div>
  </>;
}

function CasesHead({ title, total, shown, actions }: { title: ReactNode; total: number; shown: number; actions?: ReactNode }) {
  return <div className="sgc-cases-h"><h2>{title}{total > shown ? ` · primele ${formatInt(shown)} din ${formatInt(total)}` : ""}</h2>{actions}</div>;
}

const firstSentence = (text: string) => { const i = text.indexOf(". "); return i > 0 ? text.slice(0, i + 1) : text; };

function headline(data: SignalCase, models: { split: SplitGroup[] | undefined; round: NearCeiling[] | undefined; above: AboveCeiling[] | undefined }): CaseWords {
  const { entity: e, code } = data;
  const part = e.parts[code as RiskCriterion] as ScorePart | undefined;
  switch (code) {
    case "da_split": return splitWords(e.role, splitSummary(models.split ?? []), part);
    case "da_round": return roundWords(data.total, part, models.round ?? [], topPartners(models.round ?? []));
    case "da_above_ceiling": return aboveWords(models.above ?? [], part);
    case "da_year_end": return yearEndWords(data.instances.map((i) => yearEnd(inputOf(i))));
    case "da_concentration": case "da_dependence": {
      const inst = data.instances[0];
      if (!inst) break;
      const s = partnerShare(code, inst.evidence, part?.partnerShare);
      return partnerWords(code, e.name, inst.partnerName, s, inst.records.reduce((a, r) => a + r.value, 0), inst.records.map((r) => r.date));
    }
    case "da_capacity": if (data.instances[0]) return capacityWords(capacity(inputOf(data.instances[0]))); break;
  }
  return { title: outsideTitle(code, data.total), lede: FLAG_META[code]?.short ?? null };
}

/** A signal outside the score, said with its count: "1.080 de proceduri negociate fără anunț prealabil." */
function outsideTitle(code: string, n: number): string {
  switch (code) {
    case "award_no_competition": return `${countWords(n, "procedură negociată", "proceduri negociate")} fără anunț prealabil.`;
    case "award_single_bid": return `${countWords(n, "procedură", "proceduri")} cu o singură ofertă raportată în TED.`;
    case "award_calloffs_over_ceiling": return `${countWords(n, "procedură", "proceduri")} cu comenzi declarate peste plafonul acordului-cadru.`;
    default: return `${flagLabel(code)}: ${caseUnitWords(code, n)}.`;
  }
}

export default function CasePage({ data, state }: { data: SignalCase; state: SignalState }) {
  const { entity: e, code } = data;
  const tabs = caseTabs(data);
  const models = {
    split: code === "da_split" ? data.instances.map((i) => splitGroup(inputOf(i))) : undefined,
    round: code === "da_round" ? data.instances.map((i) => nearCeiling(inputOf(i))).sort((a, b) => b.ofCeiling - a.ofCeiling) : undefined,
    above: code === "da_above_ceiling" ? data.instances.map((i) => aboveCeiling(inputOf(i))).sort((a, b) => b.over - a.over) : undefined,
  };
  const words = headline(data, models);
  const guide = SIGNAL_GUIDANCE[code as RiskCriterion];
  const band = riskBand(e.score);
  const scored = tabs.inScore.length > 0;
  const county = countyLabel(e.county);
  // Found, but under the rule's threshold: a tag before the lede, the rule on hover (owner, 6 November 2026).
  const under = e.hasRiskScore && data.total > 0 && tabs.quiet.includes(code);
  const rule = firstSentence(flagEntityRule(code));
  return (
    <div className="sgc">
      <OpenFromHash />
      <div className="sgc-crumb">
        <span><Link href={entityHref(e.id, e.role)} className="sgc-back">← {cleanName(e.name) || `entitatea ${e.id}`}</Link>
          {" · "}{e.role === "authority" ? "instituție" : "firmă"}{county ? `, ${county}` : ""}{e.nDas ? ` · ${countWords(e.nDas, "achiziție directă", "achiziții directe")}` : ""}
          {e.otherRole && <> · <Link href={entityHref(e.id, e.otherRole)}>{e.otherRole === "authority" ? "și ca instituție" : "și ca firmă"}</Link></>}</span>
        {scored ? <span className={`cri-pill ${RISK_BAND_CLASS[band]}`}>{riskScoreText(e.score)} · {RISK_BAND_WORD[band]}</span>
          : e.noScoreReason ? <span className="sgc-noscore">{e.noScoreReason}</span> : null}
      </div>
      <ScoreTabs data={data} state={state} tabs={tabs} />
      <h1 className="sgc-title">{words.title}</h1>
      {(words.lede || under) && <p className="sgc-lede">
        {under && <Term tip className="sgc-under" title="Sub prag"
          text={<>Apare, dar sub pragul regulii: nu adună puncte în scor.{rule && <> Regula: {rule.charAt(0).toLowerCase() + rule.slice(1)}</>}</>}>Sub prag</Term>}
        {words.lede}</p>}

      {data.total === 0 ? (
        <div className="sgc-empty"><h2>{cleanName(e.name)} nu are acum acest tipar</h2><p>Poate a avut la un calcul anterior. Celelalte tipare sunt mai jos.</p></div>
      ) : code === "da_split" ? <SplitCase data={data} groups={models.split!} />
        : code === "da_round" ? <RoundCase data={data} items={models.round!} />
        : code === "da_above_ceiling" ? <AboveCase data={data} items={models.above!} />
        : code === "da_year_end" ? <YearEndCase data={data} />
        : code === "da_concentration" || code === "da_dependence" ? <PartnerCase data={data} code={code} />
        : code === "da_capacity" ? <CapacityCase data={data} />
        : <OutsideCase data={data} />}

      {data.total > data.pageSize && (
        <nav className="sgc-pager" aria-label="Paginile cazurilor">
          {data.page > 0 && <Link href={roleless(data, signalUrl(state, { page: data.page - 1 }))}>← Anterioarele</Link>}
          <span>Pagina {formatInt(data.page + 1)} din {formatInt(Math.ceil(data.total / data.pageSize))}</span>
          {(data.page + 1) * data.pageSize < data.total && <Link href={roleless(data, signalUrl(state, { page: data.page + 1 }))}>Următoarele →</Link>}
        </nav>
      )}

      {guide && <div className="sgc-guide"><div><h2>Ce verifici</h2><p>{guide.check}</p></div><div><h2>Explicații posibile</h2><p>{guide.explain}</p></div></div>}
      {!guide && FLAG_META[code] && <div className="sgc-guide"><div><h2>Ce verifici</h2><p>{FLAG_META[code]!.rationale}</p></div><div><h2>Limitele semnalului</h2><p>{firstSentence(FLAG_META[code]!.caveat)} <Link href={`/metodologie#${code}`}>Toate limitele →</Link></p></div></div>}

      <p className="sgc-foot">Un tipar e o pistă de verificat, nu o dovadă. Valori înregistrate, nu plăți. <Link href={`/metodologie#${code}`}>Cum se calculează →</Link></p>
    </div>
  );
}


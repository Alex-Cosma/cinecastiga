"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { DistributionDataV2, DistributionDataV3, DistributionData, DistributionMember, ScoredMember } from "../../lib/ask/compile";
import { countWords, formatDecimal, formatShare } from "../../lib/ask/answer-text";
import { askLink } from "../../lib/ask/source-spec";
import type { QuestionSpec } from "../../lib/ask/question-ui";
import {
  CRITERION_LABEL, CRITERION_RULE, PEER_MEMBERS_PAGE, PEER_MINIMUM, PROFILE_MIN_DAS, barMembersQuery, coverageWords, peerCountWords, peerGroupValue, peerWindowTip,
  scoreBandOf, scoreBandWords, similarRuleName, writePeerTicks, type PeerRowId, type ScoreBand,
} from "../../lib/ask/peer-groups-shared";
import { RISK_BAND_CLASS, riskBand, riskFact, riskLabel, riskScoreText, riskPoints, type RiskCriterion } from "../../lib/risk-score";
import { cleanName, formatInt } from "../../lib/format";
import { parseSignalState, signalUrl } from "../../lib/signals-shared";
import { useAnswerEvidence } from "./AnswerEvidence";
import EmptyState from "./answer/EmptyState";
import HelpTip from "./builder/HelpTip";
import PeersWindow, { peerDataFor } from "./builder/PeersWindow";
import Popover from "./builder/pickers/Popover";
import { usePeerDialog } from "./builder/use-peer-dialog";
import { useChartMotion } from "./answer/chart-motion";
import "./distribution.css";

/*
 * "Unde se situează X?" (distribution-3, rf-2026.18, owner decision of 1
 * November 2026; the group of plan §4.11, final distribution §3, §4.1, §4.5):
 * the group in one line with "Schimbă grupul" (the window of the builder's
 * phrase), the entity's risk score ("54%" · "risc · moderat" (?)), its
 * position among the other members (a higher score · the same · a lower one,
 * which add up to them), up to 50 a strip of the group on 0–100% and the list
 * with each member's score, above 50 the chart by tenths of the score (a bar
 * opens its members, ten at a time, and their records), what the score is
 * made of (each pattern's points and fact, how many of the group have it) and
 * the profile's sources. "Schimbă grupul" stays open on a tick, as in the
 * builder, so its note ("Am scos …") stays in view. An answer stored before it
 * (distribution-2: the criteria) keeps its own view below. Signals are leads,
 * not proof; recorded values, not payments.
 */

export interface DistributionAnswerProps {
  distribution: DistributionData;
  spec?: unknown;
  /** The answer's "Schimbă grupul" and the removals of the empty states: a new run with this group (StripPatch "peers"). */
  onChangeGroup?: (value: string) => void;
}

export default function DistributionAnswer({ distribution: d, spec, onChangeGroup }: DistributionAnswerProps) {
  const props = { spec, ...(onChangeGroup ? { onChangeGroup } : {}) };
  if (d.version === 3) return <ScoreAnswer distribution={d} {...props} />;
  if (d.version === 2) return <CriteriaAnswer distribution={d} {...props} />;
  return <p className="dist-note">Răspuns dintr-o versiune mai veche a site-ului. Reîncarcă întrebarea ca să vezi grupul și riscul.</p>;
}

/* ── shared: the group's line, its window, its empty states ─────────────── */

type AnyDistribution = DistributionDataV2 | DistributionDataV3;
interface VersionProps<D> { distribution: D; spec?: unknown; onChangeGroup?: (value: string) => void }

const LIST_FIRST = 7;

const appliedSpec = (spec: unknown) => (spec ?? { block: "distribution", measure: "value", filters: {} }) as QuestionSpec;
/** The group's noun as the answer computed it (its ticks and an old link's kind), not as the draft may say it now. */
function groupNoun(d: AnyDistribution): (n: number) => string {
  const computed = { ...(d.group.ticks.includes("similar") ? { peers: { similar: true as const } } : {}), filters: d.group.legacy.authorityKind ? { authorityKind: d.group.legacy.authorityKind } : {} };
  return (n: number) => peerCountWords(n, computed, d.role, d.group.facts);
}
const isNational = (d: AnyDistribution) => !d.group.ticks.length && !d.group.legacy.county && !d.group.legacy.authorityKind;
const writer = (onChangeGroup?: (value: string) => void) => (next: QuestionSpec) => onChangeGroup?.(JSON.stringify(peerGroupValue(next)));

const memberPlace = (m: Pick<DistributionMember, "county" | "population">) =>
  [m.county, m.population !== null ? `${formatInt(m.population)} loc.` : null].filter(Boolean).join(" · ");

/** "Grup: 29 de primării (?)" and "Schimbă grupul" with the window of "Față de cine?". */
function GroupHead({ distribution: d, spec, onChangeGroup }: VersionProps<AnyDistribution>) {
  const [open, setOpen] = useState(false);
  // The group a tick asked for while its answer comes: a second tick builds on it, not on the answer on screen.
  const [pending, setPending] = useState<QuestionSpec | null>(null);
  const [answered, setAnswered] = useState(d);
  const change = useRef<HTMLButtonElement>(null);
  // A new answer (another group): the window's pending group starts again.
  if (answered !== d) { setAnswered(d); setPending(null); }
  const windowSpec = pending ?? appliedSpec(spec);
  const peers = usePeerDialog(open ? windowSpec : { block: "", filters: {} });
  const { group } = d, noun = groupNoun(d), name = cleanName(d.focal.name), write = writer(onChangeGroup);
  const groupTip = [
    `${group.words.charAt(0).toLocaleUpperCase("ro-RO")}${group.words.slice(1)}.`,
    ...(group.coverage ? [coverageWords(group.coverage)] : []),
    `Intră profilurile cu cel puțin ${PROFILE_MIN_DAS} achiziții directe acceptate; ${name} nu e numărat.`,
  ].join(" ");
  const close = () => { setOpen(false); setPending(null); };
  // The (?) opens over the whole row (qb-tipwrap on the row), not over the words "Grup: 29 de primării".
  return <div className="dist-group qb-tipwrap">
    <span>Grup: <b>{isNational(d) ? `toată țara · ${noun(group.others)}` : noun(group.others)}</b> <HelpTip tip={{ title: "Grupul de comparație", text: groupTip }} /></span>
    {onChangeGroup && <button ref={change} type="button" className="qb-secondary dist-change" aria-haspopup="dialog" aria-expanded={open} onClick={() => open ? close() : setOpen(true)}>Schimbă grupul</button>}
    {onChangeGroup && <Popover open={open} anchor={change.current} onClose={close} title="Față de cine?" wide
      {...(peerDataFor(windowSpec, peers) ? { tip: peerWindowTip(peerDataFor(windowSpec, peers)!) } : {})}>
      {/* No "Aplică" (final §3.1): a tick reruns the answer and the window stays, with its "Am scos …" note; × only closes. */}
      <PeersWindow spec={windowSpec} state={peers} onChange={(next) => { setPending(next); write(next); }} />
    </Popover>}
  </div>;
}

/** Below the profile's threshold, or a group under 5 (final §4.5): the reason and what to remove; null when the answer has a position. */
function groupEmpty({ distribution: d, spec, onChangeGroup }: VersionProps<AnyDistribution>): ReactNode {
  const applied = appliedSpec(spec), { focal, group } = d, name = cleanName(focal.name), noun = groupNoun(d), write = writer(onChangeGroup);
  if (d.status === "below") {
    const stat = { block: "stat", measure: "value", dataset: "da", filters: Object.fromEntries(Object.entries(applied.filters).filter(([key]) => /^(authority|supplier)(Id|Name)$/.test(key))) };
    return <div className="dist">
      <EmptyState message={`${name} are ${countWords(focal.nDas, "achiziție directă acceptată", "achiziții directe acceptate")}. Comparația începe de la ${PROFILE_MIN_DAS}.`} />
      <p className="dist-links"><Link className="qb-relax-link" href={askLink(stat as QuestionSpec)}>Vezi achizițiile<span className="qb-glyph" aria-hidden="true">›</span></Link></p>
    </div>;
  }
  if (d.status !== "small") return null;
  const label: Record<PeerRowId, string> = { similar: similarRuleName(group.facts.similar), domain: "același domeniu principal", county: "același județ", activity: "activitate apropiată" };
  const relax = [
    ...group.ticks.map((tick) => ({ id: tick, label: `Scoate „${label[tick]}”`, onClick: () => write(writePeerTicks(applied, group.ticks.filter((t) => t !== tick), group.facts)) })),
    ...(group.legacy.county ? [{ id: "legacy-county", label: `Scoate „${group.legacy.county}”`, onClick: () => { const next = structuredClone(applied); delete next.filters.county; write(next); } }] : []),
    ...(group.legacy.authorityKind ? [{ id: "legacy-kind", label: "Scoate tipul instituției", onClick: () => { const next = structuredClone(applied); delete next.filters.authorityKind; write(next); } }] : []),
  ];
  return <div className="dist">
    <GroupHead distribution={d} spec={spec} {...(onChangeGroup ? { onChangeGroup } : {})} />
    <EmptyState message={`${group.others === 0 ? "Grupul nu are niciun alt membru" : `Grupul are doar ${noun(group.others)}`}. Comparația cere cel puțin ${PEER_MINIMUM}.`} relax={onChangeGroup ? relax : []} />
  </div>;
}

/** A bar's identity: a band of the score (distribution-3) or a number of criteria (distribution-2). */
type BarKey = number | ScoreBand;
const sameBar = (a: BarKey, b: BarKey) => typeof a === "number" || typeof b === "number" ? a === b : a.from === b.from && a.to === b.to;
interface BarState<M> { key: BarKey; rows: M[]; total: number; loading: boolean; error: string | null }

/** A bar of the chart (final §3.6, §3.8): the group's members in it, ten at a time (GET /api/ask/peers/members). */
function useBarMembers<M extends DistributionMember>(d: AnyDistribution) {
  const [bar, setBar] = useState<BarState<M> | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const request = useRef(0), focusRow = useRef<number | null>(null);
  // Rows unfolded by "Arată încă 10" take the keyboard focus, not the page's top.
  useEffect(() => {
    const at = focusRow.current;
    if (at === null || !bar || bar.loading) return;
    focusRow.current = null;
    listRef.current?.children[at]?.querySelector<HTMLElement>("a")?.focus();
  }, [bar]);
  const load = (key: BarKey, total: number, offset: number) => {
    const seq = ++request.current;
    setBar((current) => current && sameBar(current.key, key) ? { ...current, loading: true, error: null } : { key, rows: [], total, loading: true, error: null });
    fetch(`/api/ask/peers/members?${barMembersQuery(d, key, offset)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({ ok: false })) as { ok?: boolean; members?: M[]; total?: number; error?: string };
        if (seq !== request.current) return;
        if (!body.ok || !body.members) { setBar((current) => current && { ...current, loading: false, error: body.error ?? "Lista nu a putut fi citită acum." }); return; }
        if (offset > 0) focusRow.current = offset;
        setBar((current) => current && { ...current, rows: offset ? [...current.rows, ...body.members!] : body.members!, total: body.total ?? current.total, loading: false, error: null });
      })
      .catch(() => { if (seq === request.current) setBar((current) => current && { ...current, loading: false, error: "Lista nu a putut fi citită acum." }); });
  };
  const close = () => { request.current++; setBar(null); };
  const toggle = (key: BarKey, total: number) => { if (bar && sameBar(bar.key, key)) close(); else load(key, total, 0); };
  return { bar, listRef, load, toggle, close, reset: () => setBar(null) };
}

/** The members of one bar (final §3.8 "Peste 50, lista se deschide din barele graficului"): the list's rows, ten more at a time, and their records (→). */
function BarMembers<M extends DistributionMember>({ bar, title, row, listRef, onMore, onClose, onRecords }: {
  bar: BarState<M>; title: string; row: (m: M) => ReactNode; listRef: RefObject<HTMLOListElement | null>;
  onMore: () => void; onClose: () => void; onRecords?: () => void;
}) {
  const left = bar.total - bar.rows.length;
  return <section id="dist-bar-members" className="dist-list dist-bar-members" aria-label={title} aria-busy={bar.loading}>
    <h3>{title}
      <button type="button" className="dist-close" aria-label="Închide lista" onClick={onClose}>×</button></h3>
    <ol ref={listRef}>{bar.rows.map((m) => <li key={m.entityId} className="dist-member">{row(m)}</li>)}</ol>
    {bar.loading && <p className="dist-legend" role="status">Caut membrii…</p>}
    {bar.error && <p className="dist-note" role="alert">{bar.error}</p>}
    <div className="dist-bar-foot">
      {!bar.loading && left > 0 && <button type="button" className="qb-link dist-all" onClick={onMore}>Arată încă {formatInt(Math.min(PEER_MEMBERS_PAGE, left))}</button>}
      {onRecords && <button type="button" className="cq-record-link" onClick={onRecords}>Vezi înregistrările →</button>}
    </div>
  </section>;
}

/** A member's name, place and direct acquisitions (the list's left side). */
function MemberName({ m }: { m: Pick<DistributionMember, "entityId" | "name" | "county" | "population" | "nDas"> }) {
  return <span className="dist-member-t">
    <Link prefetch={false} href={`/entitati/${m.entityId}`}>{cleanName(m.name)}</Link>
    {memberPlace(m) && <small>{memberPlace(m)}</small>}
    <small>{countWords(m.nDas, "achiziție directă", "achiziții directe")}</small>
  </span>;
}

function SourcesFoot({ d, name }: { d: AnyDistribution; name: string }) {
  const evidence = useAnswerEvidence();
  return <div className="dist-foot">
    {evidence && <button type="button" className="cq-record-link" onClick={() => evidence.open(undefined, { entityIds: [d.focal.entityId], role: d.role }, `${name} · sursele profilului`)}>Verifică profilul ales →</button>}
    <p className="dist-caveat">Semnal, nu dovadă. Valori înregistrate, nu plăți.</p>
  </div>;
}

/* ── distribution-3: the risk score against the group ───────────────────── */

/** A member's score: a small bar in its band's colour and the score ("54 din 100"). */
function ScoreRow({ m }: { m: Pick<ScoredMember, "entityId" | "name" | "county" | "population" | "nDas" | "score"> }) {
  const band = riskBand(m.score);
  return <>
    <MemberName m={m} />
    <span className="dist-member-s">
      <span className="risk-meter" aria-hidden="true"><span className={RISK_BAND_CLASS[band]} style={{ width: `${m.score}%` }} /></span>
      <b>{riskScoreText(m.score)}</b>
    </span>
  </>;
}

/** The ticks of the strip: the bands' lower bounds (slab 20, moderat 40, puternic 68). */
const STRIP_TICKS = [0, 20, 40, 68, 100];
/** Dots closer than this many points stack; above this many levels the rest are counted ("+12"). */
const STRIP_GAP = 2, STRIP_LEVELS = 6;

interface StripDot { id: string; name: string; score: number; level: number; focal?: true }
/**
 * The group on 0–100: the entity first on the axis, then each member in the order of the score at the lowest level
 * where no other dot is closer than STRIP_GAP points; what does not fit in STRIP_LEVELS is counted above its place.
 */
export function stripLayout(focal: { id: string; name: string; score: number }, members: readonly { entityId: string; name: string; score: number }[]) {
  const levels: number[][] = [];
  const place = (x: number): number | null => {
    for (let level = 0; level < STRIP_LEVELS; level++) {
      const row = levels[level] ??= [];
      if (row.every((other) => Math.abs(other - x) >= STRIP_GAP)) { row.push(x); return level; }
    }
    return null;
  };
  const dots: StripDot[] = [{ ...focal, level: place(focal.score)!, focal: true }];
  const over: { score: number; n: number }[] = [];
  for (const m of [...members].sort((a, b) => a.score - b.score)) {
    const level = place(m.score);
    if (level !== null) { dots.push({ id: m.entityId, name: m.name, score: m.score, level }); continue; }
    // One count for the dots left out around the same place.
    const last = over.at(-1);
    if (last && m.score - last.score < STRIP_GAP * 3) last.n++;
    else over.push({ score: m.score, n: 1 });
  }
  return { dots, over, rows: Math.max(...dots.map((dot) => dot.level)) + 1 + (over.length ? 1 : 0) };
}

/** A label near an end of the axis starts or ends at its place instead of centring on it (the name, at most half the strip: 25). */
const stripEdge = (x: number, margin = 6) => x < margin ? " is-start" : x > 100 - margin ? " is-end" : "";

function ScoreStrip({ d, members, noun, name }: { d: DistributionDataV3; members: readonly ScoredMember[]; noun: (n: number) => string; name: string }) {
  // The members' dots fade in where they are, together (an order on the axis would mean nothing); the entity's dot
  // and its name come last, without a pulse. Another group re-stacks the same dots in place (owner, 6 November 2026).
  const motion = useChartMotion();
  const f = d.focal;
  const { dots, over, rows } = stripLayout({ id: f.entityId, name: f.name, score: f.score }, members);
  const label = `Scorurile celor ${noun(members.length)} pe axa 0–100; ${name}: ${riskScoreText(f.score)}.`;
  return <section className="dist-strip" aria-label="Grupul, pe axa scorului">
    <div className="dist-strip-plot" role="img" aria-label={label} style={{ "--rows": rows } as CSSProperties} {...motion.root}>
      <span className={`dist-strip-name${stripEdge(f.score, 25)} ${motion.enter("cm-fade cm-late")}`} style={{ "--x": f.score } as CSSProperties} aria-hidden="true">{f.inGroup ? name : `${name} · în afara grupului`}</span>
      {dots.map((dot) => <i key={dot.id} ref={motion.join} className={`dist-dot ${dot.focal ? "is-focal" : RISK_BAND_CLASS[riskBand(dot.score)]} cm-tw ${motion.enter(dot.focal ? "cm-fade cm-late" : "cm-fade")}`}
        style={{ "--x": dot.score, "--l": dot.level } as CSSProperties} title={`${cleanName(dot.name)} · ${riskScoreText(dot.score)}`} />)}
      {over.map((o) => <span key={o.score} ref={motion.join} className={`dist-strip-over${stripEdge(o.score)}`} style={{ "--x": o.score, "--l": STRIP_LEVELS } as CSSProperties} aria-hidden="true">+{formatInt(o.n)}</span>)}
    </div>
    <div className="dist-strip-axis" aria-hidden="true">
      {STRIP_TICKS.map((tick) => <span key={tick} className={`dist-strip-tick${tick === 0 ? " is-start" : tick === 100 ? " is-end" : ""}`} style={{ "--x": tick } as CSSProperties}>{tick}</span>)}
    </div>
    <p className="dist-legend dist-strip-legend" aria-hidden="true">
      <span><i className="dist-dot is-focal" />{name}</span>
      <span><i className="dist-dot risk-slab" />slab</span>
      <span><i className="dist-dot risk-mid" />moderat</span>
      <span><i className="dist-dot risk-high" />pronunțat</span>
      <span><i className="dist-dot risk-none" />fără tipar</span>
    </p>
  </section>;
}

function ScoreAnswer({ distribution: d, spec, onChangeGroup }: VersionProps<DistributionDataV3>) {
  const evidence = useAnswerEvidence();
  const [all, setAll] = useState(false);
  const [answered, setAnswered] = useState(d);
  const list = useRef<HTMLOListElement>(null);
  const bars = useBarMembers<ScoredMember>(d);
  // The bins grow together, „aici” last; the patterns' bars grow top down; another group tweens both in place.
  const histMotion = useChartMotion(), partsMotion = useChartMotion();
  // A new answer (another group): the open bar and the unfolded list start again.
  if (answered !== d) { setAnswered(d); bars.reset(); setAll(false); }
  const empty = groupEmpty({ distribution: d, spec, ...(onChangeGroup ? { onChangeGroup } : {}) });
  if (empty) return empty;

  const { focal: f, group, role } = d;
  const name = cleanName(f.name), noun = groupNoun(d), national = isNational(d), band = riskBand(f.score);
  const position = d.position!, hist = d.hist ?? [], per = d.perCriterion ?? [];
  const members = d.members ?? null;
  const listed = members && (all || members.length <= LIST_FIRST + 1) ? members : members?.slice(0, LIST_FIRST) ?? [];
  const hidden = members ? members.length - listed.length : 0;
  const shown = (n: number) => members ? `${formatInt(n)} din ${formatInt(group.others)}` : `${formatInt(n)} · ${formatShare(group.others ? n / group.others : 0)}`;
  const points = riskPoints(f.parts, f.score);
  const partOf = (code: string) => f.parts[code as RiskCriterion];
  // The patterns it has first, by their points, then the others in the role's order.
  const order = [...per].sort((a, b) => (partOf(b.code) ? points[b.code as RiskCriterion] ?? 0 : -1) - (partOf(a.code) ? points[a.code as RiskCriterion] ?? 0 : -1));
  const own = scoreBandOf(f.score);
  const peak = Math.max(...hist.map((h) => h.n), 1);
  const bandTitle = (b: ScoreBand, n: number) => b.from === 0 && b.to === 0 ? `${noun(n)} fără niciun tipar (0)` : `${noun(n)} cu scor ${scoreBandWords(b)}`;
  const showAll = () => {
    setAll(true);
    // The first row unfolded takes the focus (the entity's row and the first seven stay above it).
    requestAnimationFrame(() => list.current?.children[LIST_FIRST + 1]?.querySelector<HTMLElement>("a")?.focus());
  };
  const bar = bars.bar, openBand = bar && typeof bar.key !== "number" ? bar.key : null;

  return <div className="dist">
    <GroupHead distribution={d} spec={spec} {...(onChangeGroup ? { onChangeGroup } : {})} />
    {!f.inGroup && <p className="dist-note">{name} nu face parte din grup: numărăm toți membrii lui.</p>}
    <div className="dist-top">
      <div className="dist-score">
        <p className="dist-pill-line"><span className={`cri-pill dist-pill ${RISK_BAND_CLASS[band]}`}>{riskScoreText(f.score)}</span></p>
        <p className="dist-band qb-tipwrap">{riskLabel(f.score)} <HelpTip tip={{ id: "scor-risc" }} /></p>
      </div>
      <div className="dist-pos">
        <p>{`Din ${f.inGroup ? "celelalte" : "cele"} ${noun(group.others)}`}</p>
        <div className="dist-boxes" role="list">
          {([["higher", "cu scor mai mare"], ["equal", "la egalitate"], ["lower", "cu scor mai mic"]] as const).map(([key, words]) =>
            <div key={key} role="listitem" className="dist-box"><b>{formatInt(position[key])}</b><span>{words}</span></div>)}
        </div>
      </div>
    </div>

    {members ? <>
      <ScoreStrip d={d} members={members} noun={noun} name={name} />
      <section className="dist-list" aria-label="Cine intră în comparație?">
        <h3 className="qb-tipwrap">Cine intră în comparație? <span className="dist-count">{formatInt(group.others)} + {name}</span> <HelpTip tip={{ title: "Cine intră în comparație?",
          text: `Ordonate după scor, apoi după achizițiile directe.${d.sameNames ? " O instituție poate apărea de două ori (identități SICAP duplicate)." : ""}` }} /></h3>
        <ol ref={list}>
          <li className="dist-member is-focal"><ScoreRow m={f} /></li>
          {listed.map((m) => <li key={m.entityId} className="dist-member"><ScoreRow m={m} /></li>)}
        </ol>
        {hidden > 0 && <button type="button" className="qb-link dist-all" onClick={showAll}>Arată toate cele {formatInt(members.length)}</button>}
      </section>
    </> : <section className="dist-chart" aria-label="Ceilalți membri, după scor">
      <div className="dist-hist" style={{ "--cols": hist.length } as CSSProperties} {...histMotion.root}>
        {hist.map((h) => {
          // The entity's band: "aici" when it is a member; an old link's other county leaves it out, so "ar fi aici", unmarked.
          const mark = own?.from === h.from, here = mark && f.inGroup, would = mark && !f.inGroup;
          const opened = openBand?.from === h.from;
          const cls = `dist-hcol${here ? " is-here" : would ? " is-would" : ""}${opened ? " is-open" : ""}`;
          const body = <>
            <span className="dist-n">{here && <em className={histMotion.enter("cm-fade cm-late")}>aici</em>}{would && <em className={histMotion.enter("cm-fade cm-late")}>ar fi aici</em>}{formatInt(h.n)}</span>
            <span className={`dist-hbar cm-tw ${histMotion.enter("cm-y")}`} style={{ "--h": h.n / peak } as CSSProperties} />
            <span className="dist-axis"><b>{h.from}</b><small>{h.to !== h.from ? `–${h.to}` : ""}</small></span>
          </>;
          return h.n > 0
            ? <button key={h.from} type="button" className={cls} onClick={() => bars.toggle({ from: h.from, to: h.to }, h.n)} aria-expanded={opened} aria-controls="dist-bar-members"
              aria-label={`Scor ${scoreBandWords(h)}: ${noun(h.n)}${here ? `, aici e ${name}` : would ? `, aici ar fi ${name}` : ""}. Lista lor`}>{body}</button>
            : <div key={h.from} className={cls}>{body}</div>;
        })}
      </div>
      <p className="dist-legend">scor din 100 · clic pe o bară: cine are acel scor</p>
      {bar && openBand && <BarMembers bar={bar} title={bandTitle(openBand, bar.total)} row={(m) => <ScoreRow m={m} />} listRef={bars.listRef}
        onMore={() => bars.load(openBand, bar.total, bar.rows.length)} onClose={bars.close}
        {...(evidence ? { onRecords: () => evidence.open(undefined, { score: openBand }, `${scoreBandWords(openBand)} · înregistrările profilurilor din grup`) } : {})} />}
    </section>}

    <section className="dist-criteria dist-parts" aria-label="Din ce se formează riscul">
      <h3 className="qb-tipwrap">Din ce se formează riscul <HelpTip tip={{ id: "criterii-risc" }} /></h3>
      <ul {...partsMotion.root}>
        {order.map((c, i) => {
          const part = partOf(c.code), label = CRITERION_LABEL[c.code] ?? c.code;
          const share = group.others ? c.others / group.others : 0, country = d.countryTotal ? c.country / d.countryTotal : 0;
          return <li key={c.code} className="dist-crit dist-part">
            <span className="dist-crit-name qb-tipwrap">{label} <HelpTip tip={{ title: label, text: CRITERION_RULE[c.code] ?? "" }} />
              {part && <small className="dist-fact">{riskFact(c.code as RiskCriterion, part, role)}</small>}</span>
            <span className={`dist-part-pts${part ? " is-met" : ""}`}>{part ? `+${formatInt(points[c.code as RiskCriterion] ?? 0)}` : "fără tipar"}</span>
            <span className="dist-crit-bar" aria-hidden="true"><span className={`cm-tw ${partsMotion.enter("cm-x")}`} style={{ width: `${share * 100}%`, "--i": i } as CSSProperties} />{!national && <i className="cm-tw" style={{ left: `${country * 100}%` }} />}</span>
            <span className="dist-crit-n">{shown(c.others)}</span>
            {part && <a className="dist-crit-cases" href={signalUrl(parseSignalState({ tip: c.code, rol: role, ent: String(f.entityId) }))}>Vezi cazurile<span className="qb-glyph" aria-hidden="true">↗</span></a>}
          </li>;
        })}
      </ul>
      <p className="dist-legend qb-tipwrap">bara: cât din grup are tiparul{!national && <> · <i className="dist-mark" aria-hidden="true" /> media țării <HelpTip tip={{ title: "Media țării",
        text: `Ponderea în toate ${role === "authority" ? `cele ${countWords(d.countryTotal ?? 0, "instituție", "instituții")}` : `cele ${countWords(d.countryTotal ?? 0, "firmă", "firme")}`} cu profil.` }} /></>}</p>
    </section>

    <SourcesFoot d={d} name={name} />
  </div>;
}

/* ── distribution-2: the criteria against the group (answers stored before distribution-3) ── */

function Dots({ k, max }: { k: number; max: number }) {
  return <span className="dist-dots" role="img" aria-label={`${k} din ${max} criterii`}>
    {Array.from({ length: max }, (_, i) => <i key={i} className={i < k ? "on" : undefined} />)}
  </span>;
}

function CriteriaRow({ m, max }: { m: Pick<DistributionMember, "entityId" | "name" | "county" | "population" | "nFlags" | "nDas">; max: number }) {
  return <>
    <MemberName m={m} />
    <Dots k={m.nFlags} max={max} />
  </>;
}

/**
 * distribution-2 (F6a, final distribution §3.6–§3.8), as it was shown: the entity's criteria ("3 din 5 criterii",
 * the index beside them), more · same · fewer, the list up to 50 or the chart by number of criteria, each criterion
 * against the group and the country. A watch or capture stored it; a code retired since (da_rapid) shows its code.
 */
function CriteriaAnswer({ distribution: d, spec, onChangeGroup }: VersionProps<DistributionDataV2>) {
  const evidence = useAnswerEvidence();
  const [all, setAll] = useState(false);
  const [answered, setAnswered] = useState(d);
  const list = useRef<HTMLOListElement>(null);
  const bars = useBarMembers<DistributionMember>(d);
  // As distribution-3's: the columns grow together, „aici” last; the criteria's bars top down; another group tweens.
  const histMotion = useChartMotion(), critMotion = useChartMotion();
  // A new answer (another group): the open bar and the unfolded list start again.
  if (answered !== d) { setAnswered(d); bars.reset(); setAll(false); }
  const empty = groupEmpty({ distribution: d, spec, ...(onChangeGroup ? { onChangeGroup } : {}) });
  if (empty) return empty;

  const { focal, group, role, criteria } = d;
  const max = criteria.length;
  const name = cleanName(focal.name), noun = groupNoun(d), national = isNational(d);
  const position = d.position!, hist = d.hist ?? [], per = d.perCriterion ?? [];
  const members = d.members ?? null;
  const listed = members && (all || members.length <= LIST_FIRST + 1) ? members : members?.slice(0, LIST_FIRST) ?? [];
  const hidden = members ? members.length - listed.length : 0;
  const shown = (n: number) => members ? `${formatInt(n)} din ${formatInt(group.others)}` : `${formatInt(n)} · ${formatShare(group.others ? n / group.others : 0)}`;
  const order = [...per].sort((a, b) => Number(focal.flags.includes(b.code)) - Number(focal.flags.includes(a.code)));
  const peak = Math.max(...hist.map((h) => h.n), 1);
  const showAll = () => {
    setAll(true);
    // The first row unfolded takes the focus (the entity's row and the first seven stay above it).
    requestAnimationFrame(() => list.current?.children[LIST_FIRST + 1]?.querySelector<HTMLElement>("a")?.focus());
  };
  const bar = bars.bar, openK = bar && typeof bar.key === "number" ? bar.key : null;

  return <div className="dist">
    <GroupHead distribution={d} spec={spec} {...(onChangeGroup ? { onChangeGroup } : {})} />
    {!focal.inGroup && <p className="dist-note">{name} nu face parte din grup: numărăm toți membrii lui.</p>}
    <div className="dist-top">
      <div className="dist-score">
        <p><b>{focal.nFlags}</b> din {countWords(max, "criteriu", "criterii")}</p>
        <Dots k={focal.nFlags} max={max} />
        <p className="dist-cri qb-tipwrap">indice de risc <span className="dist-num">{formatDecimal(focal.cri ?? focal.nFlags / max, 2)}</span> <HelpTip tip={{ title: "Indicele de risc",
          text: `Indicele = criteriile îndeplinite ÷ ${max}${role === "authority" ? " (÷ 4 la firme)" : " (÷ 5 la instituții)"}. ${role === "authority" ? "La instituții poate fi doar 0; 0,2; 0,4; 0,6; 0,8 sau 1." : "La firme poate fi doar 0; 0,25; 0,5; 0,75 sau 1."} Un semnal, nu o dovadă.` }} /></p>
      </div>
      <div className="dist-pos">
        <p>{`Din ${focal.inGroup ? "celelalte" : "cele"} ${noun(group.others)}`}</p>
        <div className="dist-boxes" role="list">
          {([["more", "cu mai multe"], ["same", `tot cu ${focal.nFlags}`], ["fewer", "cu mai puține"]] as const).map(([key, words]) =>
            <div key={key} role="listitem" className="dist-box"><b>{formatInt(position[key])}</b><span>{words}</span></div>)}
        </div>
      </div>
    </div>

    {members ? <section className="dist-list" aria-label="Cine intră în comparație?">
      <h3 className="qb-tipwrap">Cine intră în comparație? <span className="dist-count">{formatInt(group.others)} + {name}</span> <HelpTip tip={{ title: "Cine intră în comparație?",
        text: `Ordonate după numărul de criterii, apoi după achizițiile directe.${d.sameNames ? " O instituție poate apărea de două ori (identități SICAP duplicate)." : ""}` }} /></h3>
      <ol ref={list}>
        <li className="dist-member is-focal"><CriteriaRow m={focal} max={max} /></li>
        {listed.map((m) => <li key={m.entityId} className="dist-member"><CriteriaRow m={m} max={max} /></li>)}
      </ol>
      {hidden > 0 && <button type="button" className="qb-link dist-all" onClick={showAll}>Arată toate cele {formatInt(members.length)}</button>}
    </section> : <section className="dist-chart" aria-label="Ceilalți membri, după numărul de criterii">
      <div className="dist-bars" style={{ "--cols": hist.length } as CSSProperties} {...histMotion.root}>
        {hist.map((h) => {
          // The entity's column: "aici" when it is a member; an old link's other county leaves it out, so "ar fi aici", unmarked.
          const mark = h.k === Math.min(focal.nFlags, max), here = mark && focal.inGroup, would = mark && !focal.inGroup;
          const cls = `dist-col${here ? " is-here" : would ? " is-would" : ""}${openK === h.k ? " is-open" : ""}`;
          const body = <>
            <span className="dist-n">{here && <em className={histMotion.enter("cm-fade cm-late")}>aici</em>}{would && <em className={histMotion.enter("cm-fade cm-late")}>ar fi aici</em>}{formatInt(h.n)}</span>
            <span className={`dist-bar cm-tw ${histMotion.enter("cm-y")}`} style={{ height: `${Math.max(2, (h.n / peak) * 100)}%` }} />
            <span className="dist-axis"><b>{h.k}</b><small>{formatDecimal(h.k / max, max === 4 ? 2 : 1)}</small></span>
          </>;
          return h.n > 0
            ? <button key={h.k} type="button" className={cls} onClick={() => bars.toggle(h.k, h.n)} aria-expanded={openK === h.k} aria-controls="dist-bar-members"
              aria-label={`${countWords(h.k, "criteriu", "criterii")}: ${noun(h.n)}${here ? `, aici e ${name}` : would ? `, aici ar fi ${name}` : ""}. Lista lor`}>{body}</button>
            : <div key={h.k} className={cls}>{body}</div>;
        })}
      </div>
      <p className="dist-legend">criterii · indice · clic pe o bară: cine are acel număr</p>
      {bar && openK !== null && <BarMembers bar={bar} title={`${noun(bar.total)} cu ${countWords(openK, "criteriu", "criterii")}`} row={(m) => <CriteriaRow m={m} max={max} />}
        listRef={bars.listRef} onMore={() => bars.load(openK, bar.total, bar.rows.length)} onClose={bars.close}
        {...(evidence ? { onRecords: () => evidence.open(undefined, { criteria: openK }, `${countWords(openK, "criteriu", "criterii")} · înregistrările profilurilor din grup`) } : {})} />}
    </section>}

    <section className="dist-criteria" aria-label="Criteriu cu criteriu">
      <h3 className="qb-tipwrap">Criteriu cu criteriu <HelpTip tip={{ id: "criterii-risc" }} /></h3>
      <ul {...critMotion.root}>
        {order.map((c, i) => {
          const met = focal.flags.includes(c.code);
          const share = group.others ? c.others / group.others : 0, country = d.countryTotal ? c.country / d.countryTotal : 0;
          return <li key={c.code} className="dist-crit">
            <span className="dist-crit-name qb-tipwrap">{CRITERION_LABEL[c.code] ?? c.code} <HelpTip tip={{ title: CRITERION_LABEL[c.code] ?? c.code, text: CRITERION_RULE[c.code] ?? "" }} /></span>
            <span className={`dist-crit-own${met ? " is-met" : ""}`}><i aria-hidden="true" />{met ? "da" : "nu"}</span>
            <span className="dist-crit-bar" aria-hidden="true"><span className={`cm-tw ${critMotion.enter("cm-x")}`} style={{ width: `${share * 100}%`, "--i": i } as CSSProperties} />{!national && <i className="cm-tw" style={{ left: `${country * 100}%` }} />}</span>
            <span className="dist-crit-n">{shown(c.others)}</span>
            {met && <a className="dist-crit-cases" href={signalUrl(parseSignalState({ tip: c.code, rol: role, ent: String(focal.entityId) }))}>Vezi cazurile<span className="qb-glyph" aria-hidden="true">↗</span></a>}
          </li>;
        })}
      </ul>
      {!national && <p className="dist-legend qb-tipwrap"><i className="dist-mark" aria-hidden="true" /> media țării <HelpTip tip={{ title: "Media țării",
        text: `Ponderea în toate ${role === "authority" ? `cele ${countWords(d.countryTotal ?? 0, "instituție", "instituții")}` : `cele ${countWords(d.countryTotal ?? 0, "firmă", "firme")}`} cu profil.` }} /></p>}
    </section>

    <SourcesFoot d={d} name={name} />
  </div>;
}

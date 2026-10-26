"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { DistributionData, DistributionMember } from "../../lib/ask/compile";
import { countWords, formatDecimal, formatShare } from "../../lib/ask/answer-text";
import { askLink } from "../../lib/ask/source-spec";
import type { QuestionSpec } from "../../lib/ask/question-ui";
import {
  CRITERION_LABEL, CRITERION_RULE, PEER_MEMBERS_PAGE, PEER_MINIMUM, PROFILE_MIN_DAS, barMembersQuery, coverageWords, peerCountWords, peerGroupValue, peerWindowTip, similarRuleName, writePeerTicks,
  type PeerRowId,
} from "../../lib/ask/peer-groups-shared";
import { cleanName, formatInt } from "../../lib/format";
import { useAnswerEvidence } from "./AnswerEvidence";
import EmptyState from "./answer/EmptyState";
import HelpTip from "./builder/HelpTip";
import PeersWindow, { peerDataFor } from "./builder/PeersWindow";
import Popover from "./builder/pickers/Popover";
import { usePeerDialog } from "./builder/use-peer-dialog";
import "./distribution.css";

/*
 * "Unde se situează X după indicele de risc?" (distribution-2, plan §4.11,
 * final distribution §3.6–§3.8, §4.1, §4.5): the group in one line with "Schimbă
 * grupul" (the window of the builder's phrase), the entity's criteria ("3 din 5
 * criterii", the index unchanged beside them), its position among the other
 * members (more · same · fewer, which add up to them), the list of the others
 * up to 50 or the chart by number of criteria (a bar opens its members, ten at
 * a time, and their records), each criterion against the group and the
 * country, and the profile's sources. "Schimbă grupul" stays open on a tick,
 * as in the builder, so its note ("Am scos …") stays in view. Signals are
 * leads, not proof; recorded values, not payments.
 */

export interface DistributionAnswerProps {
  distribution: DistributionData;
  spec?: unknown;
  /** The answer's "Schimbă grupul" and the removals of the empty states: a new run with this group (StripPatch "peers"). */
  onChangeGroup?: (value: string) => void;
}

const LIST_FIRST = 7;

function Dots({ k, max }: { k: number; max: number }) {
  return <span className="dist-dots" role="img" aria-label={`${k} din ${max} criterii`}>
    {Array.from({ length: max }, (_, i) => <i key={i} className={i < k ? "on" : undefined} />)}
  </span>;
}

const memberPlace = (m: Pick<DistributionMember, "county" | "population">) =>
  [m.county, m.population !== null ? `${formatInt(m.population)} loc.` : null].filter(Boolean).join(" · ");

interface BarState { k: number; rows: DistributionMember[]; total: number; loading: boolean; error: string | null }

export default function DistributionAnswer({ distribution: d, spec, onChangeGroup }: DistributionAnswerProps) {
  const evidence = useAnswerEvidence();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState(false);
  // The group a tick asked for while its answer comes: a second tick builds on it, not on the answer on screen.
  const [pending, setPending] = useState<QuestionSpec | null>(null);
  const [bar, setBar] = useState<BarState | null>(null);
  const [answered, setAnswered] = useState(d);
  const change = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLOListElement>(null), barList = useRef<HTMLOListElement>(null);
  const request = useRef(0), focusRow = useRef<number | null>(null);
  // A new answer (another group): the window's pending group, the open bar and the unfolded list start again.
  if (answered !== d) { setAnswered(d); setPending(null); setBar(null); setAll(false); }
  const applied = (spec ?? { block: "distribution", measure: "value", filters: {} }) as QuestionSpec;
  const windowSpec = pending ?? applied;
  const peers = usePeerDialog(open ? windowSpec : { block: "", filters: {} });
  // Rows unfolded by "Arată încă 10" take the keyboard focus, not the page's top.
  useEffect(() => {
    const at = focusRow.current;
    if (at === null || !bar || bar.loading) return;
    focusRow.current = null;
    barList.current?.children[at]?.querySelector<HTMLElement>("a")?.focus();
  }, [bar]);
  if (d.version !== 2) return <p className="dist-note">Răspuns dintr-o versiune mai veche a site-ului. Reîncarcă întrebarea ca să vezi grupul și criteriile.</p>;
  const { focal, group, role, criteria } = d;
  const max = criteria.length;
  const name = cleanName(focal.name);
  // The group's noun as the answer computed it (its ticks and an old link's kind), not as the draft may say it now.
  const computed = { ...(group.ticks.includes("similar") ? { peers: { similar: true as const } } : {}), filters: group.legacy.authorityKind ? { authorityKind: group.legacy.authorityKind } : {} };
  const noun = (n: number) => peerCountWords(n, computed, role, group.facts);
  const write = (next: QuestionSpec) => onChangeGroup?.(JSON.stringify(peerGroupValue(next)));
  const national = !group.ticks.length && !group.legacy.county && !group.legacy.authorityKind;
  const groupTip = [
    `${group.words.charAt(0).toLocaleUpperCase("ro-RO")}${group.words.slice(1)}.`,
    ...(group.coverage ? [coverageWords(group.coverage)] : []),
    `Intră profilurile cu cel puțin ${PROFILE_MIN_DAS} achiziții directe acceptate; ${name} nu e numărat.`,
  ].join(" ");

  const close = () => { setOpen(false); setPending(null); };
  // The (?) opens over the whole row (qb-tipwrap on the row), not over the words "Grup: 29 de primării".
  const head = <div className="dist-group qb-tipwrap">
    <span>Grup: <b>{national ? `toată țara · ${noun(group.others)}` : noun(group.others)}</b> <HelpTip tip={{ title: "Grupul de comparație", text: groupTip }} /></span>
    {onChangeGroup && <button ref={change} type="button" className="qb-secondary dist-change" aria-haspopup="dialog" aria-expanded={open} onClick={() => open ? close() : setOpen(true)}>Schimbă grupul</button>}
    {onChangeGroup && <Popover open={open} anchor={change.current} onClose={close} title="Față de cine?" wide
      {...(peerDataFor(windowSpec, peers) ? { tip: peerWindowTip(peerDataFor(windowSpec, peers)!) } : {})}>
      {/* No "Aplică" (final §3.1): a tick reruns the answer and the window stays, with its "Am scos …" note; × only closes. */}
      <PeersWindow spec={windowSpec} state={peers} onChange={(next) => { setPending(next); write(next); }} />
    </Popover>}
  </div>;

  if (d.status === "below") {
    const stat = { block: "stat", measure: "value", dataset: "da", filters: Object.fromEntries(Object.entries(applied.filters).filter(([key]) => /^(authority|supplier)(Id|Name)$/.test(key))) };
    return <div className="dist">
      <EmptyState message={`${name} are ${countWords(focal.nDas, "achiziție directă acceptată", "achiziții directe acceptate")}. Comparația începe de la ${PROFILE_MIN_DAS}.`} />
      <p className="dist-links"><Link className="qb-relax-link" href={askLink(stat as QuestionSpec)}>Vezi achizițiile<span className="qb-glyph" aria-hidden="true">›</span></Link></p>
    </div>;
  }
  if (d.status === "small") {
    const label: Record<PeerRowId, string> = { similar: similarRuleName(group.facts.similar), domain: "același domeniu principal", county: "același județ", activity: "activitate apropiată" };
    const relax = [
      ...group.ticks.map((tick) => ({ id: tick, label: `Scoate „${label[tick]}”`, onClick: () => write(writePeerTicks(applied, group.ticks.filter((t) => t !== tick), group.facts)) })),
      ...(group.legacy.county ? [{ id: "legacy-county", label: `Scoate „${group.legacy.county}”`, onClick: () => { const next = structuredClone(applied); delete next.filters.county; write(next); } }] : []),
      ...(group.legacy.authorityKind ? [{ id: "legacy-kind", label: "Scoate tipul instituției", onClick: () => { const next = structuredClone(applied); delete next.filters.authorityKind; write(next); } }] : []),
    ];
    return <div className="dist">
      {head}
      <EmptyState message={`${group.others === 0 ? "Grupul nu are niciun alt membru" : `Grupul are doar ${noun(group.others)}`}. Comparația cere cel puțin ${PEER_MINIMUM}.`} relax={onChangeGroup ? relax : []} />
    </div>;
  }

  const position = d.position!, hist = d.hist ?? [], per = d.perCriterion ?? [];
  const members = d.members ?? null;
  const listed = members && (all || members.length <= LIST_FIRST + 1) ? members : members?.slice(0, LIST_FIRST) ?? [];
  const hidden = members ? members.length - listed.length : 0;
  const shown = (n: number) => members ? `${formatInt(n)} din ${formatInt(group.others)}` : `${formatInt(n)} · ${formatShare(group.others ? n / group.others : 0)}`;
  const order = [...per].sort((a, b) => Number(focal.flags.includes(b.code)) - Number(focal.flags.includes(a.code)));
  const peak = Math.max(...hist.map((h) => h.n), 1);
  const openCriteria = (k: number) => evidence?.open(undefined, { criteria: k }, `${countWords(k, "criteriu", "criterii")} · înregistrările profilurilor din grup`);
  const showAll = () => {
    setAll(true);
    // The first row unfolded takes the focus (the entity's row and the first seven stay above it).
    requestAnimationFrame(() => list.current?.children[LIST_FIRST + 1]?.querySelector<HTMLElement>("a")?.focus());
  };
  // A bar of the chart (final §3.6, §3.8): the group's members with that many criteria, ten at a time.
  const loadBar = (k: number, offset: number) => {
    const seq = ++request.current;
    setBar((current) => current && current.k === k ? { ...current, loading: true, error: null } : { k, rows: [], total: hist.find((h) => h.k === k)?.n ?? 0, loading: true, error: null });
    fetch(`/api/ask/peers/members?${barMembersQuery(d, k, offset)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({ ok: false })) as { ok?: boolean; members?: DistributionMember[]; total?: number; error?: string };
        if (seq !== request.current) return;
        if (!body.ok || !body.members) { setBar((current) => current && { ...current, loading: false, error: body.error ?? "Lista nu a putut fi citită acum." }); return; }
        if (offset > 0) focusRow.current = offset;
        setBar((current) => current && { ...current, rows: offset ? [...current.rows, ...body.members!] : body.members!, total: body.total ?? current.total, loading: false, error: null });
      })
      .catch(() => { if (seq === request.current) setBar((current) => current && { ...current, loading: false, error: "Lista nu a putut fi citită acum." }); });
  };
  const toggleBar = (k: number) => { if (bar?.k === k) { request.current++; setBar(null); } else loadBar(k, 0); };

  return <div className="dist">
    {head}
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
        <li className="dist-member is-focal"><MemberRow m={focal} max={max} /></li>
        {listed.map((m) => <li key={m.entityId} className="dist-member"><MemberRow m={m} max={max} /></li>)}
      </ol>
      {hidden > 0 && <button type="button" className="qb-link dist-all" onClick={showAll}>Arată toate cele {formatInt(members.length)}</button>}
    </section> : <section className="dist-chart" aria-label="Ceilalți membri, după numărul de criterii">
      <div className="dist-bars" style={{ "--cols": hist.length } as CSSProperties}>
        {hist.map((h) => {
          // The entity's column: "aici" when it is a member; an old link's other county leaves it out, so "ar fi aici", unmarked.
          const mark = h.k === Math.min(focal.nFlags, max), here = mark && focal.inGroup, would = mark && !focal.inGroup;
          const cls = `dist-col${here ? " is-here" : would ? " is-would" : ""}${bar?.k === h.k ? " is-open" : ""}`;
          const body = <>
            <span className="dist-n">{here && <em>aici</em>}{would && <em>ar fi aici</em>}{formatInt(h.n)}</span>
            <span className="dist-bar" style={{ height: `${Math.max(2, (h.n / peak) * 100)}%` }} />
            <span className="dist-axis"><b>{h.k}</b><small>{formatDecimal(h.k / max, max === 4 ? 2 : 1)}</small></span>
          </>;
          return h.n > 0
            ? <button key={h.k} type="button" className={cls} onClick={() => toggleBar(h.k)} aria-expanded={bar?.k === h.k} aria-controls="dist-bar-members"
              aria-label={`${countWords(h.k, "criteriu", "criterii")}: ${noun(h.n)}${here ? `, aici e ${name}` : would ? `, aici ar fi ${name}` : ""}. Lista lor`}>{body}</button>
            : <div key={h.k} className={cls}>{body}</div>;
        })}
      </div>
      <p className="dist-legend">criterii · indice · clic pe o bară: cine are acel număr</p>
      {bar && <BarMembers bar={bar} max={max} noun={noun} listRef={barList} onMore={() => loadBar(bar.k, bar.rows.length)}
        onClose={() => { request.current++; setBar(null); }} {...(evidence ? { onRecords: () => openCriteria(bar.k) } : {})} />}
    </section>}

    <section className="dist-criteria" aria-label="Criteriu cu criteriu">
      <h3 className="qb-tipwrap">Criteriu cu criteriu <HelpTip tip={{ id: "criterii-risc" }} /></h3>
      <ul>
        {order.map((c) => {
          const met = focal.flags.includes(c.code);
          const share = group.others ? c.others / group.others : 0, country = d.countryTotal ? c.country / d.countryTotal : 0;
          return <li key={c.code} className="dist-crit">
            <span className="dist-crit-name qb-tipwrap">{CRITERION_LABEL[c.code] ?? c.code} <HelpTip tip={{ title: CRITERION_LABEL[c.code] ?? c.code, text: CRITERION_RULE[c.code] ?? "" }} /></span>
            <span className={`dist-crit-own${met ? " is-met" : ""}`}><i aria-hidden="true" />{met ? "da" : "nu"}</span>
            <span className="dist-crit-bar" aria-hidden="true"><span style={{ width: `${share * 100}%` }} />{!national && <i style={{ left: `${country * 100}%` }} />}</span>
            <span className="dist-crit-n">{shown(c.others)}</span>
            {met && <a className="dist-crit-cases" href={`/semnale?tip=${encodeURIComponent(c.code)}&rol=${role}&ent=${focal.entityId}`}>Vezi cazurile<span className="qb-glyph" aria-hidden="true">↗</span></a>}
          </li>;
        })}
      </ul>
      {!national && <p className="dist-legend qb-tipwrap"><i className="dist-mark" aria-hidden="true" /> media țării <HelpTip tip={{ title: "Media țării",
        text: `Ponderea în toate ${role === "authority" ? `cele ${countWords(d.countryTotal ?? 0, "instituție", "instituții")}` : `cele ${countWords(d.countryTotal ?? 0, "firmă", "firme")}`} cu profil.` }} /></p>}
    </section>

    <div className="dist-foot">
      {evidence && <button type="button" className="cq-record-link" onClick={() => evidence.open(undefined, { entityIds: [focal.entityId], role }, `${name} · sursele profilului`)}>Verifică profilul ales →</button>}
      <p className="dist-caveat">Semnal, nu dovadă. Valori înregistrate, nu plăți.</p>
    </div>
  </div>;
}

/** The members of one bar (final §3.8 "Peste 50, lista se deschide din barele graficului"): the list's rows, ten more at a time, and their records (→). */
function BarMembers({ bar, max, noun, listRef, onMore, onClose, onRecords }: {
  bar: BarState; max: number; noun: (n: number) => string; listRef: RefObject<HTMLOListElement | null>;
  onMore: () => void; onClose: () => void; onRecords?: () => void;
}) {
  const left = bar.total - bar.rows.length;
  return <section id="dist-bar-members" className="dist-list dist-bar-members" aria-label={`${noun(bar.total)} cu ${countWords(bar.k, "criteriu", "criterii")}`} aria-busy={bar.loading}>
    <h3>{noun(bar.total)} cu {countWords(bar.k, "criteriu", "criterii")}
      <button type="button" className="dist-close" aria-label="Închide lista" onClick={onClose}>×</button></h3>
    <ol ref={listRef}>{bar.rows.map((m) => <li key={m.entityId} className="dist-member"><MemberRow m={m} max={max} /></li>)}</ol>
    {bar.loading && <p className="dist-legend" role="status">Caut membrii…</p>}
    {bar.error && <p className="dist-note" role="alert">{bar.error}</p>}
    <div className="dist-bar-foot">
      {!bar.loading && left > 0 && <button type="button" className="qb-link dist-all" onClick={onMore}>Arată încă {formatInt(Math.min(PEER_MEMBERS_PAGE, left))}</button>}
      {onRecords && <button type="button" className="cq-record-link" onClick={onRecords}>Vezi înregistrările →</button>}
    </div>
  </section>;
}

function MemberRow({ m, max }: { m: Pick<DistributionMember, "entityId" | "name" | "county" | "population" | "nFlags" | "nDas">; max: number }) {
  return <>
    <span className="dist-member-t">
      <Link href={`/entitati/${m.entityId}`}>{cleanName(m.name)}</Link>
      {memberPlace(m) && <small>{memberPlace(m)}</small>}
      <small>{countWords(m.nDas, "achiziție directă", "achiziții directe")}</small>
    </span>
    <Dots k={m.nFlags} max={max} />
  </>;
}

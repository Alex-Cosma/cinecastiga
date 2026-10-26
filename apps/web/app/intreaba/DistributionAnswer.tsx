"use client";

import Link from "next/link";
import { useRef, useState, type CSSProperties } from "react";
import type { DistributionData, DistributionMember } from "../../lib/ask/compile";
import { countWords, formatDecimal, formatShare } from "../../lib/ask/answer-text";
import { askLink } from "../../lib/ask/source-spec";
import type { QuestionSpec } from "../../lib/ask/question-ui";
import {
  CRITERION_LABEL, CRITERION_RULE, PEER_MINIMUM, PROFILE_MIN_DAS, coverageWords, peerCountWords, peerGroupValue, peerWindowTip, similarRuleName, writePeerTicks,
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
 * up to 50 or the chart by number of criteria, each criterion against the
 * group and the country, and the profile's sources. Signals are leads, not
 * proof; recorded values, not payments.
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

export default function DistributionAnswer({ distribution: d, spec, onChangeGroup }: DistributionAnswerProps) {
  const evidence = useAnswerEvidence();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState(false);
  const change = useRef<HTMLButtonElement>(null);
  const applied = (spec ?? { block: "distribution", measure: "value", filters: {} }) as QuestionSpec;
  const peers = usePeerDialog(open ? applied : { block: "", filters: {} });
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

  const head = <div className="dist-group">
    <span className="qb-tipwrap">Grup: <b>{national ? `toată țara · ${noun(group.others)}` : noun(group.others)}</b> <HelpTip tip={{ title: "Grupul de comparație", text: groupTip }} /></span>
    {onChangeGroup && <button ref={change} type="button" className="qb-secondary dist-change" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>Schimbă grupul</button>}
    {onChangeGroup && <Popover open={open} anchor={change.current} onClose={() => setOpen(false)} title="Față de cine?" wide
      {...(peerDataFor(applied, peers) ? { tip: peerWindowTip(peerDataFor(applied, peers)!) } : {})}>
      <PeersWindow spec={applied} state={peers} onChange={(next) => { setOpen(false); write(next); }} />
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
      <ol>
        <li className="dist-member is-focal"><MemberRow m={focal} max={max} /></li>
        {listed.map((m) => <li key={m.entityId} className="dist-member"><MemberRow m={m} max={max} /></li>)}
      </ol>
      {hidden > 0 && <button type="button" className="qb-link dist-all" onClick={() => setAll(true)}>Arată toate cele {formatInt(members.length)}</button>}
    </section> : <section className="dist-chart" aria-label="Ceilalți membri, după numărul de criterii">
      <div className="dist-bars" style={{ "--cols": hist.length } as CSSProperties}>
        {hist.map((h) => {
          const here = h.k === Math.min(focal.nFlags, max);
          const bar = <>
            <span className="dist-n">{here && <em>aici</em>}{formatInt(h.n)}</span>
            <span className="dist-bar" style={{ height: `${Math.max(2, (h.n / peak) * 100)}%` }} />
            <span className="dist-axis"><b>{h.k}</b><small>{formatDecimal(h.k / max, max === 4 ? 2 : 1)}</small></span>
          </>;
          return evidence && h.n > 0
            ? <button key={h.k} type="button" className={`dist-col${here ? " is-here" : ""}`} onClick={() => openCriteria(h.k)}
              aria-label={`${countWords(h.k, "criteriu", "criterii")}: ${noun(h.n)}${here ? `, aici e ${name}` : ""}. Înregistrările lor`}>{bar}</button>
            : <div key={h.k} className={`dist-col${here ? " is-here" : ""}`}>{bar}</div>;
        })}
      </div>
      <p className="dist-legend">criterii · indice{evidence ? " · clic pe o bară: înregistrările profilurilor cu acel număr" : ""}</p>
    </section>}

    <section className="dist-criteria" aria-label="Criteriu cu criteriu">
      <h3>Criteriu cu criteriu</h3>
      <ul>
        {order.map((c) => {
          const met = focal.flags.includes(c.code);
          const share = group.others ? c.others / group.others : 0, country = d.countryTotal ? c.country / d.countryTotal : 0;
          return <li key={c.code} className="dist-crit">
            <span className="dist-crit-name qb-tipwrap">{CRITERION_LABEL[c.code] ?? c.code} <HelpTip tip={{ title: CRITERION_LABEL[c.code] ?? c.code, text: CRITERION_RULE[c.code] ?? "" }} /></span>
            <span className={`dist-crit-own${met ? " is-met" : ""}`}><i aria-hidden="true" />{met ? "da" : "nu"}</span>
            <span className="dist-crit-bar" aria-hidden="true"><span style={{ width: `${share * 100}%` }} />{!national && <i style={{ left: `${country * 100}%` }} />}</span>
            <span className="dist-crit-n">{shown(c.others)}</span>
            {met && <a className="dist-crit-cases" href={`/semnale?tip=${encodeURIComponent(c.code)}&rol=${role}&ent=${focal.entityId}`}>Vezi cazurile<span className="qb-glyph" aria-hidden="true">→</span></a>}
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

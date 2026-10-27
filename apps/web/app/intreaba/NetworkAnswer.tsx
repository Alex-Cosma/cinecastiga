"use client";

import { useEffect, useRef, useState } from "react";
import { formatInt, formatRon, formatRonFull } from "@/lib/format";
import { countWords, formatShare } from "@/lib/ask/answer-text";
import { networkSinceChoices, NETWORK_LIST_LABELS, type NetworkData, type NetworkList, type NetworkOrder, type NetworkRow } from "@/lib/ask/network-shared";
import { networkOrder } from "@/lib/ask/network-shared";
import type { AskSpec } from "@/lib/ask/spec";
import { useAnswerEvidence } from "./AnswerEvidence";
import CountGroups from "./builder/CountGroups";
import Segmented from "./builder/Segmented";
import HelpTip from "./builder/HelpTip";
import EmptyState from "./answer/EmptyState";
import RowFacts from "./answer/RowFacts";
import RowMenu from "./answer/RowMenu";
import TotalLine from "./answer/TotalLine";
import { focusFirstNew } from "./answer/ListFoot";
import { entityRowActions } from "./answer/row-actions";
import {
  JOINT_TIP, ONE_OFF_TIP, ORDER_OPTIONS, bandLast, chartRows, networkButtons, networkEmpty, networkPage, networkRowView, networkSummary, partnerNoun, relationWaits, shownList, sinceTip,
  type NetworkRelation, type NetworkRowView,
} from "./network-answer";
import "./relations.css";

/*
 * The network's answer (plan §4.8 P6–P8; final network §3–§4; kit §6
 * network): „Grupele, față de [2025]” and the four group buttons with their
 * partners and sums, the summary and „Ordonează”, the radial chart of the
 * first 15 (under „Arată graficul” on a phone), the rows with their place,
 * facts, share and band of years, „Arată încă 15” with the rest of the list,
 * and a group's empty state. The groups and the orders switch on the answer
 * already fetched (onList, onOrder: AskPanel writes the applied question with
 * no request); the reference year is a new query (onSince). A bounded answer
 * („Toți” on one channel or in a period, S4 review) waits on its whole relation
 * (`relation`): the groups and the order by years are disabled, the rows have
 * no band, until AskPanel gives the whole answer in its place.
 */

export interface NetworkAnswerProps {
  data: NetworkData;
  spec: AskSpec;
  /** What changed the total outside the sentence (G8). */
  conditions?: readonly string[];
  onList?: (list: NetworkList) => void;
  onOrder?: (order: NetworkOrder) => void;
  onSince?: (year: number) => void;
  /** A bounded answer's whole relation, still asked or not read (part=network). */
  relation?: NetworkRelation;
}

export default function NetworkAnswer({ data, spec, conditions = [], onList, onOrder, onSince, relation }: NetworkAnswerProps) {
  const evidence = useAnswerEvidence();
  const list = shownList(spec);
  const own = data.lists[list];
  // „Arată încă 15” adds rows the answer holds; a new list, order or answer starts again.
  const [extra, setExtra] = useState(0);
  const [chart, setChart] = useState(false);
  useEffect(() => { setExtra(0); }, [data, list, spec.network?.order, spec.network?.show]);
  const listRef = useRef<HTMLDivElement>(null);
  const page = networkPage(data, spec, list, extra);
  const last = bandLast(data);
  const views = page.rows.map((row) => networkRowView(row, data, list, last));
  const summary = networkSummary(own, page.shownValue, page.shown);
  const empty = networkEmpty(data, list);
  const noun = partnerNoun(data);
  const years = networkSinceChoices(data.complete);
  const menus = views.map((view, i) => {
    const records = evidence ? () => evidence.open(undefined, view.scope, view.scopeLabel) : undefined;
    return evidence?.exclude ? entityRowActions(spec, { id: view.entityId, name: view.name }, {
      ...(records ? { records } : {}), exclude: () => evidence.exclude!({ id: view.entityId, name: view.name }, i),
    }, data.focal.entityId) : [];
  });
  return <div className="qb qb-net">
    <div className="qb-strip qb-net-strip" role="group" aria-label="Ce parteneri">
      <div className="qb-row qb-tipwrap qb-net-since">
        <span className="qb-strip-label">Grupele, față de</span>
        <Segmented label="Grupele, față de anul" size="sm" value={String(data.since)}
          options={years.map((year) => ({ value: String(year), label: String(year) }))}
          onChange={(value) => { if (Number(value) !== data.since) onSince?.(Number(value)); }} />
        <HelpTip tip={sinceTip(data)} />
      </div>
      <CountGroups label="Ce parteneri" groups={networkButtons(data, relation)} value={list} onChange={(value) => { if (value !== list) onList?.(value as NetworkList); }} />
    </div>
    {!empty && <div className="qb-net-head">
      <p className="qb-net-summary qb-tipwrap">
        <span>{summary.parts.join(" · ")}</span>
        {/* The space before each part stays outside its nowrap: the line may break there (S4 tests: „· 95,3% în asociere (?)” ran 56 px past a 390 px screen, its (?) out of reach). */}
        {summary.oneOff && <>{" "}<span className="qb-nowrap">· {summary.oneOff}<HelpTip tip={ONE_OFF_TIP} /></span></>}
        {summary.joint && <>{" "}<span className="qb-nowrap">· {summary.joint}<HelpTip tip={JOINT_TIP} /></span></>}
      </p>
      <span className="qb-row qb-net-order">
        <span className="qb-strip-label">Ordonează</span>
        <Segmented label="Ordonează" size="sm" value={networkOrder(spec)}
          options={relation ? ORDER_OPTIONS.map((option) => option.value === "years" ? { ...option, disabled: relationWaits(relation) } : option) : ORDER_OPTIONS} onChange={(value) => { if (value !== networkOrder(spec)) onOrder?.(value as NetworkOrder); }} />
      </span>
    </div>}
    {empty ? <EmptyState message={empty} titleId="raspuns-titlu" relax={list !== "all" && data.lists.all.partners > 0
      ? [{ id: "all", label: `Vezi toți partenerii`, onClick: () => onList?.("all") }] : []} /> : <>
      <div className={`qb-net-chart${chart ? " is-open" : ""}`}>
        <button type="button" className="qb-more-btn qb-net-chart-toggle" aria-expanded={chart} onClick={() => setChart((open) => !open)}>
          {chart ? "Ascunde graficul" : "Arată graficul"}
        </button>
        <NetworkChart rows={chartRows(page.rows)} data={data} list={list} views={views} />
      </div>
      <div ref={listRef} className="qb-alist qb-net-rows" role="list" aria-label={`${NETWORK_LIST_LABELS[list]} · ${noun.many}`}>
        {views.map((view, i) => <NetworkRowItem key={view.key} view={view} actions={menus[i]!}
          {...(evidence ? { onRecords: () => evidence.open(undefined, view.scope, view.scopeLabel) } : {})} />)}
      </div>
      <div className="qb-listfoot">
        {(page.more || page.rest) && <span className="qb-row">
          {page.more && <button type="button" className="qb-more-btn" onClick={() => { const shown = page.shown; setExtra((n) => n + page.step); requestAnimationFrame(() => focusFirstNew(listRef.current, shown)); }}>{page.more}</button>}
          {page.rest && <span className="qb-rest">{page.rest}</span>}
        </span>}
        {evidence && <button type="button" className="qb-secondary" onClick={() => evidence.open()}>
          {list === "all" ? "Înregistrările partenerilor" : "Înregistrările grupei"}<span className="qb-glyph" aria-hidden="true">→</span>
        </button>}
      </div>
      <TotalLine conditions={conditions}>
        {`${list === "all" ? "" : `${NETWORK_LIST_LABELS[list]} · `}`}<span className="qb-num">{formatRonFull(own.value)}</span> · {formatInt(own.count)} {own.count === 1 ? "înregistrare" : "înregistrări"}
      </TotalLine>
    </>}
  </div>;
}

/** One partner (final §4 „Telefon”): name and place; facts; value and share; the band of years; records and "⋯". */
function NetworkRowItem({ view, actions, onRecords }: { view: NetworkRowView; actions: ReturnType<typeof entityRowActions>; onRecords?: () => void }) {
  return <div className="qb-arow qb-nrow" role="listitem" tabIndex={-1} data-qb-arow="">
    <div className="qb-nrow-main">
      <div className="qb-arow-name">{view.name}{view.place && <small>{view.place}</small>}</div>
      <RowFacts facts={view.facts} />
    </div>
    <div className="qb-nrow-val">
      <span className="qb-num">{view.value}</span>
      <small>{view.share}</small>
    </div>
    {view.band.length > 0 && <div className="qb-nrow-years">
      <span className="qb-years-band" role="img" aria-label={view.bandLabel}>
        {view.band.map((cell) => <i key={cell.year} className={`qb-yc${cell.on ? " is-on" : ""}${cell.partial ? " is-partial" : ""}${cell.gap ? " is-gap" : ""}`} title={cell.label} />)}
      </span>
      <small>{view.yearsText}</small>
    </div>}
    {onRecords && <button type="button" className="qb-rec qb-nrow-rec" aria-label={`${view.records}: ${view.name}`} onClick={onRecords}>
      {view.records}<span className="qb-glyph" aria-hidden="true">→</span>
    </button>}
    {actions.length > 0 && <RowMenu name={view.name} actions={actions} />}
  </div>;
}

/**
 * The radial chart of the first 15 partners (final §3.5): the centre, a spoke and a disc per partner, its width
 * and size by value; the tooltip's share is of the list's total, not of the partners drawn. Names whole in the
 * title; a click opens the partner's records.
 */
function NetworkChart({ rows, data, list, views }: { rows: readonly NetworkRow[]; data: NetworkData; list: NetworkList; views: readonly NetworkRowView[] }) {
  const evidence = useAnswerEvidence();
  const [hover, setHover] = useState<string | null>(null);
  if (rows.length === 0) return null;
  const W = 640, H = 380, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 70;
  const max = Math.max(...rows.map((n) => n.value), 1), total = data.lists[list].value;
  const byId = new Map(views.map((view) => [view.entityId, view]));
  return <svg viewBox={`0 0 ${W} ${H}`} className="qb-net-svg" role="img" aria-label={`${countWords(rows.length, "partener", "parteneri")}, primii, ai lui ${data.focal.name}`}>
    {rows.map((n, i) => {
      const a = (i / rows.length) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R, r = 6 + Math.sqrt(n.value / max) * 16;
      const anchor = Math.cos(a) > 0.3 ? "start" : Math.cos(a) < -0.3 ? "end" : "middle";
      const view = byId.get(n.entityId), name = view?.name ?? "?", on = hover === n.entityId;
      const label = name.length > 26 ? `${name.slice(0, 25)}…` : name;
      return <g key={n.entityId} onMouseEnter={() => setHover(n.entityId)} onMouseLeave={() => setHover(null)}>
        <line x1={cx} y1={cy} x2={x} y2={y} className="qb-net-spoke" strokeWidth={Math.max(1, (n.value / max) * 8)} opacity={on ? 0.9 : 0.55} />
        <a href={`/entitati/${n.entityId}`} aria-label={`${name} · ${formatRon(n.value)} · ${total > 0 ? formatShare(n.value / total) : "—"} din total`}
          onClick={(event) => { if (evidence && view) { event.preventDefault(); evidence.open(undefined, view.scope, view.scopeLabel); } }}>
          <title>{`${name}\n${formatRon(n.value)} · ${total > 0 ? formatShare(n.value / total) : "—"} din total · ${view?.records ?? ""}`}</title>
          <circle cx={x} cy={y} r={on ? r + 2 : r} className="qb-net-node" />
        </a>
        {/* The disc is the target; its label is words beside it (two neighbours' labels may meet, their targets never). */}
        <text x={x + (anchor === "start" ? r + 4 : anchor === "end" ? -r - 4 : 0)} y={y + (anchor === "middle" ? (Math.sin(a) > 0 ? r + 12 : -r - 6) : 4)}
          fontSize={10} textAnchor={anchor} className="qb-net-label" fontWeight={on ? 700 : 400} aria-hidden="true" pointerEvents="none">{label}</text>
      </g>;
    })}
    <circle cx={cx} cy={cy} r={34} className="qb-net-centre" />
    <text x={cx} y={cy + 3} fontSize={9} textAnchor="middle" className="qb-net-centre-label">{data.focal.name.length > 13 ? `${data.focal.name.slice(0, 12)}…` : data.focal.name}<title>{data.focal.name}</title></text>
  </svg>;
}

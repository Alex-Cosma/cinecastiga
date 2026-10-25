"use client";

import { Fragment } from "react";
import Link from "next/link";
import type { PartialYear } from "@/lib/ask/compile";
import type { AskSpec } from "@/lib/ask/spec";
import type { TrendList } from "@/lib/ask/trend-shared";
import { useAnswerEvidence } from "./AnswerEvidence";
import CountGroups from "./builder/CountGroups";
import Segmented from "./builder/Segmented";
import HelpTip from "./builder/HelpTip";
import EmptyState from "./answer/EmptyState";
import RowFacts, { FactTag } from "./answer/RowFacts";
import TotalLine from "./answer/TotalLine";
import {
  compositionHead, emptyGroupsLine, firstOptions, groupTerm, labelLegend, newSubLabel, partialStars, percentTerm, rowGroupWords, shownTrendList, trendButtons,
  trendEmpty, trendNounWords, trendRest, trendRowView, trendTotal, withoutFilingWords, type TrendData, type TrendRowView,
} from "./trend-answer";

/*
 * The trend's answer (plan §4.7 P6, P8; trend final §3.1, §3.4, §4.1, §4.4,
 * §4.8): the five group buttons with their count and change, „Toate · Prima
 * dată” on the new ones, the rows of the chosen list with their labels and
 * partner line, „Înregistrări →” per row, a group's empty state and its total
 * line. Every list and its facts came with the answer (owner-R-facts-all-lists),
 * so a button only changes the applied question (onList): AskPanel writes it
 * into the URL and the builder, with no request. An answer stored before
 * trend-2 has no composition: it shows its one list, as before.
 */

export interface TrendBlockProps {
  data: TrendData;
  /** The applied question: its `trend` chooses the list shown. */
  spec: AskSpec;
  /** Audit F19: endpoint years the archive covers only in part. */
  partial?: PartialYear[];
  /** What changed the total outside the sentence (G8): the total line says it. */
  conditions?: readonly string[];
  /** Another list of the same answer (no request). */
  onList?: (list: TrendList) => void;
  /** A wider question (a lower base on the growths in percent): a new query. */
  onWider?: (spec: AskSpec) => void;
}

export default function TrendBlock({ data, spec, partial = [], conditions = [], onList, onWider }: TrendBlockProps) {
  const evidence = useAnswerEvidence();
  const { list, rows } = shownTrendList(data, spec);
  const buttons = trendButtons(data, spec);
  const head = compositionHead(data, spec);
  const first = firstOptions(data, list, spec);
  const noun = trendNounWords(data, spec);
  const shownPartial = partial.filter((p) => p.year === data.yearA || p.year === data.yearB);
  // A partly covered year carries its "*" wherever it labels a sum, in every list (the note under the list says why).
  const stars = partialStars(data, shownPartial);
  const views = rows.map((row) => trendRowView(row, list, data, spec, stars));
  const legend = labelLegend(new Set(views.flatMap((v) => v.kinds)), data);
  const term = groupTerm(list, data);
  const percent = percentTerm(data, list, spec);
  const total = trendTotal(data, list, spec, stars);
  const rest = trendRest(data, list, rows.length, spec);
  const unfiled = withoutFilingWords(data, list);
  const emptyGroups = buttons ? emptyGroupsLine([...buttons, ...(first ?? []).map((o) => ({ name: o.label, ...(o.disabled ? { disabled: o.disabled } : {}) }))]) : null;
  const empty = rows.length === 0 ? trendEmpty(data, list, spec) : null;
  const pick = (next: string) => { if (next !== list) onList?.(next as TrendList); };
  return <div className="fk fk-trend">
    {buttons && <div className="fk-strip fk-trend-strip" role="group" aria-label="Felul schimbării">
      <CountGroups label="Felul schimbării" groups={buttons} value={list === "first" ? "new" : list} {...(head ? { head } : {})} onChange={pick} />
      {first && <div className="fk-row fk-tipwrap fk-trend-sub">
        <span className="fk-strip-label fk-trend-sub-label" aria-hidden="true"><i className="fk-sw fk-sw--new" />{newSubLabel(data, spec)}</span>
        <HelpTip tip={{ id: "trend-prima-data" }} />
        <Segmented label={`Care ${noun.many} noi`} value={list} options={first} onChange={pick} />
      </div>}
      {emptyGroups && <p className="fk-trend-off fk-tipwrap">{emptyGroups.text}<HelpTip tip={emptyGroups.tip} /></p>}
      {unfiled && <p className="fk-trend-unfiled fk-tipwrap">{unfiled} <HelpTip tip={{ title: "Fără bilanț",
        text: "Angajații vin din ultimul bilanț depus (de azi, nu din anul atribuirii). Firmele fără bilanț (străine, PFA, înființate recent) nu intră în nicio clasă." }} /></p>}
    </div>}
    {empty ? <EmptyState message={empty.message} titleId="raspuns-titlu" relax={[
      ...(empty.to ? [{ id: `to:${empty.to.list}`, label: empty.to.label, onClick: () => onList?.(empty.to!.list) }] : []),
      ...(empty.base && onWider ? [{ id: "base", label: empty.base.label, onClick: () => onWider({ ...spec, trend: { ...spec.trend, minBase: empty.base!.minBase } }) }] : []),
    ]} /> : <div className={`fk-alist fk-trend-rows${list === "all" ? " fk-trend-rows--sw" : ""}${views.some((v) => v.single) ? " fk-trend-rows--single" : ""}`}
      role="list" aria-label={total?.lead ?? "Schimbările"}>
      {views.map((view) => <TrendRowItem key={view.key} view={view} swatch={list === "all"}
        {...(evidence ? { onRecords: () => evidence.open(undefined, view.scope, view.scopeLabel) } : {})} />)}
    </div>}
    {(legend.length > 0 || term || percent) && rows.length > 0 && <p className="fk-trend-legend fk-tipwrap">
      {term && <span>{term.text}<HelpTip tip={term.tip} /></span>}
      {percent && <span>{percent.text}<HelpTip tip={percent.tip} /></span>}
      {legend.map(({ fact, tip }) => <span key={fact.text}><FactTag fact={fact} /><HelpTip tip={tip} /></span>)}
    </p>}
    {(rest || evidence) && rows.length > 0 && <div className="fk-listfoot">
      {rest && <span className="fk-rest">{rest}</span>}
      {evidence && <button type="button" className="fk-secondary" onClick={() => evidence.open()}>
        {list === "all" ? "Înregistrările celor doi ani" : "Înregistrările grupei"}<span className="fk-glyph" aria-hidden="true">→</span>
      </button>}
    </div>}
    {total && !empty && <TotalLine conditions={conditions}>
      {total.lead}{" · "}
      {/* Each year with its sum stays whole; the line may break between them, before „→ 2026”. */}
      {total.values.map((v, i) => <Fragment key={i}>{i > 0 ? " " : ""}<span className="fk-nowrap">{v.label && <i className="fk-trend-y">{v.label}</i>}{v.label ? " " : ""}<span className="fk-num">{v.value}</span>{i === total.values.length - 1 ? total.unit : ""}</span></Fragment>)}
    </TotalLine>}
    {shownPartial.length > 0 && <p className="ask-fine ask-partial-note">
      {shownPartial.some((p) => p.provisional)
        ? "* an cu date parțiale sau provizorii, diferența reflectă și perioada neacoperită sau încă nepublicată: "
        : "* an acoperit parțial, diferența reflectă și perioada neacoperită: "}
      {shownPartial.map((p) => `${p.year} (${p.note})`).join(", ")}.
    </p>}
  </div>;
}

/** One row (trend final §4.8): name and place, labels, partner, the two years and the change, „Înregistrări →”. */
function TrendRowItem({ view, swatch, onRecords }: { view: TrendRowView; swatch: boolean; onRecords?: () => void }) {
  const pct = view.pct && <><span aria-hidden="true">{view.pct.text}</span><span className="fk-sr">{view.pct.words}</span></>;
  return <div className="fk-arow fk-trow" role="listitem" tabIndex={-1} data-fk-arow="">
    <div className="fk-trow-main">
      <div className="fk-arow-name fk-trow-name">
        {swatch && <><i className={`fk-sw fk-sw--${view.group === "equal" ? "all" : view.group} fk-trow-sw`} aria-hidden="true" /><span className="fk-sr">{rowGroupWords(view.group)}: </span></>}
        {view.href ? <Link href={view.href}>{view.name}</Link> : view.name}
        {view.place && <small>{view.place}</small>}
      </div>
      <RowFacts facts={view.facts} />
      {view.partner && <p className="fk-trow-partner"><span>{view.partner}</span></p>}
    </div>
    <div className="fk-arow-val fk-trow-val">
      {/* Ordered in percent, the percent is the main figure and the change in lei goes under it (trend final §3.9). */}
      {view.pctFirst && pct ? <span className="fk-trow-dline">
        <span className={`fk-num fk-trow-delta${view.up ? " up" : ""}`}>{pct}</span>
        <span className="fk-trow-pct">{view.delta}</span>
      </span> : <span className="fk-trow-dline">
        <span className={`fk-num fk-trow-delta${view.up ? " up" : ""}`}>{view.delta}</span>
        {view.single && <span className="fk-trow-pct">{view.single.when}</span>}
        {pct && <span className="fk-trow-pct">{pct}</span>}
      </span>}
      {view.years.length > 0 && <span className="fk-trow-years">
        <span><i>{view.years[0]!.label}</i> {view.years[0]!.value}</span>{" "}
        <span>→ <i>{view.years[1]!.label}</i> {view.years[1]!.value}</span>
      </span>}
      {onRecords && <button type="button" className="fk-rec" aria-label={`Înregistrări: ${view.name}`} onClick={onRecords}>
        Înregistrări<span className="fk-glyph" aria-hidden="true">→</span>
      </button>}
    </div>
  </div>;
}

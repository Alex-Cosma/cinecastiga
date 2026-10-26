"use client";

import { Fragment } from "react";
import Link from "next/link";
import type { PartialYear } from "@/lib/ask/compile";
import { BLOCK_FILTERS } from "../../lib/ask/filters/blocks";
import type { FilterId } from "@/lib/ask/filters/types";
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
  compositionHead, emptyGroupsLine, firstOptions, firstTimeKitTip, groupTerm, labelLegend, newSubLabel, partialStars, percentTerm, shownTrendList, trendButtons,
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
  /**
   * The keys BLOCK_FILTERS.trend puts in the strip: the group buttons (trendChange) and „Toate · Prima
   * dată” (trendFirstOnly), the sentence's group in the answer; without them the answer shows its list.
   */
  strip?: readonly FilterId[];
  /** A wider question (a lower base on the growths in percent): a new query. */
  onWider?: (spec: AskSpec) => void;
}

export default function TrendBlock({ data, spec, partial = [], conditions = [], onList, onWider, strip = BLOCK_FILTERS.trend.strip }: TrendBlockProps) {
  const evidence = useAnswerEvidence();
  const { list, rows } = shownTrendList(data, spec);
  const buttons = strip.includes("trendChange") ? trendButtons(data, spec) : null;
  const first = strip.includes("trendFirstOnly") ? firstOptions(data, list, spec) : null;
  const noun = trendNounWords(data, spec);
  const shownPartial = partial.filter((p) => p.year === data.yearA || p.year === data.yearB);
  // A partly covered year carries its "*" wherever it labels a sum or a group, in every list (the note under the list says why).
  const stars = partialStars(data, shownPartial);
  const head = compositionHead(data, spec, stars);
  const views = rows.map((row) => trendRowView(row, list, data, spec, stars));
  const legend = labelLegend(new Set(views.flatMap((v) => v.kinds)), data, spec);
  const term = groupTerm(list, data, spec, stars);
  const percent = percentTerm(data, list, spec);
  const total = trendTotal(data, list, spec, stars);
  const rest = trendRest(data, list, rows.length, spec);
  const unfiled = withoutFilingWords(data, list);
  const emptyGroups = buttons ? emptyGroupsLine([...buttons, ...(first ?? []).map((o) => ({ name: o.label, ...(o.disabled ? { disabled: o.disabled } : {}) }))]) : null;
  const empty = rows.length === 0 ? trendEmpty(data, list, spec) : null;
  const pick = (next: string) => { if (next !== list) onList?.(next as TrendList); };
  return <div className="qb qb-trend">
    {buttons && <div className="qb-strip qb-trend-strip" role="group" aria-label="Felul schimbării">
      <CountGroups label="Felul schimbării" groups={buttons} value={list === "first" ? "new" : list} {...(head ? { head } : {})} onChange={pick} />
      {first && <div className="qb-row qb-tipwrap qb-trend-sub">
        <span className="qb-strip-label qb-trend-sub-label" aria-hidden="true"><i className="qb-sw qb-sw--new" />{newSubLabel(data, spec)}</span>
        <HelpTip tip={firstTimeKitTip(spec)} />
        <Segmented label={`Care ${noun.many} noi`} value={list} options={first} onChange={pick} />
      </div>}
      {emptyGroups && <p className="qb-trend-off qb-tipwrap">{emptyGroups.text}<HelpTip tip={emptyGroups.tip} /></p>}
      {unfiled && <p className="qb-trend-unfiled qb-tipwrap">{unfiled} <HelpTip tip={{ title: "Fără bilanț",
        text: "Angajații vin din ultimul bilanț depus (de azi, nu din anul atribuirii). Firmele fără bilanț (străine, PFA, înființate recent) nu intră în nicio clasă." }} /></p>}
    </div>}
    {empty ? <EmptyState message={empty.message} titleId="raspuns-titlu" relax={[
      ...(empty.to ? [{ id: `to:${empty.to.list}`, label: empty.to.label, onClick: () => onList?.(empty.to!.list) }] : []),
      ...(empty.base && onWider ? [{ id: "base", label: empty.base.label, onClick: () => onWider({ ...spec, trend: { ...spec.trend, minBase: empty.base!.minBase } }) }] : []),
    ]} /> : <div className={`qb-alist qb-trend-rows${list === "all" ? " qb-trend-rows--sw" : ""}${views.some((v) => v.single) ? " qb-trend-rows--single" : ""}`}
      role="list" aria-label={total?.lead ?? "Schimbările"}>
      {views.map((view) => <TrendRowItem key={view.key} view={view} swatch={list === "all"}
        {...(evidence ? { onRecords: () => evidence.open(undefined, view.scope, view.scopeLabel) } : {})} />)}
    </div>}
    {(legend.length > 0 || term || percent) && rows.length > 0 && <p className="qb-trend-legend qb-tipwrap">
      {term && <span>{term.text}<HelpTip tip={term.tip} /></span>}
      {percent && <span>{percent.text}<HelpTip tip={percent.tip} /></span>}
      {legend.map(({ fact, tip }) => <span key={fact.text}><FactTag fact={fact} /><HelpTip tip={tip} /></span>)}
    </p>}
    {(rest || evidence) && rows.length > 0 && <div className="qb-listfoot">
      {rest && <span className="qb-rest">{rest}</span>}
      {evidence && <button type="button" className="qb-secondary" onClick={() => evidence.open()}>
        {list === "all" ? "Înregistrările celor doi ani" : "Înregistrările grupei"}<span className="qb-glyph" aria-hidden="true">→</span>
      </button>}
    </div>}
    {total && !empty && <TotalLine conditions={conditions}>
      {total.lead}{" · "}
      {/* Each year with its sum stays whole; the line may break between them, before „→ 2026”. */}
      {total.values.map((v, i) => <Fragment key={i}>{i > 0 ? " " : ""}<span className="qb-nowrap">{v.label && <i className="qb-trend-y">{v.label}</i>}{v.label ? " " : ""}<span className="qb-num">{v.value}</span>{i === total.values.length - 1 ? total.unit : ""}</span></Fragment>)}
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
  const pct = view.pct && <><span aria-hidden="true">{view.pct.text}</span><span className="qb-sr">{view.pct.words}</span></>;
  return <div className="qb-arow qb-trow" role="listitem" tabIndex={-1} data-qb-arow="">
    <div className="qb-trow-main">
      <div className="qb-arow-name qb-trow-name">
        {swatch && <><i className={`qb-sw qb-sw--${view.group === "equal" ? "all" : view.group} qb-trow-sw`} aria-hidden="true" /><span className="qb-sr">{view.groupWords}: </span></>}
        {view.href ? <Link href={view.href}>{view.name}</Link> : view.name}
        {view.place && <small>{view.place}</small>}
      </div>
      <RowFacts facts={view.facts} />
      {view.partner && <p className="qb-trow-partner"><span>{view.partner}</span></p>}
    </div>
    <div className="qb-arow-val qb-trow-val">
      {/* Ordered in percent, the percent is the main figure and the change in lei goes under it (trend final §3.9). */}
      {view.pctFirst && pct ? <span className="qb-trow-dline">
        <span className={`qb-num qb-trow-delta${view.up ? " up" : ""}`}>{pct}</span>
        <span className="qb-trow-pct">{view.delta}</span>
      </span> : <span className="qb-trow-dline">
        <span className={`qb-num qb-trow-delta${view.up ? " up" : ""}`}>{view.delta}</span>
        {view.single && <span className="qb-trow-pct">{view.single.when}</span>}
        {pct && <span className="qb-trow-pct">{pct}</span>}
      </span>}
      {view.years.length > 0 && <span className="qb-trow-years">
        <span><i>{view.years[0]!.label}</i> {view.years[0]!.value}</span>{" "}
        <span>→ <i>{view.years[1]!.label}</i> {view.years[1]!.value}</span>
      </span>}
      {onRecords && <button type="button" className="qb-rec" aria-label={`Înregistrări: ${view.name}`} onClick={onRecords}>
        Înregistrări<span className="qb-glyph" aria-hidden="true">→</span>
      </button>}
    </div>
  </div>;
}

"use client";

import EntityName from "../../components/EntityName";
import { formatRon } from "@/lib/format";
import type { SankeyData } from "@/lib/ask/sankey-shared";
import type { AskSpec } from "@/lib/ask/spec";
import { useAnswerEvidence } from "./AnswerEvidence";
import HelpTip from "./builder/HelpTip";
import RowMenu, { type RowAction } from "./answer/RowMenu";
import { entityRowActions } from "./answer/row-actions";
import { exclusionBlocked } from "@/lib/ask/filters/exclusions";
import type { FilterSpec } from "@/lib/ask/filters/types";
import { JOINT_FLOW_TIP, flowGeometry, partnerDomainsWords, sankeyView, type FlowNode, type SankeyView } from "./sankey-answer";
import { useChartMotion } from "./answer/chart-motion";
import "./relations.css";

/*
 * The flow's answer (plan §4.9 P6–P8; final sankey §3.9–§3.10, §4; kit §6
 * sankey): the partners the question shows and their rest on the left, the
 * five domains and theirs on the right, a band for each flow, each node with
 * its value, share and records and a "⋯" with „Vezi înregistrările →”,
 * „Scoate din calcul −” and „Detaliază ›” (a domain); a partner's name is
 * its page (owner, 2 November 2026); the note on
 * contracts with several winners. Under 560 px, and in „Tabel”, the partners
 * are a list with their domains in words. No category palette: partners in
 * the accent, domains in slate, rests dotted (final §3.10).
 */

export interface SankeyAnswerProps {
  data: SankeyData;
  spec: AskSpec;
  /** „Vizual | Tabel”: the table is the partners' list (final §4 „Accesibilitate”). */
  layout?: "visual" | "table";
  /** A domain one level down (the same question with that code: a new answer, kept in the thread). */
  deeperHref?: (code: string) => string;
}

export default function SankeyAnswer({ data, spec, layout = "visual", deeperHref }: SankeyAnswerProps) {
  const evidence = useAnswerEvidence();
  const view = sankeyView(data, spec);
  const menu = (node: FlowNode, side: "partner" | "domain", index: number): RowAction[] => {
    const records = evidence ? () => evidence.open(undefined, node.scope, node.scopeLabel) : undefined;
    if (node.rest) return records ? [{ id: "records", label: "Vezi înregistrările", glyph: "→", onSelect: records }] : [];
    if (side === "partner") return entityRowActions(spec, { id: node.id, name: node.full }, {
      ...(records ? { records } : {}), ...(evidence?.exclude ? { exclude: () => evidence.exclude!({ id: node.id, name: node.full }, index) } : {}),
    });
    // A domain (final §3.9): its records, one level down, or out of the calculation (a labelled CPV exclusion).
    const blocked = exclusionBlocked(spec as unknown as FilterSpec);
    return [
      ...(records ? [{ id: "records", label: "Vezi înregistrările", glyph: "→" as const, onSelect: records }] : []),
      ...(node.deeper && deeperHref ? [{ id: "deeper", label: "Detaliază", glyph: "›" as const, href: deeperHref(node.deeper) }] : []),
      ...(evidence?.exclude ? [{ id: "exclude", label: "Scoate din calcul", glyph: "−" as const, onSelect: () => evidence.exclude!({ id: node.id, name: node.full, field: "cpv" }, index), ...(blocked ? { disabled: blocked } : {}) }] : []),
    ];
  };
  return <div className="qb qb-sankey">
    {layout === "visual" && <FlowChart view={view} menu={menu} />}
    <div className={`qb-flow-list${layout === "table" ? " is-table" : ""}`} role="list" aria-label="Partenerii">
      {view.partners.map((node, i) => {
        const max = Math.max(...view.partners.map((p) => p.value), 1);
        const actions = menu(node, "partner", i);
        return <div key={node.id} className={`qb-arow qb-flow-row${node.rest ? " is-rest" : ""}`} role="listitem" tabIndex={-1} data-qb-arow="">
          <div className="qb-flow-row-main">
            <div className="qb-arow-name">{node.rest ? node.full : <EntityName id={node.id}>{node.full}</EntityName>}</div>
            <span className={`qb-flow-bar${node.rest ? " is-rest" : ""}`} style={{ width: `${Math.max(2, node.value / max * 100)}%` }} aria-hidden="true" />
            <small className="qb-flow-row-domains">{partnerDomainsWords(view, node.id)}</small>
            {node.joint && <small className="qb-flow-row-joint qb-tipwrap">{node.joint}<HelpTip tip={JOINT_FLOW_TIP} /></small>}
          </div>
          <div className="qb-arow-val">
            <span className="qb-num">{formatRon(node.value)}</span>
            <small>{node.share} · {node.facts}</small>
            {evidence && <button type="button" className="qb-rec qb-flow-rec" aria-label={`Înregistrările: ${node.full}`}
              onClick={() => evidence.open(undefined, node.scope, node.scopeLabel)}>Înregistrări<span className="qb-glyph" aria-hidden="true">→</span></button>}
          </div>
          {actions.length > 0 && <RowMenu name={node.full} actions={actions} />}
        </div>;
      })}
    </div>
    {view.joint && <p className="qb-flow-note qb-tipwrap">{view.joint}<HelpTip tip={JOINT_FLOW_TIP} /></p>}
  </div>;
}

/**
 * The flow over 560 px (final §3.10): the bands in an SVG stretched to the width (heights in px, so the HTML
 * labels beside them line up), the partners' labels on the left and the domains' on the right, each with its
 * "⋯". Bands are neutral; a band's title says its two ends and its value.
 */
function FlowChart({ view, menu }: { view: SankeyView; menu: (node: FlowNode, side: "partner" | "domain", index: number) => RowAction[] }) {
  // The bands are revealed left to right when the flow first shows, from the partners to the domains; the node bars
  // and the labels are in place. A new answer's bands fade in as a whole (keyed by what they draw): ribbons morphing
  // into other ribbons would draw flows that never were (owner, 6 November 2026).
  const motion = useChartMotion();
  const geo = flowGeometry(view);
  const drawn = geo.bands.map((band) => `${band.link.partner}>${band.link.domain}:${band.link.value}`).join("|");
  const W = 100, BAR = 1.6;
  const path = (y0: number, h0: number, y1: number, h1: number) => {
    const x0 = BAR, x1 = W - BAR, mx = W / 2;
    return `M ${x0} ${y0} C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1} L ${x1} ${y1 + h1} C ${mx} ${y1 + h1}, ${mx} ${y0 + h0}, ${x0} ${y0 + h0} Z`;
  };
  const labels = (nodes: readonly FlowNode[], side: "partner" | "domain", at: Map<string, { y: number; h: number }>) => nodes.map((node, i) => {
    const pos = at.get(node.id)!, actions = menu(node, side, i);
    return <div key={node.id} className={`qb-flow-label${node.rest ? " is-rest" : ""}`} role="listitem" style={{ top: pos.y + pos.h / 2 }}>
      <div className="qb-flow-label-text">
        {side === "partner" && !node.rest
          ? <EntityName id={node.id} className="qb-flow-name" title={node.full}>{node.name}</EntityName>
          : <span className="qb-flow-name" title={node.full}>{node.name}</span>}
        <span className="qb-flow-fig">{formatRon(node.value)} · {node.share}</span>
        <span className="qb-flow-facts">{node.single ?? node.facts}</span>
      </div>
      {actions.length > 0 && <RowMenu name={node.full} actions={actions} />}
    </div>;
  });
  return <div className="qb-flow" style={{ height: geo.height }} {...motion.root}>
    <div className="qb-flow-side qb-flow-left" role="list" aria-label="Partenerii">{labels(view.partners, "partner", geo.left)}</div>
    <svg className="qb-flow-svg" style={{ height: geo.height }} viewBox={`0 0 ${W} ${geo.height}`} preserveAspectRatio="none" role="img" aria-label="Partenerii și domeniile, după valoare">
      <g key={drawn} ref={motion.join} className={motion.enter("cm-x")}>
        {/* A band is its partner → domain flow, not its place in the list. */}
        {geo.bands.map((band) => <path key={`${band.link.partner}→${band.link.domain}`} className="qb-flow-band" d={path(band.y0, band.h0, band.y1, band.h1)}>
          <title>{`${band.link.label}\n${formatRon(band.link.value)}`}</title>
        </path>)}
      </g>
      {view.partners.map((node) => { const p = geo.left.get(node.id)!; return <rect key={node.id} x={0} y={p.y} width={BAR} height={p.h} className={`qb-flow-node qb-flow-node--p${node.rest ? " is-rest" : ""}`} />; })}
      {view.domains.map((node) => { const p = geo.right.get(node.id)!; return <rect key={node.id} x={W - BAR} y={p.y} width={BAR} height={p.h} className={`qb-flow-node qb-flow-node--d${node.rest ? " is-rest" : ""}`} />; })}
    </svg>
    <div className="qb-flow-side qb-flow-right" role="list" aria-label="Domeniile">{labels(view.domains, "domain", geo.right)}</div>
  </div>;
}

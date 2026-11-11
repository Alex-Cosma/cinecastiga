import Link from "next/link";
import { Fragment } from "react";
import EntityName from "@/components/EntityName";
import { productHref, type PriceLead, type PriceStrip } from "@/lib/unit-prices";
import { AXIS_TICKS, axisPos, buyersWord, dotOf, formatLei, formatQuantity, formatRatio, formatUnitPrice, leadsWord, medianRange } from "@/lib/unit-prices-shared";
import StripChart from "./StripChart";

/**
 * Banda prețurilor (owner, 11 November 2026): one strip per product and pack on a shared "times the median" axis.
 * The median is the forest rule, twice the median the dashed rule; the pale band holds eight buyers in ten, the dark
 * band the middle half; the risk dots are the leads, the furthest named. A strip opens into its leads.
 */
export function StripAxis({ compact = false }: { compact?: boolean }) {
  return <div className={`pr-axis${compact ? " pr-axis-compact" : ""}`} aria-hidden="true">
    {AXIS_TICKS.map((t) => <span key={t.ratio} style={{ left: `${axisPos(t.ratio)}%` }}>{t.ratio === 0.5 ? <><b className="pr-wide">jumătate</b><b className="pr-narrow">½</b></> : t.label}</span>)}
  </div>;
}

/** The key to the strip, under the axis on the list and under the big strip on the product page. */
export function StripLegend({ bins = false }: { bins?: boolean }) {
  return <ul className="pr-legend" aria-label="Cum se citește banda">
    <li><i className="pr-k-median" />mediana</li>
    <li><i className="pr-k-double" />de două ori mediana</li>
    <li><i className="pr-k-core" />jumătatea din mijloc</li>
    <li><i className="pr-k-band" />opt instituții din zece</li>
    {bins && <li><i className="pr-k-bins" />câte instituții, la fiecare preț</li>}
    <li><i className="pr-k-dot" />un preț peste dublu</li>
  </ul>;
}

function LeadRow({ lead, strip, suppliers }: { lead: PriceLead; strip: PriceStrip; suppliers: Record<string, string> }) {
  const named = lead.supplierIds.slice(0, 2).filter((id) => suppliers[id]);
  return <li className="pr-lead">
    <span className="pr-lead-who">
      <EntityName id={lead.authorityId} role="authority">{lead.name}</EntityName>
      <small>{[lead.county, strip.year ? null : lead.year].filter(Boolean).join(" · ")}</small>
    </span>
    <span className="pr-lead-price"><b>{formatUnitPrice(lead.price)}</b> {strip.per}<small>mediana {formatUnitPrice(lead.median)}</small></span>
    <span className="pr-lead-x">{formatRatio(lead.ratio)}</span>
    <span className="pr-lead-qty">{formatQuantity(lead.quantity, strip.per)}<small>{lead.awards === 1 ? "o achiziție" : `${lead.awards} achiziții`}</small></span>
    <span className="pr-lead-lei">{formatLei(lead.excess)}<small>peste mediană</small></span>
    <span className="pr-lead-sup">{named.length ? <>{named.map((id, i) => <Fragment key={id}>{i > 0 && ", "}<EntityName id={id} role="supplier">{suppliers[id]}</EntityName></Fragment>)}{lead.supplierIds.length > 2 && ` și încă ${lead.supplierIds.length - 2}`}</> : "—"}</span>
    <Link className="pr-lead-open" href={`${productHref(strip.family, strip.pack, strip.year, { deschis: lead.authorityId })}#institutie-${lead.authorityId}-${lead.year}`} prefetch={false}>Liniile</Link>
  </li>;
}

export default function PriceStrips({ strips, suppliers, county }: { strips: PriceStrip[]; suppliers: Record<string, string>; county: string | null }) {
  return <div className="pr-strips">
    <StripLegend />
    <div className="pr-head" aria-hidden="true"><span>Produs</span><StripAxis /><span>Peste dublu</span></div>
    {strips.map((s, i) => {
      const title = s.packLabel ? `${s.name}, ${s.packLabel}` : s.name;
      const furthest = s.dots[0];
      const median = `${s.year ? "mediana" : "mediana anului"} ${medianRange(s.medianLo, s.medianHi, s.per)}`;
      const sentence = `${title}: ${median}, ${buyersWord(s.buyers)}, ${leadsWord(s.leads)}${county ? ` în ${county}` : ""}.`
        + (s.mixed ? " Mărci diferite: citește denumirile." : "");
      return <details className={`pr-row${s.leads ? "" : " pr-row-quiet"}`} key={`${s.family}|${s.pack}|${s.year ?? "toti"}`} name="pr-strip">
        <summary className="pr-sum" aria-label={sentence}>
          <span className="pr-label">
            <b>{s.name}</b>
            {s.packLabel && <span className="pr-pack">{s.packLabel}</span>}
            <small>{median}</small><small className="pr-label-n">{buyersWord(s.buyers)}</small>
          </span>
          <span className="pr-strip"><StripChart band={{ r10: s.r10, r25: s.r25, r75: s.r75, r90: s.r90 }} median={s.year ? s.medianLo : null} per={s.per} dots={s.dots.map(dotOf)} index={i} hrefBase={productHref(s.family, s.pack, s.year)} /></span>
          {furthest && <span className="pr-strip-lead" aria-hidden="true"><span className="pr-tag-name">{furthest.name}</span> · <b>{formatRatio(furthest.ratio)}</b></span>}
          <span className="pr-count"><b>{s.leads || "—"}</b><small className="pr-count-word">peste dublu</small>
            {s.mixed && <em className="pr-mixed">mărci diferite</em>}</span>
        </summary>
        <div className="pr-open">
          {s.mixed && <p className="pr-caution">Aici intră mărci și feluri diferite ale aceluiași produs, iar o parte din diferențele de preț vin de la ele. Citește denumirile înainte de a trage o concluzie.</p>}
          {s.top.length ? <ul className="pr-leads">{s.top.map((l) => <LeadRow key={`${l.authorityId}-${l.year}`} lead={l} strip={s} suppliers={suppliers} />)}</ul>
            : <p className="pr-none">Nicio instituție{county ? ` din ${county}` : ""} nu a plătit de două ori mediana sau mai mult.</p>}
          <p className="pr-more"><Link href={productHref(s.family, s.pack, s.year)} prefetch={false}>
            {s.leads > s.top.length ? `Toate cele ${leadsWord(s.leads)} și ` : "Toate "}cele {buyersWord(s.buyers)}, cu liniile lor →</Link></p>
        </div>
      </details>;
    })}
  </div>;
}

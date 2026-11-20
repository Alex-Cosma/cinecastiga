import Link from "next/link";
import Term from "@/components/Term";
import InfoMark from "@/components/InfoMark";
import { STRIP_DOTS, STRIP_LEADS, productHref, type PriceOrder, type PriceStrip } from "@/lib/unit-prices";
import { AXIS_TICKS, axisPos, buyersWord, countWord, formatRatio, largestOf, leadsWord, medianWords } from "@/lib/unit-prices-shared";
import StripChart from "./StripChart";
import StripRow from "./StripRow";

/**
 * Banda prețurilor (owner, 11 November 2026): one strip per product and pack on a shared "times the median" axis.
 * The median is the forest rule, twice the median the dashed rule; the pale band holds eight buyers in ten, the dark
 * band the middle half; the largest leads by lei above the median are risk dots, the first named.
 * A strip opens into its largest leads, loaded then (StripRow).
 */
export function StripAxis() {
  return <div className="pr-axis" aria-hidden="true">
    {AXIS_TICKS.map((t) => <span key={t.ratio} style={{ left: `${axisPos(t.ratio)}%` }}>{t.ratio === 0.5 ? <><b className="pr-wide">jumătate</b><b className="pr-narrow">½</b></> : t.label}</span>)}
  </div>;
}

/** Fresh vegetables and fruit are compared with the year's median: the season can explain a lead. */
export const isSeasonal = (group: string) => group === "legume" || group === "fructe";
export const SEASON_CAUTION = "Legumele și fructele proaspete se compară cu mediana întregului an: sezonul poate explica o parte din diferență.";
export const MIXED_CAUTION = "Aici intră mărci și feluri diferite ale aceluiași produs, iar o parte din diferențele de preț vin de la ele. Citește denumirile înainte de orice concluzie.";

/** The key to the strip, above the axis on the list and under the big strip on the product page. `dots` says which
 * leads have a dot when not all do („cele mai mari 14 pe produs”, „cele mai mari 40 din 195”). `prices`: what the prices
 * are, behind an "i" by the median (owner, 17 November 2026: it was a sentence under the title of /preturi). */
export function StripLegend({ bins = false, dots, prices }: { bins?: boolean; dots: string | null; prices?: string }) {
  return <ul className="pr-legend" aria-label="Cum se citește banda">
    <li><i className="pr-k-median" />mediana{prices && <> <InfoMark title="Prețurile" text={prices} /></>}</li>
    <li><i className="pr-k-double" />de două ori mediana</li>
    <li><i className="pr-k-core" />jumătatea din mijloc</li>
    <li><i className="pr-k-band" />opt instituții din zece</li>
    {bins && <li><i className="pr-k-bins" />câte instituții, la fiecare preț</li>}
    <li><i className="pr-k-dot" />{dots ?? "un preț peste dublu"}</li>
  </ul>;
}

function Strip({ s, i, county, order, quiet = false }: { s: PriceStrip; i: number; county: string | null; order: PriceOrder; quiet?: boolean }) {
  const title = s.packLabel ? `${s.name}, ${s.packLabel}` : s.name;
  // The lead the strip names: the largest by lei above the median (the same for the same address).
  const named = s.named;
  const m = medianWords(s.medianLo, s.medianHi, s.per, s.year);
  const median = `${m.label}: ${m.value}`;
  const partial = largestOf(s.dots.length, s.dotsTotal);
  const seasonal = isSeasonal(s.group);
  const sentence = `${title}: ${median}, ${buyersWord(s.buyers)}, ${s.thin ? "prea puține instituții pentru piste" : leadsWord(s.leads)}${county ? ` în ${county}` : ""}.`
    + (named ? ` Cel mai mare: ${named.name}, ${formatRatio(named.ratio)}.` : "")
    + (s.mixed ? " Mărci diferite: citește denumirile." : "") + (seasonal ? " Sezonul poate explica o parte." : "");
  const shown = Math.min(s.leads, STRIP_LEADS);
  const head = s.leads > 0 ? `${s.leads > shown ? `Cele mai mari ${shown} din ${s.leads}` : s.leads === 1 ? "Singurul preț peste dublu" : `Toate cele ${s.leads}`}, după ${order === "multiplu" ? "multiplu" : "lei peste mediană"}.` : null;
  return <StripRow className={`pr-row${s.leads ? "" : " pr-row-quiet"}`} completOnly={quiet} label={sentence} leads={s.leads} head={head}
    query={{ family: s.family, pack: s.pack, year: s.year, county, byRatio: order === "multiplu", per: s.per }}
    summary={<>
      <span className="pr-label">
        <b>{s.name}</b>
        {s.packLabel && <span className="pr-pack">{s.packLabel}</span>}
        {/* The median's name is the list head's; on a phone, without the head, the row says it (owner, 17 November 2026). */}
        <small><span className="pr-median-word">{m.label}: </span>{m.value}</small><small className="pr-label-n">{buyersWord(s.buyers)}</small>
      </span>
      <span className="pr-strip"><StripChart band={{ r10: s.r10, r25: s.r25, r75: s.r75, r90: s.r90 }} median={s.year ? s.medianLo : null} per={s.per}
        dots={s.dots} index={i} hrefBase={productHref(s.family, s.pack, s.year)}
        label={`${median}; ${s.thin ? "prea puține instituții pentru piste" : leadsWord(s.leads)}${partial ? `, punctele sunt ${partial}` : ""}`} /></span>
      {named && <span className="pr-strip-lead" aria-hidden="true"><span className="pr-tag-name">{named.name}</span><span className="pr-tag-x"> · <b>{formatRatio(named.ratio)}</b></span></span>}
      <span className="pr-count">
        {s.thin ? <small className="pr-thin">prea puține instituții pentru piste</small>
          : <><b>{s.leads || "—"}</b><small className="pr-count-word">peste dublu</small></>}
        {/* Each chip holds its caution (M-01): a resting mouse draws the outline; a tap opens it without opening the row. */}
        {s.mixed && <Term tip hold="box" className="pr-mixed" title="Mărci diferite" text={MIXED_CAUTION}>mărci diferite</Term>}
        {seasonal && s.leads > 0 && <Term tip hold="box" className="pr-mixed" title="Sezon" text={SEASON_CAUTION}>sezon</Term>}
      </span>
    </>}>
    {/* The cautions are the row's chips (above), not a box again here; the lead-not-proof line is the page's (owner, 17 November 2026). */}
    {s.leads === 0 && <p className="pr-none">{s.thin ? "Prea puține instituții într-un an pentru piste: banda arată doar cum se împrăștie prețurile." : `Niciun preț peste dublu${county ? ` în ${county}` : ""}.`}</p>}
    <p className="pr-more"><Link href={productHref(s.family, s.pack, s.year)} prefetch={false}>
      {s.leads > shown ? `Toate cele ${leadsWord(s.leads)} și ` : "Toate "}cele {buyersWord(s.buyers)}, cu liniile lor →</Link></p>
  </StripRow>;
}

/** The median's name, said once over the rows (owner, 17 November 2026): of the chosen year, else from year to year. */
function medianHead(strips: readonly PriceStrip[]): string {
  const year = strips[0]?.year ?? null;
  return year ? `mediana ${year}` : strips.some((s) => medianWords(s.medianLo, s.medianHi, s.per, null).label !== "mediana") ? "mediana, de la an la an" : "mediana";
}

/** Strips without a lead fold behind one line once a county or a year leaves this many of them. */
const FOLD_FROM = 4;

export default function PriceStrips({ strips, county, order, narrowed, whole = false }: {
  strips: PriceStrip[]; county: string | null; order: PriceOrder;
  /** A county or a year is chosen: products without a lead there are folded, not listed one by one. */
  narrowed: boolean;
  /** No group or product is chosen: the whole list. */
  whole?: boolean;
}) {
  const withLeads = strips.filter((s) => s.leads > 0), without = strips.filter((s) => s.leads === 0);
  const fold = narrowed && without.length >= FOLD_FROM;
  // Esențial (owner, 18 November 2026): the whole list shows only the products with a price above double; a product
  // or a group chosen in the picker shows its strips with or without one.
  const quiet = whole && withLeads.length > 0;
  const open = fold ? withLeads : strips;
  const key = (s: PriceStrip) => `${s.family}|${s.pack}|${s.year ?? "toti"}`;
  return <div className="pr-strips">
    <StripLegend dots={`cele mai mari, cel mult ${STRIP_DOTS} pe produs`} prices="Valori contractate, fără TVA." />
    <div className="pr-head" aria-hidden="true"><span>Produs · {medianHead(strips)}</span><StripAxis /><span>Peste dublu</span></div>
    {open.map((s, i) => <Strip key={key(s)} s={s} i={i} county={county} order={order} quiet={quiet && s.leads === 0} />)}
    {fold && withLeads.length === 0 && <p className="pr-none pr-none-all">Niciun preț peste dublu{county ? ` în ${county}` : ""} pentru această alegere.</p>}
    {fold && <details className="pr-fold">
      <summary>{countWord(without.length, "un produs", "produse")} fără prețuri peste dublu{county ? ` în ${county}` : ""}</summary>
      {without.map((s, i) => <Strip key={key(s)} s={s} i={i} county={county} order={order} />)}
    </details>}
  </div>;
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { measureNote, PRICE_GROUP_LABEL, priceFamilyBySlug, type MeasureSource } from "@seap/db";
import { PendingRegion, RegionLink } from "@/components/ghost/client";
import { formatCalendarDate } from "@/lib/format";
import { priceAdmin } from "@/lib/price-access";
import { BUYERS_PAGE, DEFAULT_PRICE_ORDER, LEAD_RULE, getProductPage, productHref, type ProductPage } from "@/lib/unit-prices";
import { flatParams } from "@/lib/unit-prices-params";
import type { PriceBuyerSort } from "@/lib/price-columns";
import { UrlFilterBand, UrlFunnel } from "@/components/table-filters/UrlFilters";
import { buyersWord, countWord, formatUnitPrice, largestOf, leadTicksPath, leadsCount, leadsWord, medianRange, priceHref, sentenceCase } from "@/lib/unit-prices-shared";
import { MIXED_CAUTION, SEASON_CAUTION, StripAxis, StripLegend, isSeasonal } from "../PriceStrips";
import StripChart from "../StripChart";
import BuyerRows, { type BuyerRowData } from "./BuyerRows";
import PriceMethod from "../PriceMethod";
import "../preturi.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ produs: string }> }): Promise<Metadata> {
  // Administrators only until the data is complete (owner, 11 November 2026): no title for anyone else.
  if (!(await priceAdmin())) return {};
  const family = priceFamilyBySlug((await params).produs);
  return { title: family ? `${family.label}: prețul pe unitate, pe instituții` : "Prețuri pe unitate", robots: { index: false, follow: false } };
}

/** A sortable header: a button-like link that orders the rows by its column, the order's state on the header. */
function SortHead({ label, sortKey, data, href, children }: { label: string; sortKey: PriceBuyerSort; data: ProductPage; href: (k: PriceBuyerSort, dir: "asc" | "desc") => string; children?: React.ReactNode }) {
  const on = data.sort === sortKey;
  const next: "asc" | "desc" = on ? (data.dir === "desc" ? "asc" : "desc") : sortKey === "institutie" ? "asc" : "desc";
  return <span className="th-filter">
    <RegionLink className="th-sort" href={href(sortKey, next)} scroll={false} aria-label={`Ordonează după ${label.toLowerCase()}`}>
      {label}{on ? (data.dir === "desc" ? " ▾" : " ▴") : ""}
    </RegionLink>
    {children}
  </span>;
}

export default async function ProdusPage({ params, searchParams }: {
  params: Promise<{ produs: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Before any data is read (lib/price-access.ts).
  if (!(await priceAdmin())) notFound();
  const sp = flatParams(await searchParams);
  const slug = (await params).produs;
  let data = await getProductPage(slug, sp);
  if (!data) notFound();
  // Without a single lead the list of leads would be an empty table: every institution is shown instead, said once.
  const allBecauseNone = data.onlyLeads && data.group != null && data.group.leads === 0;
  if (allBecauseNone) data = (await getProductPage(slug, { ...sp, toate: "1" })) ?? data;
  const { family, group: g } = data;
  const pages = data.pages;
  // The page's own address with some parameters changed (null drops one): filters and order stay.
  const here = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"));
    if (data.year) p.set("an", String(data.year)); else p.delete("an");
    if (data.pack) p.set("ambalaj", data.pack);
    for (const [k, v] of Object.entries(patch)) { if (v == null) p.delete(k); else p.set(k, v); }
    const q = p.toString().replaceAll("%2C", ",");
    return `/preturi/${family.slug}${q ? `?${q}` : ""}`;
  };
  const sortHref = (k: PriceBuyerSort, dir: "asc" | "desc") => here({ ordine: k, sens: dir, pagina: null, deschis: null });
  const scope = data.scope;
  const rows: BuyerRowData[] = data.buyers.map((b) => ({
    id: b.authorityId, year: b.year, name: b.name, county: b.county, price: b.price, median: b.median, ratio: b.ratio, quantity: b.quantity, excess: b.excess,
    lead: b.lead, awards: b.awards, lines: b.lines, pinned: b.pinned,
    suppliers: b.supplierIds.slice(0, 2).flatMap((id) => data.suppliers[id] ? [{ id, name: data.suppliers[id] }] : []), moreSuppliers: Math.max(0, b.supplierIds.length - 2),
    shown: b.linesShown.map((l) => ({
      daId: l.daId, date: l.date ? formatCalendarDate(l.date) : null, name: l.name, unit: l.unit,
      quantity: l.quantity == null ? "—" : new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 3 }).format(l.quantity),
      unitPrice: l.unitPrice == null ? "—" : `${formatUnitPrice(l.unitPrice)} lei`,
      perUnit: l.pricePerUnit == null ? "—" : formatUnitPrice(l.pricePerUnit),
      note: l.measure != null && l.measureSource ? measureNote(family, { measure: l.measure, source: l.measureSource as MeasureSource }) : "",
    })),
  }));
  const seasonal = isSeasonal(family.group);
  const sortOf = (k: PriceBuyerSort) => data.sort === k ? (data.dir === "asc" ? "ascending" as const : "descending" as const) : "none" as const;
  const first = data.page * BUYERS_PAGE + 1, last = Math.min(data.total, (data.page + 1) * BUYERS_PAGE);
  return <div className="pr-page pr-product">
    <p className="pr-crumb"><Link href={priceHref({ year: data.year, group: null, product: null, county: null, order: DEFAULT_PRICE_ORDER })}>Prețuri</Link>
      <span aria-hidden="true"> / </span><Link href={priceHref({ year: data.year, group: family.group, product: null, county: null, order: DEFAULT_PRICE_ORDER })}>{PRICE_GROUP_LABEL[family.group]}</Link></p>
    <h1 className="page-title">{family.label}</h1>
    <p className="page-sub pr-sub">{family.holds}</p>
    {(data.packs.length > 0 || data.years.length > 1) && <nav className="pr-switch" aria-label="Ambalajul și anul">
      {data.packs.length > 0 && <ul className="pr-tabs">{data.packs.map((p) =>
        <li key={p.slug}><Link href={productHref(family.slug, p.slug, data.year)} aria-current={p.slug === data.pack ? "page" : undefined} prefetch={false}>{p.label}</Link></li>)}</ul>}
      {data.years.length > 1 && <ul className="pr-tabs pr-years">
        <li><Link href={productHref(family.slug, data.pack, null)} aria-current={data.year == null ? "page" : undefined} prefetch={false}>Toți anii</Link></li>
        {data.years.map((y) =>
        <li key={y}><Link href={productHref(family.slug, data.pack, y)} aria-current={y === data.year ? "page" : undefined} prefetch={false}>{y}</Link></li>)}</ul>}
    </nav>}
    {data.yearMissing && <p className="pr-note" role="status">Pentru {data.yearMissing} nu avem prețuri de comparat la acest produs: sunt toți anii.</p>}
    {!g ? <p className="pr-empty">Mai puțin de cinci instituții au cumpărat {family.label.toLowerCase()} în acest ambalaj {data.year ? `în ${data.year}` : "într-un an"}: nu avem cu ce compara.</p> : <>
      <section className="pr-hero" aria-labelledby="pr-hero-h">
        <h2 id="pr-hero-h" className="pr-hero-line">{data.year ? <>În {data.year}, mediana a fost <b>{medianRange(g.medianLo, g.medianHi, g.per)}</b>, la {buyersWord(g.buyers)}.</>
          : <>Mediana anului: <b>{medianRange(g.medianLo, g.medianHi, g.per)}</b>, la {buyersWord(g.buyers)}.</>}
          {" "}{g.thin ? "Prea puține instituții pentru piste." : `${sentenceCase(leadsWord(g.leads))}.`}</h2>
        {g.thin && <p className="pr-note">O pistă cere un produs cu cel puțin {countWord(LEAD_RULE.buyers, "o instituție", "instituții")} într-un an; aici banda arată doar cum se împrăștie prețurile.</p>}
        {g.mixed && <p className="pr-caution">{MIXED_CAUTION}</p>}
        {seasonal && g.leads > 0 && <p className="pr-caution">{SEASON_CAUTION}</p>}
        <div className="pr-big">
          <StripAxis />
          <StripChart mode="product" band={{ r10: g.r10, r25: g.r25, r75: g.r75, r90: g.r90 }} median={data.year ? g.medianLo : null} per={g.per} dots={data.dots} named={3}
            ticks={leadTicksPath(data.leadRatios)} bins={data.bins} hrefBase={here({ deschis: null, pagina: null })}
            label={data.dots.length ? `Prețurile peste dublu pe axă, ${largestOf(data.dots.length, data.dotsTotal) ?? `toate cele ${data.dots.length}`}: săgețile trec de la unul la altul, Enter îi deschide liniile` : "Banda prețurilor: niciun preț peste dublu"} />
        </div>
        <StripLegend bins dots={largestOf(data.dots.length, data.dotsTotal) ? `${largestOf(data.dots.length, data.dotsTotal)}, după lei` : null} />
      </section>
      <PendingRegion as="section" className="pr-buyers" label="Se încarcă instituțiile…">
        <div className="pr-buyers-head">
          <h2>{data.onlyLeads ? sentenceCase(leadsCount(g.leads)) : data.year ? `Toate cele ${buyersWord(g.buyers)}` : `Toate cele ${countWord(g.comparisons, "o comparație", "comparații")}`}
            {(!data.year || data.onlyLeads) && <small>{[!data.year && "o instituție într-un an, față de mediana acelui an", data.onlyLeads && "piste, nu dovezi"].filter(Boolean).join(" · ")}</small>}</h2>
          {!allBecauseNone && <RegionLink href={here({ toate: data.onlyLeads ? "1" : null, pagina: null, deschis: null, ordine: null, sens: null })} scroll={false}>
            {data.onlyLeads ? (data.year ? `Arată toate cele ${buyersWord(g.buyers)}` : "Arată toate comparațiile") : "Doar prețurile peste dublu"}</RegionLink>}
        </div>
        <UrlFilterBand table="preturi" scope={scope} />
        <p className={`pr-shown${data.total === 0 ? " sr-only" : ""}`} role="status">{data.total === 0 ? "Niciun rând cu filtrele alese" : `${first}–${last} din ${data.total}`}{data.total > 0 && data.filtered ? " cu filtrele alese" : ""}{data.pinnedExtra > 0 ? `, plus ${data.pinnedExtra === 1 ? "rândul deschis" : "rândurile deschise"}` : ""}</p>
        <div className="pr-table-wrap">
          <table className="pr-table" role="table" aria-label={data.onlyLeads ? "Prețurile peste dublu" : "Toate instituțiile"}>
            <thead role="rowgroup"><tr role="row">
              <th role="columnheader" scope="col" className="c-who sortable" aria-sort={sortOf("institutie")}>
                <SortHead label="Instituția" sortKey="institutie" data={data} href={sortHref}><UrlFunnel table="preturi" column="institutie" scope={scope} /></SortHead>
                <span className="pr-th-sep" aria-hidden="true">·</span><UrlFunnel table="preturi" column="judet" label="Județ" scope={scope} />
              </th>
              {!data.year && <th role="columnheader" scope="col" className="c-year sortable" aria-sort={sortOf("an")}>
                <SortHead label="An" sortKey="an" data={data} href={sortHref}><UrlFunnel table="preturi" column="an" scope={scope} /></SortHead></th>}
              <th role="columnheader" scope="col" className="pr-num sortable" aria-sort={sortOf("pret")}>
                <SortHead label="Preț" sortKey="pret" data={data} href={sortHref}><UrlFunnel table="preturi" column="pret" scope={scope} align="end" /></SortHead></th>
              <th role="columnheader" scope="col" className="pr-num sortable" aria-sort={sortOf("multiplu")}>
                <SortHead label="Multiplu" sortKey="multiplu" data={data} href={sortHref}><UrlFunnel table="preturi" column="multiplu" scope={scope} align="end" /></SortHead></th>
              <th role="columnheader" scope="col" className="pr-num sortable" aria-sort={sortOf("cantitate")}>
                <SortHead label="Cantitate" sortKey="cantitate" data={data} href={sortHref}><UrlFunnel table="preturi" column="cantitate" scope={scope} align="end" /></SortHead></th>
              <th role="columnheader" scope="col" className="pr-num sortable" aria-sort={sortOf("lei")}>
                <SortHead label="Peste mediană" sortKey="lei" data={data} href={sortHref}><UrlFunnel table="preturi" column="peste" scope={scope} align="end" /></SortHead></th>
              <th role="columnheader" scope="col" className="c-sup"><span className="th-filter">Furnizori<UrlFunnel table="preturi" column="furnizor" scope={scope} align="end" /></span></th>
              <th role="columnheader" scope="col" className="c-open"><span className="sr-only">Liniile</span></th>
            </tr></thead>
            {rows.length ? <BuyerRows rows={rows} per={g.per} showYear={!data.year} hrefBase={here({ deschis: null })} /> : <tbody role="rowgroup"><tr role="row"><td role="cell" colSpan={data.year ? 7 : 8} className="pr-none">
              {data.filtered ? <>Niciun rând cu filtrele alese. <RegionLink href={here(Object.fromEntries([...["institutia", "anii", "judet", "pret", "multiplu", "cantitate", "peste", "furnizor", "pagina", "deschis"].map((k) => [k, null])]))} scroll={false}>Scoate filtrele</RegionLink></>
                : "Nicio instituție de arătat."}</td></tr></tbody>}
          </table>
        </div>
        {pages > 1 && <nav className="pr-pager" aria-label="Paginile listei">
          {data.page > 0 && <RegionLink href={here({ pagina: data.page > 1 ? String(data.page) : null, deschis: null })}>← Înapoi</RegionLink>}
          <span>Pagina {data.page + 1} din {pages}</span>
          {data.page + 1 < pages && <RegionLink href={here({ pagina: String(data.page + 2), deschis: null })}>Înainte →</RegionLink>}
        </nav>}
      </PendingRegion>
    </>}
    <PriceMethod />
  </div>;
}

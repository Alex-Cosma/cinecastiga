import type { Metadata } from "next";
import { PendingRegion } from "@/components/ghost/client";
import { flatParams } from "@/lib/unit-prices-params";
import { PRICE_PRODUCTS, getPricePage, parsePriceState, priceOptions } from "@/lib/unit-prices";
import Link from "next/link";
import Term from "@/components/Term";
import { buyersWord, countWord, formatLei, leadsCount, priceHref, priceYearWithLeads, sentenceCase } from "@/lib/unit-prices-shared";
import PriceFilters from "./PriceFilters";
import PriceStrips from "./PriceStrips";
import PriceMethod from "./PriceMethod";
import "./preturi.css";

export const dynamic = "force-dynamic";
/**
 * Open to every reader since 20 November 2026 (owner: the direct awards' item lines are complete; „Prețuri” has its own
 * place in the header). Open to the search engines since 24 November 2026 (owner), the products' pages too.
 */
export const metadata: Metadata = {
  title: "Același produs, alt preț",
  description: "Prețul pe kilogram, litru sau bucată din achizițiile directe, față de mediana instituțiilor care au cumpărat același produs.",
};

/** Unit prices, the lead-finder (owner, 10–11 November 2026): every product and pack as a strip of its buyers. */
export default async function PreturiPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const state = parsePriceState(flatParams(await searchParams));
  const data = await getPricePage(state);
  const scope = state.county ? ` în ${state.county}` : "";
  const other = priceYearWithLeads(data.yearLeads);
  return <div className="pr-page">
    {/* A short title and, under it, a few words that explain themselves on hover (owner, 20 November 2026: the page was
        clogged with text): what is compared, that a lead is no proof, and that the products are a hand-made selection. */}
    <h1 className="page-title">Același produs, alt preț</h1>
    <p className="page-sub pr-sub"><Term tip hold="line" title="Ce comparăm" text={<>
      <span className="pr-tip-p">Prețul pe kilogram, litru sau bucată din achizițiile directe, față de mediana instituțiilor care au cumpărat același produs, în același an.</span>
      <span className="pr-tip-p">Un preț peste dublu e o pistă de verificat, nu o dovadă.</span>
      <span className="pr-tip-p">Sunt {countWord(PRICE_PRODUCTS, "un produs", "produse")} obișnuite, alese de mână: alimente, curățenie, birotică, carburant. Nu e tot ce cumpără instituțiile. <Link href="/metodologie#preturi-pe-unitate" prefetch={false}>Cum le-am ales</Link></span>
    </>}>Prețul pe unitate, față de mediană</Term></p>
    <PendingRegion label="Se actualizează prețurile…" className="pr-region">
      <div className="pr-bar">
        <PriceFilters state={{ ...state, year: data.year }} years={data.years} yearLeads={data.yearLeads} counties={data.counties} options={priceOptions()} />
        {/* The count of leads at the right is Complet's too (owner, 20 November 2026): Esențial keeps the filters alone. */}
        <p className="pr-total" aria-live="polite" data-only="complet">
          <strong>{sentenceCase(leadsCount(data.totals.leads))}{scope}</strong>
          {/* The second-level totals are Complet's (owner, 18 November 2026); the count of leads stays. */}
          <span data-only="complet">{countWord(data.totals.products, "un produs", "produse")} · {buyersWord(data.totals.buyers)}</span>
          <span data-only="complet">{formatLei(data.totals.excess)} peste mediană</span>
        </p>
      </div>
      {data.yearMissing && <p className="pr-note" role="status">Pentru {data.yearMissing} nu avem prețuri de comparat: sunt toți anii.</p>}
      {/* A year with too few institutions per product says why there is no lead, and where there are (UX audit Z6-34). */}
      {data.year != null && data.yearLeads[data.year] === 0 ? <p className="pr-note">În {data.year} avem prea puține instituții pe produs ca să comparăm: doar o mică parte din achizițiile anului.
        {" "}Încearcă {other ? <><Link href={priceHref({ ...state, year: other })} prefetch={false}>{other}</Link> sau </> : null}<Link href={priceHref({ ...state, year: null })} prefetch={false}>toți anii</Link>.</p>
        : data.year != null && data.strips.length > 0 && data.strips.every((s) => s.thin) && <p className="pr-note">În {data.year} avem doar o mică parte din achiziții: prea puține instituții pentru piste.</p>}
      {data.strips.length ? <PriceStrips strips={data.strips} county={state.county} order={state.order} narrowed={state.county != null || data.year != null} whole={state.group == null && state.product == null} />
        : <p className="pr-empty">Niciun produs cu cel puțin cinci instituții {data.year ? `în ${data.year}` : "într-un an"} pentru această alegere.</p>}
    </PendingRegion>
    <PriceMethod />
  </div>;
}

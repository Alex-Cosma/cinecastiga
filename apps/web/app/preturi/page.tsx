import type { Metadata } from "next";
import { PendingRegion } from "@/components/ghost/client";
import { flatParams } from "@/lib/unit-prices-params";
import { PRICE_PRODUCTS, getPricePage, parsePriceState, priceOptions } from "@/lib/unit-prices";
import Link from "next/link";
import { buyersWord, countWord, formatLei, leadsCount, priceHref, priceYearWithLeads, sentenceCase } from "@/lib/unit-prices-shared";
import PriceFilters from "./PriceFilters";
import PriceStrips from "./PriceStrips";
import PriceMethod from "./PriceMethod";
import "./preturi.css";

export const dynamic = "force-dynamic";
/**
 * Open to every reader since 20 November 2026 (owner: the direct awards' item lines are complete; „Prețuri” has its own
 * place in the header). Out of the search engines for now (owner, the same day): he decides when it is indexed.
 */
export const metadata: Metadata = {
  title: "Cine cumpără mai scump același produs",
  description: "Prețul pe kilogram, litru sau bucată din achizițiile directe, față de mediana instituțiilor care au cumpărat același produs.",
  robots: { index: false, follow: true },
};

/** Unit prices, the lead-finder (owner, 10–11 November 2026): every product and pack as a strip of its buyers. */
export default async function PreturiPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const state = parsePriceState(flatParams(await searchParams));
  const data = await getPricePage(state);
  const scope = state.county ? ` în ${state.county}` : "";
  const other = priceYearWithLeads(data.yearLeads);
  return <div className="pr-page">
    <h1 className="page-title">Cine cumpără mai scump același produs</h1>
    {/* „Valori contractate, fără TVA” is the legend's "i" by the median (owner, 17 November 2026). */}
    <p className="page-sub pr-sub">Prețul pe kilogram, litru sau bucată din achizițiile directe, față de mediana instituțiilor care au cumpărat același produs, în același an. Un preț peste dublu e o pistă de verificat, nu o dovadă.</p>
    {/* What the page is not (owner, 20 November 2026): a hand-made selection of ordinary products, not everything bought. */}
    <p className="pr-scope">Comparăm {countWord(PRICE_PRODUCTS, "un produs", "produse")} obișnuite, alese de mână: alimente, curățenie, birotică, carburant. Nu e tot ce cumpără instituțiile. <Link href="/metodologie#preturi-pe-unitate" prefetch={false}>Cum le-am ales</Link></p>
    <PendingRegion label="Se actualizează prețurile…" className="pr-region">
      <div className="pr-bar">
        <PriceFilters state={{ ...state, year: data.year }} years={data.years} yearLeads={data.yearLeads} counties={data.counties} options={priceOptions()} />
        <p className="pr-total" aria-live="polite">
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

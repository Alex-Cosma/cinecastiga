import type { Metadata } from "next";
import { PendingRegion } from "@/components/ghost/client";
import { getPricePage, parsePriceState, priceOptions } from "@/lib/unit-prices";
import { buyersWord, countWord, formatLei, leadsCount } from "@/lib/unit-prices-shared";
import PriceFilters from "./PriceFilters";
import PriceStrips from "./PriceStrips";
import PriceMethod from "./PriceMethod";
import "./preturi.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Cine plătește mai mult pentru același produs",
  description: "Prețul pe kilogram, litru sau bucată din achizițiile directe, față de mediana instituțiilor care au cumpărat același produs.",
};

/** Unit prices, the lead-finder (owner, 10–11 November 2026): every product and pack as a strip of its buyers. */
export default async function PreturiPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const state = parsePriceState(await searchParams);
  const data = await getPricePage(state);
  const scope = state.county ? ` în ${state.county}` : "";
  return <div className="pr-page">
    <h1 className="page-title">Cine plătește mai mult pentru același produs</h1>
    <p className="page-sub pr-sub">Prețul pe kilogram, litru sau bucată din achizițiile directe, față de mediana instituțiilor care au cumpărat același produs, în același ambalaj și în același an. Fără TVA. Un preț peste dublu se verifică: nu e o dovadă.</p>
    <PendingRegion label="Se actualizează prețurile…" className="pr-region">
      <div className="pr-bar">
        <PriceFilters state={{ ...state, year: data.year }} years={data.years} counties={data.counties} options={priceOptions()} />
        <p className="pr-total" aria-live="polite">
          <strong>{leadsCount(data.totals.leads)}{scope}</strong>
          <span>{countWord(data.totals.products, "un produs", "produse")} · {buyersWord(data.totals.buyers)}</span>
          <span>{formatLei(data.totals.excess)} peste mediană</span>
        </p>
      </div>
      {data.strips.length ? <PriceStrips strips={data.strips} suppliers={data.suppliers} county={state.county} />
        : <p className="pr-empty">Niciun produs cu cel puțin cinci instituții {data.year ? `în ${data.year}` : "într-un an"} pentru această alegere.</p>}
    </PendingRegion>
    <PriceMethod />
  </div>;
}

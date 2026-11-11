import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PendingRegion } from "@/components/ghost/client";
import { priceAdmin } from "@/lib/price-access";
import { flatParams } from "@/lib/unit-prices-params";
import { getPricePage, parsePriceState, priceOptions } from "@/lib/unit-prices";
import { buyersWord, countWord, formatLei, leadsCount, sentenceCase } from "@/lib/unit-prices-shared";
import PriceFilters from "./PriceFilters";
import PriceStrips from "./PriceStrips";
import PriceMethod from "./PriceMethod";
import "./preturi.css";

export const dynamic = "force-dynamic";
/** Administrators only until the data is complete (owner, 11 November 2026): nobody else learns the page exists. */
export async function generateMetadata(): Promise<Metadata> {
  if (!(await priceAdmin())) return {};
  return {
    title: "Cine cumpără mai scump același produs",
    description: "Prețul pe kilogram, litru sau bucată din achizițiile directe, față de mediana instituțiilor care au cumpărat același produs.",
    robots: { index: false, follow: false },
  };
}

/** Unit prices, the lead-finder (owner, 10–11 November 2026): every product and pack as a strip of its buyers. */
export default async function PreturiPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Before any data is read (lib/price-access.ts).
  if (!(await priceAdmin())) notFound();
  const state = parsePriceState(flatParams(await searchParams));
  const data = await getPricePage(state);
  const scope = state.county ? ` în ${state.county}` : "";
  return <div className="pr-page">
    <h1 className="page-title">Cine cumpără mai scump același produs</h1>
    <p className="page-sub pr-sub">Prețul pe kilogram, litru sau bucată din achizițiile directe, față de mediana instituțiilor care au cumpărat același produs, în același an. Valori contractate, fără TVA. Un preț peste dublu e o pistă de verificat, nu o dovadă.</p>
    <PendingRegion label="Se actualizează prețurile…" className="pr-region">
      <div className="pr-bar">
        <PriceFilters state={{ ...state, year: data.year }} years={data.years} counties={data.counties} options={priceOptions()} />
        <p className="pr-total" aria-live="polite">
          <strong>{sentenceCase(leadsCount(data.totals.leads))}{scope}</strong>
          <span>{countWord(data.totals.products, "un produs", "produse")} · {buyersWord(data.totals.buyers)}</span>
          <span>{formatLei(data.totals.excess)} peste mediană</span>
        </p>
      </div>
      {data.yearMissing && <p className="pr-note" role="status">Pentru {data.yearMissing} nu avem prețuri de comparat: sunt toți anii.</p>}
      {data.year != null && data.strips.length > 0 && data.strips.every((s) => s.thin) && <p className="pr-note">În {data.year} avem doar o mică parte din achiziții: prea puține instituții pentru piste.</p>}
      {data.strips.length ? <PriceStrips strips={data.strips} county={state.county} order={state.order} narrowed={state.county != null || data.year != null} />
        : <p className="pr-empty">Niciun produs cu cel puțin cinci instituții {data.year ? `în ${data.year}` : "într-un an"} pentru această alegere.</p>}
    </PendingRegion>
    <PriceMethod />
  </div>;
}

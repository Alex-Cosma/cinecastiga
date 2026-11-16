import type { Metadata } from "next";
import { DomainYearError, getDomainDataset } from "@/lib/domains";
import { ghostHold } from "@/lib/ghost-hold";
import DomainExplorer from "./DomainExplorer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Domenii de achiziții publice",
  description: "Explorează ce cumpără instituțiile publice: domenii CPV, valori înregistrate și sursele SEAP din spatele fiecărei sume.",
};
type Params = { year?: string; code?: string; view?: string };

/** The route's loading.tsx (DomainsGhost) stands in while the dataset is prepared; one boundary, so the ghost is never swapped for a copy of itself. */
export default async function DomeniiPage({ searchParams }: { searchParams: Promise<Params> }) {
  await ghostHold();
  const params = await searchParams;
  const requestedYear = params.year && /^\d{4}$/.test(params.year) ? Number(params.year) : undefined;
  // A year without data (an old or mistyped link) opens the default year with a note, not the error page (UX audit Z6-33).
  let notice = "";
  const data = await getDomainDataset(requestedYear).catch(async (error: unknown) => {
    if (!(error instanceof DomainYearError) || requestedYear === undefined && !params.year) throw error;
    const fallback = await getDomainDataset();
    notice = `Pentru ${params.year} nu avem date; arătăm ${fallback.year}.`;
    return fallback;
  });
  return <DomainExplorer key={`${data.generatedAt}:${JSON.stringify(params)}`} initialData={data} initialCode={params.code ?? ""} initialView={params.view ?? ""} initialNotice={notice} />;
}

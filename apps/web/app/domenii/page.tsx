import { Suspense } from "react";
import type { Metadata } from "next";
import { getDomainDataset } from "@/lib/domains";
import DomainExplorer from "./DomainExplorer";
import DomainsLoading from "./loading";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Domenii de achiziții publice",
  description: "Explorează ce cumpără instituțiile publice: domenii CPV, valori înregistrate și sursele SEAP din spatele fiecărei sume.",
};
type Params = { year?: string; code?: string; view?: string };

async function DomainsContent({ params }: { params: Params }) {
  const requestedYear = params.year && /^\d{4}$/.test(params.year) ? Number(params.year) : undefined;
  const data = await getDomainDataset(requestedYear);
  return <DomainExplorer key={`${data.generatedAt}:${JSON.stringify(params)}`} initialData={data} initialCode={params.code ?? ""} initialView={params.view ?? ""} />;
}

export default async function DomeniiPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  return <Suspense fallback={<DomainsLoading />}><DomainsContent params={params} /></Suspense>;
}

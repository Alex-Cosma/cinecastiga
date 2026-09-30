import { Suspense } from "react";
import RiskFreshness from "@/components/RiskFreshness";
import { getSignalPage, getSignalRiskGroup, getSignalTypeCounts, getRiskCriteriaDistribution, parseSignalState } from "@/lib/signals";
import SignalsExplorer from "./SignalsExplorer";
import "./signals.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Semnale de risc" };

export default async function SemnalePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const state = parseSignalState(await searchParams);
  let error: string | undefined;
  const [signals, risk, counts, distribution] = await Promise.all([
    state.view === "signals" ? getSignalPage(state) : null,
    state.view === "cri" ? getSignalRiskGroup(state) : null,
    state.view === "signals" ? getSignalTypeCounts(state) : {} as Record<string, number>,
    state.view === "cri" ? getRiskCriteriaDistribution(state) : [],
  ]).catch(() => {
    error = "Selecția ta este păstrată. Încearcă din nou pentru a vedea rezultatele.";
    return [null, null, {} as Record<string, number>, [] as { criteria: number; n: number }[]] as const;
  });
  if (signals) counts[state.code] = signals.total;
  const page = signals?.page ?? risk?.page ?? 0;
  return <SignalsExplorer state={{ ...state, page }} signals={signals} risk={risk} counts={counts} distribution={distribution} error={error}
    freshness={<Suspense fallback={null}><RiskFreshness /></Suspense>} />;
}

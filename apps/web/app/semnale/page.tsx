import type { Metadata } from "next";
import { getSignalPage, getSignalRiskGroup, getSignalTypeCounts, getRiskScoreDistribution, parseSignalState, signalFiltered } from "@/lib/signals";
import SignalsExplorer from "./SignalsExplorer";
import "./signals.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Semnale de risc" };

/** Everyone's signals: the national list per pattern and the risk ranking. One entity's are its page, /entitati/{id}/semnale. */
export default async function SemnalePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const state = { ...parseSignalState(await searchParams), entity: null };
  let error: string | undefined;
  const [signals, risk, counts, distribution] = await Promise.all([
    state.view === "signals" ? getSignalPage(state) : null,
    state.view === "cri" ? getSignalRiskGroup(state) : null,
    state.view === "signals" ? getSignalTypeCounts(state) : {} as Record<string, number>,
    state.view === "cri" ? getRiskScoreDistribution(state) : [],
  ]).catch(() => {
    error = "Selecția ta este păstrată. Încearcă din nou pentru a vedea rezultatele.";
    return [null, null, {} as Record<string, number>, [] as { bin: number; n: number }[]] as const;
  });
  // The pattern chooser counts the list without its column filters; the page says the filtered count.
  if (signals && !signalFiltered(state)) counts[state.code] = signals.total;
  const page = signals?.page ?? risk?.page ?? 0;
  // The date of the signals is the site footer's („semnale la …”; owner, 17 November 2026: no second line under the title).
  return <SignalsExplorer state={{ ...state, page }} signals={signals} risk={risk} counts={counts} distribution={distribution} error={error} />;
}

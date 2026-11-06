"use client";
import { useEffect, useState } from "react";
import type { RxData } from "@/lib/radiografie";
import DependencyScatter from "./DependencyScatter";
import LotMatrix from "./LotMatrix";
import DaStrips from "./DaStrips";
/** The tabs as the route's ghost draws them: inert replicas, the first one chosen; the direct acquisitions' count waits. */
export function TabsGhost() {
    return <nav className="rv-tabs" aria-hidden="true" inert>{["Furnizori", "Loturi", "Achiziții directe"].map((label, i) => <button key={label} type="button" tabIndex={-1} aria-pressed={i === 0}>{label}{i === 2 && <span className="rv-tab-n-g">00</span>}</button>)}</nav>;
}
export default function RadiografieExplorer({ data }: {
    data: RxData;
}) {
    const [tab, setTab] = useState("suppliers"), [visited, setVisited] = useState(["suppliers"]);
    // A tab shown again draws its charts finished (owner, 6 November 2026: an entrance plays on a tab's first visit
    // only). Showing a hidden panel restarts its CSS animations, so for that moment the panel is "settled"
    // (components/motion/chart-motion.css: duration 0); the window outlasts any entrance, so nothing replays after it.
    const [again, setAgain] = useState<string | null>(null);
    useEffect(() => { if (!again)
        return; const timer = setTimeout(() => setAgain(null), 900); return () => clearTimeout(timer); }, [again]);
    const settled = (id: string) => (again === id ? "settled" : undefined);
    return <><nav className="rv-tabs" aria-label="Perspective de explorare">{[["suppliers", "Furnizori"], ["lots", "Loturi"], ["direct", "Achiziții directe"]].map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => { if (id !== tab && visited.includes(id!)) setAgain(id!); setTab(id!); setVisited(v => v.includes(id!) ? v : [...v, id!]); }}>{label}{id === "direct" && <span>{data.slices.length}</span>}</button>)}</nav>
    <div hidden={tab !== "suppliers"} data-motion={settled("suppliers")}><DependencyScatter rows={data.dep} win={data.win} authorityName={data.profile.name} authorityId={data.profile.id} suppliers={data.depSuppliers}/></div>
    {visited.includes("lots") && <div hidden={tab !== "lots"} data-motion={settled("lots")}><LotMatrix families={data.families} patterns={data.patterns} familiesWithLots={data.familiesWithLots} familiesTotal={data.familiesTotal} authorityId={data.profile.id}/></div>}
    {visited.includes("direct") && <div hidden={tab !== "direct"} data-motion={settled("direct")}><DaStrips rows={data.slices} nSuppliers={data.nDaSuppliers} authorityId={data.profile.id}/></div>}</>;
}

"use client";
import { useState } from "react";
import type { RxData } from "@/lib/radiografie";
import DependencyScatter from "./DependencyScatter";
import LotMatrix from "./LotMatrix";
import DaStrips from "./DaStrips";
export default function RadiografieExplorer({ data }: {
    data: RxData;
}) {
    const [tab, setTab] = useState("suppliers"), [visited, setVisited] = useState(["suppliers"]);
    return <><nav className="rv-tabs" aria-label="Perspective de explorare">{[["suppliers", "Furnizori"], ["lots", "Loturi"], ["direct", "Achiziții directe"]].map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => { setTab(id!); setVisited(v => v.includes(id!) ? v : [...v, id!]); }}>{label}{id === "direct" && <span>{data.slices.length}</span>}</button>)}</nav>
    <div hidden={tab !== "suppliers"}><DependencyScatter rows={data.dep} win={data.win} authorityName={data.profile.name} authorityId={data.profile.id} floor={Math.max(500000, data.profile.totalContracts * .001)}/></div>
    {visited.includes("lots") && <div hidden={tab !== "lots"}><LotMatrix families={data.families} patterns={data.patterns} familiesWithLots={data.familiesWithLots} familiesTotal={data.familiesTotal} authorityId={data.profile.id}/></div>}
    {visited.includes("direct") && <div hidden={tab !== "direct"}><DaStrips rows={data.slices} nSuppliers={data.nDaSuppliers} authorityId={data.profile.id}/></div>}</>;
}

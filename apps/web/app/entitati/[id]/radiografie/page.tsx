import { redirectCanonicalEntity } from "@/lib/entity-navigation";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRadiografie } from "@/lib/radiografie";
import { formatRon, formatInt } from "@/lib/format";
import RadiografieExplorer from "./RadiografieExplorer";
import "./radiografie.css";
export const dynamic = "force-dynamic";
export default async function RadiografiePage({ params, searchParams }: {
    params: Promise<{
        id: string;
    }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { id } = await params;
    await redirectCanonicalEntity(id,"/radiografie",await searchParams);
    const data = await getRadiografie(id);
    if (!data)
        notFound();
    const p = data.profile;
    return <div className="radiografie-view"><nav className="rv-breadcrumb" aria-label="Locul în aplicație"><Link href={`/entitati/${p.id}`}>Profilul instituției</Link><span> / Radiografie</span></nav>
 <header className="rv-header"><div><h1>Radiografie</h1><p className="rv-authority">{p.name}</p><p>Explorează relațiile. Urmărește datele până la sursă.</p></div><Link className="rv-button" href={`/entitati/${p.id}`}>Profilul instituției</Link></header>
 <div className="rv-context"><span><strong>{formatRon(p.totalContracts)}</strong> valoare contractată</span><span><strong>{formatInt(p.nContracts)}</strong> contracte distincte</span><span><strong>{formatInt(p.nDas)}</strong> achiziții directe</span><span>Istoric <strong>{p.firstYear ?? "—"}–{p.lastYear ?? "—"}</strong></span></div>
 <RadiografieExplorer data={data}/><footer className="rv-footer"><p>Tiparele sunt puncte de plecare pentru verificare, nu dovezi de încălcare a legii. Valorile contractate nu reprezintă plăți; cotele asocierilor pot fi estimate. Lipsa unui semnal nu confirmă absența unei probleme.</p><Link href="/metodologie">Metodologie și limite</Link></footer></div>;
}

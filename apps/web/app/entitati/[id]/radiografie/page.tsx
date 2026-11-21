import { redirectCanonicalEntity } from "@/lib/entity-navigation";
import { titleName } from "@/lib/tidy-name";
import Link from "next/link";
import EntityName from "@/components/EntityName";
import InfoMark from "@/components/InfoMark";
import { notFound } from "next/navigation";
import { getRadiografie } from "@/lib/radiografie";
import { cleanName, formatRon, formatInt } from "@/lib/format";
import { getEntityProfile } from "@/lib/marts";
import type { Metadata } from "next";
import { cache } from "react";
import EntityCrumb from "../EntityCrumb";
import RadiografieExplorer from "./RadiografieExplorer";
import { ghostHold } from "@/lib/ghost-hold";
import "./radiografie.css";
export const dynamic = "force-dynamic";

const loadProfile = cache(getEntityProfile);

/** Whose Radiografie the tab shows (UX audit Z5-36, 16 November 2026): „Radiografie · Municipiul Cluj-Napoca”. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    const entity = /^\d{1,16}$/.test(id) ? await loadProfile(id).catch(() => null) : null;
    return { title: entity?.name ? `Radiografie · ${titleName(entity.name)}` : "Radiografie" };
}
export default async function RadiografiePage({ params, searchParams }: {
    params: Promise<{
        id: string;
    }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    // Development only: a check can hold the render to photograph loading.tsx (lib/ghost-hold.ts).
    await ghostHold();
    const { id } = await params;
    await redirectCanonicalEntity(id,"/radiografie",await searchParams);
    const [data, entity] = await Promise.all([getRadiografie(id), loadProfile(id)]);
    if (!data)
        notFound();
    const p = data.profile;
    const bothRoles = (entity?.roles.length ?? 0) > 1;
    return <div className="radiografie-view"><EntityCrumb id={p.id} name={p.name} role="authority" bothRoles={bothRoles} current="Radiografie" />
 <header className="rv-header"><div><h1>Radiografie</h1><p className="rv-authority"><EntityName id={p.id} role="authority">{titleName(p.name)}</EntityName></p></div></header>
 {/* The profile's words, and what this page counts (UX audit Z5-18, 16 November 2026): the contracts' value without the
     direct acquisitions, never called the profile's total; one year once. */}
 <div className="rv-context"><span><strong>{formatRon(p.totalContracts)}</strong> valoarea contractelor (fără directe)</span><span><strong>{formatInt(p.nContracts)}</strong> contracte distincte</span><span><strong>{formatInt(p.nDas)}</strong> achiziții directe</span>{p.firstYear && <span><strong>{p.lastYear && p.lastYear !== p.firstYear ? `${p.firstYear}–${p.lastYear}` : p.firstYear}</strong></span>}</div>
 <RadiografieExplorer data={data}/>{/* The caveats behind an "i" (owner, 17 November 2026); „nu plăți” is the site footer's. */}
 <footer className="rv-footer"><span className="rv-foot-link"><Link href="/metodologie">Metodologie și limite</Link> <InfoMark title="De știut" text="Tipare de verificat, nu dovezi. Lipsa unui semnal nu confirmă absența unei probleme." /></span></footer></div>;
}

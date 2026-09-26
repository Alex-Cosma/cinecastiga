import Link from "next/link";
import { redirect } from "next/navigation";
import { sessionUserId } from "@/lib/session";
import { listInvestigations } from "@/lib/anchete";
import { createAncheta } from "./actions";
import "./workspace.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Anchete", robots: { index: false, follow: false } };
export default async function AnchetePage() {
  const user = await sessionUserId(); if (!user) redirect("/login?next=%2Fanchete");
  const list = await listInvestigations(user);
  return <div className="iw-shell iw-index"><nav className="monitoring-trail" aria-label="Spațiu privat"><span aria-current="page">Anchetele mele</span><Link href="/urmariri">Urmăriri</Link></nav><header className="iw-header"><div><h1>O întrebare bună merită urmărită.</h1><p className="iw-description">Adună sursele, verifică explicațiile și lucrează cu redacția într-un dosar privat.</p></div><a className="iw-primary" href="#ancheta-noua">Începe o anchetă</a></header>
    <section className="iw-dossiers"><div className="iw-section-head"><h2>Dosarele tale</h2><span>{list.length} dosare</span></div>
      {list.length === 0 ? <div className="iw-empty"><h3>Începe cu ceea ce te intrigă</h3><p>O achiziție, un tipar sau o întrebare despre banii publici. Nu ai nevoie de o concluzie ca să începi; păstrează separat faptele și ipotezele.</p></div>
        : <ul>{list.map(inv => <li key={inv.id}><div><Link className="iw-dossier-title" href={`/anchete/${inv.id}`}>{inv.title}</Link>{inv.description && <p>{inv.description}</p>}</div><div className="iw-dossier-meta"><span>{inv.status === "activa" ? "În lucru" : inv.status === "publicata" ? "Publicată editorial" : "Închisă"}</span><span>{inv.nClips} dovezi</span><time>{new Date(inv.updatedAt).toLocaleDateString("ro-RO")}</time></div></li>)}</ul>}
    </section>
    <section id="ancheta-noua" className="iw-new"><div><h2>Deschide un dosar</h2><p>Doar tu ai acces la început. Poți invita ulterior editori sau cititori.</p></div><form action={createAncheta}><label>Ce urmărești?<input name="title" required maxLength={200} placeholder="Un titlu scurt pentru investigația ta" /></label><label>De unde pornești? <span className="iw-muted">Opțional</span><textarea name="description" rows={3} maxLength={4000} placeholder="Întrebarea de pornire, autoritatea sau achiziția care ți-a atras atenția." /></label><button className="iw-primary" type="submit">Creează dosarul privat</button></form></section>
  </div>;
}

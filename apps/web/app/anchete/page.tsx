import Link from "next/link";
import { redirect } from "next/navigation";
import { sessionUserId } from "@/lib/session";
import { listInvestigations, listPendingInvites } from "@/lib/anchete";
import { countWords } from "@/lib/ask/answer-text";
import { privateDay } from "@/lib/private-format";
import PrivateTrail from "@/components/private/PrivateTrail";
import { createAncheta } from "./actions";
import "./workspace.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Anchetele mele", robots: { index: false, follow: false } };
const statuses: Record<string, string> = { activa: "În lucru", publicata: "Publicată editorial", inchisa: "Închisă" };
const roles: Record<string, string> = { editor: "editor", viewer: "cititor" };

export default async function AnchetePage() {
  const user = await sessionUserId(); if (!user) redirect("/login?next=%2Fanchete");
  const [list, invites] = await Promise.all([listInvestigations(user), listPendingInvites(user)]);
  return <div className="private-shell iw-shell iw-index">
    <PrivateTrail current="anchete" />
    <header className="iw-header iw-list-header"><h1>Anchetele mele</h1><a className="iw-primary" href="#ancheta-noua">Deschide un dosar</a></header>
    {invites.length > 0 && <section className="iw-invites-waiting" aria-labelledby="invitatii-titlu"><h2 id="invitatii-titlu">{invites.length === 1 ? "O invitație te așteaptă" : `${invites.length} invitații te așteaptă`}</h2>
      <ul>{invites.map(invite => <li key={invite.id}><strong>{invite.investigationTitle}</strong><span>{invite.inviterName ? `De la ${invite.inviterName}` : "Invitație"} · {roles[invite.role]} · expiră la {privateDay(invite.expiresAt)}</span><span className="iw-muted">Deschide linkul primit de la {invite.inviterName ?? "proprietar"}; din motive de siguranță nu îl păstrăm aici.</span></li>)}</ul>
    </section>}
    <section className="iw-dossiers" aria-labelledby="dosare-titlu"><div className="iw-section-head"><h2 id="dosare-titlu">Dosarele tale</h2><span className="iw-muted">{countWords(list.length, "dosar", "dosare")}</span></div>
      {list.length === 0 ? <div className="iw-empty"><p>Niciun dosar încă. Deschide unul mai jos, sau folosește „Salvează în anchetă” pe pagina unei instituții, a unei firme sau a unui contract.</p></div>
        : <ul>{list.map(inv => { const shared = inv.access?.role !== "owner"; return <li key={inv.id}><div><Link className="iw-dossier-title" href={`/anchete/${inv.id}`}>{inv.title}</Link>{inv.description && <p>{inv.description}</p>}</div>
          <div className="iw-dossier-meta"><span>{statuses[inv.status] ?? inv.status}</span>
            {shared ? <span className="iw-shared">Partajat{inv.ownerName ? ` de ${inv.ownerName}` : ""} · {roles[inv.access?.role ?? "viewer"]}</span>
              : (inv.nMembers ?? 0) > 0 && <span className="iw-shared">Partajat cu {countWords(inv.nMembers ?? 0, "colaborator", "colaboratori")}</span>}
            <span>{countWords(inv.nEvidence ?? inv.nClips, "dovadă", "dovezi")}</span><span>Actualizat la <time dateTime={inv.updatedAt}>{privateDay(inv.updatedAt)}</time></span></div></li>; })}</ul>}
    </section>
    <section id="ancheta-noua" className="iw-new"><div><h2>Deschide un dosar</h2><p>Privat. Poți invita colaboratori.</p></div><form action={createAncheta}><label>Ce urmărești?<input name="title" required maxLength={200} placeholder="Un titlu scurt pentru anchetă" /></label><label><span>De unde pornești? <span className="iw-muted">Opțional</span></span><textarea name="description" rows={3} maxLength={4000} placeholder="Întrebarea de pornire, instituția sau achiziția care ți-a atras atenția." /></label><button className="iw-primary" type="submit">Creează dosarul privat</button></form></section>
  </div>;
}

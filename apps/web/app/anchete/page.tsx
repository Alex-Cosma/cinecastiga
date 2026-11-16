import Link from "next/link";
import { redirect } from "next/navigation";
import { sessionUserId } from "@/lib/session";
import { listInvestigations, listPendingInvites } from "@/lib/anchete";
import { countWords } from "@/lib/ask/answer-text";
import { privateDay } from "@/lib/private-format";
import PrivateTrail from "@/components/private/PrivateTrail";
import NewDossier from "./NewDossier";
import "./workspace.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Anchetele mele", robots: { index: false, follow: false } };
const statuses: Record<string, string> = { activa: "În lucru", publicata: "Publicată editorial", inchisa: "Închisă" };
const roles: Record<string, string> = { editor: "editor", viewer: "cititor" };

export default async function AnchetePage({ searchParams }: { searchParams: Promise<{ nou?: string }> }) {
  const user = await sessionUserId(); if (!user) redirect("/login?next=%2Fanchete");
  const { nou } = await searchParams;
  const [list, invites] = await Promise.all([listInvestigations(user), listPendingInvites(user)]);
  return <div className="private-shell iw-shell iw-index">
    <PrivateTrail current="anchete" />
    <NewDossier count={countWords(list.length, "dosar", "dosare")} startOpen={nou === "1"} empty={list.length === 0} />
    {invites.length > 0 && <section className="iw-invites-waiting" aria-labelledby="invitatii-titlu"><h2 id="invitatii-titlu">{invites.length === 1 ? "O invitație te așteaptă" : `${invites.length} invitații te așteaptă`}</h2>
      <ul>{invites.map(invite => <li key={invite.id}><strong>{invite.investigationTitle}</strong><span>{invite.inviterName ? `De la ${invite.inviterName}` : "Invitație"} · {roles[invite.role]} · expiră la {privateDay(invite.expiresAt)}</span><span className="iw-muted">Deschide linkul primit de la {invite.inviterName ?? "proprietar"}; din motive de siguranță nu îl păstrăm aici.</span></li>)}</ul>
    </section>}
    {list.length > 0 && <section className="iw-dossiers" aria-label="Dosarele tale">
      <ul>{list.map(inv => { const shared = inv.access?.role !== "owner"; return <li key={inv.id}><div><Link className="iw-dossier-title" href={`/anchete/${inv.id}`}>{inv.title}</Link>{inv.description && <p>{inv.description}</p>}</div>
          <div className="iw-dossier-meta"><span>{statuses[inv.status] ?? inv.status}</span>
            {shared ? <span className="iw-shared">Partajat{inv.ownerName ? ` de ${inv.ownerName}` : ""} · {roles[inv.access?.role ?? "viewer"]}</span>
              : (inv.nMembers ?? 0) > 0 && <span className="iw-shared">Partajat cu {countWords(inv.nMembers ?? 0, "colaborator", "colaboratori")}</span>}
            <span>{countWords(inv.nEvidence ?? inv.nClips, "dovadă", "dovezi")}</span><span>Actualizat la <time dateTime={inv.updatedAt}>{privateDay(inv.updatedAt)}</time></span></div></li>; })}</ul>
    </section>}
  </div>;
}
